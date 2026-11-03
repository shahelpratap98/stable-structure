// A first structure for the house read off the sheets, worked down from the roof
// the way an engineer would lay it out: walls with their openings, trusses on the
// top storey, joists room by room spanning the short way, and a beam or post
// wherever a load has nothing under it. The calcs size it all. It's a draft to
// edit: what's loadbearing is the engineer's call, so it says what it assumed.

import { footprint, mainRoof, worldWalls } from "./base-house";
import type { BaseWall } from "./base-read";
import { defaultRoof, defaultWall, defaultZone, newId, nextMark, type DesignModel, type Level, type Member, type Opening, type Pt } from "./model";

export const DRAFTED = "Drafted from the plans";

// The pitch the engineer gives the house, carried onto the roof zones drafted from
// it. A drafted zone whose pitch has been changed by hand keeps its own.
export function setHousePitch(model: DesignModel, pitch: number): DesignModel {
  const base = model.base;
  if (!base) return model;
  const members = model.members.map((m) => (m.notes === DRAFTED && m.zone?.roof && m.zone.roof.pitch === base.pitch ? { ...m, zone: { ...m.zone, roof: { ...m.zone.roof, pitch } } } : m));
  return { ...model, members, base: { ...base, pitch, pitchFrom: "engineer" } };
}

const CELL = 0.1; // m
const BLOCK = 0.15; // m, this much wall that isn't a stud wall with cladding beside it is blockwork
const SILL = 0.9; // m
const BARRIER = 1.5; // m, a shorter wall doesn't divide a room for joists
const ON_WALL = 0.3; // m, an edge this close to a wall bears on it
const CARRIED = 0.5; // share of an edge that needs a wall under it
const SNAP = 0.25; // m
const MIN_SIDE = 0.5; // m, smaller strips of a room don't get their own zone
const MIN_AREA = 2; // m2
const EAVES = 0.45; // m, on the lower roofs
const JOISTS: [number, string][] = [[3.4, "190x45"], [4.2, "240x45"], [5, "290x45"]]; // m of span, SG8 at 400 centres
const SLACK = 1.2; // pieces of a room join up if their box is no bigger than this over their area
const ROOF_SPILL = 1; // m2, the most a roof zone may run out past the roof's outline, to save a zone

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Line = { h: boolean; c: number; s0: number; s1: number; member?: Member };
type Seg = { a: Pt; b: Pt; t: number; w: BaseWall };

const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : 0);

const lineOf = (a: Pt, b: Pt): Line | null => {
  const dx = Math.abs(b.x - a.x),
    dy = Math.abs(b.y - a.y);
  if (Math.min(dx, dy) > 0.05 * Math.max(dx, dy)) return null; // on the skew: left to the engineer
  const h = dx > dy;
  return { h, c: h ? (a.y + b.y) / 2 : (a.x + b.x) / 2, s0: Math.min(h ? a.x : a.y, h ? b.x : b.y), s1: Math.max(h ? a.x : a.y, h ? b.x : b.y) };
};

// how much of a stretch has one of these lines under it
function covered(lines: Line[], h: boolean, c: number, s0: number, s1: number) {
  const on = lines.filter((l) => l.h === h && Math.abs(l.c - c) <= ON_WALL).map((l) => [Math.max(l.s0, s0), Math.min(l.s1, s1)]).filter(([p, q]) => q > p).sort((p, q) => p[0] - q[0]);
  let total = 0,
    at = s0;
  for (const [p, q] of on) {
    total += Math.max(0, q - Math.max(p, at));
    at = Math.max(at, q);
  }
  return s1 > s0 ? total / (s1 - s0) : 0;
}

// the area, divided into rooms by the walls, as square-cornered pieces
function rooms(inside: (x: number, y: number) => boolean, box: Rect, walls: Seg[]): Rect[] {
  const W = Math.ceil((box.x1 - box.x0) / CELL) + 1,
    H = Math.ceil((box.y1 - box.y0) / CELL) + 1;
  const on = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) on[j * W + i] = inside(box.x0 + i * CELL, box.y0 + j * CELL) ? 1 : 0;
  for (const q of walls) {
    const L = Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y);
    if (L < BARRIER) continue;
    const r = Math.ceil(q.t / 2 / CELL);
    for (let k = 0, n = Math.ceil(L / (CELL / 2)); k <= n; k++) {
      const i = Math.round((q.a.x + ((q.b.x - q.a.x) * k) / n - box.x0) / CELL),
        j = Math.round((q.a.y + ((q.b.y - q.a.y) * k) / n - box.y0) / CELL);
      for (let u = -r; u <= r; u++) for (let v = -r; v <= r; v++) if (i + u >= 0 && j + v >= 0 && i + u < W && j + v < H) on[(j + v) * W + i + u] = 0;
    }
  }
  const out: Rect[] = [];
  const open = new Map<string, Rect>();
  for (let j = 0; j <= H; j++) {
    const here = new Set<string>();
    for (let i = 0; j < H && i < W; ) {
      if (!on[j * W + i]) {
        i++;
        continue;
      }
      let e = i;
      while (e < W && on[j * W + e]) e++;
      const key = `${i}:${e}`;
      here.add(key);
      const r = open.get(key);
      if (r) r.y1 = box.y0 + (j + 1) * CELL;
      else open.set(key, { x0: box.x0 + i * CELL, x1: box.x0 + e * CELL, y0: box.y0 + j * CELL, y1: box.y0 + (j + 1) * CELL });
      i = e;
    }
    for (const [key, r] of open)
      if (!here.has(key)) {
        out.push(r);
        open.delete(key);
      }
  }
  return out;
}

// An open-plan room comes out in strips wherever its side steps. Join them back up, where they
// nearly make a rectangle. Pieces on either side of a wall are too far apart to join.
function joined(list: Rect[], slack: number): Rect[] {
  const out = [...list];
  const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
  for (let again = true; again; ) {
    again = false;
    for (let i = 0; i < out.length && !again; i++)
      for (let j = i + 1; j < out.length && !again; j++) {
        const p = out[i],
          q = out[j];
        const gapX = Math.max(p.x0, q.x0) - Math.min(p.x1, q.x1),
          gapY = Math.max(p.y0, q.y0) - Math.min(p.y1, q.y1);
        if (gapX > 0.15 || gapY > 0.15 || (gapX > -0.3 && gapY > -0.3)) continue; // they share a side, not just a corner
        const box = { x0: Math.min(p.x0, q.x0), y0: Math.min(p.y0, q.y0), x1: Math.max(p.x1, q.x1), y1: Math.max(p.y1, q.y1) };
        if (area(box) > slack * (area(p) + area(q))) continue;
        out.splice(j, 1);
        out[i] = box;
        again = true;
      }
  }
  return out;
}

// run a piece's sides out to the wall lines beside it
function snapped(r: Rect, lines: Line[]): Rect {
  const near = (h: boolean, v: number) => lines.filter((l) => l.h === h && Math.abs(l.c - v) <= SNAP).sort((p, q) => Math.abs(p.c - v) - Math.abs(q.c - v))[0]?.c ?? v;
  return { x0: near(false, r.x0), x1: near(false, r.x1), y0: near(true, r.y0), y1: near(true, r.y1) };
}

// The side of a lean-to that meets the building above it: its rafters run up to that wall.
function leansOn(r: Rect, above: (x: number, y: number) => boolean): { dir: "x" | "y"; start: boolean } | null {
  const hits = (at: (k: number) => Pt) => Array.from({ length: 10 }, (_, i) => at((i + 0.5) / 10)).filter((p) => above(p.x, p.y)).length;
  const across = (k: number) => r.y0 + k * (r.y1 - r.y0),
    along = (k: number) => r.x0 + k * (r.x1 - r.x0);
  const sides = [
    { dir: "x" as const, start: true, n: hits((k) => ({ x: r.x0 - ON_WALL, y: across(k) })) },
    { dir: "x" as const, start: false, n: hits((k) => ({ x: r.x1 + ON_WALL, y: across(k) })) },
    { dir: "y" as const, start: true, n: hits((k) => ({ x: along(k), y: r.y0 - ON_WALL })) },
    { dir: "y" as const, start: false, n: hits((k) => ({ x: along(k), y: r.y1 + ON_WALL })) },
  ];
  const best = sides.reduce((a, b) => (b.n > a.n ? b : a));
  return best.n ? best : null;
}

// The biggest rectangles that fill an area, largest first. One may take in up to
// `spill` m2 from outside the area where that saves a zone, never another's ground.
function blocks(inside: (x: number, y: number) => boolean, box: Rect, spill: number): Rect[] {
  const W = Math.max(1, Math.ceil((box.x1 - box.x0) / CELL)),
    H = Math.max(1, Math.ceil((box.y1 - box.y0) / CELL));
  const shape = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) shape[j * W + i] = inside(box.x0 + (i + 0.5) * CELL, box.y0 + (j + 0.5) * CELL) ? 1 : 0;
  const free = shape.slice();
  const taken = new Uint8Array(W * H);
  const allow = spill / (CELL * CELL);
  const out: Rect[] = [];
  for (;;) {
    // the largest free rectangle, from the free run above each cell
    const h = new Int32Array(W);
    let best = { a: 0, i0: 0, i1: 0, j0: 0, j1: 0 };
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) h[i] = free[j * W + i] ? h[i] + 1 : 0;
      const st: number[] = [];
      for (let i = 0; i <= W; i++) {
        const v = i < W ? h[i] : 0;
        while (st.length && h[st[st.length - 1]] >= v) {
          const top = st.pop()!;
          const left = st.length ? st[st.length - 1] + 1 : 0;
          const a = h[top] * (i - left);
          if (a > best.a) best = { a, i0: left, i1: i, j0: j - h[top] + 1, j1: j + 1 };
        }
        st.push(i);
      }
    }
    if (best.a * CELL * CELL < MIN_AREA) break;
    let { i0, i1, j0, j1 } = best;
    let used = 0;
    // a strip along one side: worth taking if it's mostly free and the rest is outside
    const strip = (a0: number, a1: number, b0: number, b1: number) => {
      let fr = 0,
        outside = 0;
      for (let j = b0; j < b1; j++)
        for (let i = a0; i < a1; i++) {
          if (i < 0 || j < 0 || i >= W || j >= H || taken[j * W + i]) return null;
          if (free[j * W + i]) fr++;
          else if (!shape[j * W + i]) outside++;
          else return null;
        }
      return fr > outside && used + outside <= allow ? outside : null;
    };
    for (let grown = true; grown; ) {
      grown = false;
      const tries: [() => number | null, () => void][] = [
        [() => strip(i0, i1, j0 - 1, j0), () => j0--],
        [() => strip(i0, i1, j1, j1 + 1), () => j1++],
        [() => strip(i0 - 1, i0, j0, j1), () => i0--],
        [() => strip(i1, i1 + 1, j0, j1), () => i1++],
      ];
      for (const [test, take] of tries) {
        const o = test();
        if (o === null) continue;
        used += o;
        take();
        grown = true;
      }
    }
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++) {
        free[j * W + i] = 0;
        taken[j * W + i] = 1;
      }
    out.push({ x0: box.x0 + i0 * CELL, x1: box.x0 + i1 * CELL, y0: box.y0 + j0 * CELL, y1: box.y0 + j1 * CELL });
  }
  return out;
}

// how much of a rectangle is in an area
const share = (r: Rect, inside: (x: number, y: number) => boolean) => {
  let n = 0;
  for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) if (inside(r.x0 + ((i + 0.5) * (r.x1 - r.x0)) / 10, r.y0 + ((j + 0.5) * (r.y1 - r.y0)) / 10)) n++;
  return n / 100;
};

const round = (p: Pt): Pt => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });
const bigEnough = (r: Rect) => r.x1 - r.x0 >= MIN_SIDE && r.y1 - r.y0 >= MIN_SIDE && (r.x1 - r.x0) * (r.y1 - r.y0) >= MIN_AREA;

export function draftStructure(model: DesignModel): { members: Member[]; notes: string[] } {
  const base = model.base;
  if (!base) return { members: [], notes: [] };
  const levels = [...model.levels].sort((a, b) => a.elevation - b.elevation);
  const floors = levels.filter((l) => l.kind === "floor" && l.plan?.scale && base.sheets[l.id]?.walls.length);
  const add: Member[] = [];
  const marks = () => ({ members: [...model.members, ...add] });
  const member = (type: Member["type"], levelId: string, prefix: string, a: Pt, b: Pt | undefined, rest: Partial<Member>): Member => {
    const m: Member = { id: newId(), type, label: nextMark(marks(), prefix), levelId, a: round(a), ...(b ? { b: round(b) } : {}), material: "timber", section: "", notes: DRAFTED, ...rest };
    add.push(m);
    return m;
  };

  // ---- walls, with their openings
  const segs = new Map<string, Seg[]>();
  const walls = new Map<string, Line[]>();
  let lintels = 0;
  for (const [n, l] of floors.entries()) {
    const list = worldWalls(l, base.sheets[l.id]);
    segs.set(l.id, list.map((q) => ({ a: q.a, b: q.b, t: q.t, w: q.w })));
    const lines: Line[] = [];
    const scale = l.plan!.scale!;
    const prefix = n ? "LF" : "L";
    for (const { w, a, b, t } of list) {
      const line = lineOf(a, b);
      const taken = model.members.some((m) => {
        if (m.type !== "wall" || !m.b || m.levelId !== l.id) return false;
        const o = lineOf(m.a, m.b);
        return !!o && !!line && o.h === line.h && Math.abs(o.c - line.c) <= 0.2 && Math.min(o.s1, line.s1) - Math.max(o.s0, line.s0) >= 0.8 * (line.s1 - line.s0);
      });
      const block = !w.inferred && (w.core ? w.core >= BLOCK : t >= BLOCK);
      const openings: Opening[] = taken
        ? []
        : [...w.openings].sort((p, q) => p.s0 - q.s0).map((o) => {
            lintels++;
            return { id: newId(), label: `${prefix}${lintels}`, offset: Math.round(o.s0 * scale * 1000) / 1000, width: Math.round((o.s1 - o.s0) * scale * 1000) / 1000, sill: o.kind === "window" ? SILL : 0 };
          });
      const made = taken ? undefined : member("wall", l.id, "W", a, b, { section: "90x45", wall: { ...defaultWall(), kind: block ? "block" : w.ext ? "ext" : "int", thickness: block ? 190 : 90, loadbearing: w.ext || block, openings } });
      if (line) lines.push({ ...line, member: made });
    }
    walls.set(l.id, lines);
  }

  const edit = (m: Member | undefined, patch: Partial<Member>) => m && Object.assign(m, patch);
  const bearOn = (l: Level, h: boolean, c: number, s0: number, s1: number) => {
    for (const w of walls.get(l.id) ?? [])
      if (w.h === h && Math.abs(w.c - c) <= ON_WALL && Math.min(w.s1, s1) - Math.max(w.s0, s0) >= 0.5 && w.member?.wall) edit(w.member, { wall: { ...w.member.wall, loadbearing: true } });
  };

  // a beam end lands on a wall, or gets a post
  const land = (l: Level, p: Pt, along: boolean) => {
    const on = (walls.get(l.id) ?? []).find((w) => w.h !== along && Math.abs(w.c - (along ? p.x : p.y)) <= ON_WALL && (along ? p.y : p.x) >= w.s0 - ON_WALL && (along ? p.y : p.x) <= w.s1 + ON_WALL);
    const also = (walls.get(l.id) ?? []).find((w) => w.h === along && Math.abs(w.c - (along ? p.y : p.x)) <= ON_WALL && (along ? p.x : p.y) >= w.s0 - ON_WALL && (along ? p.x : p.y) <= w.s1 + ON_WALL);
    const wall = on ?? also;
    if (wall?.member?.wall) edit(wall.member, { wall: { ...wall.member.wall, loadbearing: true } });
    if (wall || posts.some((q) => q.levelId === l.id && Math.hypot(q.a.x - p.x, q.a.y - p.y) <= ON_WALL)) return;
    posts.push(member("post", l.id, "P", p, undefined, { grade: "SG8", section: "90x90", sizing: { mode: "auto" } }));
  };
  const posts: Member[] = [];
  const beams: Line[] = [];
  const beam = (l: Level, h: boolean, c: number, s0: number, s1: number) => {
    if (covered(beams, h, c, s0, s1) > 0.8) return;
    const a = h ? { x: s0, y: c } : { x: c, y: s0 },
      b = h ? { x: s1, y: c } : { x: c, y: s1 };
    member("beam", l.id, "B", a, b, { grade: "SG8", sizing: { mode: "auto" } });
    beams.push({ h, c, s0, s1 });
    land(l, a, h);
    land(l, b, h);
  };

  // ---- floors: on each storey, the joists for the storey above it
  let zones = 0;
  for (let i = 0; i + 1 < floors.length; i++) {
    const l = floors[i],
      up = floors[i + 1];
    const upper = footprint(segs.get(up.id)!);
    if (!upper || model.members.some((m) => m.type === "joistzone" && m.levelId === l.id && !m.zone?.roof)) continue;
    const under = walls.get(l.id) ?? [];
    const above = walls.get(up.id) ?? [];
    const pts = segs.get(up.id)!.flatMap((q) => [q.a, q.b]);
    const box = { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
    const pieces = joined(rooms(upper, box, segs.get(l.id)!), SLACK)
      .map((r) => snapped(r, [...under, ...above]))
      .flatMap((r) => {
        // too far to span either way: halve it, and a beam goes down the middle
        const longest = JOISTS[JOISTS.length - 1][0];
        const w = r.x1 - r.x0,
          h = r.y1 - r.y0;
        if (Math.min(w, h) <= longest) return [r];
        return w <= h ? [{ ...r, y1: r.y0 + h / 2 }, { ...r, y0: r.y0 + h / 2 }] : [{ ...r, x1: r.x0 + w / 2 }, { ...r, x0: r.x0 + w / 2 }];
      });
    for (const r of pieces) {
      if (!bigEnough(r)) continue;
      const sides = (dir: "x" | "y") => (dir === "y" ? [covered(under, true, r.y0, r.x0, r.x1), covered(under, true, r.y1, r.x0, r.x1)] : [covered(under, false, r.x0, r.y0, r.y1), covered(under, false, r.x1, r.y0, r.y1)]);
      const span = (dir: "x" | "y") => (dir === "y" ? r.y1 - r.y0 : r.x1 - r.x0);
      const works = (dir: "x" | "y") => sides(dir).every((v) => v >= CARRIED);
      const short: "x" | "y" = span("y") <= span("x") ? "y" : "x";
      const other = short === "y" ? "x" : "y";
      // the other way round only if it's walls both ends and a joist can make the span; otherwise a beam
      const dir = !works(short) && works(other) && span(other) <= JOISTS[1][0] ? other : short;
      zones++;
      const section = (JOISTS.find(([max]) => span(dir) <= max) ?? JOISTS[JOISTS.length - 1])[1];
      member("joistzone", l.id, "JZ", { x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 }, { grade: "SG8", section, zone: { ...defaultZone(), dir } });
      const edges: [boolean, number, number, number][] = dir === "y" ? [[true, r.y0, r.x0, r.x1], [true, r.y1, r.x0, r.x1]] : [[false, r.x0, r.y0, r.y1], [false, r.x1, r.y0, r.y1]];
      for (const [h, c, s0, s1] of edges) {
        if (covered(under, h, c, s0, s1) >= CARRIED) bearOn(l, h, c, s0, s1);
        else beam(l, h, c, s0, s1);
      }
    }
    // an outside wall above with no wall under it stands on a beam
    for (const w of above) {
      if (!w.member?.wall?.loadbearing || w.s1 - w.s0 < 1) continue;
      if (covered([...under, ...beams], w.h, w.c, w.s0, w.s1) < CARRIED) beam(l, w.h, w.c, w.s0, w.s1);
    }
  }

  // ---- roofs: trusses on the top storey, a lean-to on whatever sticks out from under the main roof
  const top = floors[floors.length - 1];
  const roofing = model.members.some((m) => m.type === "joistzone" && m.zone?.roof);
  if (top && !roofing) {
    const print = footprint(segs.get(top.id)!);
    const plan = mainRoof(model);
    // The trusses cover the roof as the roof sheet draws it, inside its outer walls. Without a
    // roof sheet, they cover the top storey.
    const inset = plan ? median(segs.get(top.id)!.filter((q) => q.w.ext).map((q) => plan.depth((q.a.x + q.b.x) / 2, (q.a.y + q.b.y) / 2))) : 0;
    const area = plan ? (x: number, y: number) => plan.inside(x, y) && plan.depth(x, y) >= inset - 0.1 : print;
    const pts = plan ? plan.pts : segs.get(top.id)!.flatMap((q) => [q.a, q.b]);
    if (print && area) {
      const box = { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
      const hip = base.sheets[levels.find((v) => v.kind === "roof")?.id ?? ""]?.hip ?? true;
      for (const r0 of blocks(area, box, ROOF_SPILL)) {
        const r = snapped(r0, walls.get(top.id) ?? []);
        if (!bigEnough(r)) continue;
        member("joistzone", top.id, "RZ", { x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 }, { grade: "SG8", section: "190x45", zone: { ...defaultZone(), dir: r.y1 - r.y0 <= r.x1 - r.x0 ? "y" : "x", spacing: 900, roof: { ...defaultRoof(), form: hip ? "hip" : "gable", pitch: base.pitch, framing: "trusses", overhang: base.eaves ?? 0.6 } } });
      }
      for (let i = 0; i + 1 < floors.length; i++) {
        const l = floors[i];
        const low = footprint(segs.get(l.id)!),
          up = footprint(segs.get(floors[i + 1].id)!);
        if (!low || !up) continue;
        const q = segs.get(l.id)!.flatMap((s) => [s.a, s.b]);
        const b2 = { x0: Math.min(...q.map((p) => p.x)), y0: Math.min(...q.map((p) => p.y)), x1: Math.max(...q.map((p) => p.x)), y1: Math.max(...q.map((p) => p.y)) };
        // a lean-to on what sticks out past the floor above; a piece mostly under the main
        // roof is covered by it (a void, or a wall above that wasn't read)
        const over = i + 2 === floors.length ? plan : null;
        for (const r0 of blocks((x, y) => low(x, y) && !up(x, y), b2, ROOF_SPILL)) {
          const r = snapped(r0, walls.get(l.id) ?? []);
          if (!bigEnough(r) || (over && share(r, over.inside) > 0.5)) continue;
          const lean = leansOn(r, up);
          const dir = lean?.dir ?? (r.y1 - r.y0 <= r.x1 - r.x0 ? "y" : "x");
          member("joistzone", l.id, "RZ", { x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 }, { grade: "SG8", section: "190x45", zone: { ...defaultZone(), dir, spacing: 900, roof: { ...defaultRoof(), form: "mono", pitch: base.pitch, framing: "rafters", overhang: base.eaves ?? EAVES, ...(lean?.start ? { high: "start" as const } : {}) } } });
        }
      }
    }
  }

  const count = (t: Member["type"]) => add.filter((m) => m.type === t).length;
  const inner = add.filter((m) => m.type === "wall" && m.wall?.kind === "int");
  const notes = add.length
    ? [
        `Added ${count("wall")} walls with ${lintels} lintels, ${zones} joist zones, ${add.filter((m) => m.zone?.roof).length} roof zones, ${count("beam")} beams and ${count("post")} posts.`,
        `${inner.filter((m) => m.wall?.loadbearing).length} of the ${inner.length} inside walls are loadbearing, because joists land on them. Check that suits the design.`,
        "Not added: foundations and bracing, which need the ground and the demand. Mark wet areas and any stair void on the joist zones.",
      ]
    : [];
  return { members: add, notes };
}
