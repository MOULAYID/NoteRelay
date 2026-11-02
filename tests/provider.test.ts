import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { gemini, request } from "../src/providers/gemini";
import { db } from "../src/storage/db";
import { enqueueTranscription, enqueueNotes, runOne } from "../src/jobs/queue";
import { DEFAULT_SETTINGS } from "../src/domain/types";
function response(value: unknown, finishReason = "STOP") {
  return new Response(
    JSON.stringify({
      candidates: [
        { finishReason, content: { parts: [{ text: JSON.stringify(value) }] } },
      ],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
    }),
    { status: 200 },
  );
}
beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});
afterEach(() => vi.unstubAllGlobals());
it("validates transcript times against the exact audio window", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        response({ segments: [{ start: 0, end: 31, text: "invented range" }] }),
      ),
  );
  await expect(
    gemini.transcribe("test-key", "test-model", new Blob([]), 30, "English", 0),
  ).rejects.toThrow("timestamps");
});
it("rejects truncated outputs without accepting partial notes", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, "MAX_TOKENS")));
  await expect(
    request("test-key", "test-model", [], {}, "test"),
  ).rejects.toThrow("incomplete");
});
it("does not expose provider error bodies or credentials", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("private-request-dump", { status: 403 })),
  );
  await expect(
    request("test-key", "test-model", [], {}, "test"),
  ).rejects.toThrow("rejected the key");
});
it("rejects notes that cite nonexistent segments", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      response({
        title: "Notes",
        sections: [
          {
            heading: "Concept",
            content: "Claim",
            sourceIds: ["fake"],
            kind: "lecture",
          },
        ],
        warnings: [],
      }),
    ),
  );
  await expect(
    gemini.generate(
      "test-key",
      "test-model",
      {
        id: "t",
        sessionId: "s",
        createdAt: 1,
        model: "test",
        language: "en",
        segments: [],
        status: "complete",
        revision: 1,
      },
      "summary",
      "English",
      "short",
    ),
  ).rejects.toThrow("source references");
});
it("runs audio → saved transcript → multiple notes without uploading audio again", async () => {
  await db.sessions.add({
    id: "s",
    title: "Lecture",
    source: "microphone",
    createdAt: 1,
    updatedAt: 1,
    state: "stopped",
    sampleRate: 16000,
    totalSamples: 16000,
    blocks: 1,
    progressive: false,
  });
  await db.blocks.add({
    id: "s:0",
    sessionId: "s",
    seq: 0,
    start: 0,
    end: 16000,
    pcm: new ArrayBuffer(32000),
  });
  const mock = vi.fn().mockResolvedValueOnce(
    response({
      segments: [
        { start: 0, end: 1, text: "A neuron computes a weighted sum." },
      ],
    }),
  );
  vi.stubGlobal("fetch", mock);
  await enqueueTranscription("s", DEFAULT_SETTINGS, true);
  await runOne("test-key");
  const t = (await db.transcripts.toArray())[0];
  expect(t.status).toBe("complete");
  expect(t.segments).toHaveLength(1);
  mock.mockImplementation(async () =>
    response({
      title: "Neuron",
      sections: [
        {
          heading: "Weighted sum",
          content: "A neuron computes a weighted sum.",
          sourceIds: [t.segments[0].id],
          kind: "lecture",
        },
      ],
      warnings: [],
    }),
  );
  for (const format of ["summary", "quiz"] as const) {
    await enqueueNotes("s", t.id, DEFAULT_SETTINGS, format, "English", "short");
    await runOne("test-key");
  }
  expect(await db.notes.count()).toBe(2);
  expect(mock).toHaveBeenCalledTimes(3);
  const bodies = mock.mock.calls.map((c) => JSON.parse(c[1].body));
  expect(
    bodies[0].contents[0].parts.some(
      (p: Record<string, unknown>) => "inlineData" in p,
    ),
  ).toBe(true);
  expect(
    bodies[1].contents[0].parts.some(
      (p: Record<string, unknown>) => "inlineData" in p,
    ),
  ).toBe(false);
  expect(await db.usage.count()).toBe(3);
});
it("retains saved audio and schedules a bounded retry after rate limiting", async () => {
  await db.sessions.add({
    id: "s",
    title: "Lecture",
    source: "tab",
    createdAt: 1,
    updatedAt: 1,
    state: "stopped",
    sampleRate: 16000,
    totalSamples: 16000,
    blocks: 1,
    progressive: false,
  });
  await db.blocks.add({
    id: "s:0",
    sessionId: "s",
    seq: 0,
    start: 0,
    end: 16000,
    pcm: new ArrayBuffer(32000),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 429 })),
  );
  await enqueueTranscription("s", DEFAULT_SETTINGS, true);
  await runOne("test-key");
  const j = (await db.jobs.toArray())[0];
  expect(j.status).toBe("pending");
  expect(j.nextRun).toBeGreaterThan(Date.now());
  expect(await db.blocks.count()).toBe(1);
});
