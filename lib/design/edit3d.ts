// Editing members in the 3D view: where the handles go, and what dragging one
// does to the member. Everything here is plain geometry; the view does the mouse.

import type { Part } from "./geometry";
import { along, memberLength, type DesignModel, type Member, type Opening, type Pt } from "./model";

export type P3 = { x: number; y: number; z: number };
export type Handle =
  | { kind: "end"; end: "a" | "b"; at: P3 }
  | { kind: "corner"; cx: "a" | "b"; cy: "a" | "b"; at: P3 } // a zone's corner: x from end cx, y from end cy
  | { kind: "lift"; at: P3 }
  | { kind: "move"; at: P3 }
  | { kind: "top"; at: P3 }
  | { kind: "base"; at: P3 };

const EDITABLE = new Set<Member["type"]>(["beam", "lintel", "joist", "rafter", "wall", "post", "joistzone", "bracing", "retaining"]);
const FLAT = new Set<Member["type"]>(["wall", "bracing", "retaining"]); // these sit on their level: no raise or lower
const SNAP = 0.2; // m, an end this close to another member's end or post jumps onto it
const MM = (v: number) => Math.round(v * 1000) / 1000; // model units are metres: keep to the millimetre
export const STEP = 0.01; // m, what a drag moves in; holding Alt gives 1 mm
const stepped = (v: number, step: number) => Math.round(v / step) * step;

export const editable = (m: Member | undefined): m is Member => !!m && EDITABLE.has(m.type);

// lowest and highest points of a member's parts
export function zRange(parts: Part[]) {
  const zs = parts.flatMap((p) => {
    if (p.kind === "beam3") return [p.a.z, p.b.z];
    if (p.kind === "poly") return p.pts.map((q) => q.z);
    if (p.kind === "wedge") return [p.z0, p.z0 + Math.max(p.h0, p.h1)];
    return [p.z0, p.z1];
  });
  return zs.length ? { z0: Math.min(...zs), z1: Math.max(...zs) } : null;
}

export function handlesFor(m: Member, parts: Part[]): Handle[] {
  const z = zRange(parts);
  if (!z) return [];
  if (m.type === "post") {
    return [
      { kind: "top", at: { ...m.a, z: z.z1 } },
      { kind: "base", at: { ...m.a, z: z.z0 } },
      { kind: "move", at: { ...m.a, z: (z.z0 + z.z1) / 2 } },
    ];
  }
  if (!m.b) return [];
  const mid = { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 };
  if (m.type === "joistzone") {
    const corners = (["a", "b"] as const).flatMap((cx) => (["a", "b"] as const).map((cy): Handle => ({ kind: "corner", cx, cy, at: { x: m[cx]!.x, y: m[cy]!.y, z: z.z1 } })));
    return [...corners, { kind: "move", at: { ...mid, z: z.z1 } }];
  }
  // on an opening's lintel the ends set the opening's width, and sliding it moves the opening along the wall
  return [
    { kind: "end", end: "a", at: { ...m.a, z: z.z1 } },
    { kind: "end", end: "b", at: { ...m.b, z: z.z1 } },
    { kind: "move", at: { ...mid, z: z.z1 } },
    ...(FLAT.has(m.type) ? [] : [{ kind: "lift", at: { ...mid, z: z.z1 + 0.4 } } as Handle]),
  ];
}

// Other members' ends and posts near this member's storey: what a dragged end can link to.
export function snapPoints(model: DesignModel, m: Member): Pt[] {
  const sorted = [...model.levels].sort((a, b) => a.elevation - b.elevation);
  const i = sorted.findIndex((l) => l.id === m.levelId);
  const near = new Set([sorted[i - 1]?.id, sorted[i]?.id, sorted[i + 1]?.id]);
  return model.members.filter((x) => x.id !== m.id && near.has(x.levelId) && !x.zone).flatMap((x) => (x.b ? [x.a, x.b] : [x.a]));
}

const snapTo = (q: Pt, snaps: Pt[]) => snaps.reduce<{ p: Pt; d: number } | null>((best, p) => {
  const d = Math.hypot(p.x - q.x, p.y - q.y);
  return d <= SNAP && (!best || d < best.d) ? { p, d } : best;
}, null)?.p;

// A wall's openings are measured from end a: keep them where they are when it moves.
function withOpenings(m: Member, patch: Partial<Member>, shift: number): Partial<Member> {
  if (!m.wall || Math.abs(shift) < 1e-9) return patch;
  return { ...patch, wall: { ...m.wall, openings: m.wall.openings.map((o) => ({ ...o, offset: MM(o.offset + shift) })) } };
}

// Stretch one end along the member's own line (free, the end goes anywhere on the plane).
export function stretch(m: Member, end: "a" | "b", to: Pt, snaps: Pt[], free = false, step = 0.001): Partial<Member> | null {
  if (!m.b) return null;
  const fixed = end === "a" ? m.b : m.a;
  const moved = end === "a" ? m.a : m.b;
  const L = memberLength(m) || 1;
  const ux = (moved.x - fixed.x) / L,
    uy = (moved.y - fixed.y) / L;
  let p: Pt;
  if (free) p = snapTo(to, snaps) ?? to;
  else {
    let s = (to.x - fixed.x) * ux + (to.y - fixed.y) * uy;
    const on = { x: fixed.x + s * ux, y: fixed.y + s * uy };
    // a snap target has to lie on the line, or the member would swing off it
    const hit = snapTo(on, snaps.filter((q) => Math.abs(-uy * (q.x - fixed.x) + ux * (q.y - fixed.y)) <= 0.05));
    s = hit ? (hit.x - fixed.x) * ux + (hit.y - fixed.y) * uy : stepped(s, step);
    p = { x: fixed.x + s * ux, y: fixed.y + s * uy };
  }
  p = { x: MM(p.x), y: MM(p.y) };
  const length = Math.hypot(p.x - fixed.x, p.y - fixed.y);
  if (length < 0.1 || (p.x - fixed.x) * ux + (p.y - fixed.y) * uy <= 0) return null;
  const shift = end === "a" ? length - L : 0;
  if (m.wall?.openings.some((o) => o.offset + shift < 0 || o.offset + shift + o.width > length)) return null; // an opening would fall off the wall
  return withOpenings(m, end === "a" ? { a: p } : { b: p }, shift);
}

// Set the length, keeping end 1 where it is.
export const lengthTo = (m: Member, metres: number) => {
  if (!m.b) return null;
  return stretch(m, "b", { x: m.a.x + ((m.b.x - m.a.x) / (memberLength(m) || 1)) * metres, y: m.a.y + ((m.b.y - m.a.y) / (memberLength(m) || 1)) * metres }, []);
};

export const lift = (m: Member, by: number): Partial<Member> => ({ dz: MM((m.dz ?? 0) + by) || undefined });

// Slide the whole member; the end nearest a snap point lands on it.
export function moveBy(m: Member, dx0: number, dy0: number, snaps: Pt[], step = 0.001): Partial<Member> {
  const dx = stepped(dx0, step),
    dy = stepped(dy0, step);
  const shifted = (p: Pt) => ({ x: p.x + dx, y: p.y + dy });
  const ends = m.b ? [m.a, m.b] : [m.a];
  const snap = ends.map((p) => ({ from: shifted(p), to: snapTo(shifted(p), snaps) })).find((x) => x.to);
  const ex = snap ? snap.to!.x - snap.from.x : 0,
    ey = snap ? snap.to!.y - snap.from.y : 0;
  const place = (p: Pt) => ({ x: MM(p.x + dx + ex), y: MM(p.y + dy + ey) });
  return m.b ? { a: place(m.a), b: place(m.b) } : { a: place(m.a) };
}

// A post's top: the height changes, the base stays.
export const raiseTop = (m: Member, height: number, by: number): Partial<Member> => ({ height: Math.max(0.2, MM(height + by)) });

// A post's base: the top stays where it is.
export const raiseBase = (m: Member, height: number, by: number): Partial<Member> => {
  const h = Math.max(0.2, MM(height - by));
  return { height: h, dz: MM((m.dz ?? 0) + (height - h)) || undefined };
};

// A zone's corner: that corner goes to the point and the opposite one stays. Each
// side snaps to a member end in line with it, so a zone pulls up to a wall.
export function resizeZone(m: Member, cx: "a" | "b", cy: "a" | "b", to: Pt, snaps: Pt[], step = 0.001): Partial<Member> | null {
  if (!m.b) return null;
  const near = (v: number, of: number[]) => of.reduce<number | null>((best, q) => (Math.abs(q - v) <= SNAP / 2 && (best === null || Math.abs(q - v) < Math.abs(best - v)) ? q : best), null);
  const x = near(to.x, snaps.map((p) => p.x)) ?? m[cx]!.x + stepped(to.x - m[cx]!.x, step);
  const y = near(to.y, snaps.map((p) => p.y)) ?? m[cy]!.y + stepped(to.y - m[cy]!.y, step);
  const ox = cx === "a" ? m.b.x : m.a.x,
    oy = cy === "a" ? m.b.y : m.a.y;
  if (Math.abs(x - ox) < 0.3 || Math.abs(y - oy) < 0.3) return null;
  return {
    a: { x: MM(cx === "a" ? x : m.a.x), y: MM(cy === "a" ? y : m.a.y) },
    b: { x: MM(cx === "b" ? x : m.b.x), y: MM(cy === "b" ? y : m.b.y) },
  };
}

// A zone's size across (east-west) and down (north-south), keeping its west and north edges.
export function zoneSize(m: Member, ew: number, ns: number): Partial<Member> | null {
  if (!m.b || ew < 0.3 || ns < 0.3) return null;
  const ax = m.a.x <= m.b.x,
    ay = m.a.y <= m.b.y;
  const x1 = MM(Math.min(m.a.x, m.b.x) + ew),
    y1 = MM(Math.min(m.a.y, m.b.y) + ns);
  return { a: { x: ax ? m.a.x : x1, y: ay ? m.a.y : y1 }, b: { x: ax ? x1 : m.b.x, y: ay ? y1 : m.b.y } };
}

// ---- an opening, edited through its lintel, which runs 45 mm past each side

const BEAR = 0.045;
const OPENING_MIN = 0.2;

function fits(wall: Member, op: Opening, offset: number, width: number): boolean {
  if (offset < -1e-9 || width < OPENING_MIN || offset + width > memberLength(wall) + 1e-9) return false;
  return !(wall.wall?.openings ?? []).some((o) => o.id !== op.id && offset < o.offset + o.width && o.offset < offset + width);
}

// how far along the wall a point sits
const alongWall = (wall: Member, p: Pt) => ((p.x - wall.a.x) * (wall.b!.x - wall.a.x) + (p.y - wall.a.y) * (wall.b!.y - wall.a.y)) / (memberLength(wall) || 1);

// Pull one end of an opening's lintel: that side of the opening follows, the other stays.
export function stretchOpening(wall: Member, op: Opening, end: "a" | "b", to: Pt, step = 0.001): Partial<Opening> | null {
  if (!wall.b) return null;
  const t = alongWall(wall, to);
  const right = op.offset + op.width;
  const width = MM(end === "a" ? stepped(right - (t + BEAR), step) : stepped(t - BEAR - op.offset, step));
  const offset = end === "a" ? MM(right - width) : op.offset;
  return fits(wall, op, offset, width) ? { offset, width } : null;
}

// Slide an opening along its wall.
export function slideOpening(wall: Member, op: Opening, from: Pt, to: Pt, step = 0.001): Partial<Opening> | null {
  if (!wall.b) return null;
  const offset = MM(op.offset + stepped(alongWall(wall, to) - alongWall(wall, from), step));
  return fits(wall, op, offset, op.width) ? { offset } : null;
}

// Set an opening's clear width, keeping its near side.
export const openingWidth = (wall: Member, op: Opening, width: number): Partial<Opening> | null => (fits(wall, op, op.offset, MM(width)) ? { width: MM(width) } : null);

// The ends of an opening's lintel for an opening as it would be: for showing a drag before it lands.
export const lintelEnds = (wall: Member, op: Opening): [Pt, Pt] => [along(wall, op.offset - BEAR), along(wall, op.offset + op.width + BEAR)];
