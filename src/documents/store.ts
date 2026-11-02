import { db } from "../storage/db";
import { id } from "../domain/types";
import { locate } from "../domain/timeline";
import {
  validateDocument,
  BackupSchema,
  SOURCE_LIMIT,
  safeWebURL,
  timestampURL,
  type StudyDocument,
  type StudyChapter,
} from "./model";
export async function chapterFromNotes(notesId: string): Promise<StudyChapter> {
  return db.transaction(
    "r",
    [db.notes, db.sessions, db.transcripts, db.anchors],
    async () => {
      const notes = await db.notes.get(notesId);
      if (!notes) throw new Error("NR:The selected notes no longer exist.");
      const session = await db.sessions.get(notes.sessionId);
      if (!session) throw new Error("NR:The source lecture no longer exists.");
      const transcript = await db.transcripts.get(notes.transcriptId);
      if (!transcript)
        throw new Error("NR:The notes source transcript no longer exists.");
      const anchors =
        session.source === "tab"
          ? await db.anchors.where("sessionId").equals(session.id).toArray()
          : [];
      const wanted = new Set(notes.sections.flatMap((s) => s.sourceIds));
      return structuredClone({
        id: id(),
        title: session.title.trim() || notes.title || "Untitled lecture",
        addedAt: Date.now(),
        source: {
          sessionId: session.id,
          lectureTitle: session.title,
          kind: session.source,
          recordedAt: session.createdAt,
          ...(session.source === "tab" && safeWebURL(session.url)
            ? { url: session.url }
            : {}),
        },
        notes,
        references: transcript.segments
          .filter((s) => wanted.has(s.id))
          .map((s) => {
            const mapped = locate(anchors, s.start);
            const url = mapped
              ? timestampURL(mapped.pageUrl, mapped.videoTime)
              : undefined;
            return {
              segmentId: s.id,
              start: s.start,
              end: s.end,
              ...(url && mapped
                ? { videoTime: mapped.videoTime, videoUrl: url }
                : {}),
            };
          }),
      });
    },
  );
}
export async function createStudyDocument(
  title: string,
  chapter?: StudyChapter,
): Promise<StudyDocument> {
  const now = Date.now();
  const doc = validateDocument({
    id: id(),
    title,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    chapters: chapter ? [structuredClone(chapter)] : [],
  });
  await db.studyDocuments.add(doc);
  return doc;
}
export async function saveStudyDocument(
  draft: StudyDocument,
  expectedRevision: number,
): Promise<StudyDocument> {
  return db.transaction("rw", db.studyDocuments, async () => {
    const current = await db.studyDocuments.get(draft.id);
    if (!current) throw new Error("NR:This document was deleted.");
    if (current.revision !== expectedRevision)
      throw new Error(
        "NR:This document changed in another view. Reopen its saved version before editing.",
      );
    const saved = validateDocument({
      ...draft,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
      revision: current.revision + 1,
    });
    await db.studyDocuments.put(saved);
    return saved;
  });
}
export type DuplicateChoice = "ask" | "replace" | "copy";
export async function addChapter(
  documentId: string,
  chapter: StudyChapter,
  choice: DuplicateChoice = "ask",
  expectedRevision?: number,
): Promise<{ document: StudyDocument; duplicate: boolean }> {
  return db.transaction("rw", db.studyDocuments, async () => {
    const current = await db.studyDocuments.get(documentId);
    if (!current)
      throw new Error("NR:Selected study document no longer exists.");
    if (expectedRevision !== undefined && expectedRevision !== current.revision)
      throw new Error(
        "NR:The selected document changed. Select it again before adding notes.",
      );
    const duplicate = current.chapters.find(
      (c) =>
        c.notes.id === chapter.notes.id ||
        c.source.sessionId === chapter.source.sessionId,
    );
    if (duplicate && choice === "ask")
      return { document: current, duplicate: true };
    const incoming = structuredClone({ ...chapter, id: id() });
    const chapters =
      duplicate && choice === "replace"
        ? current.chapters.map((c) =>
            c.id === duplicate.id
              ? { ...incoming, id: c.id, title: c.title }
              : c,
          )
        : [...current.chapters, incoming];
    const document = await saveStudyDocument(
      { ...current, chapters },
      current.revision,
    );
    return { document, duplicate: false };
  });
}
export async function deleteStudyDocument(
  documentId: string,
  expectedRevision: number,
) {
  await db.transaction("rw", db.studyDocuments, async () => {
    const doc = await db.studyDocuments.get(documentId);
    if (!doc) return;
    if (doc.revision !== expectedRevision)
      throw new Error("NR:The document changed. Reopen it before deleting.");
    await db.studyDocuments.delete(documentId);
  });
}
export function exportSource(document: StudyDocument): string {
  const backup = {
    kind: "noterelay-study-document",
    version: 1,
    document: validateDocument(document),
  };
  const pretty = JSON.stringify(backup, null, 2);
  // Keep near-limit backups importable even when pretty-printing expands their whitespace.
  return new TextEncoder().encode(pretty).byteLength <= SOURCE_LIMIT
    ? pretty
    : JSON.stringify(backup);
}
export async function importSource(text: string): Promise<StudyDocument> {
  if (new TextEncoder().encode(text).byteLength > SOURCE_LIMIT)
    throw new Error("NR:Study document source must be at most 8 MB.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      "NR:This file is not valid JSON. Choose a NoteRelay study document backup.",
    );
  }
  const parsed = BackupSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      "NR:Unsupported or invalid NoteRelay source file. Arbitrary PDF import is not supported.",
    );
  const original = parsed.data.document;
  const now = Date.now();
  const document = validateDocument({
    ...original,
    id: id(),
    createdAt: now,
    updatedAt: now,
    revision: 1,
    importedFromId: original.id,
    chapters: original.chapters.map((c) => ({ ...c, id: id() })),
  });
  await db.studyDocuments.add(document);
  return document;
}
