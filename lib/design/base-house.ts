// The base house: the walls and roof read off the architect's sheets, put
// together across the levels and drawn plain and see-through in 3D, for the
// engineer to design over. It lives beside the members and never reaches the calcs.

import { alignWalls, drawn, eavesWidth, flood, isHipped, readEaves, readWalls, roofPitch, scaleFromDimensions, scaleFromWalls, type BaseHouse, type BaseSheet, type BaseWall, type SheetPath, type SheetWord } from "./base-read";
import type { MeshPart, Part } from "./geometry";
import type { DesignModel, Level, Pt } from "./model";
import { sheetScales } from "./plan-pages";

export type SheetData = { paths: SheetPath[]; words: SheetWord[]; text: string };
export type HouseRead = { base: BaseHouse; plans: Map<string, { scale: number; origin: Pt }>; notes: string[]; walls: number };

const PT = 0.0254 / 72; // m
const OFF = 0.15; // m, floors further out than this are worth a mention
const unset = (o: Pt) => !o.x && !o.y;
const ratio = (scale: number) => Math.round(scale / PT);

// Read every level's sheet: its scale, walls and where it sits over the others.
// A scale or origin the engineer has already set is kept, and checked.
export function readHouse(model: DesignModel, sheets: Map<string, SheetData>): HouseRead {
  const placed = model.levels.filter((l) => l.plan && sheets.has(l.id)).sort((a, b) => a.elevation - b.elevation);
  const notes: string[] = [];
  const scales = new Map<string, number>();
  const how = new Map<string, string>();
  for (const l of placed) {
    const s = sheets.get(l.id)!;
    const dims = scaleFromDimensions(s.words, s.paths);
    if (l.plan!.scale) {
      scales.set(l.id, l.plan!.scale);
      if (dims && Math.abs(ratio(l.plan!.scale) / dims - 1) > 0.05) notes.push(`${l.name}: the scale is set to 1:${ratio(l.plan!.scale)}, but the dimensions on the sheet say 1:${dims}. Check it.`);
    } else if (dims) {
      scales.set(l.id, dims * PT);
      how.set(l.id, `1:${dims} from the dimensions`);
    } else {
      const n = scaleFromWalls(s.paths, sheetScales(s.text));
      if (n) {
        scales.set(l.id, n * PT);
        how.set(l.id, `1:${n} printed on the sheet`);
      }
    }
  }
  // a sheet with no scale of its own takes its neighbours', from the same set
  const known = placed.find((l) => scales.has(l.id));
  for (const l of placed) {
    if (scales.has(l.id) || !known) continue;
    scales.set(l.id, scales.get(known.id)!);
    how.set(l.id, `1:${ratio(scales.get(known.id)!)} from ${known.name}, so check it`);
  }

  const read: Record<string, BaseSheet> = {};
  for (const l of placed) {
    const scale = scales.get(l.id);
    if (!scale) {
      notes.push(`${l.name}: couldn't work out the scale. Set it, then rebuild.`);
      continue;
    }
    if (l.kind === "foundation") continue;
    const s = sheets.get(l.id)!;
    const walls = readWalls(s.paths, scale).walls;
    const eaves = l.kind === "roof" ? readEaves(s.paths, walls) : null;
    read[l.id] = { walls: l.kind === "roof" ? [] : walls, ...(eaves ? { eaves, hip: isHipped(s.paths, eaves) } : {}) };
    if (l.kind === "roof") {
      notes.push(eaves ? `${l.name}: eaves read off the sheet${read[l.id].hip ? ", hipped" : ""}.` : `${l.name}: no eaves outline found, so the roof follows the top floor's walls.`);
      read[l.id].walls = [];
    } else if (walls.length) {
      const open = walls.flatMap((w) => w.openings).length;
      const inferred = walls.filter((w) => w.inferred).length;
      notes.push(`${l.name}: ${walls.length} walls, ${walls.filter((w) => w.ext).length} of them outside, ${open} openings${how.has(l.id) ? `, ${how.get(l.id)}` : ""}.${inferred ? ` ${inferred} worked out from lines, so check ${inferred === 1 ? "it" : "them"}.` : ""}`);
    } else notes.push(`${l.name}: no walls found. This sheet has no filled or hatched walls (it may be a scan). Trace them with the House wall tool.`);
  }

  // Line the levels up, each onto the one below it, walls on walls.
  const plans = new Map<string, { scale: number; origin: Pt }>();
  const floors = placed.filter((l) => l.kind === "floor" && read[l.id]?.walls.length);
  const first = floors.find((l) => !unset(l.plan!.origin)) ?? floors[0];
  const wallsOn = (l: Level) => {
    const s = sheets.get(l.id)!;
    return l.kind === "roof" ? readWalls(s.paths, scales.get(l.id)!).walls : read[l.id].walls;
  };
  if (first) {
    const box = first.plan!.origin;
    const w = read[first.id].walls;
    plans.set(first.id, { scale: scales.get(first.id)!, origin: unset(box) ? { x: Math.min(...w.flatMap((q) => [q.a.x, q.b.x])), y: Math.min(...w.flatMap((q) => [q.a.y, q.b.y])) } : box });
    const order = [...floors.filter((l) => l !== first).sort((a, b) => Math.abs(a.elevation - first.elevation) - Math.abs(b.elevation - first.elevation)), ...placed.filter((l) => l.kind === "roof" && read[l.id])];
    const done = [first];
    for (const l of order) {
      const scale = scales.get(l.id)!;
      const on = [...done].sort((a, b) => Math.abs(a.elevation - l.elevation) - Math.abs(b.elevation - l.elevation))[0];
      const ref = plans.get(on.id)!;
      const fit = alignWalls(wallsOn(on), ref.scale, wallsOn(l), scale);
      const mine = l.plan!.origin;
      if (!fit) {
        plans.set(l.id, { scale, origin: mine });
        if (unset(mine)) notes.push(`${l.name}: couldn't line it up with ${on.name}. Set its origin at the same corner, then rebuild.`);
        continue;
      }
      const origin = { x: (ref.origin.x * ref.scale - fit.dx) / scale, y: (ref.origin.y * ref.scale - fit.dy) / scale };
      if (unset(mine)) {
        plans.set(l.id, { scale, origin });
        notes.push(`${l.name}: lined up with ${on.name}, ${Math.round(fit.share * 100)}% of the walls match.`);
      } else {
        plans.set(l.id, { scale, origin: mine });
        const off = Math.hypot(origin.x - mine.x, origin.y - mine.y) * scale;
        if (off > OFF) notes.push(`${l.name}: its origin looks ${Math.round(off * 1000)} mm off ${on.name}. Check it, or clear it and rebuild.`);
      }
      done.push(l);
    }
  }
  const text = placed.filter((l) => l.kind === "roof").map((l) => sheets.get(l.id)!.text);
  const printed = text.map(roofPitch).find((p) => p !== null) ?? null;
  const typed = model.base?.pitchFrom === "engineer" ? model.base.pitch : null; // what the engineer typed stands
  const pitch = typed ?? printed ?? model.base?.pitch ?? 20;
  if (typed !== null && printed !== null && printed !== typed) notes.push(`Roof pitch: set to ${typed}°, but the roof sheet says ${printed}°. Check it.`);
  else if (typed === null && printed === null && Object.keys(read).length) notes.push(`Roof pitch: couldn't read it off the roof sheet, so ${pitch}° is only a starting figure. Check the sheet and type it in.`);
  const pitchFrom = typed !== null ? ("engineer" as const) : printed !== null ? ("sheet" as const) : undefined;
  const eaves = text.map(eavesWidth).find((e) => e !== null) ?? null;
  if (eaves !== null) notes.push(`Roof: eaves ${Math.round(eaves * 1000)} mm, from the sheet's notes.`);
  return { base: { sheets: read, pitch, ...(pitchFrom ? { pitchFrom } : {}), ...(eaves !== null ? { eaves } : {}) }, plans, notes, walls: Object.values(read).reduce((n, s) => n + s.walls.length, 0) };
}

// ---------------------------------------------------------------- in 3D

const HEAD = 2.1; // m, top of a door or window
const SILL = 0.9; // m
const EAVES = 0.6; // m, assumed where there's no roof sheet
export const LOWER_EAVES = 0.45; // m, where the sheet doesn't give the eaves
const CELL = 0.1; // m

type Field = { W: number; H: number; x0: number; y0: number };

const frameOf = (l: Level) => (p: Pt): Pt => ({ x: (p.x - l.plan!.origin.x) * l.plan!.scale!, y: (p.y - l.plan!.origin.y) * l.plan!.scale! });

export function worldWalls(l: Level, sheet: BaseSheet) {
  const f = frameOf(l);
  return sheet.walls.map((w) => ({ w, a: f(w.a), b: f(w.b), t: w.t * l.plan!.scale! }));
}

// everything inside the outer walls, walls included
export function footprint(segs: { a: Pt; b: Pt; t: number }[]) {
  if (!segs.length) return null;
  const tries = [0, 0.3, 0.6];
  for (const grow of tries) {
    const g = drawn(segs.map((q) => ({ ...q, t: q.t + grow })), 0.05, 1);
    const out = flood(g);
    const box = (g.W - 40) * (g.H - 40);
    const count = out.reduce((n, v) => n + (v ? 0 : 1), 0);
    if (count >= 0.3 * box || grow === tries[tries.length - 1]) return (x: number, y: number) => {
      const i = Math.round((x - g.x0) / g.cell),
        j = Math.round((y - g.y0) / g.cell);
      return i >= 0 && j >= 0 && i < g.W && j < g.H && !out[j * g.W + i];
    };
  }
  return null;
}

// The main roof in plan, as the roof sheet draws it, where its eaves were read.
// Anything under it is under the main roof, whatever the floor above covers.
export function mainRoof(model: DesignModel): { pts: Pt[]; inside: (x: number, y: number) => boolean; depth: (x: number, y: number) => number } | null {
  const roof = model.levels.find((l) => l.kind === "roof");
  const eaves = roof?.plan?.scale ? model.base?.sheets[roof.id]?.eaves : undefined;
  if (!roof || !eaves) return null;
  const pts = eaves.map(frameOf(roof));
  // how far in from the eaves line
  const depth = (x: number, y: number) =>
    Math.min(
      ...pts.map((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / L2));
        return Math.hypot(x - a.x - t * (b.x - a.x), y - a.y - t * (b.y - a.y));
      }),
    );
  return { pts, inside: (x, y) => inPolygon(pts, x, y), depth };
}

function inPolygon(pts: Pt[], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if (pts[i].y > y !== pts[j].y > y && x < ((pts[j].x - pts[i].x) * (y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) hit = !hit;
  return hit;
}

// Chessboard distance to the outside, in metres. A hipped roof over a square-cornered
// outline is exactly this: every eave rises at one pitch, and an offset keeps its corners.
function chess(f: Field, on: Uint8Array, edge = 0) {
  const d = new Float32Array(on.length);
  const { W, H } = f;
  for (let i = 0; i < on.length; i++) d[i] = on[i] ? 1e6 : 0;
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? edge : d[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (on[y * W + x]) d[y * W + x] = Math.min(d[y * W + x], 1 + Math.min(get(x - 1, y), get(x, y - 1), get(x - 1, y - 1), get(x + 1, y - 1)));
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) if (on[y * W + x]) d[y * W + x] = Math.min(d[y * W + x], 1 + Math.min(get(x + 1, y), get(x, y + 1), get(x + 1, y + 1), get(x - 1, y + 1)));
  return d.map((v) => v * CELL);
}

// a gable roof falls only to its two long sides
function acrossSpan(f: Field, on: Uint8Array) {
  const { W, H } = f;
  let x0 = W,
    x1 = 0,
    y0 = H,
    y1 = 0;
  on.forEach((v, i) => {
    if (!v) return;
    x0 = Math.min(x0, i % W);
    x1 = Math.max(x1, i % W);
    y0 = Math.min(y0, Math.floor(i / W));
    y1 = Math.max(y1, Math.floor(i / W));
  });
  const d = new Float32Array(on.length);
  const alongY = x1 - x0 < y1 - y0; // the ridge runs the long way
  for (let n = 0; n < (alongY ? H : W); n++) {
    const line = (k: number) => (alongY ? n * W + k : k * W + n);
    const len = alongY ? W : H;
    for (let k = 0, run = 0; k < len; k++) {
      run = on[line(k)] ? run + 1 : 0;
      d[line(k)] = run;
    }
    for (let k = len - 1, run = 0; k >= 0; k--) {
      run = on[line(k)] ? run + 1 : 0;
      d[line(k)] = Math.min(d[line(k)], run);
    }
  }
  return d.map((v) => v * CELL);
}

// A lean-to rises from its outer eave to the wall it leans on: the side most of it meets
// that wall. Each separate piece of roof finds its own. Metres in from the outer eave.
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// the separate pieces of what's on, as lists of cells
function pieces(f: Field, on: Uint8Array) {
  const { W, H } = f;
  const seen = new Uint8Array(on.length);
  const out: number[][] = [];
  for (let s = 0; s < on.length; s++) {
    if (!on[s] || seen[s]) continue;
    const cells = [s];
    seen[s] = 1;
    for (let k = 0; k < cells.length; k++) {
      const x = cells[k] % W,
        y = Math.floor(cells[k] / W);
      for (const [dx, dy] of DIRS) {
        const n = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || !on[n] || seen[n]) continue;
        seen[n] = 1;
        cells.push(n);
      }
    }
    out.push(cells);
  }
  return out;
}

function leanTo(f: Field, roof: Uint8Array, wall: Uint8Array) {
  const { W, H } = f;
  const d = new Float32Array(roof.length);
  const dirs = DIRS;
  const end = (c: number, dx: number, dy: number) => {
    let x = c % W,
      y = Math.floor(c / W),
      n = 0;
    while (x >= 0 && y >= 0 && x < W && y < H && roof[y * W + x]) {
      x += dx;
      y += dy;
      n++;
    }
    return { n, wall: x >= 0 && y >= 0 && x < W && y < H && !!wall[y * W + x] };
  };
  for (const cells of pieces(f, roof)) {
    const meets = dirs.map(([dx, dy]) => cells.filter((c) => end(c, dx, dy).wall).length);
    const [dx, dy] = dirs[meets.indexOf(Math.max(...meets))];
    for (const c of cells) d[c] = end(c, -dx, -dy).n * CELL;
  }
  return d;
}

// triangles over the cells that are on, each split along its ridge or hip: the higher diagonal
function surface(f: Field, on: Uint8Array, z: (i: number) => number) {
  const { W, H, x0, y0 } = f;
  const pos: number[] = [];
  const P = (i: number) => pos.push(x0 + (i % W) * CELL, y0 + Math.floor(i / W) * CELL, z(i));
  for (let y = 0; y + 1 < H; y++)
    for (let x = 0; x + 1 < W; x++) {
      const a = y * W + x,
        b = a + 1,
        c = a + W,
        d = c + 1;
      if (!on[a] || !on[b] || !on[c] || !on[d]) continue;
      if (z(a) + z(d) >= z(b) + z(c)) [a, c, d, a, d, b].forEach(P);
      else [a, c, b, b, c, d].forEach(P);
    }
  return pos;
}

function fieldFor(pts: Pt[]): Field {
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs) - 1.5,
    y0 = Math.min(...ys) - 1.5;
  return { W: Math.ceil((Math.max(...xs) + 1.5 - x0) / CELL) + 1, H: Math.ceil((Math.max(...ys) + 1.5 - y0) / CELL) + 1, x0, y0 };
}

const fill = (f: Field, test: (x: number, y: number) => boolean) => {
  const on = new Uint8Array(f.W * f.H);
  for (let j = 0; j < f.H; j++) for (let i = 0; i < f.W; i++) if (test(f.x0 + i * CELL, f.y0 + j * CELL)) on[j * f.W + i] = 1;
  return on;
};
const grow = (f: Field, on: Uint8Array, r: number) => chess(f, on.map((v) => (v ? 0 : 1)), 1e6).map((d) => (d > r ? 0 : 1)) as unknown as Uint8Array;
const shrink = (f: Field, on: Uint8Array, r: number) => chess(f, on).map((d) => (d > r ? 1 : 0)) as unknown as Uint8Array;
const bytes = (v: ArrayLike<number>) => Uint8Array.from(v as ArrayLike<number>);

export function houseParts(model: DesignModel): { part: Part | MeshPart; level: Level }[] {
  const base = model.base;
  if (!base) return [];
  const out: { part: Part | MeshPart; level: Level }[] = [];
  const tan = Math.tan((base.pitch * Math.PI) / 180);
  const levels = [...model.levels].sort((a, b) => a.elevation - b.elevation);
  const floors = levels.filter((l) => l.kind === "floor" && l.plan?.scale && base.sheets[l.id]?.walls.length);

  for (const l of floors) {
    const members = model.members.filter((m) => m.levelId === l.id && m.type === "wall" && m.b);
    const drawnOver = (a: Pt, b: Pt) => {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      return members.some((m) => {
        const ux = (b.x - a.x) / L,
          uy = (b.y - a.y) / L;
        const off = (p: Pt) => Math.abs(-(p.x - a.x) * uy + (p.y - a.y) * ux);
        const s = (p: Pt) => (p.x - a.x) * ux + (p.y - a.y) * uy;
        return off(m.a) < 0.2 && off(m.b!) < 0.2 && Math.min(L, Math.max(s(m.a), s(m.b!))) - Math.max(0, Math.min(s(m.a), s(m.b!))) >= 0.8 * L;
      });
    };
    const z0 = l.elevation,
      z1 = l.elevation + l.height;
    const scale = l.plan!.scale!;
    for (const { w, a, b, t } of worldWalls(l, base.sheets[l.id])) {
      if (drawnOver(a, b)) continue;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 0.01) continue;
      const P = (s: number): Pt => ({ x: a.x + ((b.x - a.x) * s) / L, y: a.y + ((b.y - a.y) * s) / L });
      const tone = w.ext ? "baseExt" : "baseInt";
      const bar = (s0: number, s1: number, zz0: number, zz1: number, t2: Part["tone"] = tone, width = t) => {
        if (s1 - s0 > 0.005 && zz1 - zz0 > 0.005) out.push({ part: { kind: "bar", id: "", layer: "base", tone: t2, a: P(s0), b: P(s1), z0: zz0, z1: zz1, w: width }, level: l });
      };
      let s = 0;
      for (const o of [...w.openings].sort((p, q) => p.s0 - q.s0)) {
        const s0 = o.s0 * scale,
          s1 = o.s1 * scale;
        bar(s, s0, z0, z1);
        bar(s0, s1, Math.min(z1, z0 + HEAD), z1);
        if (o.kind === "window") {
          bar(s0, s1, z0, z0 + SILL);
          bar(s0, s1, z0 + SILL, Math.min(z1, z0 + HEAD), "glass", 0.02);
        }
        s = s1;
      }
      bar(s, L, z0, z1);
    }
  }
  if (!floors.length) return out;

  const prints = new Map(floors.map((l) => [l.id, footprint(worldWalls(l, base.sheets[l.id]))]));
  const all = floors.flatMap((l) => worldWalls(l, base.sheets[l.id]).flatMap((q) => [q.a, q.b]));
  const roofLevel = levels.find((l) => l.kind === "roof");
  const roofSheet = roofLevel ? base.sheets[roofLevel.id] : undefined;
  const eaves = roofLevel?.plan?.scale && roofSheet?.eaves ? roofSheet.eaves.map(frameOf(roofLevel)) : null;
  const f = fieldFor([...all, ...(eaves ?? [])]);

  // the upper floors' decks
  for (const l of floors.slice(1)) {
    const print = prints.get(l.id);
    if (print) out.push({ part: { kind: "mesh", id: "", layer: "base", tone: "baseFloor", pos: surface(f, fill(f, print), () => l.elevation) }, level: l });
  }

  // the main roof: from the roof sheet's eaves, or off the top floor's walls
  const top = floors[floors.length - 1];
  const topPrint = prints.get(top.id);
  const z0 = roofLevel && roofLevel.elevation >= top.elevation ? roofLevel.elevation : top.elevation + top.height;
  const main = eaves ? fill(f, (x, y) => inPolygon(eaves, x, y)) : topPrint ? bytes(grow(f, fill(f, topPrint), EAVES)) : null;
  if (main) {
    const hip = eaves ? !!roofSheet?.hip : true;
    const d = hip ? chess(f, main) : acrossSpan(f, main);
    // how far the eaves run past the outer walls sets where the rafters cross the plate
    const reach = chess(f, main);
    const past = worldWalls(top, base.sheets[top.id])
      .filter((q) => q.w.ext)
      .map((q) => reach[Math.round(((q.a.y + q.b.y) / 2 - f.y0) / CELL) * f.W + Math.round(((q.a.x + q.b.x) / 2 - f.x0) / CELL)] ?? 0)
      .sort((p, q) => p - q);
    const over = Math.min(1.5, past[past.length >> 1] ?? EAVES);
    out.push({ part: { kind: "mesh", id: "", layer: "baseRoof", tone: "baseRoof", pos: surface(f, main, (i) => z0 + (d[i] - over) * tan) }, level: roofLevel ?? top });
  }

  // Anything a floor has that's out from under the roof above has its own: a lean-to
  // against the upper wall. Under the top storey, that's the main roof as the sheet draws it.
  const lowerEaves = base.eaves ?? LOWER_EAVES;
  for (let i = 0; i + 1 < floors.length; i++) {
    const low = prints.get(floors[i].id),
      up = prints.get(floors[i + 1].id);
    if (!low || !up) continue;
    const upper = fill(f, up);
    const edge = bytes(grow(f, upper, 0.15));
    const bare = fill(f, low).map((v, n) => (v && !edge[n] ? 1 : 0));
    const kept = bytes(grow(f, bytes(shrink(f, bare, 0.4)), 0.4)).map((v, n) => (v && bare[n] ? 1 : 0));
    // a piece mostly under the main roof, as the sheet draws it, is covered by that roof: a void, or a wall above that wasn't read
    if (eaves && main && i + 2 === floors.length) for (const cells of pieces(f, kept)) if (cells.filter((c) => main[c]).length > cells.length / 2) for (const c of cells) kept[c] = 0;
    if (kept.reduce((n, v) => n + v, 0) * CELL * CELL < 1) continue;
    const roof = bytes(grow(f, kept, lowerEaves)).map((v, n) => (v && !upper[n] ? 1 : 0));
    const d = leanTo(f, roof, upper);
    const z = floors[i].elevation + floors[i].height;
    out.push({ part: { kind: "mesh", id: "", layer: "baseRoof", tone: "baseRoof", pos: surface(f, roof, (n) => z + (d[n] - lowerEaves) * tan) }, level: floors[i] });
  }
  return out;
}

export type { BaseHouse, BaseSheet, BaseWall };
