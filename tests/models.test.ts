import { it, expect, vi, afterEach } from "vitest";
import { listModels, testAudioConnection } from "../src/providers/gemini";
afterEach(() => vi.unstubAllGlobals());
it("paginates model discovery and filters models unsupported by this adapter", async () => {
  const mock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-3.5-flash-lite",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-embedding-001",
              supportedGenerationMethods: ["embedContent"],
            },
            {
              name: "models/gemini-3.5-transcribe",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
          nextPageToken: "next",
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-3.8-flash",
              displayName: "Gemini Flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      ),
    );
  vi.stubGlobal("fetch", mock);
  expect((await listModels("test-key")).map((m) => m.id)).toEqual([
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
  ]);
  expect(mock.mock.calls[1][0]).toContain("pageToken=next");
  expect(mock.mock.calls.every((c) => !c[0].includes("test-key"))).toBe(true);
});
it("tests audio capability using only synthetic WAV silence", async () => {
  const mock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: '{"segments":[]}' }] },
          },
        ],
      }),
    ),
  );
  vi.stubGlobal("fetch", mock);
  await testAudioConnection("test-key", "gemini-3.5-flash-lite");
  const body = JSON.parse(mock.mock.calls[0][1].body);
  const audio = body.contents[0].parts.find(
    (p: Record<string, unknown>) => "inlineData" in p,
  ).inlineData;
  expect(audio.mimeType).toBe("audio/wav");
  const wav = Buffer.from(audio.data, "base64");
  expect(wav.readUInt32LE(40)).toBe(8000);
  expect(wav.subarray(44).every((x) => x === 0)).toBe(true);
});
