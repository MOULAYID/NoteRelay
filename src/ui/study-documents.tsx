import { useEffect, useState } from "react";
import { db } from "../storage/db";
import { useData } from "./use-data";
import { safeError } from "../domain/validation";
import { stamp } from "../domain/types";
import {
  chapterFromNotes,
  createStudyDocument,
  addChapter,
  saveStudyDocument,
  deleteStudyDocument,
  exportSource,
  importSource,
  type DuplicateChoice,
} from "../documents/store";
import {
  SOURCE_LIMIT,
  filename,
  type StudyDocument,
  type StudyChapter,
} from "../documents/model";
import {
  downloadFile,
  exportStudyPDF,
  hasFilePicker,
} from "../documents/files";
interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: number;
  revision: number;
  chapters: number;
}
function useDocuments() {
  return useData(
    async () => {
      const result: DocumentSummary[] = [];
      await db.studyDocuments
        .orderBy("updatedAt")
        .reverse()
        .each((d) => {
          result.push({
            id: d.id,
            title: d.title,
            updatedAt: d.updatedAt,
            revision: d.revision,
            chapters: d.chapters.length,
          });
        });
      return result;
    },
    [],
    [] as DocumentSummary[],
  );
}
export function AddToDocument({
  notesId,
  onAdded,
}: {
  notesId: string;
  onAdded: (id: string) => void;
}) {
  const documents = useDocuments();
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState("new"),
    [title, setTitle] = useState(""),
    [selected, setSelected] = useState("");
  const [duplicate, setDuplicate] = useState<{
      chapter: StudyChapter;
      documentId: string;
      revision: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function add(choice: DuplicateChoice = "ask") {
    setBusy(true);
    setError("");
    try {
      if (duplicate) {
        const result = await addChapter(
          duplicate.documentId,
          duplicate.chapter,
          choice,
          duplicate.revision,
        );
        onAdded(result.document.id);
        setOpen(false);
        setDuplicate(null);
        return;
      }
      const chapter = await chapterFromNotes(notesId);
      if (mode === "new") {
        const doc = await createStudyDocument(title, chapter);
        onAdded(doc.id);
        setOpen(false);
      } else {
        const target = documents.find((d) => d.id === selected);
        if (!target) throw new Error("NR:Choose an existing study document.");
        const result = await addChapter(
          target.id,
          chapter,
          "ask",
          target.revision,
        );
        if (result.duplicate)
          setDuplicate({
            chapter,
            documentId: target.id,
            revision: result.document.revision,
          });
        else {
          onAdded(result.document.id);
          setOpen(false);
        }
      }
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card add-document">
      <button
        className="full"
        onClick={() => {
          setOpen(!open);
          setError("");
          setDuplicate(null);
        }}
      >
        Add to study document
      </button>
      {open && (
        <div role="group" aria-label="Add notes to study document">
          <p className="hint">
            Adds a saved snapshot. Export PDF separately to update a file.
          </p>
          {error && (
            <div role="alert" className="notice danger">
              {error}
            </div>
          )}
          {duplicate ? (
            <>
              <div className="notice">
                This lecture already has a chapter in this document. Replace its
                first matching chapter with this snapshot, or add a separate
                copy. Replacement keeps its chapter title and position.
              </div>
              <div className="button-row">
                <button disabled={busy} onClick={() => void add("replace")}>
                  Replace chapter
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void add("copy")}
                >
                  Add another copy
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setDuplicate(null);
                    setOpen(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <label>
                Destination
                <select
                  aria-label="Destination"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="new">Create a new document</option>
                  <option value="existing" disabled={!documents.length}>
                    Add to an existing document
                  </option>
                </select>
              </label>
              {mode === "new" ? (
                <label>
                  Document title
                  <input
                    maxLength={500}
                    value={title}
                    placeholder="e.g. Excel Course Notes"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
              ) : (
                <label>
                  Study document
                  <select
                    aria-label="Study document"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Choose a document…</option>
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({d.chapters} chapters)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="button-row">
                <button
                  disabled={
                    busy || (mode === "new" ? !title.trim() : !selected)
                  }
                  onClick={() => void add()}
                >
                  Add & save chapter
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
export function StudyDocuments({
  initialId,
  onDirtyChange,
}: {
  initialId?: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const documents = useDocuments();
  const [selected, setSelected] = useState(initialId ?? ""),
    [draft, setDraft] = useState<StudyDocument | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [newTitle, setNewTitle] = useState(""),
    [search, setSearch] = useState("");
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const selectedId = documents.some((d) => d.id === selected)
    ? selected
    : documents[0]?.id;
  const saved = useData(
    () =>
      selectedId
        ? db.studyDocuments.get(selectedId)
        : Promise.resolve(undefined),
    [selectedId],
    undefined as StudyDocument | undefined,
  );
  useEffect(() => {
    if (saved && (draft?.id !== saved.id || !dirty)) {
      setDraft(structuredClone(saved));
      setDirty(false);
    } else if (!saved) {
      setDraft(null);
      setDirty(false);
    }
  }, [saved?.id, saved?.revision]);
  async function run(fn: () => Promise<void>) {
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
  function select(id: string) {
    if (
      dirty &&
      !confirm("Discard unsaved document edits and open another document?")
    )
      return;
    setDirty(false);
    setSelected(id);
    setError("");
    setMessage("");
  }
  function change(document: StudyDocument) {
    setDraft(document);
    setDirty(true);
    setMessage("");
  }
  function move(index: number, step: number) {
    if (!draft) return;
    const chapters = [...draft.chapters];
    const target = index + step;
    if (target < 0 || target >= chapters.length) return;
    [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
    change({ ...draft, chapters });
  }
  function sourceExport() {
    if (!saved) return;
    downloadFile(
      new Blob([exportSource(saved)], { type: "application/json" }),
      filename(saved.title, "noterelay.json"),
    );
    setMessage(
      "Editable source exported. It contains note snapshots and source references, not recordings or API keys.",
    );
  }
  async function save() {
    if (!draft) return;
    const document = await saveStudyDocument(draft, draft.revision);
    setDraft(document);
    setDirty(false);
    setMessage(
      "Document saved locally. Existing downloaded PDFs were not changed.",
    );
  }
  return (
    <section className="study-documents">
      <div className="library-top">
        <h2>Study documents</h2>
        <a
          className="small-link"
          href="library.html?view=documents"
          target="_blank"
          rel="noreferrer"
        >
          Open full workspace ↗
        </a>
      </div>
      <p className="muted">
        Collect lectures as chapters. Save your document here; export a PDF when
        you want a file.
      </p>
      <div aria-live="polite">
        {error && (
          <div className="notice danger" role="alert">
            {error}
          </div>
        )}
        {message && <div className="notice success">{message}</div>}
      </div>
      <details className="card">
        <summary>Create or import a document</summary>
        <label>
          New document title
          <input
            value={newTitle}
            maxLength={500}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Excel Course Notes"
          />
        </label>
        <button
          disabled={busy || !newTitle.trim()}
          onClick={() =>
            void run(async () => {
              if (
                dirty &&
                !confirm("Discard unsaved edits and create another document?")
              )
                return;
              const d = await createStudyDocument(newTitle);
              setDirty(false);
              setSelected(d.id);
              setNewTitle("");
              setMessage(
                "Empty document created. Add generated notes from the Notes tab.",
              );
            })
          }
        >
          Create document
        </button>
        <label>
          Import editable NoteRelay source
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void run(async () => {
                if (file.size > SOURCE_LIMIT)
                  throw new Error(
                    "NR:Choose a NoteRelay source file smaller than 8 MB.",
                  );
                if (
                  dirty &&
                  !confirm(
                    "Discard unsaved edits and open the imported document?",
                  )
                )
                  return;
                const imported = await importSource(await file.text());
                setDirty(false);
                setSelected(imported.id);
                setMessage(
                  "Imported as a new document. Existing documents were not overwritten.",
                );
              });
            }}
          />
        </label>
        <p className="hint">
          Use a .noterelay.json backup, not a PDF. Import creates an independent
          copy, including its note snapshots.
        </p>
      </details>
      <label>
        Find documents
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search document titles…"
        />
      </label>
      <div className="document-list">
        {documents
          .filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
          .map((d) => (
            <button
              key={d.id}
              className={`lecture-card ${selectedId === d.id ? "selected" : ""}`}
              onClick={() => select(d.id)}
            >
              <span className="lecture-icon">▤</span>
              <span>
                <strong>{d.title}</strong>
                <span className="tiny muted">
                  {d.chapters} chapters ·{" "}
                  {new Date(d.updatedAt).toLocaleDateString()}
                </span>
              </span>
            </button>
          ))}
      </div>
      {!documents.length && (
        <div className="empty">
          <h3>Your course, chapter by chapter</h3>
          <p>
            Open generated notes and choose “Add to study document”, or create
            an empty document above.
          </p>
        </div>
      )}
      {draft && saved && draft.id === saved.id && (
        <>
          <section className="card document-editor">
            <label>
              Document title
              <input
                maxLength={500}
                value={draft.title}
                onChange={(e) => change({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="button-row">
              <button
                disabled={busy || !dirty || !draft.title.trim()}
                onClick={() => void run(save)}
              >
                Save document
              </button>
              <button
                className="secondary"
                disabled={busy || (!dirty && draft.revision === saved.revision)}
                onClick={() => {
                  if (dirty && !confirm("Discard unsaved document edits?"))
                    return;
                  setDraft(structuredClone(saved));
                  setDirty(false);
                  setError("");
                }}
              >
                Reopen saved version
              </button>
            </div>
            <div className="hint">
              {dirty
                ? "Unsaved changes. Save before exporting."
                : "Saved locally. PDF and editable backup exports use this saved version."}
            </div>
            {saved.revision !== draft.revision && (
              <div className="notice">
                This document changed in another view. Reopen its saved version
                to avoid overwriting changes.
              </div>
            )}
            <h3>Chapters</h3>
            {draft.chapters.map((chapter, index) => (
              <div className="chapter-editor" key={chapter.id}>
                <label>
                  Chapter {index + 1} title
                  <input
                    maxLength={500}
                    value={chapter.title}
                    onChange={(e) =>
                      change({
                        ...draft,
                        chapters: draft.chapters.map((c) =>
                          c.id === chapter.id
                            ? { ...c, title: e.target.value }
                            : c,
                        ),
                      })
                    }
                  />
                </label>
                <p className="hint">
                  {chapter.notes.format} · {chapter.notes.language} · Saved
                  notes snapshot from{" "}
                  {new Date(chapter.notes.createdAt).toLocaleDateString()}
                </p>
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={busy || index === 0}
                    aria-label={`Move chapter ${index + 1} up`}
                    onClick={() => move(index, -1)}
                  >
                    ↑ Up
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || index === draft.chapters.length - 1}
                    aria-label={`Move chapter ${index + 1} down`}
                    onClick={() => move(index, 1)}
                  >
                    ↓ Down
                  </button>
                  <button
                    className="text-button destructive"
                    disabled={busy}
                    aria-label={`Remove chapter ${index + 1}`}
                    onClick={() => {
                      if (
                        confirm(
                          "Remove this chapter from the document? Its original lecture and notes will remain.",
                        )
                      )
                        change({
                          ...draft,
                          chapters: draft.chapters.filter(
                            (c) => c.id !== chapter.id,
                          ),
                        });
                    }}
                  >
                    Remove chapter
                  </button>
                </div>
              </div>
            ))}
            {!draft.chapters.length && (
              <p className="muted">
                No chapters yet. Add generated notes from the Notes tab.
              </p>
            )}
            <div className="button-row">
              <button
                disabled={
                  busy ||
                  dirty ||
                  saved.revision !== draft.revision ||
                  !saved.chapters.length
                }
                onClick={() =>
                  void run(async () => {
                    if (await exportStudyPDF(saved))
                      setMessage(
                        "PDF generated from the saved document. Your browser controls its download destination.",
                      );
                  })
                }
              >
                Export PDF
              </button>
              {hasFilePicker() && (
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    dirty ||
                    saved.revision !== draft.revision ||
                    !saved.chapters.length
                  }
                  onClick={() =>
                    void run(async () => {
                      if (await exportStudyPDF(saved, true))
                        setMessage(
                          "PDF written to the destination you selected.",
                        );
                    })
                  }
                >
                  Save PDF as…
                </button>
              )}
              <button
                className="secondary"
                disabled={busy || dirty || saved.revision !== draft.revision}
                onClick={() => void run(async () => sourceExport())}
              >
                Export editable source
              </button>
            </div>
            <p className="hint">
              PDF generation happens on your device without Gemini. PDFs
              preserve supported Markdown formatting; complex LaTeX, raw HTML,
              and images remain text. Imported backups must remain under 8 MB;
              PDF export is limited to 2 million source characters.
            </p>
            <button
              className="text-button destructive"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Delete this study document? Original lectures, transcripts, and notes will remain.",
                  )
                )
                  void run(async () => {
                    await deleteStudyDocument(draft.id, draft.revision);
                    setDirty(false);
                    setDraft(null);
                    setSelected("");
                    setMessage(
                      "Study document deleted. Original lecture data was not changed.",
                    );
                  });
              }}
            >
              Delete document
            </button>
          </section>
          <details className="card" open>
            <summary>Document preview{dirty ? " · unsaved edits" : ""}</summary>
            <article className="study-preview">
              <h1>{draft.title}</h1>
              <ol>
                {draft.chapters.map((c) => (
                  <li key={c.id}>{c.title}</li>
                ))}
              </ol>
              {draft.chapters.map((c, i) => (
                <section className="preview-chapter" key={c.id}>
                  <span className="eyebrow">CHAPTER {i + 1}</span>
                  <h2>{c.title}</h2>
                  {c.source.url && (
                    <a href={c.source.url} target="_blank" rel="noreferrer">
                      Source lecture ↗
                    </a>
                  )}
                  {c.source.kind === "microphone" && (
                    <p className="hint">
                      Classroom recording · Audio references are local.
                    </p>
                  )}
                  {c.notes.sections.map((s, index) => (
                    <section key={index}>
                      <h3>{s.heading}</h3>
                      {s.kind === "explanation" && (
                        <span className="explanation">
                          Supplementary AI explanation
                        </span>
                      )}
                      <p className="preview-note-content">{s.content}</p>
                      <div className="sources">
                        {s.sourceIds.map((sid) => {
                          const ref = c.references.find(
                            (r) => r.segmentId === sid,
                          );
                          return ref ? (
                            <span className="timestamp" key={sid}>
                              {ref.videoUrl && c.source.kind === "tab" ? (
                                <a
                                  href={ref.videoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Video {stamp(ref.videoTime!)} ↗
                                </a>
                              ) : (
                                `Audio ${stamp(ref.start)} (local)`
                              )}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </section>
                  ))}
                  {c.notes.warnings.map((w, index) => (
                    <div className="notice" key={index}>
                      {w}
                    </div>
                  ))}
                </section>
              ))}
            </article>
          </details>
        </>
      )}
    </section>
  );
}
