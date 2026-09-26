// Browser-only PDF text extraction. pdf.js is served as a static asset from
// /vendor/pdfjs (copied by scripts/copy-pdfjs.mjs) and loaded at runtime, so it
// never becomes part of the server/Worker bundle.
type TextItem = { str?: string; hasEOL?: boolean };
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: { data: Uint8Array; isEvalSupported?: boolean }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: TextItem[] }> }>; destroy(): Promise<void> }> };
};

let loader: Promise<PdfJs> | null = null;
function loadPdfJs() {
  loader ??= (import(/* turbopackIgnore: true */ /* webpackIgnore: true */ "/vendor/pdfjs/pdf.min.mjs" as string) as Promise<PdfJs>).then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    return pdfjs;
  }).catch(error => { loader = null; throw error; });
  return loader;
}

export async function extractPdfTextInBrowser(file: File) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(content.items.map(item => (item.str ?? "") + (item.hasEOL ? "\n" : "")).join(""));
    }
    return pages.join("\n\n");
  } finally {
    await pdf.destroy();
  }
}
