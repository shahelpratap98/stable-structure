// Editing members in the 3D view: where the handles go, and what dragging one
// does to the member. Everything here is plain geometry; the view does the mouse.

import type { Part } from "./geometry";
import { memberLength, type DesignModel, type Member, type Pt } from "./model";

export type P3 = { x: number; y: number; z: number };
export type Handle = { kind: "end"; end: "a" | "b"; at: P3 } | { kind: "lift"; at: P3 } | { kind: "move"; at: P3 } | { kind: "top"; at: P3 } | { kind: "base"; at: P3 };

const EDITABLE = new Set<Member["type"]>(["beam", "lintel", "joist", "rafter", "wall", "post"]);
const SNAP = 0.2; // m, an end this close to another member's end or post jumps onto it
const MM = (v: number) => Math.round(v * 1000) / 1000; // model units are metres: keep to the millimetre

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
  return [
    { kind: "end", end: "a", at: { ...m.a, z: z.z1 } },
    { kind: "end", end: "b", at: { ...m.b, z: z.z1 } },
    { kind: "move", at: { ...mid, z: z.z1 } },
    ...(m.type === "wall" ? [] : [{ kind: "lift", at: { ...mid, z: z.z1 + 0.4 } } as Handle]),
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
export function stretch(m: Member, end: "a" | "b", to: Pt, snaps: Pt[], free = false): Partial<Member> | null {
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
    if (hit) s = (hit.x - fixed.x) * ux + (hit.y - fixed.y) * uy;
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
export function moveBy(m: Member, dx: number, dy: number, snaps: Pt[]): Partial<Member> {
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
