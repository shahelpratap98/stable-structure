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

// ---------------------------------------------------------------- finding members on a sheet

export type FoundLine = { a: { x: number; y: number }; b: { x: number; y: number }; colour: string; hue: number; label?: string }; // PDF points

// Long, straight, strongly coloured lines on the rendered page (beams are
// usually drawn in a colour), found by scanning the pixels in rows and
// columns. Lines shorter than minLen (PDF points) are ignored; dashed lines
// are joined across small gaps.
export function findLines(page: RenderedPage, minLen: number): FoundLine[] {
  const c = page.canvas;
  const ctx = c.getContext("2d");
  if (!ctx) return [];
  const W = c.width,
    H = c.height;
  const px = ctx.getImageData(0, 0, W, H).data;
  const k = W / page.width; // pixels per point
  const STEP = 2;
  const hueAt = (i: number): number => {
    const r = px[i],
      g = px[i + 1],
      b = px[i + 2];
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b);
    if (mx < 110 || (mx - mn) / mx < 0.45) return -1;
    let h = 0;
    if (mx === r) h = ((g - b) / (mx - mn)) % 6;
    else if (mx === g) h = (b - r) / (mx - mn) + 2;
    else h = (r - g) / (mx - mn) + 4;
    return Math.round((((h * 60 + 360) % 360) / 30)) % 12; // 12 hue buckets
  };
  type Run = { c: number; s: number; e: number; hue: number };
  const runs = (horiz: boolean): Run[] => {
    const out: Run[] = [];
    const n = horiz ? H : W,
      m = horiz ? W : H;
    const gap = Math.round(5 * k),
      min = minLen * k;
    for (let a = 0; a < n; a += STEP) {
      let start = -1,
        last = -1,
        hue = -1;
      for (let b = 0; b <= m; b += STEP) {
        const hh = b < m ? hueAt(((horiz ? a * W + b : b * W + a) * 4) | 0) : -1;
        if (hh >= 0 && (hue < 0 || hh === hue)) {
          if (start < 0) start = b;
          last = b;
          hue = hh;
        } else if (start >= 0 && (b - last > gap || (hh >= 0 && hh !== hue))) {
          if (last - start >= min) out.push({ c: a, s: start, e: last, hue });
          start = hh >= 0 ? b : -1;
          last = hh >= 0 ? b : -1;
          hue = hh;
        }
      }
    }
    return out;
  };
  // merge runs in neighbouring rows (a thick line) into one line at their centre
  const merge = (rs: Run[], horiz: boolean): FoundLine[] => {
    const bands: { cs: number[]; s: number; e: number; hue: number }[] = [];
    for (const r of rs.sort((x, y) => x.c - y.c)) {
      const b = bands.find((x) => x.hue === r.hue && r.c - x.cs[x.cs.length - 1] <= STEP * 3 && Math.min(x.e, r.e) - Math.max(x.s, r.s) > 0.5 * (r.e - r.s));
      if (b) {
        b.cs.push(r.c);
        b.s = Math.min(b.s, r.s);
        b.e = Math.max(b.e, r.e);
      } else bands.push({ cs: [r.c], s: r.s, e: r.e, hue: r.hue });
    }
    return bands.map((b) => {
      const mid = b.cs.reduce((a, v) => a + v, 0) / b.cs.length / k;
      const a = horiz ? { x: b.s / k, y: mid } : { x: mid, y: b.s / k };
      const e = horiz ? { x: b.e / k, y: mid } : { x: mid, y: b.e / k };
      const rgb = ["#d62828", "#e36414", "#d4a017", "#8ab61d", "#2a9d3c", "#1fa37a", "#119da4", "#1f78d1", "#2b4fd8", "#6a3fd8", "#b23fd8", "#d63384"][b.hue];
      return { a, b: e, colour: rgb, hue: b.hue };
    });
  };
  return [...merge(runs(true), true), ...merge(runs(false), false)];
}

// Text on the page with its position in PDF points (top-left origin), for member marks.
export async function pageWords(doc: PDFDocumentProxy, pageNo: number) {
  const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const out: { text: string; x: number; y: number }[] = [];
  for (const it of tc.items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const [, , , , tx, ty] = it.transform as number[];
    // PDF user space (bottom-left) to the viewport (top-left)
    const [x, y] = vp.convertToViewportPoint(tx + (it.width ?? 0) / 2, ty + (it.height ?? 0) / 2);
    out.push({ text: it.str.trim(), x, y });
  }
  return out;
}

// marks next to lines: the nearest word that looks like a member mark
export function labelLines(lines: FoundLine[], words: { text: string; x: number; y: number }[]) {
  const mark = /^(RB|B|L|LF|J|R)\d+(\.\d+)?[A-Z]?$/i;
  for (const w of words.filter((x) => mark.test(x.text))) {
    let best: FoundLine | null = null,
      bd = 22;
    for (const l of lines) {
      const horiz = Math.abs(l.b.y - l.a.y) < Math.abs(l.b.x - l.a.x);
      const along = horiz ? w.x >= Math.min(l.a.x, l.b.x) - 10 && w.x <= Math.max(l.a.x, l.b.x) + 10 : w.y >= Math.min(l.a.y, l.b.y) - 10 && w.y <= Math.max(l.a.y, l.b.y) + 10;
      const d = horiz ? Math.abs(w.y - l.a.y) : Math.abs(w.x - l.a.x);
      if (along && d < bd && !l.label) {
        bd = d;
        best = l;
      }
    }
    if (best) best.label = w.text.toUpperCase();
  }
  return lines;
}
