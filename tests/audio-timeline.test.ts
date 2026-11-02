import { describe, it, expect } from "vitest";
import { floatToPCM, wavHeader } from "../src/audio/pcm";
import { locate } from "../src/domain/timeline";
import { CommandSchema, safeError } from "../src/domain/validation";
import type { Anchor } from "../src/domain/types";
const a: Anchor = {
  sessionId: "s",
  audioTime: 0,
  videoTime: 720,
  sourceId: "video-a",
  pageUrl: "https://example.org",
  rate: 1,
  playing: true,
  event: "tick",
  observedAt: 0,
  uncertainty: 0.5,
};
describe("audio formats", () => {
  it("encodes clipped signed little-endian PCM", () => {
    const v = new DataView(floatToPCM(new Float32Array([-2, -1, 0, 1, 2])));
    expect(
      Array.from({ length: 5 }, (_, i) => v.getInt16(i * 2, true)),
    ).toEqual([-32768, -32768, 0, 32767, 32767]);
  });
  it("writes correct WAV duration, byte counts and sample rate", () => {
    const v = new DataView(wavHeader(16000, 16000));
    expect(v.getUint32(4, true)).toBe(32036);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(40, true)).toBe(32000);
  });
});
describe("video timeline", () => {
  it("maps source offset and playback speed, never plain recording elapsed time", () => {
    expect(locate([{ ...a, rate: 2 }], 1)?.videoTime).toBe(722);
  });
  it("starts a new interval after rewind", () => {
    expect(
      locate(
        [a, { ...a, audioTime: 120, videoTime: 480, event: "seeked" }],
        121,
      )?.videoTime,
    ).toBe(481);
  });
  it("rejects stale, paused, buffering or seeking mappings", () => {
    expect(locate([a], 10)).toBeNull();
    for (const event of ["seeking", "waiting", "emptied"])
      expect(locate([{ ...a, event }], 1)).toBeNull();
    expect(locate([{ ...a, playing: false }], 1)).toBeNull();
  });
  it("rejects malformed commands and never echoes an arbitrary secret-bearing error", () => {
    expect(
      CommandSchema.safeParse({ type: "START", source: "system" }).success,
    ).toBe(false);
    expect(safeError(new Error("private-provider-key"))).not.toContain(
      "private-provider-key",
    );
  });
});
