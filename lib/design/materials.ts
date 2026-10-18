// Material and section data: sawn timber, glulam and LVL to NZS 3603 and the
// manufacturers' design guides, and hot-rolled PFC / UB / UC steel (Grade 300).

import type { Family, Sizing } from "./model";

export type TimberKey = "SG8" | "SG10" | "GL8" | "GL10" | "GL12" | "LVL" | "HYONE" | "HY90" | "LVL11";
export type TimberMat = { key: TimberKey; fb: number; fs: number; fc: number; fp: number; E: number; phi: number; k2: number; dens: number; size?: number; label: string; note: string };

// Dry, MPa; E in MPa; dens kN/m³. Sources: NZS 3603 Table 2.3 (Amdt 4) for sawn
// timber; NZPMA glulam span tables (AS/NZS 1328.2) for GL grades; Futurebuild
// LVL Specific Engineering Design Guide (Aug 2019) for hySPAN, hyONE, hy90;
// NelsonPine LVL Specific Engineering Design Guide (NPIL/03, 2016) for LVL11.
// size: exponent of the bending size factor (95 / d)^size for d > 95 mm.
export const SG8: TimberMat = { key: "SG8", fb: 14, fs: 3.8, fc: 18, fp: 8.9, E: 8000, phi: 0.8, k2: 2, dens: 5.0, label: "SG8", note: "SG8 dry: fb 14, fs 3.8 MPa, E 8.0 GPa, φ 0.8 (NZS 3603)" };
export const SG10: TimberMat = { key: "SG10", fb: 20, fs: 3.8, fc: 20, fp: 8.9, E: 10000, phi: 0.8, k2: 2, dens: 5.0, label: "SG10", note: "SG10 dry: fb 20, fs 3.8 MPa, E 10.0 GPa, φ 0.8 (NZS 3603)" };
export const GL8: TimberMat = { key: "GL8", fb: 19, fs: 3.7, fc: 24, fp: 8.9, E: 8000, phi: 0.8, k2: 1.5, dens: 5.0, label: "GL8", note: "GL8 glulam: fb 19, fs 3.7 MPa, E 8.0 GPa, φ 0.8, k2 1.5 (AS/NZS 1328)" };
export const GL10: TimberMat = { key: "GL10", fb: 22, fs: 3.7, fc: 26, fp: 8.9, E: 10000, phi: 0.8, k2: 1.5, dens: 5.0, label: "GL10", note: "GL10 glulam: fb 22, fs 3.7 MPa, E 10.0 GPa, φ 0.8, k2 1.5 (AS/NZS 1328)" };
export const GL12: TimberMat = { key: "GL12", fb: 25, fs: 3.7, fc: 29, fp: 8.9, E: 11500, phi: 0.8, k2: 1.5, dens: 5.0, label: "GL12", note: "GL12 glulam: fb 25, fs 3.7 MPa, E 11.5 GPa, φ 0.8, k2 1.5 (AS/NZS 1328)" };
// hySPAN: the Lot 6 model used fb 48, fs 5.3 with no size factor; the current
// Futurebuild guide gives fb 50 × (95/d)^0.154, which governs for deep beams.
export const LVL: TimberMat = { key: "LVL", fb: 50, fs: 4.6, fc: 42, fp: 12, E: 13200, phi: 0.9, k2: 2, dens: 6.2, size: 0.154, label: "hySPAN", note: "hySPAN: fb 50 × (95/d)^0.154, fs 4.6 MPa, E 13.2 GPa, φ 0.9 (Futurebuild LVL design guide 2019)" };
export const HYONE: TimberMat = { key: "HYONE", fb: 65, fs: 4.6, fc: 48, fp: 12, E: 16000, phi: 0.9, k2: 2, dens: 6.2, size: 0.154, label: "hyONE", note: "hyONE: fb 65 × (95/d)^0.154, fs 4.6 MPa, E 16.0 GPa, φ 0.9 (Futurebuild LVL design guide 2019)" };
export const HY90: TimberMat = { key: "HY90", fb: 34, fs: 4.6, fc: 36.6, fp: 12, E: 9500, phi: 0.9, k2: 2, dens: 6.2, size: 0.154, label: "hy90", note: "hy90: fb 34 × (95/d)^0.154, fs 4.6 MPa, E 9.5 GPa, φ 0.9 (Futurebuild LVL design guide 2019)" };
export const LVL11: TimberMat = { key: "LVL11", fb: 38, fs: 5.0, fc: 38, fp: 10, E: 11000, phi: 0.9, k2: 2, dens: 5.6, size: 0.167, label: "NelsonPine LVL11", note: "NelsonPine LVL11: fb 38 × (95/d)^0.167, fs 5.0 MPa, E 11.0 GPa, φ 0.9 (NPIL design guide 2016)" };
export const TIMBER: Record<TimberKey, TimberMat> = { SG8, SG10, GL8, GL10, GL12, LVL, HYONE, HY90, LVL11 };

// fb for a member of depth d (mm), with the product's size factor
export const fbAt = (m: TimberMat, d: number) => (m.size && d > 95 ? m.fb * (95 / d) ** m.size : m.fb);

// Section ranges: [breadth, label, plies] for each depth
type Range = { depths: number[]; widths: [number, (d: number) => string, number][] };
const sawn: Range = { depths: [140, 190, 240, 290], widths: [2, 3].map((n) => [45 * n, (d: number) => `${n}/${d}×45`, n]) };
const RANGES: Record<TimberKey, Range> = {
  SG8: sawn,
  SG10: sawn,
  GL8: { depths: [180, 225, 270, 315, 360, 405, 450, 495, 540, 585, 630], widths: [65, 90, 135, 180].map((b) => [b, (d: number) => `${d}×${b}`, 1]) },
  GL10: { depths: [180, 225, 270, 315, 360, 405, 450, 495, 540, 585, 630], widths: [65, 90, 135, 180].map((b) => [b, (d: number) => `${d}×${b}`, 1]) },
  GL12: { depths: [180, 225, 270, 315, 360, 405, 450, 495, 540, 585, 630], widths: [65, 90, 135, 180].map((b) => [b, (d: number) => `${d}×${b}`, 1]) },
  LVL: {
    depths: [150, 200, 240, 300, 360, 400, 450, 600],
    widths: [
      [45, (d) => `${d}×45`, 1],
      [63, (d) => `${d}×63`, 1],
      [90, (d) => `2/${d}×45`, 2],
      [126, (d) => `2/${d}×63`, 2],
    ],
  },
  HYONE: { depths: [240, 300, 360, 400], widths: [[90, (d) => `${d}×90`, 1], [180, (d) => `2/${d}×90`, 2]] },
  HY90: { depths: [150, 200, 240, 300, 360, 400], widths: [[90, (d) => `${d}×90`, 1], [180, (d) => `2/${d}×90`, 2]] },
  LVL11: {
    depths: [140, 190, 240, 300, 360, 400],
    widths: [
      [45, (d) => `${d}×45`, 1],
      [90, (d) => `2/${d}×45`, 2],
    ],
  },
};
// hySPAN 45 wide stops at 400; 63 goes to 600
const fits = (k: TimberKey, b: number, d: number) => !(k === "LVL" && (b === 45 || b === 90) && d > 400);

export type SteelFam = "PFC" | "UB" | "UC";
export type SteelSec = { name: string; fam: SteelFam; d: number; b: number; tw: number; tf: number; A: number; Ix: number; Ze: number; kgm: number; fy: number; Iy: number; J: number; Iw: number; S: number };

// Hot-rolled sections to AS/NZS 3679.1 Grade 300: d, b, tf, tw (mm), area
// (mm2), Ix (mm4), plastic modulus Sx (mm3), minor-axis Iy (mm4), torsion
// constant J (mm4) and warping constant Iw (mm6), from the published section
// tables. Check against the current InfraBuild / Liberty catalogue before issue.
const TABLE: [string, SteelFam, number, number, number, number, number, number, number, number, number, number][] = [
  ["100PFC", "PFC", 100, 50, 6.7, 4.2, 1060, 1.74e6, 40.3e3, 267000, 13200, 424e6],
  ["125PFC", "PFC", 125, 65, 7.5, 4.7, 1520, 3.97e6, 73.0e3, 658000, 23100, 1.64e9],
  ["150PFC", "PFC", 150, 75, 9.5, 6, 2250, 8.34e6, 129e3, 1.29e6, 54900, 4.59e9],
  ["180PFC", "PFC", 180, 75, 11, 6, 2660, 14.1e6, 182e3, 1.51e6, 81400, 7.82e9],
  ["200PFC", "PFC", 200, 75, 12, 6, 2920, 19.1e6, 221e3, 1.65e6, 101000, 10.6e9],
  ["230PFC", "PFC", 230, 75, 12, 6.5, 3200, 26.8e6, 271e3, 1.76e6, 108000, 15e9],
  ["250PFC", "PFC", 250, 90, 15, 8, 4520, 45.1e6, 421e3, 3.64e6, 238000, 35.9e9],
  ["300PFC", "PFC", 300, 90, 16, 8, 5110, 72.4e6, 564e3, 4.04e6, 290000, 58.2e9],
  ["380PFC", "PFC", 380, 100, 17.5, 10, 7030, 152e6, 946e3, 6.48e6, 472000, 151e9],
  ["150UB14.0", "UB", 150, 75, 7, 5, 1780, 6.66e6, 102e3, 495000, 28100, 2.53e9],
  ["150UB18.0", "UB", 155, 75, 9.5, 6, 2300, 9.05e6, 135e3, 672000, 60500, 3.56e9],
  ["180UB16.1", "UB", 173, 90, 7, 4.5, 2040, 10.6e6, 138e3, 853000, 31500, 5.88e9],
  ["180UB18.1", "UB", 175, 90, 8, 5, 2300, 12.1e6, 157e3, 975000, 44800, 6.8e9],
  ["180UB22.2", "UB", 179, 90, 10, 6, 2820, 15.3e6, 195e3, 1.22e6, 81600, 8.71e9],
  ["200UB18.2", "UB", 198, 99, 7, 4.5, 2320, 15.8e6, 180e3, 1.14e6, 38600, 10.4e9],
  ["200UB22.3", "UB", 202, 133, 7, 5, 2870, 21.0e6, 231e3, 2.75e6, 45000, 26e9],
  ["200UB25.4", "UB", 203, 133, 7.8, 5.8, 3230, 23.6e6, 260e3, 3.06e6, 62700, 29.2e9],
  ["200UB29.8", "UB", 207, 134, 9.6, 6.3, 3820, 29.1e6, 316e3, 3.86e6, 105000, 37.6e9],
  ["250UB25.7", "UB", 248, 124, 8, 5, 3270, 35.4e6, 319e3, 2.55e6, 67400, 36.7e9],
  ["250UB31.4", "UB", 252, 146, 8.6, 6.1, 4010, 44.5e6, 397e3, 4.47e6, 89300, 65.9e9],
  ["250UB37.3", "UB", 256, 146, 10.9, 6.4, 4750, 55.7e6, 486e3, 5.66e6, 158000, 85.2e9],
  ["310UB32.0", "UB", 298, 149, 8, 5.5, 4080, 63.2e6, 475e3, 4.42e6, 86500, 92.9e9],
  ["310UB40.4", "UB", 304, 165, 10.2, 6.1, 5210, 86.4e6, 633e3, 7.65e6, 157000, 165e9],
  ["310UB46.2", "UB", 307, 166, 11.8, 6.7, 5930, 100e6, 729e3, 9.01e6, 233000, 197e9],
  ["360UB44.7", "UB", 352, 171, 9.7, 6.9, 5720, 121e6, 777e3, 8.1e6, 161000, 237e9],
  ["360UB50.7", "UB", 356, 171, 11.5, 7.3, 6470, 142e6, 897e3, 9.6e6, 241000, 284e9],
  ["360UB56.7", "UB", 359, 172, 13, 8, 7240, 161e6, 1010e3, 11e6, 338000, 330e9],
  ["410UB53.7", "UB", 403, 178, 10.9, 7.6, 6890, 188e6, 1060e3, 10.3e6, 234000, 394e9],
  ["410UB59.7", "UB", 406, 178, 12.8, 7.8, 7640, 216e6, 1200e3, 12.1e6, 337000, 467e9],
  ["460UB67.1", "UB", 454, 190, 12.7, 8.5, 8580, 296e6, 1480e3, 14.5e6, 378000, 708e9],
  ["460UB74.6", "UB", 457, 190, 14.5, 9.1, 9520, 335e6, 1660e3, 16.6e6, 530000, 815e9],
  ["460UB82.1", "UB", 460, 191, 16, 9.9, 10500, 372e6, 1840e3, 18.6e6, 701000, 919e9],
  ["530UB82.0", "UB", 528, 209, 13.2, 9.6, 10500, 477e6, 2070e3, 20.1e6, 526000, 1330e9],
  ["530UB92.4", "UB", 533, 209, 15.6, 10.2, 11800, 554e6, 2370e3, 23.8e6, 775000, 1590e9],
  ["610UB101", "UB", 602, 228, 14.8, 10.6, 13000, 761e6, 2900e3, 29.3e6, 790000, 2530e9],
  ["610UB113", "UB", 607, 228, 17.3, 11.2, 14500, 875e6, 3290e3, 34.3e6, 1.14e6, 2980e9],
  ["610UB125", "UB", 612, 229, 19.6, 11.9, 16000, 986e6, 3680e3, 39.3e6, 1.56e6, 3450e9],
  ["100UC14.8", "UC", 97, 99, 7, 5, 1890, 3.18e6, 74.4e3, 1.14e6, 34900, 2.3e9],
  ["150UC23.4", "UC", 152, 152, 6.8, 6.1, 2980, 12.6e6, 184e3, 3.98e6, 50200, 21.1e9],
  ["150UC30.0", "UC", 158, 153, 9.4, 6.6, 3860, 17.6e6, 250e3, 5.62e6, 109000, 30.8e9],
  ["150UC37.2", "UC", 162, 154, 11.5, 8.1, 4730, 22.2e6, 310e3, 7.01e6, 197000, 39.6e9],
  ["200UC46.2", "UC", 203, 203, 11, 7.3, 5900, 45.9e6, 500e3, 15.3e6, 228000, 142e9],
  ["200UC52.2", "UC", 206, 204, 12.5, 8, 6660, 52.8e6, 570e3, 17.7e6, 325000, 166e9],
  ["200UC59.5", "UC", 210, 205, 14.2, 9.3, 7620, 61.3e6, 656e3, 20.4e6, 477000, 195e9],
  ["250UC72.9", "UC", 254, 254, 14.2, 8.6, 9320, 114e6, 992e3, 38.8e6, 586000, 557e9],
  ["250UC89.5", "UC", 260, 256, 17.3, 10.5, 11400, 143e6, 1230e3, 48.4e6, 1.04e6, 713e9],
  ["310UC96.8", "UC", 308, 305, 15.4, 9.9, 12400, 223e6, 1600e3, 72.9e6, 928000, 1560e9],
  ["310UC118", "UC", 315, 307, 18.7, 11.9, 15000, 277e6, 1960e3, 90.2e6, 1.63e6, 1980e9],
  ["310UC137", "UC", 321, 309, 21.7, 13.8, 17500, 329e6, 2300e3, 107e6, 2.52e6, 2390e9],
  ["310UC158", "UC", 327, 311, 25, 15.7, 20100, 388e6, 2680e3, 125e6, 3.81e6, 2860e9],
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
export const STEEL: SteelSec[] = TABLE.map(([name, fam, d, b, tf, tw, A, Ix, S, Iy, J, Iw]) => {
  const fy = fyOf(tf);
  const e = ENGINE[name];
  // UB and UC names carry their mass; PFC mass from the area at 7850 kg/m³
  const named = /U[BC]([\d.]+)$/.exec(name);
  const kgm = e?.kgm ?? (named ? Number(named[1]) : Math.round(A * 0.785) / 100);
  return { name, fam, d, b, tf, tw, A, Ix, Iy, J, Iw, S, fy: e?.fy ?? fy, Ze: e?.Ze ?? effectiveZ(fam, d, b, tf, tw, Ix, S, fy), kgm };
}).sort((x, y) => x.kgm - y.kgm);
export const FY = 300;
export const ES = 200000;

export const FAMILY_LABEL: Record<Family | "SHS", string> = {
  SG8: "SG8 timber",
  SG10: "SG10 timber",
  GL8: "GL8 glulam",
  GL10: "GL10 glulam",
  GL12: "GL12 glulam",
  LVL: "hySPAN LVL",
  HYONE: "hyONE LVL",
  HY90: "hy90 LVL",
  LVL11: "NelsonPine LVL11",
  PFC: "PFC steel",
  UB: "UB steel",
  UC: "UC steel",
  SHS: "SHS steel",
};
export const FAMILY_COLOUR: Record<Family | "SHS", string> = {
  SG8: "#d9b77e",
  SG10: "#cfa865",
  GL8: "#e0b46a",
  GL10: "#d6a24f",
  GL12: "#c98f3a",
  LVL: "#c46f2a",
  HYONE: "#a85a22",
  HY90: "#d0843e",
  LVL11: "#b86a32",
  PFC: "#5d7590",
  UB: "#4f6680",
  UC: "#3f5670",
  SHS: "#4b5a6b",
};
// Optional families to tick on a member, beyond the default order.
export const MORE_FAMILIES: Family[] = ["SG10", "GL8", "GL10", "GL12", "HYONE", "HY90", "LVL11"];
// The order families are tried in when several are ticked: timber, then steel.
export const ALL_FAMILIES: Family[] = ["SG8", "SG10", "GL8", "GL10", "GL12", "LVL", "HYONE", "HY90", "LVL11", "PFC", "UB", "UC"];
const TIMBER_KEYS = Object.keys(TIMBER) as TimberKey[];
export const isTimberFam = (f: string): f is TimberKey => (TIMBER_KEYS as string[]).includes(f);
export const DEFAULT_FAMILIES: Family[] = ["SG8", "LVL", "PFC", "UB", "UC"];

export type Candidate =
  | { fam: TimberKey; name: string; b: number; d: number; mat: TimberMat; plies: number }
  | { fam: SteelFam; name: string; b: number; d: number; steel: SteelSec };

// Sections tried in order, cheapest first within each family.
export function candidates(sizing: Sizing, fallbackMaxD = 0): Candidate[] {
  const out: Candidate[] = [];
  const minD = sizing.minD ?? 0;
  const maxD = sizing.maxD && sizing.maxD > 0 ? sizing.maxD : fallbackMaxD > 0 ? fallbackMaxD : 1e9;
  const maxB = sizing.maxB && sizing.maxB > 0 ? sizing.maxB : 1e9;
  const fams = sizing.families?.length ? sizing.families : DEFAULT_FAMILIES;
  for (const f of fams) {
    if (isTimberFam(f)) {
      const M = TIMBER[f];
      for (const d of RANGES[f].depths)
        for (const [b, lab, plies] of RANGES[f].widths)
          if (d >= minD && d <= maxD && b <= maxB && fits(f, b, d)) out.push({ fam: f, name: `${lab(d)} ${M.label}`, b, d, mat: { ...M, fb: fbAt(M, d) }, plies });
    } else {
      // Minimum depth is for timber joists to side-fix; steel takes a timber web packer instead.
      for (const s of STEEL) if (s.fam === f && s.d <= maxD) out.push({ fam: s.fam, name: s.name, b: s.b, d: s.d, steel: s });
    }
  }
  return out;
}

// "190x45" -> depth 190, breadth 45; "2/240x45" -> two plies, breadth 90.
export function parseTimberSection(section: string): { d: number; b: number; plies: number } | null {
  const m = /^\s*(?:(\d)\s*\/\s*)?(\d{2,3})\s*[x×]\s*(\d{2,3})\s*$/i.exec(section.replace(/\s*(SG\d+|GL\d+|hySPAN|hyONE|hy90|LVL\d*|NelsonPine LVL\d+)\s*$/i, ""));
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

// member grade (as stored) -> material
const GRADE_KEY: Record<string, TimberKey> = { SG8: "SG8", SG10: "SG10", GL8: "GL8", GL10: "GL10", GL12: "GL12", hySPAN: "LVL", hyONE: "HYONE", hy90: "HY90", LVL11: "LVL11" };

// A fixed (user-chosen) section as a candidate, or null if it isn't in the library.
export function fixedCandidate(section: string, material: "timber" | "steel", grade?: string): Candidate | null {
  if (material === "steel") {
    const s = findSteel(section);
    return s ? { fam: s.fam, name: s.name, b: s.b, d: s.d, steel: s } : null;
  }
  const t = parseTimberSection(section);
  if (!t) return null;
  const key = GRADE_KEY[grade ?? "SG8"] ?? "SG8";
  const M = TIMBER[key];
  return { fam: key, name: `${section.trim()} ${M.label}`, b: t.b, d: t.d, mat: { ...M, fb: fbAt(M, t.d) }, plies: t.plies };
}

export const SG8_DEPTHS = [90, 140, 190, 240, 290];
