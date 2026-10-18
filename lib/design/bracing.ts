// NZS 3604:2011 Section 5 bracing with GIB EzyBrace® Systems 2016 ratings,
// laid out like the GIB calculation sheets (as in Stable Structure's 26121
// model): per level and direction, lines of bracing elements, each line's
// achieved BUs against its minimum, and the level's total against demand.
//
// Ratings are BU/m at 0.4 m and 1.2 m element lengths (interpolated between,
// 1.2 m value above), multiplied by f = 2.4 / stud height and capped at
// 120 BU/m on timber floors, 150 BU/m on slab. Specific-design elements
// (blockwork, portals) use their assigned value. Line minimum = greater of
// 100 BU, 50 % of demand / number of lines and 15 BU/m of external wall.
// Demand is entered per level (NZS 3604 tables or a GIB demand sheet).

import { BRACE_NAME, memberLength, type BraceSystem, type DesignModel, type Level, type Member } from "./model";

type Rating = { W: [number, number]; E: [number, number]; sed?: boolean; fixed?: number; colour: string };

export const RATINGS: Record<BraceSystem, Rating> = {
  GS1N: { W: [50, 70], E: [55, 60], colour: "#f4a261" },
  GS2N: { W: [70, 95], E: [65, 85], colour: "#e9c46a" },
  GS2NOM: { W: [50, 50], E: [50, 50], colour: "#c9c9c9" },
  GSPH: { W: [100, 150], E: [115, 150], colour: "#2a9d8f" },
  BL1H: { W: [90, 125], E: [100, 105], colour: "#d1495b" },
  BLGH: { W: [110, 150], E: [115, 145], colour: "#8e5bb0" },
  BLPH: { W: [120, 150], E: [135, 150], colour: "#c0392b" },
  BW: { W: [150, 150], E: [150, 150], sed: true, colour: "#5f6b70" },
  PORTAL: { W: [0, 0], E: [0, 0], sed: true, fixed: 300, colour: "#264653" },
};

export const BRACE_SYSTEMS = Object.keys(RATINGS) as BraceSystem[];

export function buOf(system: BraceSystem, L: number, level: Level): { W: number; E: number } {
  const r = RATINGS[system];
  if (r.fixed) return { W: r.fixed, E: r.fixed };
  if (L < 0.4) return { W: 0, E: 0 };
  const k = (Math.min(L, 1.2) - 0.4) / 0.8;
  const f = r.sed ? 1 : 2.4 / Math.max(0.5, level.height);
  const cap = r.sed ? 1e9 : level.floor === "timber" ? 120 : 150;
  const g = (a: [number, number]) => Math.round(Math.min(cap, (a[0] + k * (a[1] - a[0])) * f) * L);
  return { W: g(r.W), E: g(r.E) };
}

export type BraceEl = { memberId: string; mark: string; system: BraceSystem; L: number; W: number; E: number; wallLabel?: string };
export type BraceLine = { id: string; coord: number; els: BraceEl[]; extLen: number; sumW: number; sumE: number; minW: number; minE: number; okW: boolean; okE: boolean };
export type BracingSheet = {
  level: Level;
  dir: "along" | "across"; // along = elements running east–west (plan x), across = north–south
  lines: BraceLine[];
  demandW: number;
  demandE: number;
  totW: number;
  totE: number;
  okTotal: boolean;
};

const dirOf = (m: { a: { x: number; y: number }; b?: { x: number; y: number } }) =>
  m.b && Math.abs(m.b.x - m.a.x) >= Math.abs(m.b.y - m.a.y) ? "along" : "across";
const coordOf = (m: Member, dir: "along" | "across") => (dir === "along" ? (m.a.y + (m.b?.y ?? m.a.y)) / 2 : (m.a.x + (m.b?.x ?? m.a.x)) / 2);

export function braceCalcs(model: DesignModel): BracingSheet[] {
  const sheets: BracingSheet[] = [];
  for (const level of [...model.levels].sort((a, b) => b.elevation - a.elevation)) {
    const els = model.members.filter((m) => m.type === "bracing" && m.levelId === level.id && m.b);
    if (!els.length) continue;
    const demand = model.bracing[level.id] ?? { windAlong: 0, windAcross: 0, eq: 0 };
    const extWalls = model.members.filter((m) => m.type === "wall" && m.levelId === level.id && m.b && m.wall && m.wall.kind !== "int");
    for (const dir of ["along", "across"] as const) {
      const mine = els.filter((m) => dirOf(m) === dir);
      if (!mine.length) continue;
      // group into lines: a named line wins, otherwise elements within 0.6 m share a line
      const groups: { id?: string; coord: number; members: Member[] }[] = [];
      for (const m of [...mine].sort((a, b) => coordOf(a, dir) - coordOf(b, dir))) {
        const name = m.brace?.line?.trim();
        const c = coordOf(m, dir);
        const g = name ? groups.find((x) => x.id === name) : groups.find((x) => !x.id && Math.abs(x.coord - c) <= 0.6);
        if (g) g.members.push(m);
        else groups.push({ id: name || undefined, coord: c, members: [m] });
      }
      let auto = 0;
      const names = dir === "along" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "";
      const n = groups.length;
      const dW = dir === "along" ? demand.windAlong : demand.windAcross;
      const dE = demand.eq;
      const lines: BraceLine[] = groups.map((g) => {
        const id = g.id ?? (dir === "along" ? names[auto++] ?? `A${auto}` : String(++auto));
        const elements: BraceEl[] = g.members.map((m) => {
          const L = memberLength(m);
          const system = m.brace?.system ?? "GS2N";
          return { memberId: m.id, mark: m.label, system, L, ...buOf(system, L, level) };
        });
        const extLen = extWalls.filter((w) => dirOf(w) === dir && Math.abs(coordOf(w, dir) - g.coord) <= 0.6).reduce((s, w) => s + memberLength(w), 0);
        const sumW = elements.reduce((s, e) => s + e.W, 0);
        const sumE = elements.reduce((s, e) => s + e.E, 0);
        const minW = Math.round(Math.max(100, (0.5 * dW) / n, 15 * extLen));
        const minE = Math.round(Math.max(100, (0.5 * dE) / n, 15 * extLen));
        return { id, coord: g.coord, els: elements, extLen, sumW, sumE, minW, minE, okW: sumW >= minW, okE: sumE >= minE };
      });
      const totW = lines.reduce((s, l) => s + l.sumW, 0);
      const totE = lines.reduce((s, l) => s + l.sumE, 0);
      sheets.push({ level, dir, lines, demandW: dW, demandE: dE, totW, totE, okTotal: totW >= dW && totE >= dE });
    }
  }
  return sheets;
}

export const braceName = (s: BraceSystem) => BRACE_NAME[s];
