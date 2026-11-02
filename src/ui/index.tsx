import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useData } from "./use-data";
import { AddToDocument, StudyDocuments } from "./study-documents";
import { db, readPCM, removeAudio, removeSession } from "../storage/db";
import {
  getSettings,
  getKey,
  saveSettings,
  deleteKey,
} from "../storage/settings";
import {
  DEFAULT_SETTINGS,
  id,
  stamp,
  type Session,
  type Settings,
  type Transcript,
  type Notes,
  type NoteFormat,
  type Segment,
} from "../domain/types";
import { safeError } from "../domain/validation";
import {
  enqueueTranscription,
  restartTranscription,
  enqueueNotes,
  retryFailed,
} from "../jobs/queue";
import { wavHeader } from "../audio/pcm";
import {
  testConnection,
  testAudioConnection,
  listModels,
  type AvailableModel,
} from "../providers/gemini";
import "./style.css";
async function command(data: Record<string, unknown>) {
  const result = await chrome.runtime.sendMessage(data);
  if (result?.error) throw new Error(`NR:${result.error}`);
  return result;
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function App() {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const path = location.pathname;
  const settingsPage = path.includes("settings"),
    micPage = path.includes("microphone"),
    wide = path.includes("library");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS),
    [source, setSource] = useState<"tab" | "microphone">("tab"),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [device, setDevice] = useState("");
  const [view, setView] = useState<
      "transcript" | "notes" | "library" | "documents"
    >(
      new URLSearchParams(location.search).get("view") === "documents"
        ? "documents"
        : "transcript",
    ),
    [selected, setSelected] = useState(""),
    [selectedTranscript, setSelectedTranscript] = useState(""),
    [selectedNotes, setSelectedNotes] = useState("");
  const [documentId, setDocumentId] = useState<string>();
  const [documentsDirty, setDocumentsDirty] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [key, setKey] = useState(""),
    [hasKey, setHasKey] = useState(false);
  const [query, setQuery] = useState(""),
    [edit, setEdit] = useState<Segment[] | null>(null),
    [format, setFormat] = useState<NoteFormat>("summary"),
    [language, setLanguage] = useState("English"),
    [length, setLength] = useState("medium"),
    [part, setPart] = useState(0);
  const [engine, setEngine] = useState<{
    active?: boolean;
    sessionId?: string;
    level?: number;
    paused?: boolean;
  }>({});
  const [audio, setAudio] = useState(""),
    [audioLabel, setAudioLabel] = useState("");
  const player = useRef<HTMLAudioElement>(null);
  const sessions = useData(
    () => db.sessions.orderBy("createdAt").reverse().toArray(),
    [],
    [] as Session[],
  );
  const session =
    sessions.find((s) => s.id === selected) ||
    sessions.find((s) => s.id === engine.sessionId) ||
    sessions[0];
  const transcripts = useData(
    () =>
      session
        ? db.transcripts
            .where("sessionId")
            .equals(session.id)
            .sortBy("createdAt")
        : Promise.resolve([]),
    [session?.id],
    [] as Transcript[],
  );
  const notes = useData(
    () =>
      session
        ? db.notes.where("sessionId").equals(session.id).sortBy("createdAt")
        : Promise.resolve([]),
    [session?.id],
    [] as Notes[],
  );
  const jobs = useData(
    () =>
      session
        ? db.jobs.where("sessionId").equals(session.id).toArray()
        : Promise.resolve([]),
    [session?.id],
    [] as import("../domain/types").Job[],
  );
  const transcript =
    transcripts.find((t) => t.id === selectedTranscript) || transcripts.at(-1);
  const note = notes.find((n) => n.id === selectedNotes) || notes.at(-1);
  const active =
    !!session && ["starting", "recording", "paused"].includes(session.state);
  const activeOther = engine.active && engine.sessionId !== session?.id;
  useEffect(() => {
    void getSettings().then(setSettings);
    void getKey().then((k) => setHasKey(!!k));
    void navigator.mediaDevices
      .enumerateDevices()
      .then((ds) => setDevices(ds.filter((d) => d.kind === "audioinput")))
      .catch(() => {});
    const poll = () =>
      void command({ type: "STATUS" })
        .then(setEngine)
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 1000);
    const refreshSettings = () => {
      void getSettings().then(setSettings);
      void getKey().then((value) => setHasKey(!!value));
    };
    chrome.storage.onChanged?.addListener(refreshSettings);
    return () => {
      clearInterval(timer);
      chrome.storage.onChanged?.removeListener(refreshSettings);
    };
  }, []);
  useEffect(() => {
    const current = sessions.find((s) => s.id === engine.sessionId);
    if (engine.active && current) setSource(current.source);
  }, [engine.sessionId, engine.active, sessions]);
  useEffect(() => {
    setEdit(null);
    setPart(0);
    setAudio("");
    setSelectedTranscript("");
    setSelectedNotes("");
  }, [session?.id]);
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  async function allowMic() {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    s.getTracks().forEach((t) => t.stop());
    setDevices(
      (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "audioinput",
      ),
    );
    setMessage(
      "Microphone permission granted. You can return to the side panel.",
    );
  }
  async function start() {
    const result = await command({
      type: "START",
      source,
      deviceId: device || undefined,
      progressive: settings.progressive,
    });
    setSelected(result.sessionId);
    setView("transcript");
  }
  async function transcribe() {
    if (!session) return;
    if (!(await getKey()))
      throw new Error("NR:Add your Gemini key in Settings first.");
    await enqueueTranscription(session.id, settings, !active);
    await command({ type: "RUN_JOBS" });
    setMessage(
      "Audio queued for Gemini transcription. Your local recording is retained.",
    );
  }
  async function generate() {
    if (!session || !transcript) return;
    if (!(await getKey()))
      throw new Error("NR:Add your Gemini key in Settings first.");
    await enqueueNotes(
      session.id,
      transcript.id,
      settings,
      format,
      language,
      length,
    );
    await command({ type: "RUN_JOBS" });
    setMessage("Notes queued using your saved transcript.");
    setView("notes");
  }
  async function playback(time: number) {
    if (!session) return;
    const result = await command({
      type: "SEEK",
      sessionId: session.id,
      audioTime: time,
    });
    if (result?.ok) {
      setMessage("Video position updated (approximate).");
      return;
    }
    if (session.audioDeleted)
      throw new Error(
        "NR:Original-video navigation is unavailable and saved audio was deleted.",
      );
    const start = Math.max(0, Math.floor(time * session.sampleRate));
    const end = Math.min(session.totalSamples, start + session.sampleRate * 60);
    if (start >= end) throw new Error("NR:No saved audio at this position.");
    const pcm = await readPCM(session.id, start, end);
    setAudio(
      URL.createObjectURL(
        new Blob([wavHeader(end - start, session.sampleRate), ...pcm], {
          type: "audio/wav",
        }),
      ),
    );
    setAudioLabel(`Saved audio from ${stamp(time)} · up to 1 minute`);
    setMessage(
      "Original-video seeking unavailable. Playing the saved audio excerpt.",
    );
  }
  async function exportAudio() {
    if (!session) return;
    const start = part * 600 * session.sampleRate,
      end = Math.min(session.totalSamples, start + 600 * session.sampleRate);
    const pcm = await readPCM(session.id, start, end);
    download(
      new Blob([wavHeader(end - start, session.sampleRate), ...pcm], {
        type: "audio/wav",
      }),
      `NoteRelay-${session.id}-part-${part + 1}.wav`,
    );
  }
  async function saveEdit() {
    if (!transcript || !edit) return;
    const tid = id();
    await db.transcripts.add({
      ...transcript,
      id: tid,
      parentId: transcript.id,
      createdAt: Date.now(),
      segments: edit,
      revision: transcript.revision + 1,
    });
    setSelectedTranscript(tid);
    setEdit(null);
    setMessage(
      "Saved as a new transcript version. Existing notes retain their original source version.",
    );
  }
  function exportText(kind: "transcript" | "notes" | "json") {
    if (!session) return;
    if (kind === "json") {
      download(
        new Blob([JSON.stringify({ session, transcripts, notes }, null, 2)], {
          type: "application/json",
        }),
        `NoteRelay-${session.id}.json`,
      );
      return;
    }
    const text =
      kind === "transcript"
        ? transcript?.segments
            .map((s) => `[${stamp(s.start)}] ${s.text}`)
            .join("\n\n")
        : note &&
          `# ${note.title}\n\n${note.sections
            .map(
              (s) =>
                `## ${s.heading}${s.kind === "explanation" ? " (supplementary explanation)" : ""}\n\n${s.content}\n\nSources: ${s.sourceIds
                  .map((i) => {
                    const seg = transcripts
                      .find((t) => t.id === note.transcriptId)
                      ?.segments.find((x) => x.id === i);
                    return seg ? `[${stamp(seg.start)}] (${i})` : i;
                  })
                  .join(", ")}`,
            )
            .join("\n\n")}\n\n${note.warnings.join("\n")}`;
    if (text)
      download(
        new Blob([text], { type: "text/plain;charset=utf-8" }),
        `NoteRelay-${kind}.${kind === "notes" ? "md" : "txt"}`,
      );
  }
  const header = (
    <header>
      <a className="brand" href="index.html">
        <span className="brand-icon">▥</span>NoteRelay
        <span className="version">preview</span>
      </a>
      <button
        className="icon-button"
        aria-label="Open settings"
        onClick={() =>
          void perform(async () => {
            await command({ type: "OPEN", page: "settings" });
          })
        }
      >
        ⚙
      </button>
    </header>
  );
  const alerts = (
    <div aria-live="polite">
      {error && (
        <div role="alert" className="notice danger">
          {error}
        </div>
      )}
      {message && <div className="notice success">{message}</div>}
    </div>
  );
  if (settingsPage || micPage)
    return (
      <main className="settings-shell">
        {header}
        <div className="eyebrow">YOUR WORKSPACE</div>
        <h1>{micPage ? "Microphone setup" : "Settings"}</h1>
        <p className="muted">
          Your recordings stay on this device. Gemini processes only the audio
          or text you choose to send.
        </p>
        {alerts}
        {micPage ? (
          <section className="card">
            <h2>Record a classroom lecture</h2>
            <p>
              Use this page to grant microphone access. Ask the teacher for
              permission and follow your institution’s recording rules.
            </p>
            <button disabled={busy} onClick={() => void perform(allowMic)}>
              Allow microphone access
            </button>
            <p className="muted">
              The permission test stops immediately. No audio is stored or
              uploaded.
            </p>
            {devices.map((d) => (
              <p key={d.deviceId}>🎙 {d.label || "Microphone"}</p>
            ))}
          </section>
        ) : (
          <>
            <section className="card">
              <h2>Gemini API</h2>
              <p className="muted">
                Requests use your Google project’s quota and billing. A Notes
                testing sends a small text request. Audio testing sends 0.25
                seconds of synthetic silence, never a saved lecture. Neither
                test measures transcription quality.
              </p>
              <label>
                API key
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    hasKey
                      ? "A key is configured — enter to replace"
                      : "Paste your Gemini API key"
                  }
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.rememberKey}
                  onChange={(e) =>
                    setSettings({ ...settings, rememberKey: e.target.checked })
                  }
                />
                Remember key on this device
              </label>
              <p className="hint">
                Without this option, the key lasts for this browser session.
                Device storage is not a secure vault. Keys are never
                synchronized.
              </p>
              <div className="fields">
                <label>
                  Transcription model
                  <input
                    list="gemini-models"
                    value={settings.transcriptionModel}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        transcriptionModel: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Notes model
                  <input
                    list="gemini-models"
                    value={settings.summaryModel}
                    onChange={(e) =>
                      setSettings({ ...settings, summaryModel: e.target.value })
                    }
                  />
                </label>
              </div>
              <datalist id="gemini-models">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </datalist>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const available = await listModels(
                        key || (await getKey()),
                      );
                      setModels(available);
                      setMessage(
                        `${available.length} GenerateContent models loaded. Choose a model in the fields and test its audio support. Listing alone does not verify billing or inference access.`,
                      );
                    })
                  }
                >
                  Load available models
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setSettings({
                      ...settings,
                      transcriptionModel: DEFAULT_SETTINGS.transcriptionModel,
                      summaryModel: DEFAULT_SETTINGS.summaryModel,
                    });
                    setMessage(
                      "Current default models selected. Test them, then save settings.",
                    );
                  }}
                >
                  Use current defaults
                </button>
              </div>
              <p className="hint">
                Gemini 2.5 access is restricted for new projects. Current
                default: Gemini 3.5 Flash-Lite. Existing saved model choices are
                preserved until you change them. After changing the
                transcription model, save settings and choose Create new
                transcription version for an existing recording.
              </p>
              <p className="hint">
                Use GenerateContent models that support audio and structured
                JSON. Dedicated Transcribe/Live model adapters are not included
                in this release.
              </p>
              <div className="button-row">
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      if (
                        !/^[\w.-]+$/.test(settings.transcriptionModel) ||
                        !/^[\w.-]+$/.test(settings.summaryModel)
                      )
                        throw new Error("NR:Enter valid model IDs.");
                      await saveSettings(settings, key || undefined);
                      setKey("");
                      setHasKey(!!(await getKey()));
                      setMessage("Settings saved.");
                    })
                  }
                >
                  Save settings
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await testConnection(
                        key || (await getKey()),
                        settings.summaryModel,
                      );
                      setMessage("Gemini text connection succeeded.");
                    })
                  }
                >
                  Test notes connection
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await testAudioConnection(
                        key || (await getKey()),
                        settings.transcriptionModel,
                      );
                      setMessage(
                        "Transcription audio request succeeded. This synthetic-silence test verifies API/audio/JSON access, not speech accuracy.",
                      );
                    })
                  }
                >
                  Test transcription audio
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await deleteKey();
                      setKey("");
                      setHasKey(false);
                      setMessage("API key removed.");
                    })
                  }
                >
                  Remove key
                </button>
              </div>
            </section>
            <section className="card">
              <h2>Recording preferences</h2>
              <label>
                Transcription language
                <select
                  value={settings.language}
                  onChange={(e) =>
                    setSettings({ ...settings, language: e.target.value })
                  }
                >
                  <option value="auto">Detect automatically</option>
                  <option value="English">English</option>
                  <option value="French">French</option>
                  <option value="English and French">English + French</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.progressive}
                  onChange={(e) =>
                    setSettings({ ...settings, progressive: e.target.checked })
                  }
                />
                Send saved audio to Gemini progressively while recording
              </label>
              <p className="hint">
                Off by default. When enabled, saved audio is sent in 30-second
                requests. Network failures do not stop recording. Save settings
                to apply.
              </p>
              <button
                className="secondary"
                onClick={() =>
                  void perform(async () => {
                    await command({ type: "OPEN", page: "microphone" });
                  })
                }
              >
                Set up microphone
              </button>
            </section>
            <section className="card">
              <h2>Privacy and storage</h2>
              <p>
                Audio, transcripts, and notes are kept in this Chrome profile.
                Uninstalling the extension removes local data. Export anything
                you want to keep independently.
              </p>
              <p>
                Notes are generated from audio and may miss visual material.
                Review important facts against the source.
              </p>
              <a
                href="https://ai.google.dev/gemini-api/terms"
                target="_blank"
                rel="noreferrer"
              >
                Google API terms ↗
              </a>
            </section>
          </>
        )}
      </main>
    );
  return (
    <main className={wide ? "workspace wide" : "workspace"}>
      {header}
      <div className="intro">
        <div className="eyebrow">YOUR LECTURE, CONNECTED</div>
        <h1>Listen. Learn. Revisit.</h1>
        <p className="muted">Keep the words. Find the moment.</p>
      </div>
      {alerts}
      {(view !== "documents" || engine.active) && (
        <section className="capture card">
          <div className="source-toggle">
            <button
              className={source === "tab" ? "chosen" : ""}
              disabled={engine.active || busy}
              onClick={() => setSource("tab")}
            >
              ▣ Browser tab
            </button>
            <button
              className={source === "microphone" ? "chosen" : ""}
              disabled={engine.active || busy}
              onClick={() => setSource("microphone")}
            >
              ♩ Microphone
            </button>
          </div>
          {source === "microphone" && (
            <>
              <label>
                Input device
                <select
                  value={device}
                  disabled={engine.active}
                  onChange={(e) => setDevice(e.target.value)}
                >
                  <option value="">Default microphone</option>
                  {devices
                    .filter((d) => d.deviceId && d.deviceId !== "default")
                    .map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || "Microphone"}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="text-button"
                onClick={() =>
                  void perform(async () => {
                    await command({ type: "OPEN", page: "microphone" });
                  })
                }
              >
                Grant microphone access ↗
              </button>
              <p className="hint">
                Record with your teacher’s permission. No microphone monitoring
                is played through speakers.
              </p>
            </>
          )}
          <div className="record-row">
            <span
              className={engine.active ? "record-dot live" : "record-dot"}
            />
            <div>
              <strong>
                {engine.active
                  ? engine.paused
                    ? "Paused"
                    : "Recording"
                  : "Ready to record"}
              </strong>
              <span className="muted tiny">
                {engine.active
                  ? (sessions.find((s) => s.id === engine.sessionId)?.title ??
                    "Starting…")
                  : source === "tab"
                    ? "Only the selected tab’s audio"
                    : "Your selected microphone"}
              </span>
            </div>
            <span className="timer">
              {stamp(
                (sessions.find((s) => s.id === engine.sessionId)
                  ?.totalSamples ?? 0) /
                  (sessions.find((s) => s.id === engine.sessionId)
                    ?.sampleRate ?? 16000),
              )}
            </span>
          </div>
          {engine.active ? (
            <div className="button-row">
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await command({
                      type: "CONTROL",
                      action: engine.paused ? "resume" : "pause",
                    });
                  })
                }
              >
                {engine.paused ? "Resume" : "Pause"}
              </button>
              <button
                className="stop"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await command({ type: "CONTROL", action: "stop" });
                  })
                }
              >
                Stop & save
              </button>
            </div>
          ) : (
            <button
              className="full"
              disabled={busy}
              onClick={() => void perform(start)}
            >
              ● Start recording
            </button>
          )}
          {engine.active && (
            <div className="level-row">
              <span>Input</span>
              <meter
                min="0"
                max="0.5"
                value={engine.level ?? 0}
                aria-label="Audio input level"
              />
            </div>
          )}
          <div className="local-status">
            ✓{" "}
            {session
              ? `Saved locally through ${stamp(session.totalSamples / session.sampleRate)}`
              : "Audio is saved locally before processing"}
          </div>
          {activeOther && (
            <p className="hint">
              Another lecture is recording. Controls above apply to that active
              recording.
            </p>
          )}
        </section>
      )}
      <nav aria-label="Workspace views">
        {(["transcript", "notes", "library", "documents"] as const).map((v) => (
          <button
            key={v}
            className={view === v ? "active" : ""}
            onClick={() => {
              if (
                view === "documents" &&
                documentsDirty &&
                v !== "documents" &&
                !confirm("Discard unsaved document edits?")
              )
                return;
              setDocumentsDirty(false);
              setView(v);
            }}
          >
            {v[0].toUpperCase() + v.slice(1)}
            {v === "library" && (
              <span className="count">{sessions.length}</span>
            )}
          </button>
        ))}
      </nav>
      {view !== "documents" && session && (
        <div className="session-heading">
          <strong>{session.title}</strong>
          <span className={`status ${session.state}`}>{session.state}</span>
        </div>
      )}
      {session?.error && <div className="notice">{session.error}</div>}
      {jobs.some((j) => j.status === "pending" || j.status === "running") && (
        <div className="notice">
          Processing {jobs.filter((j) => j.status === "done").length}/
          {jobs.length} tasks ·{" "}
          {jobs.find((j) => j.error)?.error ?? "You can keep watching."}
        </div>
      )}
      {jobs.some((j) => j.status === "failed") && (
        <div className="notice danger">
          {jobs.find((j) => j.status === "failed")?.error}
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await retryFailed(session!.id);
                await command({ type: "RUN_JOBS" });
              })
            }
          >
            Retry failed tasks
          </button>
        </div>
      )}
      {audio && (
        <section className="audio-player">
          <span className="tiny">{audioLabel}</span>
          <audio controls autoPlay ref={player} src={audio} />
        </section>
      )}
      {view === "transcript" && (
        <>
          {!transcript?.segments.length ? (
            <div className="empty">
              <span className="empty-icon">≋</span>
              <h2>Your lecture starts here</h2>
              <p>
                Record a tab or classroom lecture, then transcribe the saved
                audio. Your words will appear here with source timestamps.
              </p>
            </div>
          ) : (
            <>
              <div className="toolbar">
                <input
                  aria-label="Search transcript"
                  placeholder="Search this transcript…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Transcript version"
                  value={transcript.id}
                  onChange={(e) => {
                    setSelectedTranscript(e.target.value);
                    setEdit(null);
                  }}
                >
                  {transcripts.map((t, i) => (
                    <option key={t.id} value={t.id}>
                      Version {i + 1}
                      {t.parentId ? " · edited" : ""} · {t.status}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint">
                Timestamps are approximate. Click to seek the supported video or
                play saved audio.
              </p>
              <div className="segments">
                {(edit ?? transcript.segments)
                  .filter((s) =>
                    s.text.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((s) => (
                    <article className="segment" key={s.id}>
                      <button
                        className="timestamp"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => playback(s.start))
                        }
                      >
                        {stamp(s.start)}
                      </button>
                      {edit ? (
                        <textarea
                          aria-label={`Transcript at ${stamp(s.start)}`}
                          value={s.text}
                          onChange={(e) =>
                            setEdit(
                              edit.map((x) =>
                                x.id === s.id
                                  ? { ...x, text: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      ) : (
                        <p>{s.text}</p>
                      )}
                    </article>
                  ))}
              </div>
              <div className="button-row">
                {edit ? (
                  <>
                    <button onClick={() => void perform(saveEdit)}>
                      Save new version
                    </button>
                    <button className="secondary" onClick={() => setEdit(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="secondary"
                      disabled={active || transcript.status !== "complete"}
                      onClick={() =>
                        setEdit(transcript.segments.map((s) => ({ ...s })))
                      }
                    >
                      Edit transcript
                    </button>
                    <button
                      className="text-button"
                      onClick={() => exportText("transcript")}
                    >
                      Export TXT ↓
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {session && !session.audioDeleted && (
            <button
              className="full"
              disabled={
                busy ||
                (active && !settings.progressive) ||
                session.totalSamples === 0
              }
              onClick={() => void perform(transcribe)}
            >
              Transcribe saved audio with Gemini
            </button>
          )}
          {session && !session.audioDeleted && transcripts.length > 0 && (
            <button
              className="text-button"
              disabled={busy || active}
              onClick={() => {
                if (
                  confirm(
                    "Create another transcription version? This sends the saved audio to Gemini again and may incur charges.",
                  )
                )
                  void perform(async () => {
                    if (!(await getKey()))
                      throw new Error(
                        "NR:Add your Gemini key in Settings first.",
                      );
                    await restartTranscription(session.id, await getSettings());
                    setSelectedTranscript("");
                    setEdit(null);
                    await command({ type: "RUN_JOBS" });
                    setMessage(
                      "New transcription version queued using your current model and language settings.",
                    );
                  });
              }}
            >
              Create new transcription version
            </button>
          )}
          {session && (
            <p className="hint">
              Transcription sends audio to Google using your API key. Repeated
              clicks reuse existing tasks. Silence may produce an empty
              transcript.
            </p>
          )}
        </>
      )}
      {view === "notes" && (
        <>
          <div className="card">
            <h2>Make it yours</h2>
            <div className="fields">
              <label>
                Format
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as NoteFormat)}
                >
                  {[
                    "summary",
                    "detailed",
                    "concepts",
                    "takeaways",
                    "study-guide",
                    "flashcards",
                    "quiz",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v.replaceAll("-", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Language
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option>English</option>
                  <option>French</option>
                </select>
              </label>
              <label>
                Length
                <select
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                >
                  <option>short</option>
                  <option>medium</option>
                  <option>detailed</option>
                </select>
              </label>
            </div>
            <button
              className="full"
              disabled={
                busy ||
                !transcript?.segments.length ||
                transcript.status !== "complete"
              }
              onClick={() => void perform(generate)}
            >
              ✧ Generate notes
            </button>
            <p className="hint">
              Uses your saved transcript. Audio is not sent again.
            </p>
          </div>
          {note ? (
            <>
              <label>
                Saved output
                <select
                  value={note.id}
                  onChange={(e) => setSelectedNotes(e.target.value)}
                >
                  {notes.map((n, i) => (
                    <option key={n.id} value={n.id}>
                      {i + 1}. {n.format} · {n.language} ·{" "}
                      {new Date(n.createdAt).toLocaleTimeString()}
                    </option>
                  ))}
                </select>
              </label>
              {note.transcriptId !== transcript?.id && (
                <div className="notice">
                  These notes use a different transcript version.
                </div>
              )}
              <article className="notes-document">
                <h2>{note.title}</h2>
                {note.sections.map((s, i) => (
                  <section key={i}>
                    <h3>{s.heading}</h3>
                    {s.kind === "explanation" && (
                      <span className="explanation">
                        Supplementary AI explanation
                      </span>
                    )}
                    <p>{s.content}</p>
                    <div className="sources">
                      {s.sourceIds.map((sid) => {
                        const sourceSegment = transcripts
                          .find((t) => t.id === note.transcriptId)
                          ?.segments.find((x) => x.id === sid);
                        return sourceSegment ? (
                          <button
                            className="timestamp"
                            key={sid}
                            disabled={busy}
                            onClick={() =>
                              void perform(async () =>
                                playback(sourceSegment.start),
                              )
                            }
                          >
                            ↗ {stamp(sourceSegment.start)}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </section>
                ))}
              </article>
              {note.warnings.map((w, i) => (
                <div key={i} className="notice">
                  {w}
                </div>
              ))}
              <AddToDocument
                key={note.id}
                notesId={note.id}
                onAdded={(id) => {
                  setDocumentId(id);
                  setView("documents");
                  setMessage(
                    "Chapter saved in your study document. Export PDF to create or update a file.",
                  );
                }}
              />
              <button className="secondary" onClick={() => exportText("notes")}>
                Export Markdown ↓
              </button>
            </>
          ) : (
            <div className="empty">
              <h2>Turn listening into understanding</h2>
              <p>
                Generate source-linked notes once your transcript is complete.
              </p>
            </div>
          )}
        </>
      )}
      {view === "documents" && (
        <StudyDocuments
          key={documentId ?? "documents"}
          initialId={documentId}
          onDirtyChange={setDocumentsDirty}
        />
      )}
      {view === "library" && (
        <>
          <div className="library-top">
            <h2>Saved lectures</h2>
            {!wide && (
              <button
                className="text-button"
                onClick={() =>
                  void perform(async () => {
                    await command({ type: "OPEN", page: "library" });
                  })
                }
              >
                Open full Library ↗
              </button>
            )}
          </div>
          <input
            aria-label="Search library"
            placeholder="Search lecture titles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {sessions
            .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
            .map((s) => (
              <button
                className={`lecture-card ${session?.id === s.id ? "selected" : ""}`}
                key={s.id}
                onClick={() => {
                  setSelected(s.id);
                  setQuery("");
                }}
              >
                <span className="lecture-icon">
                  {s.source === "tab" ? "▣" : "♩"}
                </span>
                <span>
                  <strong>{s.title}</strong>
                  <span className="tiny muted">
                    {new Date(s.createdAt).toLocaleDateString()} ·{" "}
                    {stamp(s.totalSamples / s.sampleRate)} · {s.state}
                    {s.audioDeleted ? " · audio deleted" : ""}
                  </span>
                </span>
              </button>
            ))}
          {!sessions.length && (
            <div className="empty">Your saved lectures will appear here.</div>
          )}
          {session && (
            <section className="card">
              <h2>Manage selected lecture</h2>
              <label>
                Title
                <input
                  value={session.title}
                  maxLength={200}
                  onChange={(e) =>
                    void db.sessions.update(session.id, {
                      title: e.target.value,
                    })
                  }
                />
              </label>
              {session.url && (
                <a href={session.url} target="_blank" rel="noreferrer">
                  Open source lecture ↗
                </a>
              )}
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => {
                    setView("transcript");
                    setQuery("");
                  }}
                >
                  View transcript
                </button>
                <button
                  className="secondary"
                  onClick={() => exportText("json")}
                >
                  Export session JSON
                </button>
              </div>
              {!session.audioDeleted && session.totalSamples > 0 && (
                <>
                  <label>
                    Audio export part (10-minute files)
                    <select
                      value={part}
                      onChange={(e) => setPart(Number(e.target.value))}
                    >
                      {Array.from(
                        {
                          length: Math.ceil(
                            session.totalSamples / session.sampleRate / 600,
                          ),
                        },
                        (_, i) => (
                          <option key={i} value={i}>
                            {stamp(i * 600)} –{" "}
                            {stamp(
                              Math.min(
                                (i + 1) * 600,
                                session.totalSamples / session.sampleRate,
                              ),
                            )}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <button
                    disabled={busy || active}
                    className="secondary"
                    onClick={() => void perform(exportAudio)}
                  >
                    Export selected WAV part ↓
                  </button>
                </>
              )}
              <div className="button-row">
                <button
                  className="text-button destructive"
                  disabled={busy || active || session.audioDeleted}
                  onClick={() => {
                    if (
                      confirm(
                        "Delete saved audio? Transcripts and notes will be kept.",
                      )
                    )
                      void perform(async () => {
                        await removeAudio(session.id);
                        setAudio("");
                      });
                  }}
                >
                  Delete audio only
                </button>
                <button
                  className="text-button destructive"
                  disabled={busy || active}
                  onClick={() => {
                    if (
                      confirm(
                        "Permanently delete this lecture, audio, transcripts, and notes?",
                      )
                    )
                      void perform(async () => {
                        await removeSession(session.id);
                        setSelected("");
                      });
                  }}
                >
                  Delete lecture
                </button>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  void perform(async () => {
                    const ids = await db.jobs
                      .where("sessionId")
                      .equals(session.id)
                      .primaryKeys();
                    const usage = await db.usage
                      .where("jobId")
                      .anyOf(ids)
                      .toArray();
                    download(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              usage,
                              jobs: jobs.map((j) => ({
                                kind: j.kind,
                                status: j.status,
                                attempts: j.attempts,
                              })),
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      ),
                      "NoteRelay-usage.json",
                    );
                  })
                }
              >
                Export usage measurements ↓
              </button>
            </section>
          )}
        </>
      )}
      <footer>
        Saved on your device <span>·</span> Review AI notes against the source
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
