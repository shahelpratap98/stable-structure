// Material and section data. Timber and steel values follow Stable Structure's
// own framing models (Lot 6 and 26121): SG8 dry to NZS 3603, hySPAN (LVL13),
// and steel channels / UB at fy 300.

import type { Family, Sizing } from "./model";

export type TimberMat = { key: "SG8" | "LVL"; fb: number; fs: number; fc: number; fp: number; E: number; phi: number; k2: number; dens: number };

export const SG8: TimberMat = { key: "SG8", fb: 14, fs: 3.8, fc: 18, fp: 8.9, E: 8000, phi: 0.8, k2: 2, dens: 5.0 };
export const LVL: TimberMat = { key: "LVL", fb: 48, fs: 5.3, fc: 45, fp: 12, E: 13200, phi: 0.9, k2: 2, dens: 6.2 };

export type SteelSec = { name: string; fam: "PFC" | "UB"; d: number; b: number; tw: number; tf: number; Ix: number; Ze: number; kgm: number };

// mm, mm4, mm3, kg/m. PFC from the Lot 6 model; 250UB25.7 as used in 26121.
export const STEEL: SteelSec[] = [
  { name: "200PFC", fam: "PFC", d: 200, b: 75, tw: 6, tf: 12, Ix: 19.1e6, Ze: 218e3, kgm: 22.9 },
  { name: "250PFC", fam: "PFC", d: 250, b: 90, tw: 8, tf: 15, Ix: 45.1e6, Ze: 414e3, kgm: 35.5 },
  { name: "250UB25.7", fam: "UB", d: 248, b: 124, tw: 5, tf: 8, Ix: 35.4e6, Ze: 319e3, kgm: 25.7 },
];
export const FY = 300;
export const ES = 200000;

export const FAMILY_LABEL: Record<Family | "SHS", string> = { SG8: "SG8 timber", LVL: "hySPAN LVL", PFC: "PFC steel", UB: "UB steel", SHS: "SHS steel" };
export const FAMILY_COLOUR: Record<Family | "SHS", string> = { SG8: "#d9b77e", LVL: "#c46f2a", PFC: "#5d7590", UB: "#4f6680", SHS: "#4b5a6b" };
export const DEFAULT_FAMILIES: Family[] = ["SG8", "LVL", "PFC", "UB"];

export type Candidate =
  | { fam: "SG8" | "LVL"; name: string; b: number; d: number; mat: TimberMat; plies: number }
  | { fam: "PFC" | "UB"; name: string; b: number; d: number; steel: SteelSec };

// Sections tried in order, cheapest first within each family.
export function candidates(sizing: Sizing, fallbackMaxD = 0): Candidate[] {
  const out: Candidate[] = [];
  const minD = sizing.minD ?? 0;
  const maxD = sizing.maxD && sizing.maxD > 0 ? sizing.maxD : fallbackMaxD > 0 ? fallbackMaxD : 1e9;
  const maxB = sizing.maxB && sizing.maxB > 0 ? sizing.maxB : 1e9;
  const fams = sizing.families?.length ? sizing.families : DEFAULT_FAMILIES;
  for (const f of fams) {
    if (f === "SG8") {
      for (const d of [140, 190, 240, 290])
        for (const n of [2, 3]) {
          const b = 45 * n;
          if (d >= minD && d <= maxD && b <= maxB) out.push({ fam: "SG8", name: `${n}/${d}×45 SG8`, b, d, mat: SG8, plies: n });
        }
    } else if (f === "LVL") {
      for (const d of [150, 200, 240, 300, 360, 400, 450, 600])
        for (const [b, lab, plies] of [
          [45, `${d}×45`, 1],
          [63, `${d}×63`, 1],
          [90, `2/${d}×45`, 2],
          [126, `2/${d}×63`, 2],
        ] as [number, string, number][])
          if (d >= minD && d <= maxD && b <= maxB) out.push({ fam: "LVL", name: `${lab} hySPAN`, b, d, mat: LVL, plies });
    } else {
      // Minimum depth is for timber joists to side-fix; steel takes a timber web packer instead.
      for (const s of STEEL) if (s.fam === f && s.d <= maxD) out.push({ fam: s.fam, name: s.name, b: s.b, d: s.d, steel: s });
    }
  }
  return out;
}

// "190x45" -> depth 190, breadth 45; "2/240x45" -> two plies, breadth 90.
export function parseTimberSection(section: string): { d: number; b: number; plies: number } | null {
  const m = /^\s*(?:(\d)\s*\/\s*)?(\d{2,3})\s*[x×]\s*(\d{2,3})\s*$/i.exec(section.replace(/\s*(SG8|hySPAN|hy90|LVL\d*)\s*$/i, ""));
  if (!m) return null;
  const plies = m[1] ? Number(m[1]) : 1;
  const d = Number(m[2]);
  const b = Number(m[3]) * plies;
  if (!d || !b || plies < 1 || plies > 4) return null;
  return { d, b, plies };
}

export const findSteel = (section: string) => {
  const key = section.replace(/[\s×x]/gi, "").toUpperCase();
  return STEEL.find((s) => s.name.replace(/[\s×x]/gi, "").toUpperCase() === key);
};

// A fixed (user-chosen) section as a candidate, or null if it isn't in the library.
export function fixedCandidate(section: string, material: "timber" | "steel", grade?: string): Candidate | null {
  if (material === "steel") {
    const s = findSteel(section);
    return s ? { fam: s.fam, name: s.name, b: s.b, d: s.d, steel: s } : null;
  }
  const t = parseTimberSection(section);
  if (!t) return null;
  const lvl = grade === "hySPAN" || grade === "hy90";
  return { fam: lvl ? "LVL" : "SG8", name: `${section.trim()} ${lvl ? "hySPAN" : "SG8"}`, b: t.b, d: t.d, mat: lvl ? LVL : SG8, plies: t.plies };
}

export const SG8_DEPTHS = [90, 140, 190, 240, 290];
