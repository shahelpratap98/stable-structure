// Connections for specific design, AS 4100 / NZS 3404.1 ch 9 and NZS 3101:
//   bolts   phi 0.8; phi·Vf = 0.8·0.62·fuf·(nn·Ac) (threads in the shear
//           plane), phi·Ntf = 0.8·As·fuf; fuf 830 (8.8), 400 (4.6)
//   ply     phi·Vb = 0.9·3.2·df·tp·fup, fup 440 (Grade 300 plate)
//   welds   phi·vw = phi·0.6·fuw·tt, fuw 490, SP fillet phi 0.8
//   bearing on concrete phi·0.85·f'c·A1·sqrt(A2/A1) <= 2·..., phi 0.65 (NZS 3101 cl 16.3.1)
//   plate   tp >= sqrt(2.22·N*·n² / (A1·fy)) (cantilever method, phi 0.9)
// Timber fixings are listed as the force a proprietary connector must be
// rated for (joist hangers, beam-to-post, tie-downs) and timber bearing is
// checked to NZS 3603 (phi·k1·fp·A).

import type { SteelSec } from "./materials";

export type Connection = { at: string; kind: string; demand: number; unit: string; detail: string; ok: boolean };

const BOLT = {
  M12: { Ac: 76.2, As: 84.3, d: 12 },
  M16: { Ac: 144, As: 157, d: 16 },
  M20: { Ac: 225, As: 245, d: 20 },
  M24: { Ac: 324, As: 353, d: 24 },
} as const;
type Bolt = keyof typeof BOLT;
const phiVf = (b: Bolt, fuf = 830) => (0.8 * 0.62 * fuf * BOLT[b].Ac) / 1e3;
const phiNtf = (b: Bolt, fuf = 400) => (0.8 * BOLT[b].As * fuf) / 1e3;
const phiVb = (b: Bolt, tp: number) => (0.9 * 3.2 * BOLT[b].d * tp * 440) / 1e3;
const phiWeld = (leg: number) => (0.8 * 0.6 * 490 * leg * 0.707) / 1e3; // kN per mm of weld

// steel beam end: web cleat to the support, bolted to the web, welded to the support
export function beamEnd(mark: string, end: string, R: number, s: SteelSec): Connection {
  const cleat = s.d >= 300 ? 10 : 8;
  for (const b of ["M16", "M20", "M24"] as Bolt[]) {
    const per = Math.min(phiVf(b), phiVb(b, s.tw), phiVb(b, cleat));
    const n = Math.max(2, Math.ceil(R / per));
    const pitch = 70;
    const depth = (n - 1) * pitch + 2 * 35;
    if (depth <= s.d - 2 * s.tf - 20) {
      const weld = Math.ceil(R / (2 * phiWeld(6)) / 10) * 10;
      return {
        at: `${mark} ${end}`,
        kind: "Steel beam end",
        demand: R,
        unit: "kN",
        detail: `${cleat} mm web cleat ${Math.max(depth, weld)} long, ${n} ${b} 8.8/S bolts (${(per).toFixed(0)} kN each), 6 mm SP fillet both sides to the support`,
        ok: true,
      };
    }
  }
  return { at: `${mark} ${end}`, kind: "Steel beam end", demand: R, unit: "kN", detail: "end shear too high for a single web cleat: end plate or specific design", ok: false };
}

// base plate under a steel post or portal leg on a concrete pad
export function basePlate(mark: string, N: number, size: number, M = 0, up = 0, fc = 25): Connection {
  const B = size + 100; // plate 50 mm past the section each side
  const A1 = B * B;
  const bearing = (0.65 * 0.85 * fc * A1 * Math.min(2, Math.sqrt(4))) / 1e3; // A2 >= 4·A1 on a pad
  const n = (B - 0.8 * size) / 2;
  const tp = Math.max(10, Math.ceil(Math.sqrt((2.22 * Math.max(N, 1) * 1e3 * n * n) / (A1 * 300)) / 2) * 2);
  // hold-downs: uplift plus the base moment over the bolt lever arm
  const lever = Math.max(0.1, (B - 50) / 1000);
  const T = up + (M > 0 ? M / lever : 0);
  let bolts = "4 M12 4.6/S cast-in";
  for (const [b, k] of [
    ["M12", 2],
    ["M16", 2],
    ["M20", 2],
    ["M24", 2],
  ] as [Bolt, number][]) {
    if (k * phiNtf(b) >= T) {
      bolts = `4 ${b} 4.6/S cast-in (${(phiNtf(b)).toFixed(0)} kN each)`;
      break;
    }
    bolts = "hold-down force beyond 4 M24: specific design";
  }
  return {
    at: mark,
    kind: "Base plate",
    demand: N,
    unit: "kN",
    detail: `${B}×${B}×${tp} plate, bearing φ ${bearing.toFixed(0)} kN${T > 0 ? `; hold-down ${T.toFixed(1)} kN` : ""}; ${bolts}`,
    ok: N <= bearing,
  };
}

// timber beam bearing on a timber post or wall plate (NZS 3603: phi 0.8, k1 0.8, fp)
export function timberBearing(mark: string, R: number, beamB: number, postD: number, fp: number): Connection {
  const cap = (0.8 * 0.8 * fp * beamB * postD) / 1e3;
  return {
    at: mark,
    kind: "Timber bearing",
    demand: R,
    unit: "kN",
    detail: `${beamB} × ${postD} bearing, φN ${cap.toFixed(1)} kN${R > cap ? ": add a bearing plate or a wider post" : ""}`,
    ok: R <= cap,
  };
}

export const rated = (at: string, kind: string, R: number, what: string): Connection => ({ at, kind, demand: R, unit: "kN", detail: `${what} rated for at least ${R.toFixed(1)} kN`, ok: true });
