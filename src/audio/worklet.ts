// AudioWorklet globals are intentionally isolated from window/extension APIs.
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  port: MessagePort;
  constructor();
}
declare function registerProcessor(
  name: string,
  processor: typeof AudioWorkletProcessor,
): void;
class PCMRecorder extends AudioWorkletProcessor {
  private buffer = new Float32Array(sampleRate);
  private used = 0;
  private total = 0;
  private paused = false;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data.type === "anchor") {
        this.port.postMessage({
          type: "anchor",
          data: data.data,
          samples: this.total,
        });
        return;
      }
      if (data.type === "pause" || data.type === "stop") {
        this.flush();
        this.paused = true;
      }
      if (data.type === "resume") this.paused = false;
      this.port.postMessage({
        type: "ack",
        requestId: data.requestId,
        samples: this.total,
      });
    };
  }
  private flush() {
    if (!this.used) return;
    const chunk = this.buffer.slice(0, this.used);
    this.port.postMessage(
      {
        type: "pcm",
        samples: chunk,
        start: this.total - this.used,
        time: currentTime,
      },
      [chunk.buffer],
    );
    this.used = 0;
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const channels = inputs[0];
    if (!channels?.length || this.paused) return true;
    const length = channels[0].length;
    // Output remains silent: tab monitoring is connected separately, microphone is never monitored.
    for (const output of outputs[0] ?? []) output.fill(0);
    for (let i = 0; i < length; i++) {
      let s = 0;
      for (const c of channels) s += c[i] ?? 0;
      this.buffer[this.used++] = s / channels.length;
      this.total++;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor("noterelay-pcm", PCMRecorder);
