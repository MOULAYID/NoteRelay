import { db } from "../storage/db";
import { id, type Settings, type Job, type NoteFormat } from "../domain/types";
import { gemini, ProviderError } from "../providers/gemini";
import { readPCM } from "../storage/db";
import { wavHeader } from "../audio/pcm";
export const WINDOW_SECONDS = 30;
export async function enqueueTranscription(
  sessionId: string,
  settings: Settings,
  final = false,
) {
  await db.transaction("rw", db.sessions, db.transcripts, db.jobs, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.audioDeleted) return;
    let tid = s.activeTranscriptId;
    if (!tid) {
      tid = id();
      await db.transcripts.add({
        id: tid,
        sessionId,
        createdAt: Date.now(),
        model: settings.transcriptionModel,
        language: settings.language,
        segments: [],
        status: "processing",
        revision: 1,
      });
      await db.sessions.update(s.id, { activeTranscriptId: tid });
    }
    const transcript = await db.transcripts.get(tid);
    if (!transcript || transcript.parentId) return;
    // Existing jobs pin the model/language, so a settings change cannot mix providers in one transcript.
    const width = s.sampleRate * WINDOW_SECONDS;
    const limit = final
      ? s.totalSamples
      : Math.floor(s.totalSamples / width) * width;
    for (let start = 0; start < limit; start += width) {
      const end = Math.min(start + width, limit),
        jid = `transcribe:${tid}:${start}`;
      if (!(await db.jobs.get(jid)))
        await db.jobs.add({
          id: jid,
          sessionId,
          transcriptId: tid,
          kind: "transcribe",
          start,
          end,
          status: "pending",
          attempts: 0,
          nextRun: 0,
          leaseUntil: 0,
          model: transcript.model,
          language: transcript.language,
          createdAt: Date.now(),
        });
    }
  });
}
export async function enqueueNotes(
  sessionId: string,
  transcriptId: string,
  settings: Settings,
  format: NoteFormat,
  language: string,
  length: string,
) {
  const transcript = await db.transcripts.get(transcriptId);
  if (!transcript?.segments.length)
    throw new Error("NR:Create a non-empty transcript first.");
  if (transcript.status !== "complete")
    throw new Error("NR:Finish transcription before generating notes.");
  const jobId = id();
  await db.jobs.add({
    id: jobId,
    sessionId,
    transcriptId,
    kind: "notes",
    start: 0,
    end: 0,
    status: "pending",
    attempts: 0,
    nextRun: 0,
    leaseUntil: 0,
    model: settings.summaryModel,
    language,
    format,
    length,
    createdAt: Date.now(),
  });
  return jobId;
}
export async function retryFailed(sessionId: string) {
  await db.jobs
    .where("sessionId")
    .equals(sessionId)
    .filter((j) => j.status === "failed")
    .modify({ status: "pending", attempts: 0, nextRun: 0, error: undefined });
}
export async function claimJob(now = Date.now()): Promise<Job | undefined> {
  return db.transaction("rw", db.jobs, async () => {
    // A global lease prevents duplicate processing even if more than one engine asks.
    if (
      await db.jobs
        .filter((j) => j.status === "running" && j.leaseUntil > now)
        .count()
    )
      return;
    const j = await db.jobs
      .filter(
        (j) =>
          (j.status === "pending" && j.nextRun <= now) ||
          (j.status === "running" && j.leaseUntil <= now),
      )
      .first();
    if (!j) return;
    if (j.attempts >= 4) {
      await db.jobs.update(j.id, {
        status: "failed",
        error: "Retry limit reached. Check settings and retry manually.",
      });
      return;
    }
    const job = {
      ...j,
      status: "running" as const,
      attempts: j.attempts + 1,
      leaseUntil: now + 120000,
    };
    await db.jobs.put(job);
    return job;
  });
}
export async function finishTranscript(tid: string) {
  const t = await db.transcripts.get(tid);
  if (!t) return;
  const s = await db.sessions.get(t.sessionId);
  const jobs = await db.jobs
    .where("sessionId")
    .equals(t.sessionId)
    .filter((j) => j.transcriptId === tid && j.kind === "transcribe")
    .toArray();
  const terminal = s && !["recording", "paused", "starting"].includes(s.state);
  await db.transcripts.update(tid, {
    status:
      terminal && jobs.length > 0 && jobs.every((j) => j.status === "done")
        ? "complete"
        : "partial",
  });
}
export async function runOne(key: string) {
  const job = await claimJob();
  if (!job) return false;
  const started = performance.now();
  try {
    const s = await db.sessions.get(job.sessionId);
    if (!s) throw new ProviderError(false, "This session was deleted.");
    if (job.kind === "transcribe") {
      if (s.audioDeleted)
        throw new ProviderError(false, "Original audio has been deleted.");
      const pcm = await readPCM(s.id, job.start, job.end);
      const blob = new Blob(
        [wavHeader(job.end - job.start, s.sampleRate), ...pcm],
        { type: "audio/wav" },
      );
      const result = await gemini.transcribe(
        key,
        job.model,
        blob,
        (job.end - job.start) / s.sampleRate,
        job.language,
        job.start / s.sampleRate,
      );
      await db.transaction(
        "rw",
        db.transcripts,
        db.jobs,
        db.usage,
        async () => {
          const t = await db.transcripts.get(job.transcriptId);
          if (!t) throw new Error("Transcript missing");
          const from = job.start / s.sampleRate,
            to = job.end / s.sampleRate;
          await db.transcripts.update(t.id, {
            segments: [
              ...t.segments.filter((x) => x.start < from || x.start >= to),
              ...result.value,
            ].sort((a, b) => a.start - b.start),
          });
          await db.jobs.update(job.id, {
            status: "done",
            leaseUntil: 0,
            error: undefined,
          });
          await db.usage.add({
            id: id(),
            jobId: job.id,
            at: Date.now(),
            model: job.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            elapsedMs: performance.now() - started,
          });
        },
      );
    } else {
      const t = await db.transcripts.get(job.transcriptId);
      if (!t) throw new ProviderError(false, "Transcript no longer exists.");
      const result = await gemini.generate(
        key,
        job.model,
        t,
        job.format ?? "summary",
        job.language,
        job.length ?? "medium",
      );
      await db.transaction("rw", db.notes, db.jobs, db.usage, async () => {
        await db.notes.add({
          ...result.value,
          id: id(),
          sessionId: s.id,
          transcriptId: t.id,
          createdAt: Date.now(),
          format: job.format ?? "summary",
          language: job.language,
          model: job.model,
          promptVersion: "notes-v1",
        });
        await db.jobs.update(job.id, {
          status: "done",
          leaseUntil: 0,
          error: undefined,
        });
        await db.usage.add({
          id: id(),
          jobId: job.id,
          at: Date.now(),
          model: job.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          elapsedMs: performance.now() - started,
        });
      });
    }
  } catch (error) {
    const retry =
      error instanceof ProviderError && error.retryable && job.attempts < 4;
    await db.jobs.update(job.id, {
      status: retry ? "pending" : "failed",
      nextRun:
        Date.now() +
        Math.min(120000, 5000 * 2 ** job.attempts) +
        Math.random() * 1000,
      leaseUntil: 0,
      error:
        error instanceof ProviderError
          ? error.message.slice(3)
          : "Processing failed validation. Saved audio is retained.",
    });
  }
  if (job.kind === "transcribe") await finishTranscript(job.transcriptId);
  return true;
}
