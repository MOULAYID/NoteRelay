import { filename, type StudyDocument } from "./model";
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
interface SaveHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }>;
}
interface PickerWindow {
  showSaveFilePicker?: (
    options: Record<string, unknown>,
  ) => Promise<SaveHandle>;
}
export function hasFilePicker() {
  return (
    typeof (window as unknown as PickerWindow).showSaveFilePicker === "function"
  );
}
export async function exportStudyPDF(
  document: StudyDocument,
  chooseDestination = false,
) {
  // Request a destination before asynchronous PDF work so the user gesture stays valid.
  let handle: SaveHandle | undefined;
  if (chooseDestination) {
    const picker = (window as unknown as PickerWindow).showSaveFilePicker;
    if (!picker)
      throw new Error(
        "NR:This browser cannot choose a direct destination. Use Export PDF to download instead.",
      );
    try {
      handle = await picker.call(window, {
        suggestedName: filename(document.title, "pdf"),
        types: [
          {
            description: "PDF document",
            accept: { "application/pdf": [".pdf"] },
          },
        ],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return false;
      throw new Error(
        "NR:Could not select a PDF destination. Use the download option instead.",
        { cause: error },
      );
    }
  }
  const { studyPDF } = await import("./pdf");
  const blob = await studyPDF(document);
  if (handle) {
    const writer = await handle.createWritable();
    try {
      await writer.write(blob);
      await writer.close();
    } catch {
      await writer.abort().catch(() => {});
      throw new Error(
        "NR:Could not save the PDF to the selected file. Your study document is still saved locally.",
      );
    }
  } else downloadFile(blob, filename(document.title, "pdf"));
  return true;
}
