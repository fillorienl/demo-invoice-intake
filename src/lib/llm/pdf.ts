/**
 * Turns a PDF into what a generic vision model can read: one JPEG per page plus
 * the PDF's own text layer (empty for scans). Used for OpenAI-compatible APIs,
 * which mostly accept images but not PDFs.
 */
import { createCanvas } from "@napi-rs/canvas";

export const MAX_PAGES = 10;

export interface RenderedPdf {
  pages: { jpeg: Buffer; text: string }[];
  pageCount: number;
}

export async function renderPdf(pdf: Buffer, scale = 2): Promise<RenderedPdf> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`This PDF has ${doc.numPages} pages; the demo reads at most ${MAX_PAGES}.`);
    const pages: RenderedPdf["pages"] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // pdf.js expects a DOM-like canvas; @napi-rs/canvas is compatible enough for rendering
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
      pages.push({ jpeg: await canvas.encode("jpeg", 85), text });
      page.cleanup();
    }
    return { pages, pageCount: doc.numPages };
  } finally {
    await doc.destroy();
  }
}
