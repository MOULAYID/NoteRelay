# Study documents and PDF export

## Add your first lecture

1. Generate notes or open a previously saved notes output.
2. Click **Add to study document**.
3. Choose **Create a new document**, enter a course/collection name, and click **Add & save chapter**.
4. The chapter heading defaults to the saved lecture/video title, not the AI notes title.
5. In **Documents**, rename the chapter if needed and click **Save document**.

To add another lecture, open that lecture's notes, choose **Add to an existing document**, select the collection, and add/save its chapter. Repeat for more lectures. A matching source lecture prompts for **Replace chapter**, **Add another copy**, or **Cancel**. Replacement updates the first matching snapshot while keeping its custom heading and position.

## Edit and reopen

The **Documents** tab lists saved documents. Its full-workspace link opens a larger extension page. Rename a document or chapter, use Up/Down to reorder, or remove a chapter; then click **Save document**. Unsaved edits disable export and prompt before leaving the view. **Reopen saved version** discards the draft. Concurrent changes in another window cause a conflict rather than an overwrite.

Documents survive a browser restart in the same Chrome profile. Removing chapters or documents does not delete source recordings, transcripts, or notes. Conversely, deleting the original lecture does not erase its already-collected chapter snapshot.

## Save versus export

- **Save document** updates the editable document in NoteRelay's IndexedDB.
- **Export PDF** downloads a new PDF of the saved chapters, in their saved order.
- **Save PDF as…** uses Chrome's file chooser when available; the user chooses the target and confirms any overwrite. It requests a fresh destination rather than persisting background filesystem access. If unavailable, use normal PDF download.
- **Export editable source** saves a `.noterelay.json` backup. This includes note snapshots, titles/order, source references, and notes-version metadata, but no audio or API key.
- **Import editable NoteRelay source** restores that backup as an independent new document. It never overwrites another document merely because its ID/title matches.

Saving locally does not update any downloaded PDF or JSON backup. Export again after adding chapters. PDF files themselves are not the editable source, and arbitrary PDF reconstruction/import is not supported.

## What the PDF preserves

An A4 document with an overall title, linked contents, separately titled chapters, selectable text, consistent margins/page numbers, source URLs, and notes warnings. Headings, paragraphs, emphasis, lists, basic tables, links, and code blocks are formatted from supported Markdown. Chapter names may be edited without modifying their original source titles/provenance.

French accents and common Greek/math characters are supported by the embedded Roboto fonts. Full LaTeX layout, image embedding, HTML execution, and universal-script/emoji font coverage are not implemented. Images and unsupported markup remain descriptive text. The on-screen content preview retains source text; the PDF applies the supported Markdown formatting.

Validated YouTube mappings can become timestamp hyperlinks. Other audio timestamps are labelled local/approximate and are not public audio download links. A source URL may require the reader's own course access. Classroom chapters never advertise a public recording URL.

## Limits and privacy

All document collection, editing, backup, and PDF operations are local. They do not call Gemini, retranscribe audio, or regenerate notes. PDF libraries and fonts are packaged with the extension; there are no CDN scripts or remote font downloads.

A chapter is a deep snapshot of one selected notes version and its source references. Later note regeneration or transcript corrections do not silently alter it. To refresh a chapter, explicitly add the new notes and choose replacement. A document can contain up to 1,000 chapters within the validated source-size limit (about 8 MB). PDF export has a 2-million-source-character guard and a generation timeout to avoid unbounded work; split oversized collections rather than losing content through truncation.

Backups and PDFs contain lecture content and source URLs. Share them only as appropriate for the original material. They are not encrypted backups. Import rejects invalid versions/structure, unknown top-level secret fields, non-HTTP(S) URLs, and false public links for classroom recordings.

## Storage and design

Dexie schema v2 adds `studyDocuments` without changing or deleting existing v1 stores. Each document holds title, revision, timestamps, and ordered chapter snapshots, which makes its backup self-contained. Saves use revision checks to protect against concurrent edits. Backup schema v1 is independently versioned from the IndexedDB schema. JSON is the editable source; no LaTeX installation or backend is needed.

## Updating an installed extension

Stop recording and export important data first. Replace files **inside the same folder originally loaded into Chrome**, then click **Reload** on the existing NoteRelay card at `chrome://extensions`. Do not remove the extension or load a separate new folder if you need to preserve the existing profile's saved lectures. The additive migration runs when the updated extension opens the database.
