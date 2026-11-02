// Shallow foundations for specific design: pad footings under posts, strip
// footings under walls, and point loads punching through a ground slab.
// Bearing: N* <= phi_b × q_ult × A (B1/VM4, phi_b 0.45–0.60 nominated by the
// engineer); NZS 3604 good ground is 300 kPa ultimate (B1/AS1 Amdt 19).
// Concrete to NZS 3101:2006: phi 0.75 shear, 0.85 bending, punching at d/2
// (cl 12.7), beam shear vb = (0.07 + 10 rho)√f'c (cl 9.3.9.3.4), minimum
// steel √f'c/(4 fy)·b·d. Footings and slab 25 MPa (Combes S001), bars 500E.

import type { SiteData } from "./site";

export const FC = 25; // MPa
const FYR = 500; // MPa, grade 500E bars
const COVER = 75; // mm, cast against ground
const CONC = 24; // kN/m³

export type FootingResult = {
  B: number; // mm, square side
  D: number; // mm
  qStar: number; // kPa, factored bearing pressure
  qCap: number; // kPa, phi_b q_ult
  uBearing: number;
  uPunch: number;
  uShear: number;
  bars: string;
  lines: { label: string; value: string }[];
  notes: string[];
};

const vcBeam = (rho: number) => Math.min(0.2, Math.max(0.08, 0.07 + 10 * rho)) * Math.sqrt(FC);

// rebar for a moment M* (kN·m) on width b (mm) and effective depth d (mm)
function bars(Mstar: number, b: number, d: number) {
  const a1 = 0.85;
  // solve M* = 0.85 As fy (d - As fy / (2 a1 f'c b))
  const k = (FYR * FYR) / (2 * a1 * FC * b);
  const disc = (FYR * d) ** 2 - 4 * k * ((Mstar * 1e6) / 0.85);
  const req = disc > 0 ? (FYR * d - Math.sqrt(disc)) / (2 * k) : Infinity;
  const min = Math.max((Math.sqrt(FC) / (4 * FYR)) * b * d, (1.4 * b * d) / FYR);
  const As = Math.max(req, min);
  for (const [dia, area] of [
    [12, 113],
    [16, 201],
    [20, 314],
  ] as const) {
    const n = Math.max(2, Math.ceil(As / area));
    const s = Math.floor(((b - 2 * COVER) / (n - 1)) / 25) * 25;
    if (s >= 100) return { text: `${n} HD${dia} @ ${Math.min(300, s)} each way`, As: n * area, rho: (n * area) / (b * d) };
  }
  return { text: "more steel than a pad usually takes: deepen it", As, rho: As / (b * d) };
}

// N* factored load (kN) from a post of plan size c (mm) onto a square pad
export function designPad(Nstar: number, c: number, site: SiteData, fixed?: { B: number; D: number }, Mstar = 0): FootingResult {
  const qCap = site.phiBearing * site.bearing;
  const tryPad = (B: number, D: number) => {
    const sw = 1.2 * CONC * (B / 1000) ** 2 * (D / 1000);
    const Bm = B / 1000;
    // with a base moment (cantilever post): pressure under the toe, triangular once e > B/6
    const P = Nstar + 0.9 * (sw / 1.2);
    const e = Mstar > 0 ? Mstar / Math.max(P, 1e-6) : 0;
    const qStar = Mstar > 0 ? (e <= Bm / 6 ? (P / (Bm * Bm)) * (1 + (6 * e) / Bm) : e < Bm / 2 ? (2 * P) / (3 * Bm * (Bm / 2 - e)) : Infinity) : (Nstar + sw) / (Bm * Bm);
    const qNet = Nstar / (B / 1000) ** 2; // net upward pressure for the concrete checks
    const d = D - COVER - 16;
    // punching, interior post (alpha_s 20, beta_c 1)
    const cp = c + d;
    const bo = 4 * cp;
    const vc = Math.min((1 / 6) * 3 * Math.sqrt(FC), (1 / 6) * ((20 * d) / bo + 1) * Math.sqrt(FC), (1 / 3) * Math.sqrt(FC));
    const Vp = Nstar * (1 - (cp / B) ** 2);
    const uPunch = Vp > 0 ? (Vp * 1e3) / (0.75 * vc * bo * d) : 0;
    // bending at the post face, and one-way shear at d from the face
    const arm = (B - c) / 2 / 1000;
    const M = (Math.max(qNet, Mstar > 0 ? qStar : 0) * (B / 1000) * arm * arm) / 2;
    const reo = bars(M, B, d);
    const sh = Math.max(0, arm - d / 1000);
    const V1 = qNet * (B / 1000) * sh;
    const uShear = V1 > 0 ? (V1 * 1e3) / (0.75 * vcBeam(reo.rho) * B * d) : 0;
    return { B, D, d, qStar, uBearing: qStar / qCap, uPunch, uShear, reo, M, Vp, V1, vc };
  };
  let best = fixed ? tryPad(fixed.B, fixed.D) : null;
  if (!fixed)
    outer: for (const D of [300, 400, 500, 600]) for (let B = 400; B <= 3000; B += 50) {
      const r = tryPad(B, D);
      best = r;
      if (r.uBearing <= 1 && r.uPunch <= 1 && r.uShear <= 1) break outer;
    }
  const r = best!;
  const notes = [
    `Bearing: φb ${site.phiBearing} × ${site.bearing} kPa ultimate (B1/VM4). ${site.bearing >= 300 ? "NZS 3604 good ground is 300 kPa ultimate: confirm by Scala test (5 blows/100 mm to 2B, 3 below)." : "Confirm with the geotechnical report."}`,
    `Concrete ${FC} MPa, ${COVER} mm cover against ground, 500E bars. Punching at d/2 from a ${Math.round(c)} mm post or base plate (NZS 3101 cl 12.7).`,
  ];
  if (site.expansive !== "none")
    notes.push(
      site.expansive === "moderate"
        ? "Expansive (moderately reactive / TC2) site: NZS 3604 foundations don't apply. Use an enhanced or specifically designed foundation (MBIE TC2 options or AS 2870)."
        : "Highly expansive / TC3 site: specific geotechnical investigation and foundation design required (deep piles or ground improvement).",
    );
  return {
    B: r.B,
    D: r.D,
    qStar: r.qStar,
    qCap,
    uBearing: r.uBearing,
    uPunch: r.uPunch,
    uShear: r.uShear,
    bars: r.reo.text,
    lines: [
      { label: "Pad", value: `${r.B} × ${r.B} × ${r.D} deep` },
      { label: Mstar > 0 ? `Bearing q* max (base moment ${Mstar.toFixed(1)} kNm) / φq` : "Bearing q* / φq", value: `${r.qStar.toFixed(0)} / ${qCap.toFixed(0)} kPa` },
      { label: "Punching V* / φVc", value: `${r.Vp.toFixed(1)} kN · ${(r.uPunch * 100).toFixed(0)}%` },
      { label: "One-way shear", value: `${r.V1.toFixed(1)} kN · ${(r.uShear * 100).toFixed(0)}%` },
      { label: "Bending M* at post face", value: `${r.M.toFixed(1)} kNm` },
      { label: "Reinforcement", value: r.reo.text },
    ],
    notes,
  };
}

// strip footing under a wall: factored line load w* (kN/m)
export function designStrip(wStar: number, site: SiteData, wallTh: number) {
  const qCap = site.phiBearing * site.bearing;
  for (let B = 300; B <= 1500; B += 50) {
    const D = Math.max(200, B >= 600 ? 300 : 200);
    const q = (wStar + 1.2 * CONC * (B / 1000) * (D / 1000)) / (B / 1000);
    if (q <= qCap) {
      const d = D - COVER - 12;
      const arm = (B - wallTh) / 2 / 1000;
      const qNet = wStar / (B / 1000);
      const M = (qNet * arm * arm) / 2; // per metre run
      const reo = bars(M, 1000, d);
      return { B, D, q, qCap, u: q / qCap, lines: [{ label: "Strip footing", value: `${B} wide × ${D} deep` }, { label: "Bearing q* / φq", value: `${q.toFixed(0)} / ${qCap.toFixed(0)} kPa` }, { label: "Line load w*", value: `${wStar.toFixed(1)} kN/m` }, { label: "Transverse steel", value: arm > 0.15 ? `${reo.text.replace(" each way", "")} per metre` : "nominal" }] };
    }
  }
  return { B: 1500, D: 300, q: Infinity, qCap, u: 9, lines: [{ label: "Strip footing", value: "wider than 1.5 m: specific design" }] };
}

// a post standing on a ground slab: punching through the slab (thickness t mm)
export function slabPunch(Nstar: number, c: number, t = 100) {
  const d = t - 30 - 5; // mesh at about mid-upper depth
  const bo = 4 * (c + d);
  const vc = (1 / 3) * Math.sqrt(FC);
  const cap = (0.75 * vc * bo * d) / 1e3;
  // thickening needed: find depth so it passes
  let need = t;
  while (need < 600 && (0.75 * vc * 4 * (c + (need - 35)) * (need - 35)) / 1e3 < Nstar) need += 25;
  return { cap, u: Nstar / cap, need, d };
}
