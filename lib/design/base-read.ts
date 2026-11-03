// Reading the house off an architect's sheets, for the base 3D model: walls,
// openings, the sheet's scale, how the sheets line up and the roof outline.
//
// CAD packages draw a cut wall as a filled or hatched band, which nothing else
// on a floor plan is: stairs, furniture and dimensions are lines. So the bands
// are read rather than pairs of lines. Everything here works on the sheet's
// vector paths in PDF points; a scanned sheet has none, and reads as no walls.

import type { Pt } from "./model";

export type SheetPath = { fill: string | null; stroke: string | null; width: number; pts: Pt[]; curved?: boolean };
export type SheetWord = { text: string; x: number; y: number };

export type BaseOpening = { s0: number; s1: number; kind: "window" | "door" }; // PDF points along the wall from a
// PDF points. inferred: drawn without a band, so check it. core: m of solid fill across the wall, 0 if it's only hatched
export type BaseWall = { id: string; a: Pt; b: Pt; t: number; ext: boolean; openings: BaseOpening[]; inferred?: boolean; core?: number };
export type WallRead = { walls: BaseWall[]; bands: number }; // bands: m of filled or hatched wall found
export type BaseSheet = { walls: BaseWall[]; eaves?: Pt[]; hip?: boolean }; // PDF points on the level's own sheet, so it moves with the sheet's scale and origin
export type BaseHouse = { sheets: Record<string, BaseSheet>; pitch: number; pitchFrom?: "sheet" | "engineer"; eaves?: number }; // sheets by level id; pitch in degrees, pitchFrom unset while it's only the default; eaves in m, as printed

type OpsList = { fnArray: number[] | Uint32Array; argsArray: unknown[] };
type Matrix = number[];

const PT = 0.0254 / 72; // m
const mul = (a: Matrix, b: Matrix) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const apply = (m: Matrix, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

function hex(v: unknown): string {
  if (typeof v === "string") return v.replace("#", "").toLowerCase();
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v as ArrayLike<number>, (n) => Math.round(n).toString(16).padStart(2, "0")).join("");
  return "000000";
}

// A page's operator list as paths in PDF points, top-left origin. `transform` is the viewport's.
export function readPaths(ops: OpsList, OPS: Record<string, number>, transform: Matrix): SheetPath[] {
  const fills = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const strokes = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const closes = new Set([OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  let ctm = transform.slice(),
    width = 1,
    stroke = "000000",
    fill = "000000";
  const stack: [Matrix, number, string, string][] = [];
  const out: SheetPath[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const a = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push([ctm, width, stroke, fill]);
    else if (fn === OPS.restore) [ctm, width, stroke, fill] = stack.pop() ?? [ctm, width, stroke, fill];
    else if (fn === OPS.transform) ctm = mul(ctm, a as number[]);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push([ctm, width, stroke, fill]);
      if (a[0]) ctm = mul(ctm, Array.from(a[0] as number[]));
    } else if (fn === OPS.paintFormXObjectEnd) [ctm, width, stroke, fill] = stack.pop() ?? [ctm, width, stroke, fill];
    else if (fn === OPS.setLineWidth) width = a[0] as number;
    else if (fn === OPS.setStrokeRGBColor) stroke = hex(a.length > 1 ? a : a[0]);
    else if (fn === OPS.setFillRGBColor) fill = hex(a.length > 1 ? a : a[0]);
    else if (fn === OPS.setFillColorN) fill = "pattern"; // a tiling pattern, a wall's hatch to a PDF writer
    else if (fn === OPS.constructPath) {
      const paint = a[0] as number;
      const data = (a[1] as (ArrayLike<number> | null)[] | undefined)?.[0];
      if (!data) continue;
      const scale = Math.hypot(ctm[0], ctm[1]);
      const isFill = fills.has(paint),
        isStroke = strokes.has(paint);
      if (!isFill && !isStroke) continue;
      let sub: Pt[] = [],
        curved = false,
        k = 0;
      const flush = (closed: boolean) => {
        if (closed && sub.length > 2) sub.push(sub[0]);
        if (sub.length > 1) out.push({ fill: isFill ? fill : null, stroke: isStroke ? stroke : null, width: width * scale, pts: sub, ...(curved ? { curved } : {}) });
        sub = [];
        curved = false;
      };
      while (k < data.length) {
        const op = data[k++];
        if (op === 0) {
          flush(false);
          sub = [apply(ctm, data[k], data[k + 1])];
          k += 2;
        } else if (op === 1) {
          sub.push(apply(ctm, data[k], data[k + 1]));
          k += 2;
        } else if (op === 2) {
          sub.push(apply(ctm, data[k + 4], data[k + 5]));
          curved = true;
          k += 6;
        } else if (op === 3) {
          sub.push(apply(ctm, data[k + 2], data[k + 3]));
          curved = true;
          k += 4;
        } else if (op === 4) flush(true);
        else break;
      }
      flush(closes.has(paint));
    }
  }
  return out;
}

// ---------------------------------------------------------------- wall bands

const THICK = [0.06, 0.42]; // m, a wall on plan
const MIN_LEN = 0.22; // m
const HATCH_MAX = 0.6; // m, one stroke of hatching
const GLYPH = 0.12; // m, solid shapes smaller than this are lettering or arrowheads
const CLOSE = 0.04; // m, the gap a line leaves between a wall's fill and its cladding hatch
const HATCH_CLOSE = 0.05; // m, half the spacing of hatching
const REACH = 1; // m, bands this close are one group; bands in line with each other, up to IN_LINE apart, are too (piers between big windows)
const IN_LINE = 5; // m
const NEAR_GROUP = 4; // m, a smaller group this near the main one is more of the house, if it's long enough
const MIN_GROUP = 1.5; // m, which a legend's swatches aren't, though at 1:50 they can sit under 2 m from the building
const BRIDGE = 7.2; // m, the widest gap in a wall that is still one wall (a double garage door)
const DOOR = 1.3; // m, inside the house a wider gap is an open plan, not a door
const LONG = 3; // m, lines along a gap this long are a wall to check, sooner than a window
const ROOM = 0.05; // share of the floor plan: a gap that lets the outside into more than this is in the perimeter; less is a porch

type Evidence = { key: string; polys: Pt[][]; lines: [Pt, Pt][] };

const len = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

// What could be a wall: solid shapes by colour, and hatching by colour. Hatching
// is many short strokes at one skew angle; a zigzag (ducts) or cross-ticks
// (dimensions) have strokes both ways, so they don't count.
function evidence(paths: SheetPath[], m: number): Evidence[] {
  const solid = new Map<string, Pt[][]>();
  const hatch = new Map<string, Map<number, [Pt, Pt][]>>();
  for (const q of paths) {
    if (q.fill && q.fill !== "ffffff" && !q.curved) {
      const xs = q.pts.map((p) => p.x),
        ys = q.pts.map((p) => p.y);
      if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * m < GLYPH || q.pts.length < 3) continue;
      solid.set(q.fill, [...(solid.get(q.fill) ?? []), q.pts]);
    } else if (q.stroke && !q.fill && q.pts.length === 2) {
      const [a, b] = q.pts;
      const L = len(a, b) * m;
      if (L > HATCH_MAX || L < 0.02) continue;
      let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (deg < 0) deg += 180;
      if (deg % 90 < 8 || deg % 90 > 82) continue;
      const key = `${q.stroke}|${q.width.toFixed(2)}`;
      const bins = hatch.get(key) ?? new Map<number, [Pt, Pt][]>();
      const bin = (Math.round(deg / 5) * 5) % 180;
      bins.set(bin, [...(bins.get(bin) ?? []), [a, b]]);
      hatch.set(key, bins);
    }
  }
  const out: Evidence[] = [...solid].map(([key, polys]) => ({ key: `fill ${key}`, polys, lines: [] }));
  for (const [key, bins] of hatch) {
    const [bin, lines] = [...bins].sort((p, q) => q[1].length - p[1].length)[0];
    if (lines.length >= 25 && (bins.get((180 - bin) % 180)?.length ?? 0) < 0.4 * lines.length) out.push({ key: `hatch ${key}`, polys: [], lines });
  }
  return out;
}

type Grid = { W: number; H: number; cell: number; x0: number; y0: number; on: Uint8Array };

// the frame an angle's walls run square in
const rot = (p: Pt, th: number): Pt => ({ x: p.x * Math.cos(th) + p.y * Math.sin(th), y: -p.x * Math.sin(th) + p.y * Math.cos(th) });
const unrot = (p: Pt, th: number): Pt => rot(p, -th);

function square(src: Uint8Array, W: number, H: number, r: number) {
  const a = new Uint8Array(src.length),
    b = new Uint8Array(src.length);
  const sweep = (s: Uint8Array, d: Uint8Array, n: number, l: number, at: (i: number, j: number) => number) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0, last = -1e9; j < l; j++) {
        if (s[at(i, j)]) last = j;
        if (j - last <= r) d[at(i, j)] = 1;
      }
      for (let j = l - 1, last = 1e9; j >= 0; j--) {
        if (s[at(i, j)]) last = j;
        if (last - j <= r) d[at(i, j)] = 1;
      }
    }
  };
  sweep(src, a, H, W, (y, x) => y * W + x);
  sweep(a, b, W, H, (x, y) => y * W + x);
  return b;
}
const invert = (s: Uint8Array) => s.map((v) => (v ? 0 : 1));
const closed = (s: Uint8Array, W: number, H: number, r: number) => invert(square(invert(square(s, W, H, r)), W, H, r));

// Paint evidence into a grid of the walls' frame (metres), rotated by th.
function paint(list: Evidence[], m: number, th: number, cell: number, frame: { x0: number; y0: number; x1: number; y1: number }): Grid {
  const W = Math.ceil((frame.x1 - frame.x0) / cell) + 2,
    H = Math.ceil((frame.y1 - frame.y0) / cell) + 2;
  const on = new Uint8Array(W * H);
  const cx = (x: number) => (x - frame.x0) / cell,
    cy = (y: number) => (y - frame.y0) / cell;
  for (const e of list) {
    for (const poly of e.polys) {
      const pts = poly.map((p) => rot({ x: p.x * m, y: p.y * m }, th)).map((p) => ({ x: cx(p.x), y: cy(p.y) }));
      const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)))),
        y1 = Math.min(H - 1, Math.ceil(Math.max(...pts.map((p) => p.y))));
      for (let y = y0; y <= y1; y++) {
        const xs: number[] = [];
        const yc = y + 0.5;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i],
            q = pts[(i + 1) % pts.length];
          if (p.y <= yc !== q.y <= yc) xs.push(p.x + ((yc - p.y) / (q.y - p.y)) * (q.x - p.x));
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.max(0, Math.round(xs[i])); x <= Math.min(W - 1, Math.round(xs[i + 1])); x++) on[y * W + x] = 1;
      }
    }
    if (e.lines.length) {
      const h = new Uint8Array(W * H);
      for (const [a0, b0] of e.lines) {
        const a = rot({ x: a0.x * m, y: a0.y * m }, th),
          b = rot({ x: b0.x * m, y: b0.y * m }, th);
        const n = Math.ceil(len(a, b) / cell) + 1;
        for (let i = 0; i <= n; i++) {
          const x = Math.floor(cx(a.x + ((b.x - a.x) * i) / n)),
            y = Math.floor(cy(a.y + ((b.y - a.y) * i) / n));
          if (x >= 0 && y >= 0 && x < W && y < H) h[y * W + x] = 1;
        }
      }
      const c = closed(h, W, H, Math.round(HATCH_CLOSE / cell));
      for (let i = 0; i < on.length; i++) if (c[i]) on[i] = 1;
    }
  }
  return { W, H, cell, x0: frame.x0, y0: frame.y0, on };
}

// A band: along the frame's x or y, in metres. s runs along it, c across it.
type Band = { along: "x" | "y"; th: number; c: number; s0: number; s1: number; t: number };

function bands(g: Grid, th: number): Band[] {
  const { W, H, cell, on } = g;
  const t0 = THICK[0] / cell,
    t1 = THICK[1] / cell,
    drift = 0.06 / cell,
    step = 0.12 / cell;
  const out: Band[] = [];
  const scan = (along: "x" | "y", n: number, l: number, at: (i: number, j: number) => number) => {
    const from = along === "x" ? g.x0 : g.y0,
      across = along === "x" ? g.y0 : g.x0;
    type Live = { s0: number; last: number; c0: number; t0: number; cs: number[]; ts: number[] };
    let live: Live[] = [];
    const done = (b: Live) => {
      const L = (b.last - b.s0 + 1) * cell;
      const t = [...b.ts].sort((p, q) => p - q)[b.ts.length >> 1];
      if (L < MIN_LEN || L < t * cell * 1.3) return;
      const c = [...b.cs].sort((p, q) => p - q)[b.cs.length >> 1];
      out.push({ along, th, c: across + c * cell, s0: from + b.s0 * cell, s1: from + (b.last + 1) * cell, t: t * cell });
    };
    for (let i = 0; i <= n; i++) {
      const next: Live[] = [];
      for (let j = 0; i < n && j < l; ) {
        if (!on[at(i, j)]) {
          j++;
          continue;
        }
        let e = j;
        while (e < l && on[at(i, e)]) e++;
        const t = e - j,
          c = (j + e) / 2;
        if (t >= t0 && t <= t1) {
          const hit = live.find((b) => Math.abs(b.c0 - c) <= drift && Math.abs(b.t0 - t) <= step);
          if (hit) {
            hit.last = i;
            hit.cs.push(c);
            hit.ts.push(t);
            next.push(hit);
            live = live.filter((b) => b !== hit);
          } else next.push({ s0: i, last: i, c0: c, t0: t, cs: [c], ts: [t] });
        }
        j = e;
      }
      live.forEach(done);
      live = next;
    }
  };
  scan("x", W, H, (x, y) => y * W + x); // walls along x are a short run down each column
  scan("y", H, W, (y, x) => y * W + x);
  // Each stops at the face of the wall it meets: carry it on across, so corners are closed.
  const inBand = (b: Band, s: number) => {
    const x = Math.floor(((b.along === "x" ? s : b.c) - g.x0) / cell),
      y = Math.floor(((b.along === "x" ? b.c : s) - g.y0) / cell);
    return x >= 0 && y >= 0 && x < W && y < H && !!on[y * W + x];
  };
  for (const b of out) {
    for (let k = 0; k < 0.5 / cell && inBand(b, b.s1 + cell / 2); k++) b.s1 += cell;
    for (let k = 0; k < 0.5 / cell && inBand(b, b.s0 - cell / 2); k++) b.s0 -= cell;
  }
  return out;
}

const bandLength = (b: Band[]) => b.reduce((n, x) => n + x.s1 - x.s0, 0);
const ends = (b: Band): [Pt, Pt] => {
  const P = (s: number) => unrot(b.along === "x" ? { x: s, y: b.c } : { x: b.c, y: s }, b.th);
  return [P(b.s0), P(b.s1)];
};

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Keep the building: the biggest group of bands that reach each other, any near its size, and real lengths of wall beside it.
function building(list: Band[]) {
  const seg = list.map(ends);
  const inLine = (p: Band, q: Band) => p.th === q.th && p.along === q.along && Math.abs(p.c - q.c) <= 0.05 && Math.max(p.s0, q.s0) - Math.min(p.s1, q.s1) <= IN_LINE;
  const touch = (i: number, j: number) => {
    const [a, b] = seg[i],
      [c, d] = seg[j];
    return inLine(list[i], list[j]) || Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b)) <= REACH;
  };
  const seen = new Set<number>();
  const groups: Band[][] = [];
  list.forEach((_, i) => {
    if (seen.has(i)) return;
    seen.add(i);
    const g = [i];
    for (let k = 0; k < g.length; k++)
      list.forEach((__, j) => {
        if (!seen.has(j) && touch(g[k], j)) {
          seen.add(j);
          g.push(j);
        }
      });
    groups.push(g.map((j) => list[j]));
  });
  const most = Math.max(0, ...groups.map(bandLength));
  const main = groups.find((g) => bandLength(g) === most) ?? [];
  const gap = (p: Band, q: Band) => {
    const [a, b] = ends(p),
      [c, d] = ends(q);
    return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
  };
  const beside = (g: Band[]) => g.some((p) => main.some((q) => gap(p, q) <= NEAR_GROUP));
  return groups.filter((g) => bandLength(g) >= 0.35 * most || (bandLength(g) >= MIN_GROUP && beside(g))).flat();
}

// the directions walls run on the sheet, as skews off square (0 first)
function skews(list: Evidence[], m: number) {
  const hist = new Map<number, number>();
  for (const e of list)
    for (const poly of e.polys)
      for (let i = 0; i + 1 < poly.length; i++) {
        const L = len(poly[i], poly[i + 1]) * m;
        if (L < 0.3) continue;
        const deg = ((Math.atan2(poly[i + 1].y - poly[i].y, poly[i + 1].x - poly[i].x) * 180) / Math.PI + 180) % 90;
        const bin = Math.round(deg) % 90;
        hist.set(bin, (hist.get(bin) ?? 0) + L);
      }
  const angles = [...hist].filter(([deg, L]) => deg !== 0 && deg !== 1 && deg !== 89 && L >= 1).sort((p, q) => q[1] - p[1]);
  return [0, ...angles.slice(0, 3).map(([deg]) => (deg * Math.PI) / 180)];
}

// ---------------------------------------------------------------- walls, openings, the perimeter

type Run = { th: number; along: "x" | "y"; c: number; t: number; pieces: { s0: number; s1: number }[] };

function toRuns(list: Band[]): Run[] {
  const sorted = [...list].sort((p, q) => q.s1 - q.s0 - (p.s1 - p.s0));
  const runs: (Run & { bands: Band[] })[] = [];
  for (const b of sorted) {
    const r = runs.find((x) => x.th === b.th && x.along === b.along && Math.abs(x.c - b.c) <= 0.12 && Math.abs(x.t - b.t) <= 0.15);
    if (r) r.bands.push(b);
    else runs.push({ th: b.th, along: b.along, c: b.c, t: b.t, pieces: [], bands: [b] });
  }
  for (const r of runs) {
    r.bands.sort((p, q) => p.s0 - q.s0);
    for (const b of r.bands) {
      const last = r.pieces[r.pieces.length - 1];
      if (last && b.s0 <= last.s1 + 0.06) last.s1 = Math.max(last.s1, b.s1);
      else r.pieces.push({ s0: b.s0, s1: b.s1 });
    }
  }
  // A wall that stops short, with nothing to meet (drawn with no band, say, like a
  // party wall): carry it on to the first wall across its line, as one more gap.
  const near = (r: Run, c: number) => r.pieces.some((p) => p.s0 - 0.3 <= c && c <= p.s1 + 0.3);
  for (const r of runs) {
    if (!r.pieces.length) continue;
    const across = runs.filter((o) => o.th === r.th && o.along !== r.along && near(o, r.c));
    const lo = r.pieces[0].s0,
      hi = r.pieces[r.pieces.length - 1].s1;
    const free = (s: number) => !across.some((o) => Math.abs(o.c - s) <= o.t / 2 + 0.15);
    const hits = across.map((o) => o.c);
    const up = hits.filter((c) => c > hi && c - hi <= BRIDGE).sort((p, q) => p - q)[0];
    const down = hits.filter((c) => c < lo && lo - c <= BRIDGE).sort((p, q) => q - p)[0];
    if (free(hi) && up !== undefined) r.pieces.push({ s0: up, s1: up });
    if (free(lo) && down !== undefined) r.pieces.unshift({ s0: down, s1: down });
  }
  // Or the wall it should meet stops short: bring that one out to this end.
  for (const r of runs) {
    if (!r.pieces.length) continue;
    const square = runs.filter((o) => o.th === r.th && o.along !== r.along && o.pieces.length);
    for (const low of [true, false]) {
      const end = low ? r.pieces[0].s0 : r.pieces[r.pieces.length - 1].s1;
      if (square.some((o) => near(o, r.c) && Math.abs(o.c - end) <= o.t / 2 + 0.15)) continue;
      const o = square.find((x) => Math.abs(x.c - end) <= 0.3 && !near(x, r.c));
      if (!o) continue;
      const hi = o.pieces[o.pieces.length - 1].s1,
        lo = o.pieces[0].s0;
      if (r.c > hi && r.c - hi <= BRIDGE) o.pieces.push({ s0: r.c, s1: r.c });
      else if (r.c < lo && lo - r.c <= BRIDGE) o.pieces.unshift({ s0: r.c, s1: r.c });
      else continue;
      if (low) r.pieces[0].s0 = Math.min(r.pieces[0].s0, o.c); // and close the corner
      else r.pieces[r.pieces.length - 1].s1 = Math.max(r.pieces[r.pieces.length - 1].s1, o.c);
    }
  }
  return runs;
}

const at = (r: { th: number; along: "x" | "y"; c: number }, s: number) => unrot(r.along === "x" ? { x: s, y: r.c } : { x: r.c, y: s }, r.th);

type Mask = { W: number; H: number; cell: number; x0: number; y0: number; on: Uint8Array };

export function drawn(segs: { a: Pt; b: Pt; t: number }[], cell: number, pad: number): Mask {
  const xs = segs.flatMap((q) => [q.a.x, q.b.x]),
    ys = segs.flatMap((q) => [q.a.y, q.b.y]);
  const x0 = Math.min(...xs) - pad,
    y0 = Math.min(...ys) - pad;
  const W = Math.ceil((Math.max(...xs) + pad - x0) / cell) + 1,
    H = Math.ceil((Math.max(...ys) + pad - y0) / cell) + 1;
  const on = new Uint8Array(W * H);
  for (const q of segs) {
    const L = len(q.a, q.b);
    const n = Math.ceil(L / (cell / 2)) + 1;
    const r = Math.max(1, Math.ceil(q.t / 2 / cell));
    for (let i = 0; i <= n; i++) {
      const x = Math.round((q.a.x + ((q.b.x - q.a.x) * i) / n - x0) / cell),
        y = Math.round((q.a.y + ((q.b.y - q.a.y) * i) / n - y0) / cell);
      for (let u = -r; u <= r; u++) for (let v = -r; v <= r; v++) if (x + u >= 0 && y + v >= 0 && x + u < W && y + v < H) on[(y + v) * W + x + u] = 1;
    }
  }
  return { W, H, cell, x0, y0, on };
}

// the cells the outside can reach
export function flood(g: Mask) {
  const out = new Uint8Array(g.on.length);
  const stack = [0];
  out[0] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % g.W;
    for (const n of [x > 0 ? c - 1 : -1, x < g.W - 1 ? c + 1 : -1, c - g.W, c + g.W]) {
      if (n >= 0 && n < out.length && !out[n] && !g.on[n]) {
        out[n] = 1;
        stack.push(n);
      }
    }
  }
  return out;
}

const insideArea = (g: Mask, outside: Uint8Array) => outside.reduce((n, v, i) => n + (v || g.on[i] ? 0 : 1), 0);

// What's in a gap in a wall, from the lines drawn along it.
function gapKind(paths: SheetPath[], m: number, r: Run, s0: number, s1: number): "window" | "door" | "wall" {
  const a = at(r, s0),
    b = at(r, s1);
  const L = s1 - s0;
  const ux = (b.x - a.x) / L,
    uy = (b.y - a.y) / L;
  const offsets: number[] = [];
  const coloured = new Set<number>(); // windows are drawn in colour and in pairs; one coloured line is cladding or setout
  for (const q of paths) {
    if (!q.stroke || q.curved) continue;
    for (let i = 0; i + 1 < q.pts.length; i++) {
      const p0 = { x: q.pts[i].x * m, y: q.pts[i].y * m },
        p1 = { x: q.pts[i + 1].x * m, y: q.pts[i + 1].y * m };
      const l = len(p0, p1);
      if (l < 0.15) continue;
      if (Math.abs((p1.x - p0.x) * uy - (p1.y - p0.y) * ux) / l > 0.05) continue;
      const off = -(p0.x - a.x) * uy + (p0.y - a.y) * ux;
      if (Math.abs(off) > r.t / 2 + 0.05) continue;
      const u0 = (p0.x - a.x) * ux + (p0.y - a.y) * uy,
        u1 = (p1.x - a.x) * ux + (p1.y - a.y) * uy;
      if (Math.min(L, Math.max(u0, u1)) - Math.max(0, Math.min(u0, u1)) < 0.5 * L) continue;
      if (!offsets.some((o) => Math.abs(o - off) < 0.012)) offsets.push(off);
      if (!/^([0-9a-f]{2})\1\1$/.test(q.stroke)) coloured.add(Math.round(off / 0.012));
    }
  }
  if (L >= LONG) return offsets.length ? "wall" : "door"; // a garage door has nothing drawn across it
  if (coloured.size >= 2 || offsets.length >= 3) return "window";
  // two lines along it: a length of wall drawn with no band, or a small window
  if (offsets.length >= 2) return L >= 2 ? "wall" : "window";
  return "door";
}

// Bands to walls: joins each wall through its openings and marks the perimeter.
function assemble(paths: SheetPath[], list: Band[], m: number): BaseWall[] {
  const runs = toRuns(list);
  type Gap = { r: Run; s0: number; s1: number };
  const gaps: Gap[] = [];
  for (const r of runs) for (let i = 0; i + 1 < r.pieces.length; i++) if (r.pieces[i + 1].s0 - r.pieces[i].s1 <= BRIDGE) gaps.push({ r, s0: r.pieces[i].s1, s1: r.pieces[i + 1].s0 });
  const solid = runs.flatMap((r) => r.pieces.map((p) => ({ a: at(r, p.s0), b: at(r, p.s1), t: r.t })));
  if (!solid.length) return [];
  const seg = (g: Gap) => ({ a: at(g.r, g.s0), b: at(g.r, g.s1), t: g.r.t });
  const CELL = 0.05;
  const test = (open: Gap[]) => {
    const g = drawn([...solid, ...open.map(seg)], CELL, 1);
    return { g, outside: flood(g) };
  };
  // A gap is in the perimeter if the outside floods in without it. The rest are inside the house.
  let keep = [...gaps];
  const full = insideArea(...(Object.values(test(keep)) as [Mask, Uint8Array]));
  const perimeter = new Set<Gap>();
  for (const g of [...gaps].sort((p, q) => q.s1 - q.s0 - (p.s1 - p.s0))) {
    const without = keep.filter((x) => x !== g);
    const t = test(without);
    if (insideArea(t.g, t.outside) >= (1 - ROOM) * full) keep = without;
    else perimeter.add(g);
  }
  const { g, outside } = test(keep);
  const isOut = (p: Pt) => {
    const x = Math.round((p.x - g.x0) / g.cell),
      y = Math.round((p.y - g.y0) / g.cell);
    return x < 0 || y < 0 || x >= g.W || y >= g.H || !!outside[y * g.W + x];
  };

  const walls: BaseWall[] = [];
  for (const r of runs) {
    let cur: { s0: number; s1: number; openings: { s0: number; s1: number; kind: "window" | "door" }[]; inferred?: boolean } | null = null;
    const finish = () => {
      if (!cur) return;
      const a = at(r, cur.s0),
        b = at(r, cur.s1);
      const n = { x: -(b.y - a.y) / (len(a, b) || 1), y: (b.x - a.x) / (len(a, b) || 1) };
      const side = r.t / 2 + 0.2;
      const ext = [0.15, 0.5, 0.85].some((f) => {
        const mid = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        return isOut({ x: mid.x + n.x * side, y: mid.y + n.y * side }) || isOut({ x: mid.x - n.x * side, y: mid.y - n.y * side });
      });
      walls.push({
        id: "",
        a: { x: a.x / m, y: a.y / m },
        b: { x: b.x / m, y: b.y / m },
        t: r.t / m,
        ext,
        openings: cur.openings.map((o) => ({ s0: (o.s0 - cur!.s0) / m, s1: (o.s1 - cur!.s0) / m, kind: o.kind })),
        ...(cur.inferred ? { inferred: true } : {}),
      });
      cur = null;
    };
    r.pieces.forEach((p, i) => {
      if (cur) {
        const prev = r.pieces[i - 1];
        const g2 = gaps.find((x) => x.r === r && Math.abs(x.s0 - prev.s1) < 1e-9);
        const wide = p.s0 - prev.s1;
        if (g2 && (perimeter.has(g2) || wide <= DOOR)) {
          const kind = gapKind(paths, m, r, prev.s1, p.s0);
          if (kind === "wall") cur.inferred = true;
          else cur.openings.push({ s0: prev.s1, s1: p.s0, kind });
          cur.s1 = p.s1;
          return;
        }
        finish();
      }
      cur = { s0: p.s0, s1: p.s1, openings: [] };
    });
    finish();
  }
  return walls.filter((w) => len(w.a, w.b) * m >= MIN_LEN).map((w, i) => ({ ...w, id: `w${i + 1}` }));
}

// The walls drawn on a sheet. m: metres per PDF point.
export function readWalls(paths: SheetPath[], m: number): WallRead {
  const none: WallRead = { walls: [], bands: 0 };
  const ev = evidence(paths, m);
  if (!ev.length) return none;
  const cell = Math.max(0.02, m / 4);
  const box = (list: Evidence[], th: number) => {
    const pts = list.flatMap((e) => [...e.polys.flat(), ...e.lines.flat()]).map((p) => rot({ x: p.x * m, y: p.y * m }, th));
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x),
      ys = pts.map((p) => p.y);
    return { x0: Math.min(...xs) - 0.1, y0: Math.min(...ys) - 0.1, x1: Math.max(...xs) + 0.1, y1: Math.max(...ys) + 0.1 };
  };
  const angles = skews(ev, m);
  // a colour that draws walls draws metres of them
  const scored = ev.map((e) => ({
    e,
    n: angles.reduce((sum, th) => {
      const f = box([e], th);
      return f ? sum + bandLength(bands(paint([e], m, th, cell, f), th)) : sum;
    }, 0),
  }));
  const best = Math.max(0, ...scored.map((x) => x.n));
  const use = scored.filter((x) => x.n >= Math.max(3, 0.12 * best)).map((x) => x.e);
  if (!use.length) return none;
  const found: Band[] = [];
  for (const th of angles) {
    const f = box(use, th);
    if (!f) continue;
    const g = paint(use, m, th, cell, f);
    g.on = closed(g.on, g.W, g.H, Math.round(CLOSE / cell));
    const here = bands(g, th);
    // a skew pass only adds what the square one couldn't see
    for (const b of here) {
      const [p, q] = ends(b);
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      if (th === 0 || !found.some((o) => o.th !== th && segDist(mid, ...ends(o)) < o.t)) found.push(b);
    }
  }
  const main = building(found);
  const walls = assemble(paths, main, m);
  // How much of each wall's width is solid fill: cladding hatch beside a stud wall widens the band, not the wall.
  const solid = use.filter((e) => e.polys.length);
  const f = box(solid, 0);
  if (f) {
    const g = paint(solid, m, 0, cell, f);
    const hit = (x: number, y: number) => {
      const i = Math.floor((x - g.x0) / cell),
        j = Math.floor((y - g.y0) / cell);
      return i >= 0 && j >= 0 && i < g.W && j < g.H && !!g.on[j * g.W + i];
    };
    for (const w of walls) {
      const L = len(w.a, w.b),
        t = w.t * m;
      const ux = (w.b.x - w.a.x) / L,
        uy = (w.b.y - w.a.y) / L;
      const widths: number[] = [];
      for (let k = 1; k < 20; k++) {
        const s = (L * k) / 20;
        if (w.openings.some((o) => s >= o.s0 && s <= o.s1)) continue;
        let on = 0;
        const n = Math.ceil((t + 0.1) / (cell / 2));
        for (let q = 0; q <= n; q++) {
          const d = -(t + 0.1) / 2 + (q / n) * (t + 0.1);
          if (hit((w.a.x + ux * s) * m - uy * d, (w.a.y + uy * s) * m + ux * d)) on++;
        }
        widths.push((on / n) * (t + 0.1));
      }
      w.core = [...widths].sort((p, q) => p - q)[widths.length >> 1] ?? 0;
    }
  }
  return { walls, bands: bandLength(main) };
}

// ---------------------------------------------------------------- scale

const STANDARD = [20, 25, 50, 100, 200, 250, 500];

// The sheet's true scale, from what it says its dimensions are: each number
// against the length of the line it sits on. Beats the printed scale, which can
// be for another sheet size. Returns N of 1:N, or null if the numbers don't agree.
export function scaleFromDimensions(words: SheetWord[], paths: SheetPath[]): number | null {
  const lines = paths.flatMap((q) => {
    if (!q.stroke) return [];
    return q.pts.slice(1).flatMap((p, i) => {
      const a = q.pts[i];
      const L = len(a, p);
      if (L < 12) return [];
      const h = Math.abs(p.y - a.y) < 0.2,
        v = Math.abs(p.x - a.x) < 0.2;
      return h || v ? [{ h, c: h ? a.y : a.x, s0: h ? Math.min(a.x, p.x) : Math.min(a.y, p.y), s1: h ? Math.max(a.x, p.x) : Math.max(a.y, p.y) }] : [];
    });
  });
  const votes = new Map<number, number>();
  for (const w of words) {
    if (!/^\d{3,5}$/.test(w.text)) continue;
    const mm = Number(w.text);
    if (mm < 300) continue;
    let best: (typeof lines)[number] | null = null;
    for (const l of lines) {
      const s = l.h ? w.x : w.y,
        c = l.h ? w.y : w.x;
      if (s < l.s0 || s > l.s1 || Math.abs(c - l.c) > 14) continue;
      if (Math.abs(s - (l.s0 + l.s1) / 2) > 0.25 * (l.s1 - l.s0)) continue; // the number sits mid-line
      if (!best || l.s1 - l.s0 < best.s1 - best.s0) best = l;
    }
    if (!best) continue;
    const n = (mm / 1000 / (best.s1 - best.s0) / PT);
    const hit = STANDARD.find((v) => Math.abs(n / v - 1) < 0.03);
    if (hit) votes.set(hit, (votes.get(hit) ?? 0) + 1);
  }
  const all = [...votes.values()].reduce((p, q) => p + q, 0);
  const [top] = [...votes].sort((p, q) => q[1] - p[1]);
  return top && top[1] >= 4 && top[1] >= 0.7 * all ? top[0] : null;
}

// Of the scales printed on a sheet, the one that makes its walls wall-sized.
export function scaleFromWalls(paths: SheetPath[], printed: number[]): number | null {
  let best: { n: number; off: number } | null = null;
  for (const n of printed) {
    const m = n * PT;
    const ev = readWalls(paths, m).walls;
    if (!ev.length) continue;
    const total = ev.reduce((s, w) => s + len(w.a, w.b), 0);
    let run = 0,
      t = 0;
    for (const w of [...ev].sort((p, q) => p.t - q.t)) {
      run += len(w.a, w.b);
      if (run >= total / 2) {
        t = w.t * m;
        break;
      }
    }
    const off = Math.abs(t - 0.1);
    if (off < 0.05 && (!best || off < best.off)) best = { n, off };
  }
  return best?.n ?? null;
}

// ---------------------------------------------------------------- lining the sheets up

type Line = { h: boolean; c: number; s0: number; s1: number };
const squareLines = (walls: BaseWall[], m: number): Line[] =>
  walls.flatMap((w) => {
    const dx = Math.abs(w.b.x - w.a.x),
      dy = Math.abs(w.b.y - w.a.y);
    if (Math.min(dx, dy) > 0.02 * Math.max(dx, dy)) return [];
    const h = dx > dy;
    const s = (h ? [w.a.x, w.b.x] : [w.a.y, w.b.y]).map((v) => v * m).sort((p, q) => p - q);
    return [{ h, c: ((h ? w.a.y + w.b.y : w.a.x + w.b.x) / 2) * m, s0: s[0], s1: s[1] }];
  });

// How far to shift `walls` (metres) to sit on `ref`, by the walls the two share.
// share: how much of the shorter sheet's walls landed on the other's.
export function alignWalls(ref: BaseWall[], mRef: number, walls: BaseWall[], m: number): { dx: number; dy: number; share: number } | null {
  const A = squareLines(ref, mRef),
    B = squareLines(walls, m);
  if (A.length < 3 || B.length < 3) return null;
  const peaks = (horizontal: boolean) => {
    const hist = new Map<number, number>();
    for (const p of A.filter((l) => l.h === horizontal))
      for (const q of B.filter((l) => l.h === horizontal)) {
        const bin = Math.round((p.c - q.c) / 0.02);
        const w = Math.min(p.s1 - p.s0, q.s1 - q.s0);
        for (const k of [bin - 1, bin, bin + 1]) hist.set(k, (hist.get(k) ?? 0) + w);
      }
    return [...hist].sort((p, q) => q[1] - p[1]).slice(0, 14).map(([k]) => k * 0.02);
  };
  const dxs = peaks(false),
    dys = peaks(true);
  let best: { dx: number; dy: number; score: number } | null = null;
  for (const dx of dxs)
    for (const dy of dys) {
      let score = 0;
      for (const p of A)
        for (const q of B) {
          if (p.h !== q.h) continue;
          const [dc, ds] = p.h ? [dy, dx] : [dx, dy];
          if (Math.abs(p.c - q.c - dc) > 0.07) continue;
          score += Math.max(0, Math.min(p.s1, q.s1 + ds) - Math.max(p.s0, q.s0 + ds));
        }
      if (!best || score > best.score) best = { dx, dy, score };
    }
  if (!best) return null;
  const total = (l: Line[]) => l.reduce((s, x) => s + x.s1 - x.s0, 0);
  const share = best.score / Math.min(total(A), total(B));
  return share >= 0.2 ? { dx: best.dx, dy: best.dy, share } : null;
}

// ---------------------------------------------------------------- the roof

const area = (pts: Pt[]) => Math.abs(pts.reduce((n, p, i) => n + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2;

// The eaves on a roof sheet: the biggest closed outline around the building
// that is still about the building's size.
export function readEaves(paths: SheetPath[], walls: BaseWall[]): Pt[] | null {
  if (!walls.length) return null;
  const xs = walls.flatMap((w) => [w.a.x, w.b.x]),
    ys = walls.flatMap((w) => [w.a.y, w.b.y]);
  const b = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const size = (b.x1 - b.x0) * (b.y1 - b.y0);
  let best: Pt[] | null = null;
  for (const q of paths) {
    if (!q.stroke || q.fill || q.pts.length < 5 || len(q.pts[0], q.pts[q.pts.length - 1]) > 1) continue;
    const pts = q.pts.slice(0, -1);
    const px = pts.map((p) => p.x),
      py = pts.map((p) => p.y);
    if (Math.min(...px) > b.x0 || Math.max(...px) < b.x1 || Math.min(...py) > b.y0 || Math.max(...py) < b.y1) continue;
    const A = area(pts);
    if (A < 0.7 * size || A > 1.7 * size) continue;
    if (!best || A > area(best)) best = pts;
  }
  return best;
}

// hips show as long diagonals running in from the eaves' corners
export function isHipped(paths: SheetPath[], eaves: Pt[]) {
  const corners = eaves.filter((p, i) => {
    const a = eaves[(i + eaves.length - 1) % eaves.length],
      b = eaves[(i + 1) % eaves.length];
    return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1;
  });
  let hits = 0;
  for (const c of corners) {
    const near = paths.some((q) => {
      if (!q.stroke) return false;
      return q.pts.slice(1).some((p, i) => {
        const a = q.pts[i];
        const L = len(a, p);
        if (L < 30) return false;
        const skew = Math.abs(Math.abs(p.x - a.x) - Math.abs(p.y - a.y)) / L;
        return skew < 0.15 && Math.min(len(a, c), len(p, c)) < 14;
      });
    });
    if (near) hits++;
  }
  return hits >= 2;
}

// the eaves width printed in the notes: "EAVES : 150MM"
export function eavesWidth(text: string): number | null {
  const m = text.match(/eaves\W{0,6}(?:width\W{0,4})?(\d{2,4})\s*mm/i);
  const v = m ? Number(m[1]) / 1000 : NaN;
  return v >= 0.05 && v <= 1.5 ? v : null;
}

export function roofPitch(text: string): number | null {
  const m = text.match(/(?:pitch|roof\s+(?:angle|slope))\D{0,20}(\d{1,2}(?:\.\d)?)\s*(?:°|deg)/i) ?? text.match(/(\d{1,2}(?:\.\d)?)\s*(?:°|deg\w*)\s*(?:pitch|roof\s+(?:pitch|angle|slope))/i);
  const v = m ? Number(m[1]) : NaN;
  return v >= 1 && v <= 60 ? v : null;
}
