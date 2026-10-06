const { parentPort, workerData } = require("node:worker_threads");
async function extract() {
  const bytes = Buffer.from(workerData.bytes),
    ext = workerData.extension;
  let blocks = [];
  if (ext === "txt") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    blocks = text
      .split(/\r?\n/)
      .map((text, i) => ({ location: `Line ${i + 1}`, text }));
  } else if (ext === "docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText(
      { buffer: bytes },
      { externalFileAccess: false },
    );
    blocks = result.value
      .split(/\n\n/)
      .map((text, i) => ({ location: `Paragraph ${i + 1}`, text }));
  } else if (ext === "pdf") {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loading = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      useWorkerFetch: false,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    });
    const pdf = await loading.promise;
    try {
      if (pdf.numPages > 100)
        throw Error("Choose a PDF with at most 100 pages.");
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p),
          content = await page.getTextContent();
        let line = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          line += item.str + " ";
          if (item.hasEOL) {
            blocks.push({ location: `Page ${p}`, text: line.trim() });
            line = "";
          }
        }
        if (line.trim())
          blocks.push({ location: `Page ${p}`, text: line.trim() });
        if (blocks.reduce((n, b) => n + b.text.length, 0) > 250000)
          throw Error("Choose a shorter document (under 250,000 characters).");
        page.cleanup();
      }
    } finally {
      await loading.destroy();
    }
  } else throw Error("Choose a PDF, DOCX or UTF-8 TXT file.");
  blocks = blocks.filter((b) => b.text.trim());
  if (!blocks.length)
    throw Error(
      "No readable text was found. For a scanned PDF, use a text-searchable PDF or paste its text into a TXT file.",
    );
  if (
    blocks.length > 10000 ||
    blocks.reduce((n, b) => n + b.text.length, 0) > 250000
  )
    throw Error("Choose a shorter document (under 250,000 characters).");
  return blocks;
}
extract()
  .then((blocks) => parentPort.postMessage({ blocks }))
  .catch((error) =>
    parentPort.postMessage({
      error: /Choose|readable text/.test(error.message)
        ? error.message
        : "This file could not be read. Try a text-searchable PDF, DOCX or UTF-8 TXT file.",
    }),
  );
