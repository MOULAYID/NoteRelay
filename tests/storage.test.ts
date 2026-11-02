import { beforeEach, describe, it, expect } from "vitest";
import {
  db,
  commitBlock,
  readPCM,
  removeAudio,
  recoverInterrupted,
  removeSession,
} from "../src/storage/db";
import { DEFAULT_SETTINGS, type Session } from "../src/domain/types";
import {
  enqueueTranscription,
  restartTranscription,
  claimJob,
  enqueueNotes,
  finishTranscript,
} from "../src/jobs/queue";
const fixture: Session = {
  id: "lecture",
  title: "Test",
  source: "microphone",
  createdAt: 1,
  updatedAt: 1,
  state: "recording",
  sampleRate: 2,
  totalSamples: 0,
  blocks: 0,
  progressive: false,
};
beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  await db.sessions.add({ ...fixture });
});
describe("durable PCM storage", () => {
  it("commits audio and saved-through position atomically; repeated blocks are idempotent", async () => {
    const b = {
      id: "a",
      sessionId: "lecture",
      seq: 0,
      start: 0,
      end: 2,
      pcm: new Int16Array([11, 12]).buffer,
    };
    await commitBlock(b);
    await commitBlock(b);
    expect((await db.sessions.get("lecture"))?.totalSamples).toBe(2);
    expect(await db.blocks.count()).toBe(1);
  });
  it("rejects missing, malformed and out-of-order blocks without advancing saved position", async () => {
    await expect(
      commitBlock({
        id: "b",
        sessionId: "lecture",
        seq: 1,
        start: 2,
        end: 4,
        pcm: new ArrayBuffer(4),
      }),
    ).rejects.toThrow();
    expect(await db.blocks.count()).toBe(0);
    expect((await db.sessions.get("lecture"))?.totalSamples).toBe(0);
  });
  it("reconstructs a cross-block sample range without returning unrelated audio", async () => {
    await commitBlock({
      id: "a",
      sessionId: "lecture",
      seq: 0,
      start: 0,
      end: 2,
      pcm: new Int16Array([11, 12]).buffer,
    });
    await commitBlock({
      id: "b",
      sessionId: "lecture",
      seq: 1,
      start: 2,
      end: 4,
      pcm: new Int16Array([13, 14]).buffer,
    });
    const parts = await readPCM("lecture", 1, 3);
    expect(parts.map((p) => Array.from(new Int16Array(p))).flat()).toEqual([
      12, 13,
    ]);
  });
  it("recovers committed audio after restart, but does not pretend recording continued", async () => {
    await commitBlock({
      id: "a",
      sessionId: "lecture",
      seq: 0,
      start: 0,
      end: 2,
      pcm: new ArrayBuffer(4),
    });
    await recoverInterrupted();
    expect((await db.sessions.get("lecture"))?.state).toBe("interrupted");
    expect(await db.blocks.count()).toBe(1);
  });
  it("protects active recordings from deletion and retains transcripts when audio is removed", async () => {
    await expect(removeAudio("lecture")).rejects.toThrow();
    await db.sessions.update("lecture", { state: "stopped" });
    await db.transcripts.add({
      id: "t",
      sessionId: "lecture",
      createdAt: 1,
      model: "test",
      language: "en",
      segments: [],
      status: "complete",
      revision: 1,
    });
    await removeAudio("lecture");
    expect(await db.transcripts.count()).toBe(1);
    expect((await db.sessions.get("lecture"))?.audioDeleted).toBe(true);
    await removeSession("lecture");
    expect(await db.sessions.count()).toBe(0);
    expect(await db.transcripts.count()).toBe(0);
  });
});
describe("persistent jobs", () => {
  it("uses stable transcription IDs and queues final short windows", async () => {
    await db.sessions.update("lecture", {
      totalSamples: 125,
      blocks: 63,
      state: "stopped",
    });
    await enqueueTranscription("lecture", DEFAULT_SETTINGS, true);
    await enqueueTranscription("lecture", DEFAULT_SETTINGS, true);
    const jobs = await db.jobs.toArray();
    expect(
      jobs.sort((a, b) => a.start - b.start).map((j) => [j.start, j.end]),
    ).toEqual([
      [0, 60],
      [60, 120],
      [120, 125],
    ]);
  });
  it("claims once across workers and caps stale-job retries", async () => {
    await db.sessions.update("lecture", { totalSamples: 60 });
    await enqueueTranscription("lecture", DEFAULT_SETTINGS, true);
    const [a, b] = await Promise.all([claimJob(100), claimJob(100)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const job = (a ?? b)!;
    expect((await claimJob(120101))?.attempts).toBe(2);
    await db.jobs.update(job.id, { attempts: 4, leaseUntil: 0 });
    expect(await claimJob(999999)).toBeUndefined();
    expect((await db.jobs.get(job.id))?.status).toBe("failed");
  });
  it("notes use stored text without creating transcription tasks", async () => {
    await db.transcripts.add({
      id: "t",
      sessionId: "lecture",
      createdAt: 1,
      model: "test",
      language: "en",
      segments: [
        { id: "s", start: 0, end: 1, text: "Hello", approximate: true },
      ],
      status: "complete",
      revision: 1,
    });
    await enqueueNotes(
      "lecture",
      "t",
      DEFAULT_SETTINGS,
      "summary",
      "English",
      "short",
    );
    expect((await db.jobs.toArray()).map((j) => j.kind)).toEqual(["notes"]);
  });
  it("does not call an incomplete transcript complete while any task failed", async () => {
    await db.sessions.update("lecture", { totalSamples: 60, state: "stopped" });
    await enqueueTranscription("lecture", DEFAULT_SETTINGS, true);
    const job = (await db.jobs.toArray())[0];
    await db.jobs.update(job.id, { status: "failed" });
    await finishTranscript(job.transcriptId);
    expect((await db.transcripts.get(job.transcriptId))?.status).toBe(
      "partial",
    );
    await db.jobs.update(job.id, { status: "done" });
    await finishTranscript(job.transcriptId);
    expect((await db.transcripts.get(job.transcriptId))?.status).toBe(
      "complete",
    );
  });
});

it("can switch a failed model through a new version without overwriting the earlier transcript", async () => {
  await db.sessions.update("lecture", { totalSamples: 60, state: "stopped" });
  await enqueueTranscription("lecture", DEFAULT_SETTINGS, true);
  const first = (await db.jobs.toArray())[0];
  await db.jobs.update(first.id, { status: "failed" });
  await restartTranscription("lecture", {
    ...DEFAULT_SETTINGS,
    transcriptionModel: "replacement-model",
  });
  expect(await db.transcripts.count()).toBe(2);
  expect((await db.jobs.get(first.id))?.status).toBe("cancelled");
  const next = (await db.jobs.toArray()).find((j) => j.status === "pending")!;
  expect(next.model).toBe("replacement-model");
  expect(next.transcriptId).not.toBe(first.transcriptId);
});
