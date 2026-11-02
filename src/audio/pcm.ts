export function floatToPCM(input: Float32Array): ArrayBuffer {
  const out = new ArrayBuffer(input.length * 2),
    view = new DataView(out);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return out;
}
export function wavHeader(samples: number, sampleRate: number): ArrayBuffer {
  if (samples * 2 > 0xffffffff - 36)
    throw new Error(
      "NR:Audio is too large for a WAV file. Export smaller parts.",
    );
  const b = new ArrayBuffer(44),
    v = new DataView(b);
  const text = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples * 2, true);
  return b;
}
