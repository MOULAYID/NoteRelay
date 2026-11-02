import { beforeEach, it, expect } from "vitest";
import Dexie from "dexie";
import { db, NoteRelayDB, removeSession } from "../src/storage/db";
import {
  createStudyDocument,
  saveStudyDocument,
  addChapter,
  chapterFromNotes,
  deleteStudyDocument,
  exportSource,
  importSource,
} from "../src/documents/store";
import { sampleChapter, sampleDocument } from "./fixtures/study";
import { buildPDFDefinition } from "../src/documents/pdf-definition";
import { validateDocument } from "../src/documents/model";
beforeEach(async () => {
  for (const table of db.tables) await table.clear();
});
it("creates ordered chapter snapshots that survive source changes and deletion", async () => {
  const chapter = sampleChapter();
  await db.sessions.add({
    id: "lecture-1",
    title: chapter.title,
    source: "tab",
    url: chapter.source.url,
    createdAt: chapter.source.recordedAt,
    updatedAt: 1,
    state: "stopped",
    sampleRate: 16000,
    totalSamples: 0,
    blocks: 0,
    progressive: false,
  });
  await db.transcripts.add({
    id: "transcript-1",
    sessionId: "lecture-1",
    createdAt: 1,
    model: "test",
    language: "English",
    status: "complete",
    revision: 1,
    segments: [
      {
        id: "segment-1",
        start: 12.5,
        end: 30,
        text: "Source words",
        approximate: true,
      },
    ],
  });
  await db.notes.add(chapter.notes);
  const snapshot = await chapterFromNotes("notes-1");
  expect(snapshot.title).toBe(chapter.title);
  const doc = await createStudyDocument("Excel course", snapshot);
  await db.notes.update("notes-1", { title: "Changed original" });
  await removeSession("lecture-1");
  const saved = await db.studyDocuments.get(doc.id);
  expect(saved?.chapters[0].notes.title).toBe("Notes 1");
  expect(saved?.chapters[0].references[0].start).toBe(12.5);
});
it("appends multiple lectures and handles ask, replace and copy without altering prior chapters", async () => {
  const doc = await createStudyDocument("Course", sampleChapter(1));
  const second = await addChapter(doc.id, sampleChapter(2));
  expect(second.document.chapters.map((c) => c.source.sessionId)).toEqual([
    "lecture-1",
    "lecture-2",
  ]);
  const asked = await addChapter(doc.id, sampleChapter(2));
  expect(asked.duplicate).toBe(true);
  expect((await db.studyDocuments.get(doc.id))?.chapters).toHaveLength(2);
  const updated = sampleChapter(2);
  updated.notes.title = "New snapshot";
  const replaced = await addChapter(doc.id, updated, "replace");
  expect(replaced.document.chapters).toHaveLength(2);
  expect(replaced.document.chapters[1].notes.title).toBe("New snapshot");
  const copied = await addChapter(doc.id, sampleChapter(2), "copy");
  expect(copied.document.chapters).toHaveLength(3);
  expect(new Set(copied.document.chapters.map((c) => c.id)).size).toBe(3);
});
it("saves rename, reorder and remove operations with optimistic concurrency", async () => {
  const doc = await createStudyDocument("Course", sampleChapter(1));
  const appended = (await addChapter(doc.id, sampleChapter(2))).document;
  const saved = await saveStudyDocument(
    {
      ...appended,
      title: "Renamed",
      chapters: [
        { ...appended.chapters[1], title: "Second first" },
        appended.chapters[0],
      ],
    },
    appended.revision,
  );
  expect(saved.chapters[0].title).toBe("Second first");
  await expect(saveStudyDocument(appended, appended.revision)).rejects.toThrow(
    "another view",
  );
  const removed = await saveStudyDocument(
    { ...saved, chapters: saved.chapters.slice(1) },
    saved.revision,
  );
  expect(removed.chapters).toHaveLength(1);
  await expect(deleteStudyDocument(doc.id, saved.revision)).rejects.toThrow(
    "changed",
  );
});
it("exports a complete editable backup and imports it as an independent copy", async () => {
  const doc = sampleDocument();
  await db.studyDocuments.add(doc);
  const exported = exportSource(doc);
  const imported = await importSource(exported);
  expect(imported.id).not.toBe(doc.id);
  expect(imported.importedFromId).toBe(doc.id);
  expect(imported.chapters.map((c) => c.notes)).toEqual(
    doc.chapters.map((c) => c.notes),
  );
  expect(imported.chapters[0].id).not.toBe(doc.chapters[0].id);
  expect(await db.studyDocuments.count()).toBe(2);
  await deleteStudyDocument(imported.id, imported.revision);
  expect(await db.studyDocuments.count()).toBe(1);
});
it("keeps original notes when a study document is removed", async () => {
  const c = sampleChapter();
  await db.notes.add(c.notes);
  const d = await createStudyDocument("Course", c);
  await deleteStudyDocument(d.id, d.revision);
  expect(await db.notes.get(c.notes.id)).toEqual(c.notes);
});
it("rejects unsafe or incompatible imports rather than reconstructing arbitrary PDFs", async () => {
  await expect(importSource("%PDF-1.7")).rejects.toThrow("not valid JSON");
  const backup = JSON.parse(exportSource(sampleDocument()));
  backup.version = 9;
  await expect(importSource(JSON.stringify(backup))).rejects.toThrow(
    "Unsupported",
  );
  const unsafe = sampleDocument();
  unsafe.chapters[0].source.url = "javascript:alert(1)";
  expect(() => validateDocument(unsafe)).toThrow();
  const classroom = sampleDocument();
  classroom.chapters[2].references[0].videoUrl =
    "https://example.org/false-public-audio";
  expect(() => validateDocument(classroom)).toThrow();
  const unknown = JSON.parse(exportSource(sampleDocument()));
  unknown.apiKey = "must-not-be-imported";
  await expect(importSource(JSON.stringify(unknown))).rejects.toThrow(
    "Unsupported",
  );
});
it("adds the v2 store without losing v1 audio, notes, transcript, or job records", async () => {
  const name = `migration-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(1).stores({
    sessions: "id,createdAt,state",
    blocks: "id,sessionId,[sessionId+seq],[sessionId+start]",
    anchors: "++id,sessionId,[sessionId+audioTime]",
    transcripts: "id,sessionId,createdAt",
    notes: "id,sessionId,transcriptId,createdAt",
    jobs: "id,sessionId,status,nextRun",
    usage: "id,jobId,at",
  });
  await old.open();
  await old.table("sessions").add({ id: "legacy", state: "stopped" });
  await old.table("blocks").add({
    id: "audio",
    sessionId: "legacy",
    pcm: new Uint8Array([1, 2]).buffer,
  });
  await old.table("notes").add(sampleChapter().notes);
  await old
    .table("transcripts")
    .add({ id: "legacy-transcript", sessionId: "legacy" });
  await old.table("jobs").add({ id: "legacy-job", sessionId: "legacy" });
  old.close();
  const upgraded = new NoteRelayDB(name);
  await upgraded.open();
  expect(await upgraded.sessions.get("legacy")).toBeDefined();
  expect((await upgraded.blocks.get("audio"))?.pcm.byteLength).toBe(2);
  expect(await upgraded.notes.count()).toBe(1);
  expect(await upgraded.transcripts.count()).toBe(1);
  expect(await upgraded.jobs.count()).toBe(1);
  await upgraded.studyDocuments.add(sampleDocument());
  upgraded.close();
  await upgraded.open();
  expect(
    (await upgraded.studyDocuments.get("study-fixture"))?.chapters,
  ).toHaveLength(3);
  upgraded.close();
  await Dexie.delete(name);
});
it("builds a local selectable-text PDF definition preserving source content and safe links", () => {
  const doc = sampleDocument();
  const definition = buildPDFDefinition(doc);
  const json = JSON.stringify(definition);
  expect(json).toContain("Nettoyer les données");
  expect(json).toContain("Électricité");
  expect(json).toContain("link");
  expect(json).toContain("t=72s");
  expect(json).toContain("local recording");
  expect(json).toContain("table");
  expect(doc.chapters[0].notes.sections[0].content).toContain(
    "**Keep the original source**",
  );
  expect(() => buildPDFDefinition({ ...doc, chapters: [] })).toThrow(
    "at least one",
  );
});
