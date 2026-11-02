export type Source = "tab" | "microphone";
export type CaptureState =
  "starting" | "recording" | "paused" | "stopped" | "interrupted" | "error";
export interface Session {
  id: string;
  title: string;
  source: Source;
  tabId?: number;
  url?: string;
  createdAt: number;
  updatedAt: number;
  state: CaptureState;
  sampleRate: number;
  totalSamples: number;
  blocks: number;
  audioDeleted?: boolean;
  error?: string;
  progressive: boolean;
  activeTranscriptId?: string;
}
export interface AudioBlock {
  id: string;
  sessionId: string;
  seq: number;
  start: number;
  end: number;
  pcm: ArrayBuffer;
}
export interface Anchor {
  id?: number;
  sessionId: string;
  audioTime: number;
  videoTime: number;
  sourceId: string;
  pageUrl: string;
  rate: number;
  playing: boolean;
  event: string;
  observedAt: number;
  uncertainty: number;
}
export interface Segment {
  id: string;
  start: number;
  end: number;
  text: string;
  approximate: boolean;
}
export interface Transcript {
  id: string;
  sessionId: string;
  parentId?: string;
  createdAt: number;
  model: string;
  language: string;
  segments: Segment[];
  status: "processing" | "complete" | "partial";
  revision: number;
}
export type NoteFormat =
  | "summary"
  | "detailed"
  | "concepts"
  | "takeaways"
  | "study-guide"
  | "flashcards"
  | "quiz";
export interface NoteSection {
  heading: string;
  content: string;
  sourceIds: string[];
  kind: "lecture" | "explanation";
}
export interface Notes {
  id: string;
  sessionId: string;
  transcriptId: string;
  createdAt: number;
  format: NoteFormat;
  language: string;
  model: string;
  promptVersion: string;
  title: string;
  sections: NoteSection[];
  warnings: string[];
}
export interface Job {
  id: string;
  sessionId: string;
  transcriptId: string;
  kind: "transcribe" | "notes";
  start: number;
  end: number;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  nextRun: number;
  leaseUntil: number;
  model: string;
  language: string;
  format?: NoteFormat;
  length?: string;
  error?: string;
  createdAt: number;
}
export interface Usage {
  id: string;
  jobId: string;
  at: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
}
export interface Settings {
  transcriptionModel: string;
  summaryModel: string;
  language: string;
  rememberKey: boolean;
  progressive: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  transcriptionModel: "gemini-2.5-flash",
  summaryModel: "gemini-2.5-flash-lite",
  language: "auto",
  rememberKey: false,
  progressive: false,
};
export function id() {
  return crypto.randomUUID();
}
export function stamp(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
}
