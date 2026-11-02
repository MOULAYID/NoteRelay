import { z } from "zod";
const Title = z.string().trim().min(1).max(500);
const Id = z.string().min(1).max(200);
const Timestamp = z.number().finite().nonnegative().max(8.64e15);
const WebURL = z
  .string()
  .max(4000)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Only HTTP(S) source URLs are supported");
const Section = z
  .object({
    heading: z.string().max(300),
    content: z.string().max(100000),
    sourceIds: z.array(Id).max(100),
    kind: z.enum(["lecture", "explanation"]),
  })
  .strict();
const NotesSnapshot = z
  .object({
    id: Id,
    sessionId: Id,
    transcriptId: Id,
    createdAt: Timestamp,
    format: z.enum([
      "summary",
      "detailed",
      "concepts",
      "takeaways",
      "study-guide",
      "flashcards",
      "quiz",
    ]),
    language: z.string().max(100),
    model: z.string().max(200),
    promptVersion: z.string().max(100),
    title: z.string().max(500),
    sections: z.array(Section).max(200),
    warnings: z.array(z.string().max(2000)).max(100),
  })
  .strict();
export const ChapterSchema = z
  .object({
    id: Id,
    title: Title,
    addedAt: Timestamp,
    source: z
      .object({
        sessionId: Id,
        lectureTitle: z.string().max(500),
        kind: z.enum(["tab", "microphone"]),
        recordedAt: Timestamp,
        url: WebURL.optional(),
      })
      .strict(),
    notes: NotesSnapshot,
    references: z
      .array(
        z
          .object({
            segmentId: Id,
            start: Timestamp,
            end: Timestamp,
            videoTime: Timestamp.optional(),
            videoUrl: WebURL.optional(),
          })
          .strict(),
      )
      .max(20000),
  })
  .strict();
export const StudyDocumentSchema = z
  .object({
    id: Id,
    title: Title,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    revision: z.number().int().positive(),
    chapters: z.array(ChapterSchema).max(1000),
    importedFromId: Id.optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    for (const chapter of doc.chapters) {
      if (
        chapter.source.kind === "microphone" &&
        (chapter.source.url ||
          chapter.references.some(
            (r) => r.videoUrl !== undefined || r.videoTime !== undefined,
          ))
      )
        ctx.addIssue({
          code: "custom",
          message: "Classroom source cannot claim public video playback",
        });
      if (ids.has(chapter.id))
        ctx.addIssue({ code: "custom", message: "Duplicate chapter ID" });
      ids.add(chapter.id);
      if (chapter.source.sessionId !== chapter.notes.sessionId)
        ctx.addIssue({
          code: "custom",
          message: "Inconsistent chapter provenance",
        });
      for (const ref of chapter.references)
        if (ref.end < ref.start)
          ctx.addIssue({ code: "custom", message: "Invalid source interval" });
    }
    if (new TextEncoder().encode(JSON.stringify(doc)).byteLength > 7_990_000)
      ctx.addIssue({
        code: "custom",
        message: "Document exceeds 8 MB source limit",
      });
  });
export type StudyDocument = z.infer<typeof StudyDocumentSchema>;
export type StudyChapter = z.infer<typeof ChapterSchema>;
export const BackupSchema = z
  .object({
    kind: z.literal("noterelay-study-document"),
    version: z.literal(1),
    document: StudyDocumentSchema,
  })
  .strict();
export const SOURCE_LIMIT = 8_000_000;
export function validateDocument(value: unknown): StudyDocument {
  const result = StudyDocumentSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "NR:Invalid study document. Check titles, content limits, source URLs, and chapter structure.",
    );
  return result.data;
}
export function safeWebURL(value: string | undefined) {
  if (!value) return undefined;
  const parsed = WebURL.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
export function timestampURL(url: string, seconds: number): string | undefined {
  const safe = safeWebURL(url);
  if (!safe || !Number.isFinite(seconds) || seconds < 0) return;
  const u = new URL(safe);
  if (
    ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname) &&
    u.pathname === "/watch" &&
    u.searchParams.get("v")
  ) {
    u.searchParams.set("t", `${Math.floor(seconds)}s`);
    return u.href;
  }
  if (u.hostname === "youtu.be" && u.pathname.length > 1) {
    u.searchParams.set("t", `${Math.floor(seconds)}s`);
    return u.href;
  }
}
export function filename(title: string, extension: string) {
  const clean =
    title
      .normalize("NFKC")
      .split("")
      .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      .join("")
      .replace(/[<>:"/\\|?*]/g, "-")
      .replace(/[. ]+$/, "")
      .trim()
      .slice(0, 100) || "NoteRelay-study-document";
  return `${clean}.${extension}`;
}
