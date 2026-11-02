import { z } from "zod";
export const PlayerSchema = z.object({
  videoTime: z.number().finite().nonnegative(),
  sourceId: z.string().max(2000),
  pageUrl: z.string().max(2000),
  rate: z.number().positive().max(16),
  playing: z.boolean(),
  event: z.string().max(40),
  observedAt: z.number().finite(),
});
export const TranscriptSchema = z.object({
  segments: z
    .array(
      z.object({
        start: z.number().finite().nonnegative(),
        end: z.number().finite().nonnegative(),
        text: z.string().max(12000),
      }),
    )
    .max(500),
});
export const NotesSchema = z.object({
  title: z.string().max(200),
  sections: z
    .array(
      z.object({
        heading: z.string().max(300),
        content: z.string().max(20000),
        sourceIds: z.array(z.string()).max(100),
        kind: z.enum(["lecture", "explanation"]),
      }),
    )
    .max(100),
  warnings: z.array(z.string().max(1000)).max(30),
});
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("START"),
    source: z.enum(["tab", "microphone"]),
    deviceId: z.string().max(300).optional(),
    progressive: z.boolean(),
  }),
  z.object({
    type: z.literal("CONTROL"),
    action: z.enum(["pause", "resume", "stop"]),
  }),
  z.object({ type: z.literal("STATUS") }),
  z.object({ type: z.literal("RUN_JOBS") }),
  z.object({
    type: z.literal("SEEK"),
    sessionId: z.string(),
    audioTime: z.number().finite().nonnegative(),
  }),
  z.object({ type: z.literal("PLAYER"), data: PlayerSchema }),
  z.object({
    type: z.literal("OPEN"),
    page: z.enum(["library", "settings", "microphone"]),
  }),
]);
export function safeError(error: unknown): string {
  // Never echo provider errors, URLs, request bodies, microphone labels, or credentials.
  if (error instanceof Error && /^NR:/.test(error.message))
    return error.message.slice(3);
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError")
      return "Permission denied. Open microphone setup and allow access.";
    if (error.name === "NotFoundError") return "No microphone was found.";
    if (error.name === "QuotaExceededError")
      return "Local storage is full. Export or remove recordings before retrying.";
  }
  return "The operation could not finish. Your previously saved audio is retained.";
}
