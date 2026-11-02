import { marked, type Token, type Tokens } from "marked";
import type {
  Content,
  ContentText,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { safeWebURL, validateDocument, type StudyDocument } from "./model";
import { stamp } from "../domain/types";
// Long unbroken identifiers/URLs gain invisible break opportunities, never a shortened visible value.
const wrap = (text: string) =>
  text.replace(/[^\s\u200b]{45,}/gu, (value) =>
    value.match(/.{1,32}/gu)!.join("\u200b"),
  );
function inline(
  tokens: Token[] | undefined,
  fallback = "",
  depth = 0,
): ContentText[] {
  if (!tokens) return [{ text: wrap(fallback) }];
  if (depth > 15)
    return [{ text: wrap(fallback || tokens.map((t) => t.raw).join("")) }];
  return tokens.flatMap((token): ContentText[] => {
    switch (token.type) {
      case "strong":
        return inline(token.tokens, token.text, depth + 1).map((t) => ({
          ...t,
          bold: true,
        }));
      case "em":
        return inline(token.tokens, token.text, depth + 1).map((t) => ({
          ...t,
          italics: true,
        }));
      case "del":
        return inline(token.tokens, token.text, depth + 1).map((t) => ({
          ...t,
          decoration: "lineThrough",
        }));
      case "link": {
        const url = safeWebURL(token.href);
        return inline(token.tokens, token.text, depth + 1).map((t) => ({
          ...t,
          ...(url
            ? { link: url, color: "#245ce4", decoration: "underline" as const }
            : {}),
        }));
      }
      case "image":
        return [{ text: wrap(`[Image: ${token.text}] ${token.href}`) }];
      case "codespan":
        return [
          { text: wrap(token.text), background: "#eef2f7", fontSize: 9.5 },
        ];
      case "br":
        return [{ text: "\n" }];
      case "escape":
      case "text":
        return "tokens" in token && token.tokens
          ? inline(token.tokens, token.text, depth + 1)
          : [{ text: wrap(token.text) }];
      default:
        return [{ text: wrap(token.raw) }];
    }
  });
}
function blocks(tokens: Token[], depth = 0): Content[] {
  if (depth > 15)
    return [{ text: wrap(tokens.map((t) => t.raw).join("")), style: "body" }];
  return tokens.flatMap((token): Content[] => {
    switch (token.type) {
      case "space":
        return [];
      case "paragraph":
      case "text":
        return [
          {
            text: inline(
              "tokens" in token ? token.tokens : undefined,
              token.text,
            ),
            style: "body",
          },
        ];
      case "heading":
        return [
          {
            text: inline(token.tokens, token.text),
            style: token.depth <= 2 ? "subheading" : "minorHeading",
            headlineLevel: 3,
          },
        ];
      case "code":
        return [
          {
            text: wrap(token.text),
            style: "code",
            preserveLeadingSpaces: true,
          },
        ];
      case "blockquote":
        return [
          {
            stack: blocks((token as Tokens.Blockquote).tokens, depth + 1),
            margin: [14, 4, 0, 9],
            color: "#4b5a72",
          },
        ];
      case "list": {
        const list = token as Tokens.List;
        const items = list.items.map((item) => ({
          stack: [
            ...(item.task
              ? [{ text: item.checked ? "[x]" : "[ ]", fontSize: 9 }]
              : []),
            ...blocks(item.tokens, depth + 1),
          ],
        }));
        return [
          list.ordered
            ? {
                ol: items,
                start: typeof list.start === "number" ? list.start : 1,
                margin: [12, 0, 0, 9],
              }
            : { ul: items, margin: [12, 0, 0, 9] },
        ];
      }
      case "table": {
        const sourceTable = token as Tokens.Table;
        const table = {
          headerRows: 1,
          widths: sourceTable.header.map(() => "*"),
          body: [
            sourceTable.header.map((cell) => ({
              text: inline(cell.tokens, cell.text),
              bold: true,
              fillColor: "#edf2fa",
            })),
            ...sourceTable.rows.map((row) =>
              row.map((cell) => ({ text: inline(cell.tokens, cell.text) })),
            ),
          ],
        };
        return [
          {
            table,
            layout: "lightHorizontalLines",
            fontSize: 9,
            margin: [0, 3, 0, 12],
          },
        ];
      }
      case "hr":
        return [
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 499,
                y2: 0,
                lineWidth: 0.5,
                lineColor: "#dce3ed",
              },
            ],
            margin: [0, 8, 0, 12],
          },
        ];
      default:
        return [{ text: wrap(token.raw), style: "body" }];
    }
  });
}
export function markdownContent(text: string): Content[] {
  return blocks(marked.lexer(text, { gfm: true, breaks: false }));
}
export function buildPDFDefinition(value: StudyDocument): TDocumentDefinitions {
  const doc = validateDocument(value);
  if (!doc.chapters.length)
    throw new Error("NR:Add at least one chapter before exporting PDF.");
  if (JSON.stringify(doc).length > 2_000_000)
    throw new Error(
      "NR:This document is too large for the current PDF exporter. Split it into smaller study documents; the editable source remains available.",
    );
  const content: Content[] = [
    {
      text: "NOTERELAY / STUDY DOCUMENT",
      fontSize: 9,
      bold: true,
      color: "#245ce4",
      characterSpacing: 1.5,
      margin: [0, 15, 0, 28],
    },
    { text: wrap(doc.title), style: "documentTitle" },
    {
      text: `${doc.chapters.length} ${doc.chapters.length === 1 ? "chapter" : "chapters"} · Saved ${new Date(doc.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      style: "meta",
      margin: [0, 12, 0, 25],
    },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 499,
          y2: 0,
          lineWidth: 1,
          lineColor: "#245ce4",
        },
      ],
      margin: [0, 0, 0, 25],
    },
    {
      toc: { title: { text: "Contents", style: "subheading" } },
      fontSize: 10,
      color: "#44536b",
    },
    {
      text: "Generated study notes. Review important claims against the lecture. Audio-only notes may omit visual information.",
      style: "meta",
      margin: [0, 28, 0, 0],
    },
  ];
  doc.chapters.forEach((chapter, index) => {
    content.push(
      {
        text: `CHAPTER ${String(index + 1).padStart(2, "0")}`,
        style: "chapterLabel",
        pageBreak: "before",
      },
      {
        text: wrap(chapter.title),
        style: "chapterTitle",
        id: `chapter-${index}`,
        tocItem: true,
        tocStyle: "tocEntry",
        tocMargin: [0, 0, 0, 7],
      },
      {
        text: `${new Date(chapter.source.recordedAt).toLocaleDateString("en-GB")} · ${chapter.notes.language} · ${chapter.notes.format.replaceAll("-", " ")}`,
        style: "meta",
        margin: [0, 10, 0, 8],
      },
    );
    if (chapter.source.kind === "tab" && chapter.source.url)
      content.push({
        text: wrap(chapter.source.url),
        link: chapter.source.url,
        color: "#245ce4",
        fontSize: 9,
        margin: [0, 0, 0, 15],
      });
    if (chapter.source.kind === "microphone")
      content.push({
        text: "Classroom recording · Audio timestamps refer to a local recording, not a public file.",
        style: "meta",
        margin: [0, 0, 0, 15],
      });
    for (const section of chapter.notes.sections) {
      content.push({
        text: wrap(section.heading),
        style: "subheading",
        headlineLevel: 2,
      });
      if (section.kind === "explanation")
        content.push({
          text: "SUPPLEMENTARY AI EXPLANATION",
          style: "meta",
          color: "#8b6528",
          margin: [0, 0, 0, 5],
        });
      content.push(...markdownContent(section.content));
      const refs = section.sourceIds
        .map((sid) => chapter.references.find((r) => r.segmentId === sid))
        .filter((r) => !!r);
      if (refs.length)
        content.push({
          text: [
            { text: "Sources: ", bold: true },
            ...refs.flatMap((r, i): ContentText[] => [
              {
                text: `${i ? "  ·  " : ""}${r.videoUrl ? `Video ${stamp(r.videoTime!)} (approx.; audio ${stamp(r.start)})` : `Audio ${stamp(r.start)} (local, approximate)`}`,
                ...(chapter.source.kind === "tab" && r.videoUrl
                  ? { link: r.videoUrl, color: "#245ce4" }
                  : {}),
              },
            ]),
          ],
          style: "meta",
          margin: [0, 0, 0, 13],
        });
    }
    if (chapter.notes.warnings.length)
      content.push(
        { text: "Review notes", style: "subheading", headlineLevel: 2 },
        ...chapter.notes.warnings.map(
          (w) =>
            ({
              text: wrap(w),
              style: "meta",
              margin: [0, 0, 0, 7],
            }) as ContentText,
        ),
      );
    content.push({
      text: `Saved snapshot · ${chapter.notes.model} · ${chapter.notes.promptVersion} · ${new Date(chapter.notes.createdAt).toLocaleDateString("en-GB")}`,
      style: "meta",
      margin: [0, 18, 0, 0],
    });
  });
  return {
    pageSize: "A4",
    pageMargins: [48, 55, 48, 55],
    info: {
      title: doc.title,
      author: "NoteRelay",
      subject: "Study notes collected from lecture snapshots",
      creator: "NoteRelay local PDF exporter",
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 10.5,
      lineHeight: 1.3,
      color: "#24324a",
    },
    styles: {
      documentTitle: {
        fontSize: 32,
        bold: true,
        lineHeight: 1.15,
        color: "#17243b",
      },
      chapterLabel: {
        fontSize: 9,
        bold: true,
        color: "#245ce4",
        characterSpacing: 1.5,
        margin: [0, 0, 0, 12],
      },
      chapterTitle: {
        fontSize: 24,
        bold: true,
        lineHeight: 1.15,
        color: "#17243b",
        margin: [0, 0, 0, 4],
      },
      subheading: {
        fontSize: 14,
        bold: true,
        color: "#17243b",
        margin: [0, 15, 0, 8],
      },
      minorHeading: { fontSize: 11.5, bold: true, margin: [0, 11, 0, 6] },
      body: { margin: [0, 0, 0, 9] },
      meta: { fontSize: 8.5, color: "#6b788d", lineHeight: 1.3 },
      tocEntry: { fontSize: 10, color: "#24324a" },
      code: {
        fontSize: 9,
        background: "#f0f3f8",
        lineHeight: 1.3,
        margin: [8, 6, 8, 12],
      },
    },
    content,
    footer: (page, total) => ({
      columns: [
        {
          text:
            doc.title.length > 70 ? `${doc.title.slice(0, 67)}…` : doc.title,
          width: "*",
        },
        { text: `${page} / ${total}`, alignment: "right", width: "auto" },
      ],
      fontSize: 8,
      color: "#7b879a",
      margin: [48, 15, 48, 0],
    }),
    pageBreakBefore: (node, following) =>
      !!node.headlineLevel && following.length === 0,
  };
}
