import { db, commitBlock, recoverInterrupted } from "../storage/db";
import { floatToPCM } from "../audio/pcm";
import { id, type Session, type Settings } from "../domain/types";
import { enqueueTranscription, finishTranscript, runOne } from "../jobs/queue";
import { PlayerSchema, safeError } from "../domain/validation";
let stream: MediaStream | undefined,
  context: AudioContext | undefined,
  node: AudioWorkletNode | undefined,
  session: Session | undefined;
let writeQueue = Promise.resolve(),
  pendingWrites = 0,
  level = 0,
  stopping = false,
  processing = false,
  sequence = 0,
  writeError = "";
const waiters = new Map<string, () => void>();
const ready = recoverInterrupted();
function requestWorklet(type: string) {
  return new Promise<void>((resolve, reject) => {
    const requestId = id();
    const timeout = setTimeout(() => {
      waiters.delete(requestId);
      reject(
        new Error(
          "NR:Audio engine did not respond. Saved blocks are retained.",
        ),
      );
    }, 3000);
    waiters.set(requestId, () => {
      clearTimeout(timeout);
      resolve();
    });
    node?.port.postMessage({ type, requestId });
  });
}
async function config(): Promise<{ key: string; settings: Settings }> {
  return chrome.runtime.sendMessage({ type: "ENGINE_CONFIG" });
}
async function tickJobs() {
  if (processing) return;
  processing = true;
  try {
    const c = await config();
    if (c.key) await runOne(c.key);
  } finally {
    processing = false;
  }
}
async function release() {
  stream?.getTracks().forEach((t) => {
    t.onended = null;
    t.stop();
  });
  stream = undefined;
  node?.disconnect();
  node = undefined;
  await context?.close();
  context = undefined;
  level = 0;
  void chrome.runtime.sendMessage({ type: "ENGINE_BADGE", active: false });
}
async function fail(message: string) {
  if (!session || stopping) return;
  stopping = true;
  const sid = session.id;
  try {
    await requestWorklet("stop").catch(() => {});
    await writeQueue;
    await db.sessions.update(sid, {
      state: "error",
      error: message,
      updatedAt: Date.now(),
    });
  } finally {
    await release();
    session = undefined;
    stopping = false;
  }
}
async function start(data: {
  sessionId: string;
  source: "tab" | "microphone";
  deviceId?: string;
  streamId?: string;
}) {
  if (session) throw new Error("NR:Another recording is active.");
  session = await db.sessions.get(data.sessionId);
  if (!session) throw new Error("NR:Session could not be created.");
  sequence = 0;
  writeQueue = Promise.resolve();
  pendingWrites = 0;
  writeError = "";
  try {
    if (data.source === "tab") {
      const audio = {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: data.streamId,
        },
      } as unknown as MediaTrackConstraints;
      stream = await navigator.mediaDevices.getUserMedia({
        audio,
        video: false,
      });
    } else
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: data.deviceId ? { exact: data.deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    context = new AudioContext({ sampleRate: 16000 });
    await context.audioWorklet.addModule(chrome.runtime.getURL("worklet.js"));
    await context.resume();
    session.sampleRate = context.sampleRate;
    await db.sessions.update(session.id, {
      sampleRate: context.sampleRate,
      state: "recording",
      error: undefined,
    });
    const source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, "noterelay-pcm", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    if (data.source === "tab") source.connect(context.destination);
    source.connect(node);
    node.connect(context.destination);
    node.port.onmessage = ({ data: frame }) => {
      if (frame.type === "ack") {
        waiters.get(frame.requestId)?.();
        waiters.delete(frame.requestId);
        return;
      }
      if (!session) return;
      if (frame.type === "anchor") {
        const parsed = PlayerSchema.safeParse(frame.data);
        if (parsed.success)
          void db.anchors.add({
            ...parsed.data,
            id: undefined,
            sessionId: session.id,
            audioTime: frame.samples / session.sampleRate,
            uncertainty: 0.5,
          });
        return;
      }
      if (frame.type !== "pcm") return;
      const samples = frame.samples as Float32Array;
      let energy = 0;
      for (const x of samples) energy += x * x;
      level = Math.sqrt(energy / Math.max(1, samples.length));
      const block = {
        id: `${session.id}:${sequence}`,
        sessionId: session.id,
        seq: sequence++,
        start: frame.start as number,
        end: (frame.start as number) + samples.length,
        pcm: floatToPCM(samples),
      };
      pendingWrites++;
      if (pendingWrites > 8) {
        void fail(
          "Local storage cannot keep up. Recording stopped; committed audio is retained.",
        );
        return;
      }
      writeQueue = writeQueue
        .then(() => commitBlock(block))
        .catch(() => {
          writeError =
            "Audio could not be saved. Recording stopped; previously committed blocks are retained.";
          void fail(writeError);
        })
        .finally(() => {
          pendingWrites--;
        });
    };
    for (const track of stream.getAudioTracks())
      track.onended = () => {
        void stop(
          "interrupted",
          "The audio source disconnected. Saved audio is retained.",
        );
      };
    session.state = "recording";
    return { ok: true };
  } catch (error) {
    const message = safeError(error);
    await db.sessions.update(data.sessionId, {
      state: "error",
      error: message,
    });
    await release();
    session = undefined;
    throw error;
  }
}
async function stop(
  state: "stopped" | "interrupted" = "stopped",
  error?: string,
) {
  if (!session || stopping) return { ok: true };
  stopping = true;
  const sid = session.id;
  try {
    await requestWorklet("stop");
    await writeQueue;
    if (writeError) {
      await db.sessions.update(sid, {
        state: "error",
        error: writeError,
        updatedAt: Date.now(),
      });
      throw new Error(`NR:${writeError}`);
    }
    await db.sessions.update(sid, { state, error, updatedAt: Date.now() });
    const c = await config();
    if ((await db.sessions.get(sid))?.progressive)
      await enqueueTranscription(sid, c.settings, true);
    const s = await db.sessions.get(sid);
    if (s?.activeTranscriptId) await finishTranscript(s.activeTranscriptId);
    return { ok: true };
  } catch (failure) {
    await db.sessions.update(sid, {
      state: "interrupted",
      error: safeError(failure),
      updatedAt: Date.now(),
    });
    throw failure;
  } finally {
    await release();
    session = undefined;
    stopping = false;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    message?.target !== "engine" ||
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    (sender.url && !sender.url.startsWith(chrome.runtime.getURL("")))
  )
    return false;
  (async () => {
    await ready;
    switch (message.type) {
      case "PING":
        return { ok: true };
      case "START":
        return start(message);
      case "STATUS":
        return {
          ok: true,
          active: !!session,
          sessionId: session?.id,
          level,
          paused: session?.state === "paused",
        };
      case "ANCHOR":
        if (session?.id === message.sessionId && session?.state === "recording")
          node?.port.postMessage({ type: "anchor", data: message.data });
        return { ok: true };
      case "CONTROL":
        if (!session) return { ok: true };
        if (message.action === "stop") return stop();
        if (message.action === "pause" || message.action === "resume") {
          await requestWorklet(message.action);
          session.state = message.action === "pause" ? "paused" : "recording";
          await db.sessions.update(session.id, {
            state: session.state,
            updatedAt: Date.now(),
          });
        }
        return { ok: true };
      case "RUN_JOBS":
        void tickJobs().catch(() => {});
        return { ok: true };
    }
  })()
    .then(reply)
    .catch((error) => reply({ ok: false, error: safeError(error) }));
  return true;
});
setInterval(() => {
  void (async () => {
    await ready;
    if (session?.progressive && session.state === "recording") {
      const c = await config();
      await enqueueTranscription(session.id, c.settings);
    }
    await tickJobs();
  })().catch(() => {});
}, 3000);
