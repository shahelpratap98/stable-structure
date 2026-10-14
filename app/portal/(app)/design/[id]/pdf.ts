"use client";

// pdf.js, loaded on demand: the design editor is the only page that needs it.
import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;

function pdfjs() {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
  }
  return lib;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

// One document per plan id; signed URLs change but the file does not.
export function loadPdf(key: string, src: string | ArrayBuffer) {
  let doc = docs.get(key);
  if (!doc) {
    doc = pdfjs().then((m) => m.getDocument(typeof src === "string" ? { url: src } : { data: new Uint8Array(src.slice(0)) }).promise);
    docs.set(key, doc);
    doc.catch(() => docs.delete(key));
  }
  return doc;
}

export async function countPages(data: ArrayBuffer) {
  const m = await pdfjs();
  const task = m.getDocument({ data: new Uint8Array(data.slice(0)) });
  const n = (await task.promise).numPages;
  void task.destroy();
  return n;
}

export type RenderedPage = { width: number; height: number; canvas: HTMLCanvasElement };

// Render a page at up to ~4096 px on its long side. width/height are PDF points.
export async function renderPage(doc: PDFDocumentProxy, pageNo: number): Promise<RenderedPage> {
  const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, 4096 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.style.cssText = "display:block;width:100%;height:100%";
  await page.render({ canvas, viewport }).promise;
  return { width: base.width, height: base.height, canvas };
}
