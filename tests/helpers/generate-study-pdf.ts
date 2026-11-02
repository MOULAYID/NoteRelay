import { mkdir, writeFile } from "node:fs/promises";
import { studyPDF } from "../../src/documents/pdf";
import { sampleDocument } from "../fixtures/study";
async function main() {
  await mkdir("tmp/pdfs", { recursive: true });
  const blob = await studyPDF(sampleDocument(true));
  await writeFile(
    "tmp/pdfs/study-document-qa.pdf",
    Buffer.from(await blob.arrayBuffer()),
  );
  console.log(`PDF QA fixture: ${blob.size} bytes`);
}
void main();
