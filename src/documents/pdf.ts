import pdfMake from "pdfmake/build/pdfmake";
import fontData from "pdfmake/build/vfs_fonts";
// pdfmake 0.2 exports the virtual filesystem directly; older typings wrap it.
const vfs = fontData as unknown as Record<string, string>;
import { buildPDFDefinition } from "./pdf-definition";
import type { StudyDocument } from "./model";
const fonts = {
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
};
export async function studyPDF(document: StudyDocument): Promise<Blob> {
  const definition = buildPDFDefinition(document);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "NR:PDF generation took too long. Your saved document is unchanged. Try exporting fewer chapters.",
          ),
        ),
      90000,
    );
    try {
      pdfMake.createPdf(definition, undefined, fonts, vfs).getBlob((blob) => {
        clearTimeout(timer);
        resolve(blob);
      });
    } catch {
      clearTimeout(timer);
      reject(
        new Error(
          "NR:PDF generation failed. Your saved document and editable source are retained.",
        ),
      );
    }
  });
}
