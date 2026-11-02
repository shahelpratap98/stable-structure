// Rib raft (pod) slab on ground, designed specifically to NZS 3101:2006 and
// B1/VM4. A topping slab over polystyrene pods, with ribs both ways between
// the pods and a thickened edge beam:
//
//   bearing     average pressure under the whole raft, the edge beam under the
//               worst edge wall, a wider rib under each loadbearing internal
//               wall and a thickening under each post, all to phi_b·q_ult
//   ribs        T-beams (flange = rib spacing, web = rib width) designed for
//               loss of support: an internal span Ls (M = wLs²/8 + PLs/4) and
//               an edge cantilever Lc (M = wLc²/2 + P·Lc), where P is a wall
//               line load crossing the rib; flexure phi 0.85 with the ductility
//               limit, minimum steel 1.4/fy, shear vc = (0.07 + 10 rho)√f'c,
//               deflection with Ie = 0.35 Ig
//   topping     one-way between ribs, wL²/10, with at least 0.7/fy·b·t
//               (shrinkage) of mesh
//
// Loss-of-support lengths come from the geotechnical report. Without them the
// app assumes 2.0 m span / 1.0 m cantilever on moderately expansive ground and
// 3.0 / 1.5 m on highly expansive ground, and says so.

import type { SiteData } from "./site";

export type RaftSpec = {
  pod: number; // mm, pod height
  topping: number; // mm
  ribSpacing: number; // mm centres
  ribWidth: number; // mm
  edgeWidth: number; // mm
  edgeDepth?: number; // mm, overall; default the raft depth
  span?: number; // m, internal loss of support (geotechnical report)
  cant?: number; // m, edge loss of support
  fc: number; // MPa
};

export const defaultRaft = (): RaftSpec => ({ pod: 220, topping: 85, ribSpacing: 1200, ribWidth: 100, edgeWidth: 300, fc: 25 });

export type RaftWall = { mark: string; edge: boolean; length: number; wStar: number; G: number; Q: number }; // kN/m
export type RaftPost = { mark: string; Nstar: number }; // kN
export type RaftInput = { Lx: number; Ly: number; Gsup: number; Q: number; walls: RaftWall[]; posts: RaftPost[] }; // m, kPa

const FY = 500;
const CONC = 24; // kN/m³
const FINISHES = 0.3; // kPa, floor finishes on the topping (assumed)
const COVER_BOT = 75; // cast against the ground (DPM over hardfill)
const COVER_TOP = 30; // interior topping

const BARS = [
  [12, 113],
  [16, 201],
  [20, 314],
  [25, 491],
] as const;

const ceil50 = (mm: number) => Math.ceil(mm / 50) * 50;

// As (mm²) to resist M* (kN·m) with compression width b (mm), depth d (mm)
function steelFor(M: number, b: number, d: number, fc: number) {
  const b1 = fc <= 30 ? 0.85 : Math.max(0.65, 0.85 - 0.008 * (fc - 30));
  const k = (FY * FY) / (2 * 0.85 * fc * b);
  const disc = (FY * d) ** 2 - 4 * k * ((M * 1e6) / 0.85);
  const req = M <= 0 ? 0 : disc > 0 ? (FY * d - Math.sqrt(disc)) / (2 * k) : Infinity;
  const AsMax = (0.85 * fc * b * 0.375 * b1 * d) / FY;
  return { req, AsMax };
}

// bars that fit in a rib of width bw (25 mm side cover to the pods)
function ribBars(As: number, bw: number) {
  for (const n of [1, 2, 3])
    for (const [dia, area] of BARS) {
      if (n * area < As) continue;
      if (n * dia + (n - 1) * Math.max(25, dia) > bw - 50) continue;
      return { text: `${n} HD${dia}`, area: n * area };
    }
  return null;
}

export function lossOfSupport(spec: RaftSpec, site: SiteData) {
  const auto = site.expansive === "high" ? { span: 3.0, cant: 1.5 } : site.expansive === "moderate" ? { span: 2.0, cant: 1.0 } : { span: 0, cant: 0 };
  const entered = spec.span !== undefined || spec.cant !== undefined;
  return { span: spec.span ?? auto.span, cant: spec.cant ?? auto.cant, entered, auto };
}

export function raftSelfWeight(s: RaftSpec) {
  const r = s.ribWidth / s.ribSpacing;
  return CONC * (s.topping / 1000 + (s.pod / 1000) * (2 * r - r * r)); // kPa: topping plus ribs both ways
}

export function designRaft(s: RaftSpec, inp: RaftInput, site: SiteData) {
  const D = s.pod + s.topping;
  const De = s.edgeDepth ?? D;
  const qCap = site.phiBearing * site.bearing;
  const sw = raftSelfWeight(s);
  const G = sw + FINISHES + inp.Gsup;
  const A = inp.Lx * inp.Ly;
  const perim = 2 * (inp.Lx + inp.Ly);
  const edgeSW = Math.max(0, CONC * (s.edgeWidth / 1000) * (De / 1000) - sw * (s.edgeWidth / 1000)); // edge beam weight over the slab average, kN/m
  const area = (g: number, q: number) => Math.max(1.35 * g, 1.2 * g + 1.5 * q);

  // overall bearing
  const Wstar = area(G, inp.Q) * A + 1.2 * edgeSW * perim + inp.walls.reduce((a, w) => a + w.wStar * w.length, 0) + inp.posts.reduce((a, p) => a + p.Nstar, 0);
  const qAvg = Wstar / Math.max(A, 1e-6);
  const uAvg = qAvg / qCap;

  // edge beam bearing under the worst edge wall, plus half a rib bay of slab
  const edgeWalls = inp.walls.filter((w) => w.edge);
  const wEdge = Math.max(0, ...edgeWalls.map((w) => w.wStar));
  const edgeLine = wEdge + 1.2 * CONC * (s.edgeWidth / 1000) * (De / 1000) + area(G, inp.Q) * (s.ribSpacing / 2000);
  const qEdge = edgeLine / (s.edgeWidth / 1000);
  const uEdge = qEdge / qCap;
  const edgeNeed = ceil50((edgeLine / qCap) * 1000);

  // internal loadbearing walls: a rib wide enough to bear the wall
  const internal = inp.walls.filter((w) => !w.edge);
  const wideRibs = internal
    .map((w) => {
      const own = 1.2 * CONC * (D / 1000); // the widened rib's own weight per m of width
      const need = ceil50((w.wStar / Math.max(1, qCap - own)) * 1000);
      return { mark: w.mark, width: need > s.ribWidth ? Math.max(need, 200) : s.ribWidth };
    })
    .filter((r) => r.width > s.ribWidth);

  // posts: on a rib intersection (two ribs, a bay each way) if that bears it, else a square thickening
  const ownD = 1.2 * CONC * (D / 1000);
  const ribCross = ((2 * s.ribSpacing - s.ribWidth) * s.ribWidth) / 1e6; // m²
  const crossCap = ribCross * Math.max(0, qCap - ownD);
  const thick = inp.posts.map((p) => ({
    mark: p.mark,
    N: p.Nstar,
    side: p.Nstar <= crossCap ? 0 : Math.max(600, ceil50(Math.sqrt(p.Nstar / Math.max(1, qCap - ownD)) * 1000)),
  }));

  // ribs for loss of support
  const los = lossOfSupport(s, site);
  const sp = s.ribSpacing / 1000;
  const wRib = area(G, inp.Q) * sp; // kN/m per rib
  const wRibS = (G + 0.4 * inp.Q) * sp; // long-term serviceability
  const wInt = Math.max(0, ...internal.map((w) => w.wStar));
  const wIntS = Math.max(0, ...internal.map((w) => w.G + 0.4 * w.Q));
  const wEdgeS = Math.max(0, ...edgeWalls.map((w) => w.G + 0.4 * w.Q));
  const Pint = wInt * sp,
    Pedge = wEdge * sp;
  const Msag = (wRib * los.span ** 2) / 8 + (Pint * los.span) / 4;
  const Mhog = (wRib * los.cant ** 2) / 2 + Pedge * los.cant;
  const V = Math.max(wRib * los.span / 2 + Pint / 2, wRib * los.cant + Pedge);
  const dBot = D - COVER_BOT - 8,
    dTop = D - COVER_TOP - 8;
  const minAs = (d: number) => (1.4 / FY) * s.ribWidth * d;
  const sag = steelFor(Msag, s.ribSpacing, dBot, s.fc); // compression in the topping
  const hog = steelFor(Mhog, s.ribWidth, dTop, s.fc); // compression at the bottom of the rib
  const bot = ribBars(Math.max(sag.req, minAs(dBot)), s.ribWidth);
  const top = ribBars(Math.max(hog.req, minAs(dTop)), s.ribWidth);
  const uSag = Math.max(sag.req / sag.AsMax, bot ? Math.max(sag.req, minAs(dBot)) / bot.area : 1.01);
  const uHog = Math.max(hog.req / hog.AsMax, top ? Math.max(hog.req, minAs(dTop)) / top.area : 1.01);
  const rho = (bot?.area ?? 113) / (s.ribWidth * dBot);
  const vb = Math.min(0.2, Math.max(0.08, 0.07 + 10 * rho)) * Math.sqrt(Math.min(s.fc, 50));
  const Vc = (vb * s.ribWidth * dBot) / 1e3;
  const phiVc = 0.75 * Vc;
  // stirrups where the ribs need them: R6 closed ties (two legs, 300 MPa)
  let stirrups = "";
  let uShear = V / phiVc;
  if (uShear > 1) {
    const Vs = V / 0.75 - Vc;
    const tie = Math.max(75, Math.floor(Math.min((56.5 * 300 * dBot) / (Vs * 1e3), dBot / 2) / 25) * 25);
    const Vsp = (56.5 * 300 * dBot) / tie / 1e3;
    const vMax = (0.75 * Math.min(0.2 * s.fc, 8) * s.ribWidth * dBot) / 1e3;
    uShear = Math.max(V / (0.75 * (Vc + Vsp)), V / vMax);
    stirrups = `R6 ties @ ${tie} crs in the ribs`;
  }

  // stiffness of one rib as a T-beam, cracked
  const bf = s.ribSpacing,
    t = s.topping,
    bw = s.ribWidth;
  const Af = bf * t,
    Aw = bw * s.pod;
  const ybar = (Af * (t / 2) + Aw * (t + s.pod / 2)) / (Af + Aw); // from the top
  const Ig = (bf * t ** 3) / 12 + Af * (ybar - t / 2) ** 2 + (bw * s.pod ** 3) / 12 + Aw * (t + s.pod / 2 - ybar) ** 2;
  const Ec = 4700 * Math.sqrt(s.fc);
  const EI = (Ec * 0.35 * Ig) / 1e9; // kN·m²
  const Ps = wIntS * sp,
    PsE = wEdgeS * sp;
  const dSpan = los.span > 0 ? ((5 * wRibS * los.span ** 4) / (384 * EI) + (Ps * los.span ** 3) / (48 * EI)) * 1000 : 0;
  const dCant = los.cant > 0 ? ((wRibS * los.cant ** 4) / (8 * EI) + (PsE * los.cant ** 3) / (3 * EI)) * 1000 : 0;
  const uDefl = Math.max(los.span > 0 ? dSpan / ((los.span * 1000) / 300) : 0, los.cant > 0 ? dCant / ((los.cant * 1000) / 150) : 0);

  // topping between ribs
  const Lt = (s.ribSpacing - s.ribWidth) / 1000;
  const wt = area(CONC * (t / 1000) + FINISHES + inp.Gsup, inp.Q);
  const Mt = (wt * Lt * Lt) / 10;
  const mesh = Math.max(steelFor(Mt, 1000, t - 30 - 4, s.fc).req, (0.7 / FY) * 1000 * t);

  const utils = [
    { label: "Bearing (average)", u: uAvg },
    { label: "Edge beam bearing", u: uEdge },
    ...(los.span > 0 || los.cant > 0
      ? [
          { label: "Rib bending (sagging)", u: uSag },
          { label: "Rib bending (hogging)", u: uHog },
          { label: "Rib shear", u: uShear },
          { label: "Deflection over loss of support", u: uDefl },
        ]
      : []),
  ];
  const util = Math.max(...utils.map((u) => u.u));
  const gov = utils.find((u) => u.u === util)?.label ?? "";
  const losText =
    los.span > 0 || los.cant > 0
      ? `span ${los.span.toFixed(1)} m, edge cantilever ${los.cant.toFixed(1)} m${los.entered ? "" : ` (assumed for ${site.expansive === "high" ? "highly" : "moderately"} expansive ground: set from the geotechnical report)`}`
      : "none: non-expansive, good ground (ribs nominal)";

  const lines = [
    { label: "Raft", value: `${inp.Lx.toFixed(2)} × ${inp.Ly.toFixed(2)} m, ${D} deep (${s.pod} pods + ${s.topping} topping), f'c ${s.fc} MPa` },
    { label: "Ribs", value: `${s.ribWidth} wide @ ${s.ribSpacing} crs both ways` },
    { label: "Edge beam", value: `${Math.max(s.edgeWidth, edgeNeed)} wide × ${De} deep${edgeNeed > s.edgeWidth ? ` (widened from ${s.edgeWidth} for bearing)` : ""}` },
    { label: "Self-weight", value: `${sw.toFixed(2)} kPa + ${FINISHES} kPa finishes` },
    { label: "Bearing q* average / φq", value: `${qAvg.toFixed(0)} / ${qCap.toFixed(0)} kPa` },
    { label: "Edge beam q* / φq", value: `${qEdge.toFixed(0)} / ${qCap.toFixed(0)} kPa (w* ${edgeLine.toFixed(1)} kN/m)` },
    { label: "Loss of support", value: losText },
    ...(los.span > 0 || los.cant > 0
      ? [
          { label: "Rib M* sagging / hogging", value: `${Msag.toFixed(1)} / ${Mhog.toFixed(1)} kNm` },
          { label: "Rib V* / φVc", value: `${V.toFixed(1)} / ${phiVc.toFixed(1)} kN` },
          { label: "Deflection span / cantilever", value: `${dSpan.toFixed(1)} mm (L/300 ${((los.span * 1000) / 300).toFixed(1)}) / ${dCant.toFixed(1)} mm (L/150 ${((los.cant * 1000) / 150).toFixed(1)})` },
        ]
      : []),
    { label: "Rib bottom bar", value: bot ? `${bot.text} (As ${Math.max(sag.req, minAs(dBot)).toFixed(0)} mm² req)` : "does not fit: widen the ribs" },
    { label: "Rib top bar", value: top ? `${top.text} (As ${Math.max(hog.req, minAs(dTop)).toFixed(0)} mm² req)` : "does not fit: widen the ribs" },
    ...(stirrups ? [{ label: "Rib shear reinforcement", value: stirrups }] : []),
    { label: "Topping mesh", value: `at least ${mesh.toFixed(0)} mm²/m each way, 30 cover` },
    ...(wideRibs.length ? [{ label: "Wider ribs under walls", value: wideRibs.map((r) => `${r.mark} ${r.width}`).join(", ") }] : []),
    ...(thick.length ? [{ label: "Under posts", value: thick.map((p) => (p.side ? `${p.mark} ${p.side}×${p.side} thickening` : `${p.mark} on a rib intersection`)).join(", ") }] : []),
  ];

  return {
    util,
    gov,
    utils,
    lines,
    D,
    sw,
    thick,
    wideRibs,
    los,
    Msag,
    Mhog,
    bot,
    top,
    checks: [
      { name: "Average bearing", demand: qAvg, capacity: qCap, unit: "kPa", ratio: uAvg },
      { name: "Edge beam bearing", demand: qEdge, capacity: qCap, unit: "kPa", ratio: uEdge },
    ],
    notes: [
      `Rib raft to NZS 3101:2006 and B1/VM4: ribs as T-beams for loss of support (flexure φ 0.85, shear φ 0.75, Ie 0.35Ig), bearing φb ${site.phiBearing} × ${site.bearing} kPa. Pods on compacted hardfill and a DPM; cover 75 to rib bottoms, 30 to the topping.`,
      "Proprietary pod systems (e.g. Firth RibRaft®): confirm pod and rib sizes, mesh, edge details and hardfill with the supplier's current details.",
      ...(site.expansive !== "none" && !los.entered ? ["Expansive ground: the loss-of-support span and cantilever are assumptions until the geotechnical engineer gives them."] : []),
      "On TC2 or TC3 land, follow MBIE's guidance for Canterbury and the site's geotechnical report.",
    ],
  };
}
