import Dexie, { type Table } from "dexie";
import type { StudyDocument } from "../documents/model";
import type {
  Session,
  AudioBlock,
  Anchor,
  Transcript,
  Notes,
  Job,
  Usage,
} from "../domain/types";
export class NoteRelayDB extends Dexie {
  studyDocuments!: Table<StudyDocument, string>;
  sessions!: Table<Session, string>;
  blocks!: Table<AudioBlock, string>;
  anchors!: Table<Anchor, number>;
  transcripts!: Table<Transcript, string>;
  notes!: Table<Notes, string>;
  jobs!: Table<Job, string>;
  usage!: Table<Usage, string>;
  constructor(name = "NoteRelay") {
    super(name);
    this.version(1).stores({
      sessions: "id,createdAt,state",
      blocks: "id,sessionId,[sessionId+seq],[sessionId+start]",
      anchors: "++id,sessionId,[sessionId+audioTime]",
      transcripts: "id,sessionId,createdAt",
      notes: "id,sessionId,transcriptId,createdAt",
      jobs: "id,sessionId,status,nextRun",
      usage: "id,jobId,at",
    });
    // Additive migration: retain every pre-existing lecture, audio block and note.
    this.version(2).stores({ studyDocuments: "id,updatedAt,title" });
  }
}
export const db = new NoteRelayDB();
export async function commitBlock(block: AudioBlock) {
  await db.transaction("rw", db.blocks, db.sessions, async () => {
    if (await db.blocks.get(block.id)) return;
    const session = await db.sessions.get(block.sessionId);
    if (!session || session.audioDeleted)
      throw new Error("NR:This recording is no longer available.");
    if (
      block.seq !== session.blocks ||
      block.start !== session.totalSamples ||
      block.end <= block.start ||
      block.pcm.byteLength !== (block.end - block.start) * 2
    )
      throw new Error(
        "NR:Audio sequence mismatch. Recording was stopped to protect saved data.",
      );
    await db.blocks.add(block);
    await db.sessions.update(session.id, {
      blocks: session.blocks + 1,
      totalSamples: block.end,
      updatedAt: Date.now(),
    });
  });
}
export async function removeAudio(sessionId: string) {
  await db.transaction("rw", db.sessions, db.blocks, db.jobs, async () => {
    const s = await db.sessions.get(sessionId);
    if (s && ["recording", "paused", "starting"].includes(s.state))
      throw new Error("NR:Stop recording before deleting audio.");
    if (
      await db.jobs
        .where("sessionId")
        .equals(sessionId)
        .filter((j) => j.status === "running")
        .count()
    )
      throw new Error(
        "NR:Wait for processing to finish before deleting audio.",
      );
    await db.blocks.where("sessionId").equals(sessionId).delete();
    await db.jobs
      .where("sessionId")
      .equals(sessionId)
      .filter((j) => j.kind === "transcribe" && j.status !== "done")
      .delete();
    await db.sessions.update(sessionId, { audioDeleted: true });
  });
}
export async function removeSession(sessionId: string) {
  await db.transaction(
    "rw",
    [
      db.sessions,
      db.blocks,
      db.anchors,
      db.transcripts,
      db.notes,
      db.jobs,
      db.usage,
    ],
    async () => {
      await removeAudio(sessionId);
      const jobs = await db.jobs
        .where("sessionId")
        .equals(sessionId)
        .primaryKeys();
      await db.usage.where("jobId").anyOf(jobs).delete();
      for (const table of [
        db.blocks,
        db.anchors,
        db.transcripts,
        db.notes,
        db.jobs,
      ])
        await table.where("sessionId").equals(sessionId).delete();
      await db.sessions.delete(sessionId);
    },
  );
}
export async function recoverInterrupted() {
  const active = await db.sessions
    .filter((s) => ["recording", "paused", "starting"].includes(s.state))
    .toArray();
  for (const s of active)
    await db.sessions.update(s.id, {
      state: "interrupted",
      error: "Capture ended unexpectedly. Committed audio is available.",
      updatedAt: Date.now(),
    });
}
export async function readPCM(sessionId: string, start: number, end: number) {
  const s = await db.sessions.get(sessionId);
  if (!s) throw new Error("NR:Session not found.");
  if (start < 0 || end < start || end > s.totalSamples)
    throw new Error("NR:Invalid audio range.");
  const blocks = await db.blocks
    .where("[sessionId+start]")
    .between(
      [sessionId, Math.max(0, start - s.sampleRate)],
      [sessionId, end],
      true,
      false,
    )
    .sortBy("seq");
  const parts: ArrayBuffer[] = [];
  let cursor = start;
  for (const b of blocks) {
    const from = Math.max(start, b.start),
      to = Math.min(end, b.end);
    if (from < to) {
      if (from !== cursor) throw new Error("NR:Some audio blocks are missing.");
      parts.push(b.pcm.slice((from - b.start) * 2, (to - b.start) * 2));
      cursor = to;
    }
  }
  if (cursor !== end)
    throw new Error(
      "NR:Some audio blocks are missing. Export saved portions for recovery.",
    );
  return parts;
}
