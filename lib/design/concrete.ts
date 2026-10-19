// Reinforced concrete beams to NZS 3101:2006 (non-seismic gravity beams):
//   flexure  phi 0.85, stress block alpha1 0.85 / beta1 (cl 7.4.2.7), As from
//            M* = phi·As·fy·(d - a/2), ductility a <= 0.375·beta1·d
//   minimum  As >= max(√f'c/(4 fy), 1.4/fy)·b·d (cl 9.3.8.2.1)
//   shear    phi 0.75, vc = (0.07 + 10 rho)√f'c within 0.08–0.2√f'c
//            (cl 9.3.9.3.4), v <= min(0.2 f'c, 8 MPa); stirrups R10 or HD10
//   deflection by span/depth: L/16, /18.5, /21, cantilever /8, × (0.4 + fy/700)
// Analysis on the frame solver with live load patterned.

import { solveBeam } from "./frame";

export type ConcreteSpec = { L: number; supports: number[]; b: number; D: number; fc: number; G: number; Q: number; points: { at: number; G: number; Q: number }[] };
const FY = 500,
  FYT = 500,
  COVER = 40, // mm to stirrups, interior / sheltered
  STIR = 10;

const BARS: [number, number][] = [
  [12, 113],
  [16, 201],
  [20, 314],
  [25, 491],
  [32, 804],
];

function flexBars(M: number, b: number, d: number, fc: number) {
  const a1 = 0.85,
    b1 = fc <= 30 ? 0.85 : Math.max(0.65, 0.85 - 0.008 * (fc - 30));
  const k = (FY * FY) / (2 * a1 * fc * b);
  const disc = (FY * d) ** 2 - 4 * k * ((M * 1e6) / 0.85);
  const req = M <= 0 ? 0 : disc > 0 ? (FY * d - Math.sqrt(disc)) / (2 * k) : Infinity;
  const min = Math.max((Math.sqrt(fc) / (4 * FY)) * b * d, (1.4 * b * d) / FY);
  const As = Math.max(req, M > 0 ? min : 0);
  const aMax = 0.375 * b1 * d;
  const AsMax = (a1 * fc * b * aMax) / FY;
  const ok = req <= AsMax;
  let text = "";
  for (const [dia, area] of BARS) {
    const n = Math.max(2, Math.ceil(As / area));
    const clear = (b - 2 * COVER - 2 * STIR - n * dia) / Math.max(1, n - 1);
    if (clear >= Math.max(25, dia)) {
      text = `${n} HD${dia}`;
      return { As, req, n, dia, text, ok, AsMax, prov: n * area };
    }
  }
  return { As, req, n: 0, dia: 0, text: "more than one layer: specific detailing", ok: false, AsMax, prov: As };
}

export function designConcreteBeam(s: ConcreteSpec) {
  const d = s.D - COVER - STIR - 10; // to the centre of a 20 bar layer
  const sw = (24 * s.b * s.D) / 1e6; // kN/m
  const G = s.G + sw;
  const sup = [...new Set(s.supports)].sort((a, b) => a - b);
  const bounds = [...new Set([0, ...sup, s.L])].sort((a, b) => a - b);
  const regions = bounds.slice(0, -1).map((x0, k) => [x0, bounds[k + 1]] as const);
  const beam = { length: s.L, supports: sup, EI: 1 };
  const cuts = s.points.map((q) => q.at);
  const run = (w: (x0: number, x1: number) => number, pts: { at: number; P: number }[]) => solveBeam(beam, w, pts, 160, cuts, false);
  const inR = (k: number) => (x0: number, x1: number) => (x0 >= regions[k][0] - 1e-9 && x1 <= regions[k][1] + 1e-9 ? 1 : 0);
  const patterns = [regions.map((_, k) => k), regions.map((_, k) => k).filter((k) => k % 2 === 0), regions.map((_, k) => k).filter((k) => k % 2 === 1)].filter((p) => p.length);
  const U = run(() => 1, []);
  const R = regions.map((_, k) => run(inR(k), []));
  const ptsG = run(() => 0, s.points.map((q) => ({ at: q.at, P: q.G })));
  const ptsQ = run(() => 0, s.points.map((q) => ({ at: q.at, P: q.Q })));
  let Mpos = 0,
    Mneg = 0,
    V = 0;
  for (const [g, q] of [
    [1.35, 0],
    [1.2, 1.5],
  ] as const)
    for (const pat of patterns) {
      const M = U.stations.map((st, i) => g * G * st.M + pat.reduce((a, k) => a + q * s.Q * R[k].stations[i].M, 0) + g * ptsG.stations[i].M + q * ptsQ.stations[i].M);
      const Vs = U.stations.map((st, i) => g * G * st.V + pat.reduce((a, k) => a + q * s.Q * R[k].stations[i].V, 0) + g * ptsG.stations[i].V + q * ptsQ.stations[i].V);
      Mpos = Math.max(Mpos, ...M);
      Mneg = Math.max(Mneg, ...M.map((m) => -m));
      V = Math.max(V, ...Vs.map(Math.abs));
    }
  const bot = flexBars(Mpos, s.b, d, s.fc);
  const top = Mneg > 0.5 ? flexBars(Mneg, s.b, d, s.fc) : null;
  const rho = bot.prov / (s.b * d);
  const vb = Math.min(0.2, Math.max(0.08, 0.07 + 10 * rho)) * Math.sqrt(Math.min(s.fc, 50));
  const Vc = (vb * s.b * d) / 1e3;
  const vMax = Math.min(0.2 * s.fc, 8);
  const uVmax = (V * 1e3) / (0.75 * s.b * d) / vMax;
  const Vs = Math.max(0, V / 0.75 - Vc);
  const Av = 2 * 78.5; // two legs of HD10
  const sMax = Math.min(0.5 * d, 600);
  const sReq = Vs > 0 ? (Av * FYT * d) / (Vs * 1e3) : Infinity;
  const sMin = (Av * FYT) / ((1 / 16) * Math.sqrt(s.fc) * s.b); // nominal stirrups
  const sp = Math.max(75, Math.floor(Math.min(sReq, sMax, sMin) / 25) * 25);
  // span/depth
  const mult = 0.4 + FY / 700;
  let uDefl = 0;
  regions.forEach(([x0, x1]) => {
    const len = (x1 - x0) * 1000;
    const leftSup = sup.some((x) => Math.abs(x - x0) < 1e-6),
      rightSup = sup.some((x) => Math.abs(x - x1) < 1e-6);
    const cont = (x0 > 1e-6 && leftSup ? 1 : 0) + (x1 < s.L - 1e-6 && rightSup ? 1 : 0);
    const ratio = !leftSup || !rightSup ? 8 : cont === 2 ? 21 : cont === 1 ? 18.5 : 16;
    uDefl = Math.max(uDefl, (len * mult) / ratio / s.D);
  });
  const uM = Math.max(bot.req / bot.AsMax, top ? top.req / top.AsMax : 0);
  // unfactored reactions at each support (dead everywhere, live as the worst pattern)
  const at = (r: { reactions: { at: number; R: number }[] }, x: number) => r.reactions.find((q) => Math.abs(q.at - x) < 1e-6)?.R ?? 0;
  const reactions = sup.map((x) => ({
    at: x,
    loads: { G: G * at(U, x) + at(ptsG, x), Qf: Math.max(...patterns.map((pat) => pat.reduce((a, k) => a + s.Q * at(R[k], x), 0))) + at(ptsQ, x), Qr: 0, S: 0 },
  }));
  const util = Math.max(uM, uVmax, uDefl);
  return {
    util,
    gov: util === uM ? "Bending (ductility limit)" : util === uVmax ? "Shear (max stress)" : "Span/depth",
    utils: [
      { label: "Bending", u: uM },
      { label: "Shear", u: uVmax },
      { label: "Span/depth", u: uDefl },
    ],
    lines: [
      { label: "Section", value: `${s.b} wide × ${s.D} deep, f'c ${s.fc} MPa, d ${d} mm` },
      { label: "M* sagging / hogging", value: `${Mpos.toFixed(1)} / ${Mneg.toFixed(1)} kNm` },
      { label: "Bottom steel", value: `${bot.text} (As ${bot.As.toFixed(0)} mm² req${bot.As > bot.req + 0.5 ? ", minimum steel" : ""})` },
      ...(top ? [{ label: "Top steel over supports", value: `${top.text} (As ${top.As.toFixed(0)} mm² req${top.As > top.req + 0.5 ? ", minimum steel" : ""})` }] : [{ label: "Top steel", value: "2 HD12 (hangers)" }]),
      { label: "V* / φVc", value: `${V.toFixed(1)} / ${(0.75 * Vc).toFixed(1)} kN` },
      { label: "Stirrups", value: `HD10 two legs @ ${sp} crs${Vs > 0 ? "" : " (nominal)"}` },
    ],
    G,
    sw,
    reactions,
    notes: [
      `NZS 3101:2006 gravity beam: flexure φ 0.85 with α1 0.85, ductility a ≤ 0.375β1·d; shear φ 0.75, vc = (0.07 + 10ρ)√f'c; min steel per cl 9.3.8.2.1; deflection by span/depth (× ${mult.toFixed(2)} for 500E). Cover ${COVER} mm to stirrups (interior: check against the exposure zone, NZS 3101 Table 3.6). Not a ductile seismic frame member.`,
    ],
  };
}
