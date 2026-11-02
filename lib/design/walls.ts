// Walls read off a drawing come in pieces: a wall line breaks wherever there
// is a window or door. Pieces lying in line are joined into one wall, and a
// break of a window's width becomes an opening in it (with its own lintel).

import type { Pt } from "./model";

export type WallRun = { a: Pt; b: Pt; openings: { offset: number; width: number; sill: number }[] };

const MIN_GAP = 0.5; // m, a break narrower than this is a drafting gap, not an opening
const MAX_GAP = 3.6; // m, wider than this is two separate walls
const SILL = 0.9; // m, windows
const DOOR = 2.4; // m, a break this wide or more is taken as a door or slider (sill 0)

export function joinWallRuns(segs: { a: Pt; b: Pt }[], offTol = 0.15): WallRun[] {
  type S = { a: Pt; b: Pt; ux: number; uy: number; off: number; s0: number; s1: number; used?: boolean };
  const items: S[] = segs
    .map(({ a, b }) => {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      let ux = (b.x - a.x) / L,
        uy = (b.y - a.y) / L;
      // one sense per direction, so parallel pieces compare
      if (ux < -1e-9 || (Math.abs(ux) < 1e-9 && uy < 0)) {
        ux = -ux;
        uy = -uy;
      }
      const off = a.x * -uy + a.y * ux;
      const pa = a.x * ux + a.y * uy,
        pb = b.x * ux + b.y * uy;
      return { a, b, ux, uy, off, s0: Math.min(pa, pb), s1: Math.max(pa, pb) };
    })
    .filter((s) => Number.isFinite(s.ux));
  const out: WallRun[] = [];
  for (const s of items) {
    if (s.used) continue;
    const line = items.filter((t) => !t.used && Math.abs(t.ux * s.uy - t.uy * s.ux) < 0.02 && Math.abs(t.off - s.off) <= offTol).sort((p, q) => p.s0 - q.s0);
    let cur: { s0: number; s1: number; gaps: { at: number; w: number }[] } | null = null;
    const flush = () => {
      if (!cur) return;
      const p = (t: number): Pt => ({ x: t * s.ux - s.off * s.uy, y: t * s.uy + s.off * s.ux });
      const start = cur.s0;
      out.push({ a: p(cur.s0), b: p(cur.s1), openings: cur.gaps.map((g) => ({ offset: g.at - start, width: g.w, sill: g.w >= DOOR ? 0 : SILL })) });
      cur = null;
    };
    for (const t of line) {
      t.used = true;
      if (!cur) cur = { s0: t.s0, s1: t.s1, gaps: [] };
      else {
        const gap = t.s0 - cur.s1;
        if (gap > MAX_GAP) {
          flush();
          cur = { s0: t.s0, s1: t.s1, gaps: [] };
        } else {
          if (gap >= MIN_GAP) cur.gaps.push({ at: cur.s1, w: gap });
          cur.s1 = Math.max(cur.s1, t.s1);
        }
      }
    }
    flush();
  }
  return out;
}
