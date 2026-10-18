// Material and section data. Timber and steel values follow Stable Structure's
// own framing models (Lot 6 and 26121): SG8 dry to NZS 3603, hySPAN (LVL13),
// and hot-rolled PFC / UB / UC steel (Grade 300).

import type { Family, Sizing } from "./model";

export type TimberMat = { key: "SG8" | "LVL"; fb: number; fs: number; fc: number; fp: number; E: number; phi: number; k2: number; dens: number };

export const SG8: TimberMat = { key: "SG8", fb: 14, fs: 3.8, fc: 18, fp: 8.9, E: 8000, phi: 0.8, k2: 2, dens: 5.0 };
export const LVL: TimberMat = { key: "LVL", fb: 48, fs: 5.3, fc: 45, fp: 12, E: 13200, phi: 0.9, k2: 2, dens: 6.2 };

export type SteelFam = "PFC" | "UB" | "UC";
export type SteelSec = { name: string; fam: SteelFam; d: number; b: number; tw: number; tf: number; Ix: number; Ze: number; kgm: number; fy: number };

// Hot-rolled sections to AS/NZS 3679.1 Grade 300: d, b, tf, tw (mm), area
// (mm2), Ix (mm4), plastic modulus Sx (mm3), from the published section
// tables. Check against the current InfraBuild / Liberty catalogue before issue.
const TABLE: [string, SteelFam, number, number, number, number, number, number, number][] = [
  ["100PFC", "PFC", 100, 50, 6.7, 4.2, 1060, 1.74e6, 40.3e3],
  ["125PFC", "PFC", 125, 65, 7.5, 4.7, 1520, 3.97e6, 73.0e3],
  ["150PFC", "PFC", 150, 75, 9.5, 6, 2250, 8.34e6, 129e3],
  ["180PFC", "PFC", 180, 75, 11, 6, 2660, 14.1e6, 182e3],
  ["200PFC", "PFC", 200, 75, 12, 6, 2920, 19.1e6, 221e3],
  ["230PFC", "PFC", 230, 75, 12, 6.5, 3200, 26.8e6, 271e3],
  ["250PFC", "PFC", 250, 90, 15, 8, 4520, 45.1e6, 421e3],
  ["300PFC", "PFC", 300, 90, 16, 8, 5110, 72.4e6, 564e3],
  ["380PFC", "PFC", 380, 100, 17.5, 10, 7030, 152e6, 946e3],
  ["150UB14.0", "UB", 150, 75, 7, 5, 1780, 6.66e6, 102e3],
  ["150UB18.0", "UB", 155, 75, 9.5, 6, 2300, 9.05e6, 135e3],
  ["180UB16.1", "UB", 173, 90, 7, 4.5, 2040, 10.6e6, 138e3],
  ["180UB18.1", "UB", 175, 90, 8, 5, 2300, 12.1e6, 157e3],
  ["180UB22.2", "UB", 179, 90, 10, 6, 2820, 15.3e6, 195e3],
  ["200UB18.2", "UB", 198, 99, 7, 4.5, 2320, 15.8e6, 180e3],
  ["200UB22.3", "UB", 202, 133, 7, 5, 2870, 21.0e6, 231e3],
  ["200UB25.4", "UB", 203, 133, 7.8, 5.8, 3230, 23.6e6, 260e3],
  ["200UB29.8", "UB", 207, 134, 9.6, 6.3, 3820, 29.1e6, 316e3],
  ["250UB25.7", "UB", 248, 124, 8, 5, 3270, 35.4e6, 319e3],
  ["250UB31.4", "UB", 252, 146, 8.6, 6.1, 4010, 44.5e6, 397e3],
  ["250UB37.3", "UB", 256, 146, 10.9, 6.4, 4750, 55.7e6, 486e3],
  ["310UB32.0", "UB", 298, 149, 8, 5.5, 4080, 63.2e6, 475e3],
  ["310UB40.4", "UB", 304, 165, 10.2, 6.1, 5210, 86.4e6, 633e3],
  ["310UB46.2", "UB", 307, 166, 11.8, 6.7, 5930, 100e6, 729e3],
  ["360UB44.7", "UB", 352, 171, 9.7, 6.9, 5720, 121e6, 777e3],
  ["360UB50.7", "UB", 356, 171, 11.5, 7.3, 6470, 142e6, 897e3],
  ["360UB56.7", "UB", 359, 172, 13, 8, 7240, 161e6, 1010e3],
  ["410UB53.7", "UB", 403, 178, 10.9, 7.6, 6890, 188e6, 1060e3],
  ["410UB59.7", "UB", 406, 178, 12.8, 7.8, 7640, 216e6, 1200e3],
  ["460UB67.1", "UB", 454, 190, 12.7, 8.5, 8580, 296e6, 1480e3],
  ["460UB74.6", "UB", 457, 190, 14.5, 9.1, 9520, 335e6, 1660e3],
  ["460UB82.1", "UB", 460, 191, 16, 9.9, 10500, 372e6, 1840e3],
  ["530UB82.0", "UB", 528, 209, 13.2, 9.6, 10500, 477e6, 2070e3],
  ["530UB92.4", "UB", 533, 209, 15.6, 10.2, 11800, 554e6, 2370e3],
  ["610UB101", "UB", 602, 228, 14.8, 10.6, 13000, 761e6, 2900e3],
  ["610UB113", "UB", 607, 228, 17.3, 11.2, 14500, 875e6, 3290e3],
  ["610UB125", "UB", 612, 229, 19.6, 11.9, 16000, 986e6, 3680e3],
  ["100UC14.8", "UC", 97, 99, 7, 5, 1890, 3.18e6, 74.4e3],
  ["150UC23.4", "UC", 152, 152, 6.8, 6.1, 2980, 12.6e6, 184e3],
  ["150UC30.0", "UC", 158, 153, 9.4, 6.6, 3860, 17.6e6, 250e3],
  ["150UC37.2", "UC", 162, 154, 11.5, 8.1, 4730, 22.2e6, 310e3],
  ["200UC46.2", "UC", 203, 203, 11, 7.3, 5900, 45.9e6, 500e3],
  ["200UC52.2", "UC", 206, 204, 12.5, 8, 6660, 52.8e6, 570e3],
  ["200UC59.5", "UC", 210, 205, 14.2, 9.3, 7620, 61.3e6, 656e3],
  ["250UC72.9", "UC", 254, 254, 14.2, 8.6, 9320, 114e6, 992e3],
  ["250UC89.5", "UC", 260, 256, 17.3, 10.5, 11400, 143e6, 1230e3],
  ["310UC96.8", "UC", 308, 305, 15.4, 9.9, 12400, 223e6, 1600e3],
  ["310UC118", "UC", 315, 307, 18.7, 11.9, 15000, 277e6, 1960e3],
  ["310UC137", "UC", 321, 309, 21.7, 13.8, 17500, 329e6, 2300e3],
  ["310UC158", "UC", 327, 311, 25, 15.7, 20100, 388e6, 2680e3],
];

// Grade 300 yield drops for thick plate (the 320 MPa under 11 mm isn't taken).
const fyOf = (tf: number) => (tf <= 17 ? 300 : 280);

// Effective section modulus to AS 4100 cl 5.2: hot-rolled flange outstand
// (λep 9, λey 16) and web in bending (λep 82, λey 115).
function effectiveZ(fam: SteelFam, d: number, b: number, tf: number, tw: number, Ix: number, S: number, fy: number) {
  const Z = Ix / (d / 2);
  const k = Math.sqrt(fy / 250);
  const lf = ((fam === "PFC" ? b - tw : (b - tw) / 2) / tf) * k;
  const lw = ((d - 2 * tf) / tw) * k;
  const Zc = Math.min(S, 1.5 * Z);
  const [ls, lp, ly] = lf / 16 >= lw / 115 ? [lf, 9, 16] : [lw, 82, 115];
  if (ls <= lp) return Zc;
  if (ls <= ly) return Z + ((ly - ls) / (ly - lp)) * (Zc - Z);
  return Z * (ly / ls);
}

// The sections in Stable Structure's Lot 6 / 26121 models keep the values used there.
const ENGINE: Record<string, { Ze: number; kgm: number; fy: number }> = {
  "200PFC": { Ze: 218e3, kgm: 22.9, fy: 300 },
  "250PFC": { Ze: 414e3, kgm: 35.5, fy: 300 },
  "250UB25.7": { Ze: 319e3, kgm: 25.7, fy: 300 },
};

// Lightest first, so auto sizing picks the lightest section that passes.
export const STEEL: SteelSec[] = TABLE.map(([name, fam, d, b, tf, tw, A, Ix, S]) => {
  const fy = fyOf(tf);
  const e = ENGINE[name];
  // UB and UC names carry their mass; PFC mass from the area at 7850 kg/m³
  const named = /U[BC]([\d.]+)$/.exec(name);
  const kgm = e?.kgm ?? (named ? Number(named[1]) : Math.round(A * 0.785) / 100);
  return { name, fam, d, b, tf, tw, Ix, fy: e?.fy ?? fy, Ze: e?.Ze ?? effectiveZ(fam, d, b, tf, tw, Ix, S, fy), kgm };
}).sort((x, y) => x.kgm - y.kgm);
export const FY = 300;
export const ES = 200000;

export const FAMILY_LABEL: Record<Family | "SHS", string> = { SG8: "SG8 timber", LVL: "hySPAN LVL", PFC: "PFC steel", UB: "UB steel", UC: "UC steel", SHS: "SHS steel" };
export const FAMILY_COLOUR: Record<Family | "SHS", string> = { SG8: "#d9b77e", LVL: "#c46f2a", PFC: "#5d7590", UB: "#4f6680", UC: "#3f5670", SHS: "#4b5a6b" };
export const DEFAULT_FAMILIES: Family[] = ["SG8", "LVL", "PFC", "UB", "UC"];

export type Candidate =
  | { fam: "SG8" | "LVL"; name: string; b: number; d: number; mat: TimberMat; plies: number }
  | { fam: SteelFam; name: string; b: number; d: number; steel: SteelSec };

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
