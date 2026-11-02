import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { sampleChapter } from "../fixtures/study";
export async function seedStudyNotes(page: Page) {
  const chapters = [sampleChapter(1), sampleChapter(2)];
  await page.evaluate(async (chapters) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("NoteRelay");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(
        ["sessions", "transcripts", "notes", "anchors"],
        "readwrite",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const [index, c] of chapters.entries()) {
        tx.objectStore("sessions").put({
          id: c.source.sessionId,
          title: c.title,
          source: c.source.kind,
          url: c.source.url,
          createdAt: c.source.recordedAt + index,
          updatedAt: c.source.recordedAt,
          state: "stopped",
          sampleRate: 16000,
          totalSamples: 0,
          blocks: 0,
          progressive: false,
        });
        tx.objectStore("notes").put(c.notes);
        tx.objectStore("transcripts").put({
          id: c.notes.transcriptId,
          sessionId: c.source.sessionId,
          createdAt: c.notes.createdAt,
          model: "fixture",
          language: c.notes.language,
          status: "complete",
          revision: 1,
          segments: c.references.map((r) => ({
            id: r.segmentId,
            start: r.start,
            end: r.end,
            text: "Original reference words",
            approximate: true,
          })),
        });
        for (const r of c.references)
          tx.objectStore("anchors").put({
            sessionId: c.source.sessionId,
            audioTime: r.start,
            videoTime: r.videoTime ?? r.start,
            pageUrl: c.source.url ?? "",
            sourceId: "fixture",
            rate: 1,
            playing: true,
            event: "tick",
            observedAt: Date.now(),
            uncertainty: 0.5,
          });
      }
    });
    database.close();
  }, chapters);
  await page.reload();
}
export async function studyDocumentFlow(
  initial: Page,
  restart: () => Promise<Page>,
) {
  let page = initial;
  await expect(
    page.getByRole("heading", { name: "Study documents", exact: true }),
  ).toBeVisible();
  await seedStudyNotes(page);
  await page
    .getByRole("button", { name: "Library", exact: false })
    .first()
    .click();
  await page
    .locator(".lecture-card")
    .filter({ hasText: "Get and Transform Data from Excel" })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Notes 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add to study document", exact: true })
    .click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Excel Course Notes");
  await page
    .getByRole("button", { name: "Add & save chapter", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Study documents", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Chapter 1 title", { exact: true })).toHaveValue(
    "Get and Transform Data from Excel",
  );
  await page
    .getByRole("button", { name: "Library", exact: false })
    .first()
    .click();
  await page
    .locator(".lecture-card")
    .filter({ hasText: "Nettoyer les données avec Power Query" })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Notes 2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add to study document", exact: true })
    .click();
  await page
    .getByLabel("Destination", { exact: true })
    .selectOption("existing");
  await page
    .getByLabel("Study document", { exact: true })
    .selectOption({ label: "Excel Course Notes (1 chapters)" });
  await page
    .getByRole("button", { name: "Add & save chapter", exact: true })
    .click();
  await expect(page.getByLabel("Chapter 2 title", { exact: true })).toHaveValue(
    "Nettoyer les données avec Power Query",
  );
  // Explicit edits disable export until persisted. Reordering must change the PDF/source order.
  await page
    .getByLabel("Chapter 2 title", { exact: true })
    .fill("Chapitre français : qualité des données");
  await expect(
    page.getByRole("button", { name: "Export PDF", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Move chapter 2 up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export PDF", exact: true }),
  ).toBeEnabled();
  // A second addition of the same lecture offers cancel/replace/copy rather than silent duplication.
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByRole("button", { name: "Add to study document", exact: true })
    .click();
  await page
    .getByLabel("Destination", { exact: true })
    .selectOption("existing");
  await page
    .getByLabel("Study document", { exact: true })
    .selectOption({ label: "Excel Course Notes (2 chapters)" });
  await page
    .getByRole("button", { name: "Add & save chapter", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Replace chapter", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(page.getByLabel("Chapter 1 title", { exact: true })).toHaveValue(
    "Chapitre français : qualité des données",
  );
  // Stop the browser and reopen the same profile, not just a React rerender.
  page = await restart();
  await expect(
    page.getByRole("heading", { name: "Study documents", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Chapter 2 title", { exact: true })).toHaveValue(
    "Get and Transform Data from Excel",
  );
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const pdf = await pdfDownload;
  const bytes = await readFile((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.byteLength).toBeGreaterThan(1000);
  const sourceDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export editable source", exact: true })
    .click();
  const source = await sourceDownload;
  const sourceBytes = await readFile((await source.path())!);
  const backup = JSON.parse(sourceBytes.toString());
  expect(backup.document.chapters).toHaveLength(2);
  expect(backup.document.chapters[0].title).toBe(
    "Chapitre français : qualité des données",
  );
  expect(backup.document.chapters[1].notes.id).toBe("notes-1");
  expect(sourceBytes.toString()).not.toContain("apiKey");
  await page
    .locator("summary")
    .filter({ hasText: "Create or import a document" })
    .click();
  await page
    .getByLabel("Import editable NoteRelay source", { exact: true })
    .setInputFiles({
      name: "backup.noterelay.json",
      mimeType: "application/json",
      buffer: sourceBytes,
    });
  await expect(
    page.getByText("Imported as a new document.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".document-list .lecture-card")).toHaveCount(2);
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Imported independent copy");
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("button", { name: "Remove chapter 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(page.getByLabel("Chapter 2 title", { exact: true })).toHaveCount(
    0,
  );
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await expect(page.locator(".document-list .lecture-card")).toHaveCount(1);
  await expect(page.getByLabel("Chapter 2 title", { exact: true })).toHaveValue(
    "Get and Transform Data from Excel",
  );
  const originals = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("NoteRelay");
      r.onsuccess = () => resolve(r.result);
    });
    const count = await new Promise<number>((resolve) => {
      const r = database.transaction("notes").objectStore("notes").count();
      r.onsuccess = () => resolve(r.result);
    });
    database.close();
    return count;
  });
  expect(originals).toBe(2);
  await page.screenshot({
    path: "test-results/study-documents-preview.png",
    fullPage: true,
  });
  return page;
}
