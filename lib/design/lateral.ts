// Specifically designed lateral elements: steel portal frames and cantilever
// posts. Portals are analysed with the frame solver (rigid knees, fixed or
// pinned bases) under gravity plus the lateral force the portal is rated
// for; members are checked to AS 4100 / NZS 3404.1 for combined actions:
//   section    M* <= phi·Ms·(1 - N*/phi·Ns)                (cl 8.3)
//   in-plane   M* <= phi·Ms·(1 - N*/phi·Ncx)               (cl 8.4.2.2)
//   out of plane M* <= phi·Mb·(1 - N*/phi·Ncy)             (cl 8.4.4.1)
// Drift is reported against h/40 (ULS) and h/300 (SLS) — limits commonly
// used for portals in light timber buildings; confirm for the job.

import { solveFrame } from "./frame";
import { ES, STEEL, type SteelFam, type SteelSec } from "./materials";

const GS = 80000;
const AB: Record<SteelFam, number> = { UB: 0, UC: 0, PFC: 0.5 };

function alphaC(ln: number, ab: number) {
  const aa = (2100 * (ln - 13.5)) / (ln * ln - 15.3 * ln + 2050);
  const l = ln + aa * ab;
  const eta = Math.max(0, 0.00326 * (l - 13.5));
  const q = (l / 90) ** 2;
  const xi = (q + 1 + eta) / (2 * q);
  return Math.min(1, xi * (1 - Math.sqrt(Math.max(0, 1 - (90 / (xi * l)) ** 2))));
}
const phiNc = (s: SteelSec, le: number, axis: "x" | "y") => {
  const r = Math.sqrt((axis === "x" ? s.Ix : s.Iy) / s.A);
  const ln = ((le * 1000) / r) * Math.sqrt(s.fy / 250);
  return (0.9 * alphaC(ln, AB[s.fam]) * s.A * s.fy) / 1e3;
};
const phiMs = (s: SteelSec) => (0.9 * s.fy * s.Ze) / 1e6;
function phiMb(s: SteelSec, le: number, am: number) {
  const L = le * 1000;
  const Ms = s.fy * s.Ze;
  const Mo = Math.sqrt(((Math.PI ** 2 * ES * s.Iy) / L ** 2) * (GS * s.J + (Math.PI ** 2 * ES * s.Iw) / L ** 2));
  const as = 0.6 * (Math.sqrt((Ms / Mo) ** 2 + 3) - Ms / Mo);
  return (0.9 * Math.min(Ms, am * as * Ms)) / 1e6;
}

export type PortalInput = { span: number; height: number; base: "fixed" | "pinned"; H: number; gG: number; gQ: number; families?: SteelFam[] };
export type PortalResult = {
  sec: SteelSec | null;
  util: number;
  gov: string;
  drift: number; // mm, ULS
  lines: { label: string; value: string }[];
  base: { M: number; V: number; N: number; up: number };
  notes: string[];
};

export function designPortal(inp: PortalInput): PortalResult {
  const fams = inp.families?.length ? inp.families : (["PFC", "UB", "UC"] as SteelFam[]);
  const cands = STEEL.filter((s) => fams.includes(s.fam));
  const h = inp.height,
    L = inp.span;
  const fix = inp.base === "fixed" ? { x: true, y: true, r: true } : { x: true, y: true };
  // sway-frame effective length for the legs in the plane of the portal (conservative)
  const keX = inp.base === "fixed" ? 1.5 : 2.2;
  const combos = [
    { name: "1.2G + Wu", g: 1.2 * inp.gG },
    { name: "G + 0.3Q + Eu", g: inp.gG + 0.3 * inp.gQ },
    { name: "0.9G + Wu", g: 0.9 * inp.gG },
  ];
  let last: PortalResult | null = null;
  for (const s of cands) {
    const EI = (ES * s.Ix) / 1e9;
    let worst = 0,
      gov = "",
      drift = 0,
      base = { M: 0, V: 0, N: 0, up: 0 };
    const lines: PortalResult["lines"] = [];
    for (const c of combos) {
      const w = c.g + (0.0981 * s.kgm) / 10; // + self weight kN/m
      const r = solveFrame(
        [
          { x: 0, y: 0, fix },
          { x: 0, y: h },
          { x: L, y: h },
          { x: L, y: 0, fix },
        ],
        [
          { i: 0, j: 1, EI, EA: (ES * s.A) / 1e3 },
          { i: 1, j: 2, EI, EA: (ES * s.A) / 1e3, load: { w } },
          { i: 2, j: 3, EI, EA: (ES * s.A) / 1e3 },
        ],
        [{ node: 1, fx: inp.H }],
      );
      drift = Math.max(drift, Math.abs(r.u[3]) * 1000);
      const memberU = r.members.map((mr, k) => {
        const M = Math.max(...mr.stations.map((st) => Math.abs(st.M)));
        const N = Math.abs(mr.end.Ni);
        const leg = k !== 1;
        const Ns = (0.9 * s.A * s.fy) / 1e3;
        const sec = M / (phiMs(s) * Math.max(1e-6, 1 - N / Ns));
        const inPlane = leg ? M / (phiMs(s) * Math.max(1e-6, 1 - N / phiNc(s, keX * h, "x"))) : sec;
        const outPlane = leg ? M / (Math.min(phiMs(s), phiMb(s, h, 1.75)) * Math.max(1e-6, 1 - N / phiNc(s, h, "y"))) : M / Math.min(phiMs(s), phiMb(s, L, 1.13));
        return { u: Math.max(sec, inPlane, outPlane), M, N, which: leg ? "leg" : "beam" };
      });
      for (const mu of memberU)
        if (mu.u > worst) {
          worst = mu.u;
          gov = `${mu.which}, ${c.name}`;
        }
      for (const rr of r.reactions) {
        base = {
          M: Math.max(base.M, Math.abs(rr.mz)),
          V: Math.max(base.V, Math.abs(rr.fx)),
          N: Math.max(base.N, rr.fy),
          up: Math.max(base.up, -rr.fy),
        };
      }
      if (c === combos[0]) lines.push({ label: "Leg M* / N*", value: `${memberU[0].M.toFixed(1)} kNm / ${memberU[0].N.toFixed(1)} kN` }, { label: "Beam M*", value: `${memberU[1].M.toFixed(1)} kNm` });
    }
    const uDrift = drift / ((h * 1000) / 40);
    const uSls = (drift * 0.68) / ((h * 1000) / 300);
    const util = Math.max(worst, uDrift, uSls);
    const out: PortalResult = {
      sec: s,
      util,
      gov: util === worst ? gov : util === uDrift ? "ULS drift" : "SLS drift",
      drift,
      lines: [
        { label: "Portal", value: `${s.name} legs and beam, ${L.toFixed(2)} m × ${h.toFixed(2)} m, ${inp.base} bases` },
        { label: "Lateral H (ULS)", value: `${inp.H.toFixed(1)} kN` },
        ...lines,
        { label: "Drift ULS / SLS", value: `${drift.toFixed(1)} mm (h/${Math.round((h * 1000) / Math.max(drift, 0.01))}) / ${(drift * 0.68).toFixed(1)} mm` },
        { label: "Base M / V / uplift", value: `${base.M.toFixed(1)} kNm / ${base.V.toFixed(1)} kN / ${base.up.toFixed(1)} kN` },
      ],
      base,
      notes: [
        `Portal analysed as a frame (rigid knees, ${inp.base} bases) under ${combos.map((c) => c.name).join(", ")}; combined actions to AS 4100 cl 8.3–8.4, legs le = ${keX} h in plane (sway) and h out of plane.`,
        "Drift against h/40 at ULS and h/300 at SLS (SLS taken as 0.68 of ULS wind). Knee and base connections must develop the moments above: detail the base plate and hold-down bolts for the base moment and uplift.",
      ],
    };
    last = out;
    if (util <= 1) return out;
  }
  return last ?? { sec: null, util: 9, gov: "", drift: 0, lines: [{ label: "Portal", value: "no steel section fits" }], base: { M: 0, V: 0, N: 0, up: 0 }, notes: [] };
}
