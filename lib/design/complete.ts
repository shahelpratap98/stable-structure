// Is the model finished? Members that pass are only half of it: a design also
// needs every floor framed, a roof over the top storey, bracing both ways on
// every storey, the doors and windows in the walls, real loads on the beams and
// lintels, and the site. Each gap found here is listed until it is fixed or the
// engineer marks it OK (a stair void, say), and "All checks pass" waits for them.

import type { Calcs } from "./calc";
import { levelAboveOf, type DesignModel, type Level, type Member, type Pt } from "./model";

export type Gap = {
  key: string; // stable, for marking it OK
  kind: "missing" | "assumed" | "unchecked";
  what: string;
  levelId?: string;
  id?: string; // the member to open
};

const CELL = 0.5; // m, sampling grid for floor and roof coverage
const REACH = 0.3; // m, a zone drawn to joist or rafter centres still covers the plates beside it
const MIN_GAP_M2 = 2; // smaller uncovered patches are drawing slop

const storeys = (model: DesignModel) => [...model.levels].filter((l) => l.kind !== "roof").sort((a, b) => a.elevation - b.elevation);
const wallsOn = (model: DesignModel, l: Level) => model.members.filter((m) => m.type === "wall" && m.levelId === l.id && m.b);

// Where a point is, by the nearest set-out grid lines if there are any.
export function placeOf(model: DesignModel, p: Pt) {
  const gx = model.grids?.x ?? [],
    gy = model.grids?.y ?? [];
  const near = (gs: { n: string; at: number }[], v: number) => gs.reduce<{ n: string; at: number } | null>((a, g) => (!a || Math.abs(g.at - v) < Math.abs(a.at - v) ? g : a), null);
  const x = near(gx, p.x),
    y = near(gy, p.y);
  if (x && y) return `near grid ${x.n}/${y.n}`;
  return `around (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) m`;
}

// Points on a grid inside the storey's walls: a wall in each of the four directions.
function enclosed(walls: Member[]): Pt[] {
  if (walls.length < 3) return [];
  const xs = walls.flatMap((w) => [w.a.x, w.b!.x]),
    ys = walls.flatMap((w) => [w.a.y, w.b!.y]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  if ((x1 - x0) * (y1 - y0) > 40000) return []; // not a house: don't sample
  // does a ray from p in direction (dx, dy) meet a wall?
  const hits = (p: Pt, dx: number, dy: number) =>
    walls.some((w) => {
      const ax = w.a.x,
        ay = w.a.y,
        bx = w.b!.x,
        by = w.b!.y;
      const ex = bx - ax,
        ey = by - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) return false;
      const t = ((ax - p.x) * ey - (ay - p.y) * ex) / den; // along the ray
      const s = ((ax - p.x) * dy - (ay - p.y) * dx) / den; // along the wall
      return t > 0 && s >= -0.05 && s <= 1.05;
    });
  const out: Pt[] = [];
  for (let x = x0 + CELL / 2; x < x1; x += CELL)
    for (let y = y0 + CELL / 2; y < y1; y += CELL) {
      const p = { x, y };
      if (hits(p, 1, 0) && hits(p, -1, 0) && hits(p, 0, 1) && hits(p, 0, -1)) out.push(p);
    }
  return out;
}

const inRect = (p: Pt, m: Member, pad = REACH) =>
  !!m.b && p.x >= Math.min(m.a.x, m.b.x) - pad && p.x <= Math.max(m.a.x, m.b.x) + pad && p.y >= Math.min(m.a.y, m.b.y) - pad && p.y <= Math.max(m.a.y, m.b.y) + pad;

// Uncovered points gathered into patches (cells touching), largest first.
function patches(points: Pt[]): Pt[][] {
  const key = (p: Pt) => `${Math.round(p.x / CELL)},${Math.round(p.y / CELL)}`;
  const left = new Map(points.map((p) => [key(p), p]));
  const out: Pt[][] = [];
  for (const [k0, p0] of left) {
    left.delete(k0);
    const group = [p0];
    for (let i = 0; i < group.length; i++) {
      const [cx, cy] = key(group[i]).split(",").map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const k = `${cx + dx},${cy + dy}`;
        const q = left.get(k);
        if (q) {
          left.delete(k);
          group.push(q);
        }
      }
    }
    out.push(group);
  }
  return out.sort((a, b) => b.length - a.length);
}

function coverageGaps(model: DesignModel, area: Pt[], covers: Member[], label: (m2: number, where: string) => string, keyBase: string, levelId: string): Gap[] {
  const open = area.filter((p) => !covers.some((m) => inRect(p, m)));
  return patches(open)
    .filter((g) => g.length * CELL * CELL >= MIN_GAP_M2)
    .slice(0, 5)
    .map((g) => {
      const c = { x: g.reduce((a, p) => a + p.x, 0) / g.length, y: g.reduce((a, p) => a + p.y, 0) / g.length };
      return { key: `${keyBase}:${Math.round(c.x)}:${Math.round(c.y)}`, kind: "missing" as const, what: label(Math.round(g.length * CELL * CELL), placeOf(model, c)), levelId };
    });
}

export function completeness(model: DesignModel, calcs: Calcs): Gap[] {
  const gaps: Gap[] = [];
  if (!model.members.length) return gaps;
  const all = storeys(model);
  const levelName = (l: Level) => l.name;

  if (!model.site) gaps.push({ key: "site", kind: "missing", what: "No site data: wind and earthquake demand and footing bearing use defaults (Loads tab, Find site)" });

  for (const l of all) {
    const walls = wallsOn(model, l);
    if (!walls.length) continue;

    // the floor this storey stands on, if it's timber: joists on the level below it
    if (l.floor === "timber") {
      const below = [...model.levels].filter((x) => x.elevation < l.elevation - 1e-6).sort((a, b) => b.elevation - a.elevation)[0];
      const zones = model.members.filter((m) => m.levelId === below?.id && (m.type === "joistzone" || m.type === "raft") && !m.zone?.roof);
      gaps.push(...coverageGaps(model, enclosed(walls), zones, (m2, where) => `${m2} m² of the ${levelName(l)} has no floor joists ${where}`, `floor:${l.id}`, below?.id ?? l.id));
    }

    // the roof over the top storey (or a storey with nothing above it)
    const above = levelAboveOf(model.levels, l);
    if (!above || above.kind === "roof") {
      const roofLevels = new Set([l.id, ...(above ? [above.id] : [])]);
      const roofZones = model.members.filter((m) => roofLevels.has(m.levelId) && m.type === "joistzone" && (m.zone?.roof || m.levelId !== l.id));
      const rafters = model.members.some((m) => roofLevels.has(m.levelId) && m.type === "rafter");
      if (!rafters) gaps.push(...coverageGaps(model, enclosed(walls), roofZones, (m2, where) => `${m2} m² over the ${levelName(l)} has no roof framing ${where}`, `roof:${l.id}`, l.id));
    }

    // bracing both ways
    const sheets = calcs.bracing.filter((s) => s.level.id === l.id);
    for (const dir of ["along", "across"] as const) {
      if (!sheets.some((s) => s.dir === dir && s.totW > 0))
        gaps.push({ key: `brace:${l.id}:${dir}`, kind: "missing", what: `No bracing ${dir === "along" ? "along (east–west walls)" : "across (north–south walls)"} on the ${levelName(l)}`, levelId: l.id });
    }
    if (sheets.length && sheets.every((s) => s.source === "none")) gaps.push({ key: `demand:${l.id}`, kind: "missing", what: `No bracing demand for the ${levelName(l)}: add the site, or enter the demand (Loads tab)`, levelId: l.id });

    // doors and windows in the outside walls
    const ext = walls.filter((w) => w.wall?.kind === "ext");
    const extLength = ext.reduce((a, w) => a + Math.hypot(w.b!.x - w.a.x, w.b!.y - w.a.y), 0);
    if (extLength >= 8 && !ext.some((w) => w.wall!.openings.length))
      gaps.push({ key: `openings:${l.id}`, kind: "missing", what: `No doors or windows in the ${levelName(l)} outside walls (Opening tool, N)`, levelId: l.id });
  }

  // beams and lintels sized on assumed loads, and members carrying nothing
  const lintelIn = new Map(calcs.lintels.map((v) => [v.id, v]));
  for (const r of calcs.results.values()) {
    const lintel = lintelIn.get(r.memberId);
    if (lintel && lintel.wall.wall?.loadbearing === false) continue; // a door head in a partition
    const m = lintel?.member ?? model.members.find((x) => x.id === r.memberId);
    if (!m) continue;
    const trib = r.loads.find((x) => x.label === "Tributary");
    if (trib?.note?.startsWith("assumed")) gaps.push({ key: `loads:${r.memberId}`, kind: "assumed", what: `${r.mark}: sized for an assumed metre of ${lintel ? "floor" : "load"}; set what it carries`, id: r.memberId, levelId: m.levelId });
    else if (r.status === "none" && (m.type === "beam" || m.type === "post") && !lintel) gaps.push({ key: `none:${r.memberId}`, kind: "unchecked", what: `${r.mark}: carries nothing, so it isn't checked`, id: r.memberId, levelId: m.levelId });
  }
  return gaps;
}

// Gaps still open: not marked OK.
export const openGaps = (model: DesignModel, gaps: Gap[]) => gaps.filter((g) => !(model.ack ?? []).includes(g.key));

// One run per set of calcs (the editor recalculates when the model changes).
const cache = new WeakMap<Calcs, Gap[]>();
export function gapsFor(model: DesignModel, calcs: Calcs): Gap[] {
  let g = cache.get(calcs);
  if (!g) cache.set(calcs, (g = completeness(model, calcs)));
  return g;
}
