// Preliminary design calculations, following Stable Structure's own framing
// models (Lot 6 engine and the 26121 basis):
//   - beams and lintels: tributary loads, combinations 1.35G, 1.2G+1.5Q,
//     1.2G+1.5Qr+0.4Q, 1.2G+Su+0.4Q; bending, shear, long / short-term and
//     point-load deflection; sizes picked in the order SG8 -> hySPAN -> steel
//   - wall openings make their own lintels
//   - joist zones and single joists / rafters
//   - posts: SG8 stud packs then SHS, buckling k12 and bearing
//   - loads passed from beam ends to posts, piles and footings
// Bracing and retaining walls are in bracing.ts and retaining.ts.
// Every result is preliminary until checked by a CPEng (see DRAFT_NOTE).

import { braceCalcs, type BracingSheet } from "./bracing";
import { solveBeam } from "./frame";
import { candidates, fixedCandidate, FAMILY_LABEL, FY, ES, SG8, type Candidate } from "./materials";
import { along, describeMember, framingTop, MEMBER_INFO, memberLength, type DesignModel, type DesignParams, type Level, type Member, type Opening, type Pt, type Sizing, type Trib } from "./model";
import { retainingCalc } from "./retaining";

export { parseTimberSection, SG8_DEPTHS } from "./materials";

export const DRAFT_NOTE =
  "Preliminary design. Members outside NZS 3604 (hySPAN, steel, posts carrying beams) are specific engineering design and need checking and a PS1 from a CPEng before consent.";

export type Status = "pass" | "close" | "fail" | "none";
export type Line = { label: string; value: string; note?: string };
export type Check = { name: string; demand: number; capacity: number; unit: string; ratio: number };
export type Util = { label: string; u: number };
export type Loads = { G: number; Qf: number; Qr: number; S: number };
export type SecInfo = { name: string; fam: Candidate["fam"] | "SHS" | "other"; b: number; d: number; tw?: number; tf?: number };
export type PointLoad = { at: number; G: number; Qf: number; Qr: number; S: number; from: string }; // at: m from end a
export type SeqRow = { family: string; text: string; util: number | null; pass: boolean; chosen: boolean };

export type Result = {
  memberId: string;
  mark: string;
  status: Status;
  ratio: number | null; // governing utilisation
  summary: string;
  sec?: SecInfo; // chosen (auto) or checked (fixed) section
  govName?: string;
  utils: Util[];
  kv: Line[];
  inputs: Line[];
  loads: Line[];
  checks: Check[];
  seq?: SeqRow[];
  notes: string[];
  ends?: { a: Loads; b: Loads }; // unfactored reactions at each end (beams); axial at both for supports
  carried?: PointLoad[]; // point loads from members bearing on this one
  supportLoads?: { at: number; loads: Loads }[]; // beams over more than two supports: reaction at each (m from end 1)
  bu?: { W: number; E: number; line: string; dir: "along" | "across" };
};

// A lintel made by an opening in a wall. Its id is "<wall id>#<opening id>".
export type VirtualLintel = { id: string; wall: Member; opening: Opening; member: Member };

export type Calcs = {
  results: Map<string, Result>;
  lintels: VirtualLintel[];
  bracing: BracingSheet[];
};

const fmt = (n: number, dp = 2) => (Number.isFinite(n) ? n.toFixed(dp) : "–");

export function statusFor(ratio: number | null): Status {
  if (ratio === null || !Number.isFinite(ratio)) return "none";
  if (ratio > 1) return "fail";
  if (ratio > 0.9) return "close";
  return "pass";
}

function levelAbove(model: DesignModel, level: Level | undefined) {
  if (!level) return undefined;
  return [...model.levels].filter((l) => l.elevation > level.elevation + 1e-6).sort((a, b) => a.elevation - b.elevation)[0];
}
const levelOf = (model: DesignModel, id: string) => model.levels.find((l) => l.id === id);

// Each level holds the posts and walls of that storey and the framing at its
// top. So framing on a level carries the surface above it: the roof when the
// next level up is a roof (or it is the roof level), otherwise a floor.
export function loadKind(model: DesignModel, level: Level | undefined): "floor" | "roof" {
  if (!level) return "floor";
  if (level.kind === "roof") return "roof";
  return levelAbove(model, level)?.kind === "roof" ? "roof" : "floor";
}

// ---------------------------------------------------------------- loads

export function lineLoads(t: Trib, p: DesignParams, extraG = 0, extraQ = 0): Loads {
  let G = extraG,
    Qf = extraQ,
    Qr = 0,
    S = 0;
  if (t.floor) {
    G += t.floor * p.Gf;
    Qf += t.floor * p.Qf;
  }
  if (t.wet) G += t.wet * (p.Gwet - p.Gf);
  if (t.wallExt) G += t.wallExt * p.gWallExt * p.wallHeight;
  if (t.wallInt) G += t.wallInt * p.gWallInt * p.wallHeight;
  if (t.roof) {
    G += t.roof * p.Groof;
    Qr += t.roof * p.Qroof;
    S += t.roof * p.Su;
  }
  return { G, Qf, Qr, S };
}

type Combo = { name: string; w: number; k1: number; pf: number; G: number; Qf: number; Qr: number; S: number };

function combos(l: Loads, p: DesignParams, point: boolean, extra: Loads = { G: 0, Qf: 0, Qr: 0, S: 0 }): Combo[] {
  const any = { Qf: l.Qf + extra.Qf, Qr: l.Qr + extra.Qr, S: l.S + extra.S };
  const c: Combo[] = [{ name: "1.35G", w: 1.35 * l.G, k1: 0.6, pf: 0, G: 1.35, Qf: 0, Qr: 0, S: 0 }];
  if (any.Qf > 0 || (point && p.Ppt > 0)) c.push({ name: "1.2G+1.5Q", w: 1.2 * l.G + 1.5 * l.Qf, k1: 0.8, pf: 1.5, G: 1.2, Qf: 1.5, Qr: 0, S: 0 });
  if (any.Qr > 0) c.push({ name: "1.2G+1.5Qr+0.4Q", w: 1.2 * l.G + 1.5 * l.Qr + 0.4 * l.Qf, k1: p.k1Roof, pf: 0.4, G: 1.2, Qf: 0.4, Qr: 1.5, S: 0 });
  if (any.S > 0) c.push({ name: "1.2G+Su+0.4Q", w: 1.2 * l.G + l.S + 0.4 * l.Qf, k1: 0.8, pf: 0.4, G: 1.2, Qf: 0.4, Qr: 0, S: 1 });
  return c;
}

// ---------------------------------------------------------------- beams

type BeamCheck = {
  sec: Candidate;
  ok: boolean;
  util: number;
  uM: number;
  uV: number;
  uDl: number;
  uDs: number;
  uDp: number;
  M: number;
  phiM: number;
  V: number;
  phiV: number;
  dl: number;
  limL: number;
  ds: number;
  limS: number;
  dP: number;
  gov: string;
  govName: string;
  l: Loads;
  sw: number;
  endA: Loads; // unfactored reactions, the midspan point load included as Qf
  endB: Loads;
  reactions?: { at: number; loads: Loads }[]; // every support, for beams over more than two
};

function selfWeight(sec: Candidate) {
  return "steel" in sec ? (sec.steel.kgm * 9.81) / 1000 : sec.b * sec.d * 1e-6 * sec.mat.dens;
}

const pointComp = (c: Combo, q: PointLoad) => c.G * q.G + c.Qf * q.Qf + c.Qr * q.Qr + c.S * q.S;

function checkBeam(span: number, base: Loads, sec: Candidate, p: DesignParams, opts: { point: boolean; dlim?: number; selfWeight?: boolean; points?: PointLoad[]; supports?: number[] }): BeamCheck {
  if (opts.supports && !(opts.supports.length === 2 && opts.supports[0] < 1e-6 && Math.abs(opts.supports[1] - span) < 1e-6)) return checkMulti(span, opts.supports, base, sec, p, opts);
  const L = span;
  const Lmm = L * 1000;
  // Floor and roof dead loads already include joists and rafters.
  const sw = opts.selfWeight === false ? 0 : selfWeight(sec);
  const l = { ...base, G: base.G + sw };
  const P = opts.point ? p.Ppt : 0;
  const pts = (opts.points ?? []).filter((q) => q.at > 0 && q.at < L);
  const sum = pts.reduce((a, q) => ({ G: a.G + q.G, Qf: a.Qf + q.Qf, Qr: a.Qr + q.Qr, S: a.S + q.S }), { G: 0, Qf: 0, Qr: 0, S: 0 });
  const cs = combos(l, p, opts.point, sum);
  const EI = "steel" in sec ? ES * sec.steel.Ix : (sec.mat.E * sec.b * sec.d ** 3) / 12;
  const k2 = "steel" in sec ? 1 : sec.mat.k2;
  // simply supported: moment at x from a point load P at a
  const mPt = (x: number, a: number) => (x <= a ? ((L - a) * x) / L : (a * (L - x)) / L);
  // deflections (mm) at x (mm): UDL w (N/mm), point load F (N) at a (mm)
  const dUdl = (w: number, x: number) => (w * x * (Lmm ** 3 - 2 * Lmm * x * x + x ** 3)) / (24 * EI);
  const dPt = (F: number, a: number, x: number) => {
    const b = Lmm - a;
    return x <= a ? (F * b * x * (Lmm * Lmm - b * b - x * x)) / (6 * Lmm * EI) : (F * a * (Lmm - x) * (Lmm * Lmm - a * a - (Lmm - x) ** 2)) / (6 * Lmm * EI);
  };
  const xs = pts.length ? [...Array.from({ length: 41 }, (_, i) => (L * i) / 40), ...pts.map((q) => q.at)] : [L / 2];

  let uM = 0,
    uV = 0,
    gov = cs[0].name,
    Mg = 0,
    phiMg = 0,
    Vg = 0,
    phiVg = 0;
  for (const c of cs) {
    let M = 0;
    for (const x of xs) {
      const m = (c.w * x * (L - x)) / 2 + c.pf * P * mPt(x, L / 2) + pts.reduce((acc, q) => acc + pointComp(c, q) * mPt(x, q.at), 0);
      if (m > M) M = m;
    }
    const RA = (c.w * L) / 2 + (c.pf * P) / 2 + pts.reduce((acc, q) => acc + (pointComp(c, q) * (L - q.at)) / L, 0);
    const RB = (c.w * L) / 2 + (c.pf * P) / 2 + pts.reduce((acc, q) => acc + (pointComp(c, q) * q.at) / L, 0);
    const V = Math.max(RA, RB);
    let phiM: number, phiV: number;
    if ("steel" in sec) {
      phiM = (0.9 * sec.steel.fy * sec.steel.Ze) / 1e6;
      phiV = (0.9 * 0.6 * FY * sec.steel.d * sec.steel.tw) / 1e3;
    } else {
      const t = sec.mat;
      phiM = (t.phi * c.k1 * t.fb * sec.b * sec.d * sec.d) / 6 / 1e6;
      phiV = (t.phi * c.k1 * t.fs * (2 / 3) * sec.b * sec.d) / 1e3;
    }
    if (M / phiM > uM) {
      uM = M / phiM;
      gov = c.name;
      Mg = M;
      phiMg = phiM;
    }
    if (V / phiV > uV) {
      uV = V / phiV;
      Vg = V;
      phiVg = phiV;
    }
  }
  const dP = (P * 1e3 * Lmm ** 3) / (48 * EI);
  let dl = 0,
    ds = 0;
  for (const x of xs) {
    const xm = x * 1000;
    const dlx = k2 * (dUdl(l.G + 0.4 * l.Qf, xm) + pts.reduce((acc, q) => acc + dPt((q.G + 0.4 * q.Qf) * 1e3, q.at * 1000, xm), 0)) + 0.4 * k2 * dPt(P * 1e3, Lmm / 2, xm);
    const dsx = dUdl(0.7 * (l.Qf + l.Qr), xm) + pts.reduce((acc, q) => acc + dPt(0.7 * (q.Qf + q.Qr) * 1e3, q.at * 1000, xm), 0) + 0.7 * dPt(P * 1e3, Lmm / 2, xm);
    if (dlx > dl) dl = dlx;
    if (dsx > ds) ds = dsx;
  }
  const limL = Math.min(Lmm / 300, opts.dlim || p.dAbs || 1e9);
  const limS = Lmm / 360;
  const uDl = dl / limL;
  const uDs = ds / limS;
  const uDp = P > 0 && p.dPlim > 0 ? dP / p.dPlim : 0;
  const util = Math.max(uM, uV, uDl, uDs, uDp);
  const govName = util === uM ? "Bending" : util === uV ? "Shear" : util === uDl ? "Long-term δ" : util === uDs ? "Short-term δ" : "Point-load δ";
  const half = { G: (l.G * L) / 2, Qf: (l.Qf * L) / 2 + P / 2, Qr: (l.Qr * L) / 2, S: (l.S * L) / 2 };
  const share = (frac: (q: PointLoad) => number): Loads =>
    pts.reduce((a, q) => ({ G: a.G + q.G * frac(q), Qf: a.Qf + q.Qf * frac(q), Qr: a.Qr + q.Qr * frac(q), S: a.S + q.S * frac(q) }), { ...half });
  const endA = share((q) => (L - q.at) / L);
  const endB = share((q) => q.at / L);
  return { sec, ok: util <= 1, util, uM, uV, uDl, uDs, uDp, M: Mg, phiM: phiMg, V: Vg, phiV: phiVg, dl, limL, ds, limS, dP, gov, govName, l, sw, endA, endB };
}

// Beams over more than two supports, or with an overhang: solved with the
// frame solver. Moments don't depend on EI for a prismatic beam, so each
// unit load case is solved once (EI = 1) and combined per combination; live
// load is patterned (all spans, odd spans, even spans).
type MultiCase = { M: number[]; V: number[]; d: number[]; R: number[] };
function checkMulti(L: number, supports: number[], base: Loads, sec: Candidate, p: DesignParams, opts: { point: boolean; dlim?: number; selfWeight?: boolean; points?: PointLoad[] }): BeamCheck {
  const sup = [...new Set(supports.map((s) => Math.round(s * 1e4) / 1e4))].sort((a, b) => a - b);
  const sw = opts.selfWeight === false ? 0 : selfWeight(sec);
  const l = { ...base, G: base.G + sw };
  const P = opts.point ? p.Ppt : 0;
  const pts = (opts.points ?? []).filter((q) => q.at > 0 && q.at < L);
  const sum = pts.reduce((a, q) => ({ G: a.G + q.G, Qf: a.Qf + q.Qf, Qr: a.Qr + q.Qr, S: a.S + q.S }), { G: 0, Qf: 0, Qr: 0, S: 0 });
  const cs = combos(l, p, opts.point, sum);
  const EI = ("steel" in sec ? ES * sec.steel.Ix : (sec.mat.E * sec.b * sec.d ** 3) / 12) / 1e9; // kN·m²
  const k2 = "steel" in sec ? 1 : sec.mat.k2;
  // regions between supports and to the free ends
  const bounds = [...new Set([0, ...sup, L])].sort((a, b) => a - b);
  const regions = bounds.slice(0, -1).map((x0, k) => ({ x0, x1: bounds[k + 1], cant: !sup.includes(x0) || !sup.includes(bounds[k + 1]) }));
  const mids = regions.map((r) => (r.cant ? (sup.includes(r.x0) ? r.x1 : r.x0) : (r.x0 + r.x1) / 2)); // Ppt at mid-span, or the tip of an overhang
  const cuts = [...pts.map((q) => q.at), ...mids];
  const beam = { length: L, supports: sup, EI: 1 };
  const run = (w: (x0: number, x1: number) => number, loads: { at: number; P: number }[]): MultiCase => {
    const r = solveBeam(beam, w, loads, 160, cuts, false);
    return { M: r.stations.map((s) => s.M), V: r.stations.map((s) => s.V), d: r.stations.map((s) => s.d), R: sup.map((x) => r.reactions.find((q) => Math.abs(q.at - x) < 1e-6)?.R ?? 0) };
  };
  const xs = solveBeam(beam, () => 0, [], 160, cuts, false).stations.map((s) => s.x);
  const inRegion = (k: number) => (x0: number, x1: number) => (x0 >= regions[k].x0 - 1e-9 && x1 <= regions[k].x1 + 1e-9 ? 1 : 0);
  const U = run(() => 1, []);
  const R = regions.map((_, k) => run(inRegion(k), []));
  const Pt = pts.map((q) => run(() => 0, [{ at: q.at, P: 1 }]));
  const Pp = mids.map((m) => run(() => 0, [{ at: m, P: 1 }]));
  const add = (acc: number[], c: number[], f: number) => (f ? acc.map((v, i) => v + f * c[i]) : acc);
  const patterns = [regions.map((_, k) => k), regions.map((_, k) => k).filter((k) => k % 2 === 0), regions.map((_, k) => k).filter((k) => k % 2 === 1)].filter((pt) => pt.length);
  const field = (key: "M" | "V" | "d" | "R", g: number, q: number, pattern: number[], ptF: (q: PointLoad) => number, ppt: number, at: number) => {
    let a = (key === "R" ? U.R : U[key]).map((v) => g * v);
    for (const k of pattern) a = add(a, R[k][key], q);
    pts.forEach((qq, i) => (a = add(a, Pt[i][key], ptF(qq))));
    if (ppt && at >= 0) a = add(a, Pp[at][key], ppt);
    return a;
  };

  let uM = 0,
    uV = 0,
    gov = cs[0].name,
    Mg = 0,
    phiMg = 0,
    Vg = 0,
    phiVg = 0;
  for (const c of cs) {
    const q = c.Qf * l.Qf + c.Qr * l.Qr + c.S * l.S;
    let M = 0,
      V = 0;
    for (const pat of patterns)
      for (let at = c.pf && P ? 0 : -1; at < (c.pf && P ? mids.length : 0); at++) {
        const m = field("M", c.G * l.G, q, pat, (qq) => pointComp(c, qq), c.pf * P, at);
        const v = field("V", c.G * l.G, q, pat, (qq) => pointComp(c, qq), c.pf * P, at);
        M = Math.max(M, ...m.map(Math.abs));
        V = Math.max(V, ...v.map(Math.abs));
      }
    let phiM: number, phiV: number;
    if ("steel" in sec) {
      phiM = (0.9 * sec.steel.fy * sec.steel.Ze) / 1e6;
      phiV = (0.9 * 0.6 * FY * sec.steel.d * sec.steel.tw) / 1e3;
    } else {
      const t = sec.mat;
      phiM = (t.phi * c.k1 * t.fb * sec.b * sec.d * sec.d) / 6 / 1e6;
      phiV = (t.phi * c.k1 * t.fs * (2 / 3) * sec.b * sec.d) / 1e3;
    }
    if (M / phiM > uM) {
      uM = M / phiM;
      gov = c.name;
      Mg = M;
      phiMg = phiM;
    }
    if (V / phiV > uV) {
      uV = V / phiV;
      Vg = V;
      phiVg = phiV;
    }
  }

  // deflections per region (mm), against span/300 and span/360 (overhangs: twice their length)
  const span = (k: number) => (regions[k].x1 - regions[k].x0) * (regions[k].cant ? 2 : 1) * 1000;
  const maxIn = (d: number[], k: number) => Math.max(0, ...d.filter((_, i) => xs[i] >= regions[k].x0 - 1e-9 && xs[i] <= regions[k].x1 + 1e-9).map(Math.abs)) * (1000 / EI);
  let uDl = 0,
    uDs = 0,
    uDp = 0,
    dl = 0,
    ds = 0,
    dP = 0,
    limL = 1,
    limS = 1;
  regions.forEach((_, k) => {
    const long = maxIn(field("d", k2 * (l.G + 0.4 * l.Qf), 0, [], (qq) => k2 * (qq.G + 0.4 * qq.Qf), 0.4 * k2 * P, k), k);
    let short = 0;
    for (const pat of patterns) short = Math.max(short, maxIn(field("d", 0, 0.7 * (l.Qf + l.Qr), pat, (qq) => 0.7 * (qq.Qf + qq.Qr), 0.7 * P, k), k));
    const pl = P > 0 ? maxIn(field("d", 0, 0, [], () => 0, P, k), k) : 0;
    const lL = Math.min(span(k) / 300, opts.dlim || p.dAbs || 1e9);
    const lS = span(k) / 360;
    if (long / lL > uDl) [uDl, dl, limL] = [long / lL, long, lL];
    if (short / lS > uDs) [uDs, ds, limS] = [short / lS, short, lS];
    if (P > 0 && p.dPlim > 0 && pl / p.dPlim > uDp) [uDp, dP] = [pl / p.dPlim, pl];
  });

  const util = Math.max(uM, uV, uDl, uDs, uDp);
  const govName = util === uM ? "Bending" : util === uV ? "Shear" : util === uDl ? "Long-term δ" : util === uDs ? "Short-term δ" : "Point-load δ";
  // unfactored reactions at each support: dead on everything, live as the worst pattern, the
  // point load where it gives the largest reaction there
  const reactions = sup.map((x, i) => {
    const worst = (fn: (pat: number[]) => number) => Math.max(...patterns.map(fn));
    const live = (w: number, key: "Qf" | "Qr" | "S") => worst((pat) => pat.reduce((a, k) => a + w * R[k].R[i], 0)) + pts.reduce((a, qq, j) => a + qq[key] * Pt[j].R[i], 0);
    return {
      at: x,
      loads: {
        G: l.G * U.R[i] + pts.reduce((a, qq, j) => a + qq.G * Pt[j].R[i], 0),
        Qf: live(l.Qf, "Qf") + (P ? Math.max(0, ...Pp.map((c) => P * c.R[i])) : 0),
        Qr: live(l.Qr, "Qr"),
        S: live(l.S, "S"),
      },
    };
  });
  const zero: Loads = { G: 0, Qf: 0, Qr: 0, S: 0 };
  const endA = reactions.find((r) => r.at < 1e-6)?.loads ?? zero;
  const endB = reactions.find((r) => Math.abs(r.at - L) < 1e-6)?.loads ?? zero;
  return { sec, ok: util <= 1, util, uM, uV, uDl, uDs, uDp, M: Mg, phiM: phiMg, V: Vg, phiV: phiVg, dl, limL, ds, limS, dP, gov, govName, l, sw, endA, endB, reactions };
}

export const rStar = (e: Loads) => Math.max(1.35 * e.G, 1.2 * e.G + 1.5 * e.Qf, 1.2 * e.G + 1.5 * e.Qr + 0.4 * e.Qf, 1.2 * e.G + e.S + 0.4 * e.Qf);

function secInfo(c: Candidate): SecInfo {
  return "steel" in c ? { name: c.name, fam: c.fam, b: c.b, d: c.d, tw: c.steel.tw, tf: c.steel.tf } : { name: c.name, fam: c.fam, b: c.b, d: c.d };
}

type BeamSpec = { id: string; mark: string; role: string; span: number; trib: Trib; extraG?: number; extraQ?: number; sizing: Sizing; fixed: Candidate | null; point: boolean; fallbackMaxD: number; flush?: boolean; selfWeight?: boolean; points?: PointLoad[]; supports?: number[] };

function designBeam(spec: BeamSpec, p: DesignParams): Result {
  const base: Result = { memberId: spec.id, mark: spec.mark, status: "none", ratio: null, summary: "", utils: [], kv: [], inputs: [], loads: [], checks: [], notes: [] };
  if (spec.span < 0.1) return { ...base, summary: "Span too short to check." };
  const loads = lineLoads(spec.trib, p, spec.extraG, spec.extraQ);

  let chosen: BeamCheck | null = null;
  let seq: SeqRow[] | undefined;
  if (spec.sizing.mode === "fixed") {
    if (!spec.fixed) return { ...base, summary: "Section not in the library (use e.g. 2/240x45, or 250PFC for steel)." };
    chosen = checkBeam(spec.span, loads, spec.fixed, p, { point: spec.point, dlim: spec.sizing.dlim, selfWeight: spec.selfWeight, points: spec.points, supports: spec.supports });
  } else {
    const all = candidates(spec.sizing, spec.fallbackMaxD);
    const fams = [...new Set(all.map((c) => c.fam))];
    seq = [];
    let firstPass: BeamCheck | null = null;
    let lastBest: BeamCheck | null = null;
    for (const f of fams) {
      let best: BeamCheck | null = null;
      let pass: BeamCheck | null = null;
      for (const c of all.filter((x) => x.fam === f)) {
        const r = checkBeam(spec.span, loads, c, p, { point: spec.point, dlim: spec.sizing.dlim, selfWeight: spec.selfWeight, points: spec.points, supports: spec.supports });
        if (!best || r.util < best.util) best = r;
        if (r.ok) {
          pass = r;
          break;
        }
      }
      const show = pass ?? best;
      if (show) seq.push({ family: FAMILY_LABEL[f], text: pass ? pass.sec.name : `best: ${show.sec.name}`, util: show.util, pass: !!pass, chosen: false });
      if (pass && !firstPass) firstPass = pass;
      if (best) lastBest = best;
    }
    chosen = firstPass ?? lastBest;
    if (!chosen) return { ...base, summary: "No section in the library fits the depth and width limits." };
    const ch = chosen;
    seq = seq.map((s) => ({ ...s, chosen: !!firstPass && s.text === ch.sec.name }));
  }

  const c = chosen;
  const status = statusFor(c.util);
  const downstand = spec.flush ? Math.max(0, c.sec.d - 240) : null;
  return {
    ...base,
    status,
    ratio: c.util,
    sec: secInfo(c.sec),
    govName: c.govName,
    seq,
    summary: `${c.sec.name} · ${Math.round(c.util * 100)}% · ${c.govName.toLowerCase()}${c.ok ? "" : spec.sizing.mode === "auto" ? " · no listed section passes" : ""}`,
    utils: [
      { label: "Bending", u: c.uM },
      { label: "Shear", u: c.uV },
      { label: "Long-term δ", u: c.uDl },
      { label: "Short-term δ", u: c.uDs },
      ...(spec.point && p.Ppt > 0 ? [{ label: "Point-load δ", u: c.uDp }] : []),
    ],
    kv: [
      { label: `M* (${c.gov})`, value: `${fmt(c.M, 1)} kNm` },
      { label: "φMn", value: `${fmt(c.phiM, 1)} kNm` },
      { label: "V*", value: `${fmt(c.V, 1)} kN` },
      { label: "φVn", value: `${fmt(c.phiV, 1)} kN` },
      { label: "δ long-term", value: `${fmt(c.dl, 1)} / ${fmt(c.limL, 1)} mm` },
      { label: "δ short-term", value: `${fmt(c.ds, 1)} / ${fmt(c.limS, 1)} mm` },
      ...(spec.point && p.Ppt > 0 ? [{ label: `δ under ${fmt(p.Ppt, 1)} kN point load`, value: `${fmt(c.dP)} / ${fmt(p.dPlim)} mm` }] : []),
      c.reactions
        ? { label: "Support reactions R*", value: c.reactions.map((r) => `${fmt(r.at)} m: ${fmt(rStar(r.loads), 1)}`).join(" · ") + " kN" }
        : { label: "End reactions R*", value: `${fmt(rStar(c.endA), 1)} / ${fmt(rStar(c.endB), 1)} kN` },
      ...(downstand !== null ? [{ label: "Depth vs 240 joists", value: downstand > 0 ? `${downstand} mm downstand` : "flush" }] : []),
    ],
    inputs: [
      { label: "Member", value: `${spec.mark} · ${spec.role}` },
      c.reactions
        ? { label: "Length", value: `${fmt(spec.span)} m`, note: `${c.reactions.length} supports at ${c.reactions.map((r) => fmt(r.at)).join(", ")} m${c.reactions[0].at > 1e-6 || Math.abs(c.reactions[c.reactions.length - 1].at - spec.span) > 1e-6 ? ", overhanging" : ""}; live load patterned` }
        : { label: "Span", value: `${fmt(spec.span)} m`, note: "simply supported" },
      { label: "Sizing", value: spec.sizing.mode === "auto" ? "Automatic (first section that passes)" : "Fixed" },
    ],
    loads: [
      { label: "G (incl. self weight)", value: `${fmt(c.l.G)} kN/m` },
      { label: "Q floor", value: `${fmt(c.l.Qf)} kN/m` },
      { label: "Q roof", value: `${fmt(c.l.Qr)} kN/m` },
      ...(c.l.S > 0 ? [{ label: "Su", value: `${fmt(c.l.S)} kN/m` }] : []),
      { label: "Tributary", value: tribText(spec.trib) || "none set" },
      ...(spec.points ?? []).map((q) => ({ label: `Point load from ${q.from}`, value: `${fmt(q.at)} m: G ${fmt(q.G)}, Q ${fmt(q.Qf + q.Qr)} kN` })),
    ],
    checks: [
      { name: `Bending, ${c.gov}`, demand: c.M, capacity: c.phiM, unit: "kNm", ratio: c.uM },
      { name: "Shear", demand: c.V, capacity: c.phiV, unit: "kN", ratio: c.uV },
      { name: "Deflection, long term", demand: c.dl, capacity: c.limL, unit: "mm", ratio: c.uDl },
      { name: "Deflection, short term", demand: c.ds, capacity: c.limS, unit: "mm", ratio: c.uDs },
      ...(spec.point && p.Ppt > 0 ? [{ name: "Deflection, point load", demand: c.dP, capacity: p.dPlim, unit: "mm", ratio: c.uDp }] : []),
    ],
    notes:
      "steel" in c.sec
        ? [`Steel fy ${c.sec.steel.fy} MPa (Grade 300 at tf ${c.sec.steel.tf} mm), Ze ${Math.round(c.sec.steel.Ze / 1e3)}×10³ mm³, φ 0.9; full lateral restraint assumed (top flange held by the joists). Bolt a timber packer to the web for joist hangers.`]
        : [`${c.sec.fam === "LVL" ? "hySPAN: fb 48, fs 5.3 MPa, E 13.2 GPa, φ 0.9" : "SG8 dry: fb 14, fs 3.8 MPa, E 8.0 GPa, φ 0.8"}; k4 = k5 = k8 = 1.0 (compression edge restrained).`],
    ends: { a: c.endA, b: c.endB },
    supportLoads: c.reactions,
    carried: spec.points?.length ? spec.points : undefined,
  };
}

export function tribText(t: Trib) {
  return [
    t.floor ? `floor ${t.floor} m` : "",
    t.wet ? `wet ${t.wet} m` : "",
    t.roof ? `roof ${t.roof} m` : "",
    t.wallExt ? `${t.wallExt} ext wall` : "",
    t.wallInt ? `${t.wallInt} int wall` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// Default tributary for a member that has none set.
function defaultTrib(model: DesignModel, m: Member): Trib {
  const level = levelOf(model, m.levelId);
  const roof = loadKind(model, level) === "roof";
  if (m.type === "joist" || m.type === "rafter") {
    const w = (m.spacing ?? (m.type === "joist" ? 400 : 900)) / 1000;
    return roof ? { roof: w } : { floor: w };
  }
  return roof ? { roof: 1.0 } : { floor: 1.0 };
}

// ---------------------------------------------------------------- wall openings

export function wallLintels(model: DesignModel): VirtualLintel[] {
  const out: VirtualLintel[] = [];
  for (const w of model.members) {
    if (w.type !== "wall" || !w.b || !w.wall) continue;
    for (const o of w.wall.openings) {
      const a = along(w, o.offset - 0.045);
      const b = along(w, o.offset + o.width + 0.045);
      const member: Member = {
        id: `${w.id}#${o.id}`,
        type: "lintel",
        label: o.label,
        levelId: w.levelId,
        a,
        b,
        material: "timber",
        grade: "SG8",
        section: "2/190x45",
        role: `Lintel, ${o.sill > 0.05 ? "window" : "door"} in ${w.label}`,
        trib: o.trib,
        sizing: { mode: "auto", maxB: w.wall.thickness, ...(o.sizing ?? {}) },
        notes: o.note,
      };
      out.push({ id: member.id, wall: w, opening: o, member });
    }
  }
  return out;
}

// ---------------------------------------------------------------- posts

function k12(S: number) {
  const x = 1.05 * S;
  return x <= 10 ? 1 : x <= 20 ? 1.5 - 0.05 * x : 200 / (x * x);
}

type PostCand = { name: string; fam: "SG8" | "SHS"; b: number; d: number; phiN?: number; A?: number; I?: number };

// C350L0 square hollow sections: b (mm), t (mm), A (mm2), I (mm4), from the
// published tables. Every one listed is fully effective (kf = 1) at fy 350.
const SHS: [number, number, number, number][] = [
  [89, 5, 1590, 1.82e6],
  [89, 6, 1870, 2.06e6],
  [100, 6, 2130, 3.04e6],
  [125, 6, 2730, 6.29e6],
  [100, 9, 3000, 3.91e6],
  [150, 6, 3330, 11.3e6],
  [125, 9, 3900, 8.38e6],
  [150, 9, 4800, 15.4e6],
  [150, 10, 5260, 16.5e6],
];

// AS 4100 cl 6.3.3 member capacity of a pin-ended SHS post of height h (m):
// cold-formed, so alpha_b = -0.5; phi 0.9, fy 350.
function shsCapacity(A: number, I: number, h: number) {
  const fy = 350;
  const r = Math.sqrt(I / A);
  const ln = ((h * 1000) / r) * Math.sqrt(fy / 250);
  const aa = (2100 * (ln - 13.5)) / (ln * ln - 15.3 * ln + 2050);
  const l = ln + aa * -0.5;
  const eta = Math.max(0, 0.00326 * (l - 13.5));
  const q = (l / 90) ** 2;
  const xi = (q + 1 + eta) / (2 * q);
  const ac = Math.min(1, xi * (1 - Math.sqrt(Math.max(0, 1 - (90 / (xi * l)) ** 2))));
  return (0.9 * ac * A * fy) / 1e3;
}

function designPost(loads: Loads, h: number, p: DesignParams, fixed: PostCand | null) {
  const cs = combos(loads, p, false);
  const cands: PostCand[] = fixed
    ? [fixed]
    : [
        ...[2, 3, 4].map((n): PostCand => ({ name: `${n}/90×45 SG8`, fam: "SG8", b: 45 * n, d: 90 })),
        // the 89 SHS keeps the 290 kN of the Lot 6 model as a ceiling
        ...SHS.map(([b, t, A, I]): PostCand => ({ name: `${b}×${b}×${t.toFixed(1)} SHS`, fam: "SHS", b, d: b, A, I, ...(b === 89 && t === 5 ? { phiN: 290 } : {}) })),
      ];
  let out: { sec: PostCand; util: number; ok: boolean; N: number; cap: number; gov: string; k12: number | null } | null = null;
  for (const c of cands) {
    let u = 0,
      N = 0,
      cap = 0,
      gov = cs[0].name,
      k = 1;
    for (const r of cs) {
      const n = r.G * loads.G + r.Qf * loads.Qf + r.Qr * loads.Qr + r.S * loads.S;
      let phiN: number;
      if (c.fam === "SHS") phiN = Math.min(c.phiN ?? Infinity, c.A && c.I ? shsCapacity(c.A, c.I, h) : (c.phiN ?? 290));
      else {
        k = k12((h * 1000) / Math.min(c.b, c.d));
        const A = c.b * c.d;
        phiN = Math.min(0.8 * r.k1 * k * SG8.fc * A, 0.8 * r.k1 * SG8.fp * A) / 1e3;
      }
      if (n / phiN > u || N === 0) {
        u = n / phiN;
        N = n;
        cap = phiN;
        gov = r.name;
      }
    }
    out = { sec: c, util: u, ok: u <= 1, N, cap, gov, k12: c.fam === "SG8" ? k : null };
    if (out.ok) break;
  }
  return out!;
}

// ---------------------------------------------------------------- orchestration

const near = (p: Pt, q: Pt, tol = 0.15) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
const BEAM_LIKE = new Set(["beam", "lintel", "joist", "rafter"]);
const SUPPORT = new Set(["post", "pile", "footing"]);
const add = (a: Loads, b: Loads, k = 1): Loads => ({ G: a.G + k * b.G, Qf: a.Qf + k * b.Qf, Qr: a.Qr + k * b.Qr, S: a.S + k * b.S });
const ZERO: Loads = { G: 0, Qf: 0, Qr: 0, S: 0 };

export function runCalcs(model: DesignModel): Calcs {
  const p = model.params;
  const results = new Map<string, Result>();
  const lintels = wallLintels(model);

  // beams, lintels, single joists and rafters (members plus opening lintels)
  const beamLike = [...model.members.filter((m) => BEAM_LIKE.has(m.type)), ...lintels.map((l) => l.member)];
  const posts = model.members.filter((m) => SUPPORT.has(m.type));
  // A beam end that lands part-way along another beam on the same level (and
  // not on a post) is a point load on that beam, so the carried beam is
  // designed first and its reaction passed on.
  type Bearing = { carrier: string; end: "a" | "b"; at: number };
  const bearings = new Map<string, Bearing[]>(); // carried id -> where its ends land
  for (const x of beamLike) {
    if (!x.b) continue;
    for (const end of ["a", "b"] as const) {
      if (x.free === end) continue; // a cantilever tip rests on nothing
      const pt = x[end]!;
      if (posts.some((s) => near(s.a, pt))) continue;
      for (const y of beamLike) {
        if (y.id === x.id || !y.b || y.levelId !== x.levelId) continue;
        const L = memberLength(y);
        const t = ((pt.x - y.a.x) * (y.b.x - y.a.x) + (pt.y - y.a.y) * (y.b.y - y.a.y)) / (L * L || 1);
        const at = t * L;
        const foot = { x: y.a.x + t * (y.b.x - y.a.x), y: y.a.y + t * (y.b.y - y.a.y) };
        if (at > 0.15 && at < L - 0.15 && near(foot, pt)) {
          bearings.set(x.id, [...(bearings.get(x.id) ?? []), { carrier: y.id, end, at }]);
          break;
        }
      }
    }
  }
  // order: a beam only after everything bearing on it (cycles fall back to drawing order)
  const order: Member[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const byId = new Map(beamLike.map((m) => [m.id, m]));
  const visit = (m: Member) => {
    if (done.has(m.id) || visiting.has(m.id)) return;
    visiting.add(m.id);
    for (const [carried, list] of bearings) if (list.some((b) => b.carrier === m.id)) visit(byId.get(carried)!);
    visiting.delete(m.id);
    done.add(m.id);
    order.push(m);
  };
  beamLike.forEach(visit);

  // What each post stands on: the first thing below it, searching down level
  // by level - a pile or footing on its own level, then on each lower level a
  // post, pile or footing (stacked) or a beam part-way along (a point load).
  // A post can pass down through a double-height space this way.
  type Seat = { kind: "support"; id: string; levelId: string } | { kind: "beam"; id: string; levelId: string; at: number };
  const seats = new Map<string, Seat>();
  const downFrom = (l: Level) => model.levels.filter((x) => x.elevation < l.elevation - 1e-6).sort((a, b) => b.elevation - a.elevation);
  // Levels are traced from separate sheets, so between levels allow 300 mm.
  const ACROSS = 0.3;
  const partway = (m: Member, q: Pt, tol = 0.15) => {
    if (!m.b) return null;
    const L = memberLength(m);
    const t = ((q.x - m.a.x) * (m.b.x - m.a.x) + (q.y - m.a.y) * (m.b.y - m.a.y)) / (L * L || 1);
    const foot = { x: m.a.x + t * (m.b.x - m.a.x), y: m.a.y + t * (m.b.y - m.a.y) };
    return t * L > 0.15 && t * L < L - 0.15 && near(foot, q, tol) ? t * L : null;
  };
  for (const q of posts) {
    if (q.type !== "post") continue;
    const ql = levelOf(model, q.levelId);
    if (!ql) continue;
    const base = posts.find((x) => x.type !== "post" && x.levelId === ql.id && near(x.a, q.a));
    if (base) {
      seats.set(q.id, { kind: "support", id: base.id, levelId: ql.id });
      continue;
    }
    for (const v of downFrom(ql)) {
      const under = posts
        .filter((x) => x.levelId === v.id && near(x.a, q.a, ACROSS))
        .sort((a, b) => Number(b.type === "post") - Number(a.type === "post") || Math.hypot(a.a.x - q.a.x, a.a.y - q.a.y) - Math.hypot(b.a.x - q.a.x, b.a.y - q.a.y))[0];
      if (under) {
        seats.set(q.id, { kind: "support", id: under.id, levelId: v.id });
        break;
      }
      const beam = beamLike.find((m) => m.levelId === v.id && partway(m, q.a, ACROSS) !== null);
      if (beam) {
        seats.set(q.id, { kind: "beam", id: beam.id, levelId: v.id, at: partway(beam, q.a, ACROSS)! });
        break;
      }
    }
  }

  // A post, pile or footing: beam ends on its own level (and roof beams for a
  // top-storey post), plus the posts standing on it.
  const designSupport = (s: Member) => {
    const level = levelOf(model, s.levelId);
    const above = levelAbove(model, level);
    const beamLevels = new Set([s.levelId, ...(s.type === "post" && above?.kind === "roof" ? [above.id] : [])]);
    let loads: Loads = { ...ZERO };
    const from: string[] = [];
    for (const m of beamLike) {
      if (!beamLevels.has(m.levelId) || !m.b) continue;
      const sl = results.get(m.id)?.supportLoads;
      if (sl) {
        // a beam over several supports: whichever of them is this one
        const hit = sl.filter((r) => near(along(m, r.at), s.a));
        hit.forEach((r) => (loads = add(loads, r.loads)));
        if (hit.length) from.push(m.label);
        continue;
      }
      const e = results.get(m.id)?.ends;
      if (!e) continue;
      const atA = near(m.a, s.a),
        atB = near(m.b, s.a);
      if (atA) loads = add(loads, e.a);
      if (atB) loads = add(loads, e.b);
      if (atA || atB) from.push(m.label);
    }
    for (const o of posts) {
      const seat = seats.get(o.id);
      const e = results.get(o.id)?.ends;
      if (seat?.kind === "support" && seat.id === s.id && e) {
        loads = add(loads, e.a);
        from.push(o.label);
      }
    }
    const res: Result = {
      memberId: s.id,
      mark: s.label,
      status: "none",
      ratio: null,
      summary: from.length ? `Carries ${from.join(", ")}` : "No members bearing on it yet.",
      utils: [],
      kv: [],
      inputs: [{ label: "Member", value: `${s.label} · ${MEMBER_INFO[s.type].label}` }],
      loads: [
        { label: "Carries", value: from.length ? from.join(", ") : "nothing yet" },
        { label: "Axial G / Q / Qr", value: `${fmt(loads.G)} / ${fmt(loads.Qf)} / ${fmt(loads.Qr)} kN` },
      ],
      checks: [],
      notes: [],
      ends: { a: loads, b: loads },
    };
    if (s.type === "post") {
      // up to the underside of the deepest beam it carries
      const deepest = Math.max(0, ...beamLike.filter((m) => from.includes(m.label) && beamLevels.has(m.levelId)).map((m) => (results.get(m.id)?.sec?.d ?? 0) / 1000));
      const topOfPost = level ? (level.kind === "roof" ? level.elevation : framingTop(model, level)) - deepest : 2.4;
      const seat = seats.get(s.id);
      const seatLevel = seat ? levelOf(model, seat.levelId) : undefined;
      const below = level ? downFrom(level)[0] : undefined;
      // a post passing down through a double-height space stands on that lower framing
      const bottom = seatLevel && below && seatLevel.elevation < below.elevation - 1e-6 ? framingTop(model, seatLevel) : (level?.elevation ?? 0);
      const h = s.height ?? Math.max(0.3, topOfPost - bottom);
      const fixed: PostCand | null =
        s.sizing?.mode === "fixed"
          ? (() => {
              const c = fixedCandidate(s.section, s.material, s.grade);
              return c && !("steel" in c) ? { name: c.name, fam: "SG8", b: c.b, d: c.d } : null;
            })()
          : null;
      const d = designPost(loads, h, p, fixed);
      res.status = from.length ? statusFor(d.util) : "none";
      res.ratio = from.length ? d.util : null;
      res.sec = { name: d.sec.name, fam: d.sec.fam, b: d.sec.b, d: d.sec.d };
      res.summary = from.length ? `${d.sec.name} · N* ${fmt(d.N, 1)} kN · ${Math.round(d.util * 100)}%` : res.summary;
      res.utils = from.length ? [{ label: "Axial", u: d.util }] : [];
      res.kv = [
        { label: `N* (${d.gov})`, value: `${fmt(d.N, 1)} kN` },
        { label: "φN (min of buckling, bearing)", value: `${fmt(d.cap, 1)} kN` },
        { label: "Height", value: `${fmt(h)} m` },
        ...(d.k12 !== null ? [{ label: `k12 (L/d = ${fmt((h * 1000) / Math.min(d.sec.b, d.sec.d), 1)})`, value: fmt(d.k12) }] : []),
      ];
      res.checks = from.length ? [{ name: `Axial, ${d.gov}`, demand: d.N, capacity: d.cap, unit: "kN", ratio: d.util }] : [];
      res.notes = ["Post sits within the wall; linings and nogs restrain it in the plane of the wall. Continue the load path to a pad footing and check bottom-plate bearing."];
    } else {
      const N = Math.max(1.35 * loads.G, 1.2 * loads.G + 1.5 * loads.Qf, 1.2 * loads.G + 1.5 * loads.Qr + 0.4 * loads.Qf);
      res.kv.push({ label: "N*", value: `${fmt(N, 1)} kN` });
      res.summary = from.length ? `N* ${fmt(N, 1)} kN from ${from.join(", ")}` : res.summary;
      if (s.type === "footing") {
        const dims = s.section.split(/x/i).map(Number);
        if (dims.length >= 2 && dims[0] > 0 && dims[1] > 0) res.kv.push({ label: "Bearing pressure (factored)", value: `${fmt(N / ((dims[0] / 1000) * (dims[1] / 1000)), 0)} kPa` });
      }
      res.notes = ["Foundation design is by the engineer: check bearing against the site's geotechnical report."];
    }
    results.set(s.id, res);
  };

  // Where a beam is held up: its ends (unless marked free) and any post on its
  // own level standing part-way along it. Undefined for a plain two-end span.
  const beamSupports = (m: Member): number[] | undefined => {
    if (!m.b) return undefined;
    const L = memberLength(m);
    const inner = posts.filter((s) => s.type === "post" && s.levelId === m.levelId).map((s) => partway(m, s.a)).filter((x): x is number => x !== null);
    const at = [...(m.free === "a" ? [] : [0]), ...inner, ...(m.free === "b" ? [] : [L])].sort((a, b) => a - b);
    return inner.length || m.free ? at : undefined;
  };

  const levelsDown = [...model.levels].sort((a, b) => b.elevation - a.elevation);
  const onLevel = (m: Member, l: Level) => m.levelId === l.id || (l === levelsDown[levelsDown.length - 1] && !levelOf(model, m.levelId));
  for (const lvl of levelsDown) {
    for (const m of order.filter((x) => onLevel(x, lvl))) {
      const level = levelOf(model, m.levelId);
      const single = m.type === "joist" || m.type === "rafter";
      const sizing: Sizing = m.sizing ?? { mode: single ? "fixed" : "auto", ...(m.type === "lintel" ? { maxB: 90 } : {}) };
      const points: PointLoad[] = [];
      for (const [carried, list] of bearings)
        for (const b of list) {
          if (b.carrier !== m.id) continue;
          const r = results.get(carried);
          const e = r?.ends?.[b.end];
          if (e) points.push({ at: b.at, ...e, from: r!.mark });
        }
      for (const [qid, seat] of seats) {
        if (seat.kind !== "beam" || seat.id !== m.id) continue;
        const r = results.get(qid);
        const e = r?.ends?.a;
        if (!r || !e) continue;
        points.push({ at: seat.at, ...e, from: `${r.mark} above` });
        r.kv.push({ label: "Stands on", value: `${m.label}, ${fmt(seat.at)} m from its end 1` });
      }
      const spec: BeamSpec = {
        id: m.id,
        mark: m.label,
        role: m.role || `${MEMBER_INFO[m.type].label}${level ? ` · ${level.name}` : ""}`,
        span: memberLength(m),
        trib: m.trib && Object.values(m.trib).some((v) => v) ? m.trib : defaultTrib(model, m),
        extraG: m.extraG,
        extraQ: m.extraQ,
        sizing,
        fixed: fixedCandidate(m.section, m.material, m.grade),
        point: !single,
        selfWeight: !single,
        fallbackMaxD: m.type === "beam" && loadKind(model, level) === "floor" ? p.beamMaxD : 0,
        flush: m.type === "beam" && loadKind(model, level) === "floor",
        points,
        supports: beamSupports(m),
      };
      const res = designBeam(spec, p);
      // ends resting on another beam don't also load a post
      for (const b of bearings.get(m.id) ?? []) res.kv.push({ label: `End ${b.end === "a" ? "1" : "2"} bears on`, value: results.get(b.carrier)?.mark ?? byId.get(b.carrier)?.label ?? "" });
      results.set(m.id, res);
    }

    // then this level's posts, piles and footings (posts first, so a footing
    // or pile under one sees it)
    for (const s of posts.filter((x) => onLevel(x, lvl)).sort((a, b) => Number(b.type === "post") - Number(a.type === "post"))) designSupport(s);
  }

  // joist zones
  for (const z of model.members) {
    if (z.type !== "joistzone" || !z.b || !z.zone) continue;
    const span = z.zone.dir === "x" ? Math.abs(z.b.x - z.a.x) : Math.abs(z.b.y - z.a.y);
    const width = z.zone.dir === "x" ? Math.abs(z.b.y - z.a.y) : Math.abs(z.b.x - z.a.x);
    const s = z.zone.spacing / 1000;
    const r = designBeam(
      {
        id: z.id,
        mark: z.label,
        role: z.role || `Floor joists${z.zone.wet ? " (wet area)" : ""}`,
        span,
        trib: z.zone.wet ? { floor: s, wet: s } : { floor: s },
        sizing: { mode: "fixed", dlim: 20 },
        fixed: fixedCandidate(z.section, z.material, z.grade),
        point: false,
        selfWeight: false,
        fallbackMaxD: 0,
      },
      p,
    );
    if (z.zone.tableSpan && r.ratio !== null) {
      const uT = span / z.zone.tableSpan;
      r.utils.push({ label: "NZS 3604 span", u: uT });
      r.kv.push({ label: "NZS 3604 Table 7.1", value: `${fmt(span)} ≤ ${fmt(z.zone.tableSpan)} m` });
      if (uT > r.ratio) {
        r.ratio = uT;
        r.govName = "NZS 3604 span";
      }
      r.status = statusFor(r.ratio);
    }
    const count = Math.floor(width / s) + 1 + z.zone.doubled.length;
    r.kv.push({ label: "Joists", value: `${count} @ ${z.zone.spacing} crs, ${z.zone.dir === "x" ? "E–W" : "N–S"}` });
    if (r.ends) r.kv.push({ label: "Hanger / bearing R* per joist", value: `${fmt(Math.max(1.35 * r.ends.a.G, 1.2 * r.ends.a.G + 1.5 * r.ends.a.Qf), 2)} kN` });
    r.summary = r.sec ? `${z.section} @ ${z.zone.spacing} · span ${fmt(span)} m · ${Math.round((r.ratio ?? 0) * 100)}%` : r.summary;
    r.ends = undefined; // joist zones don't load posts directly
    results.set(z.id, r);
  }

  // retaining walls
  for (const m of model.members) if (m.type === "retaining") results.set(m.id, retainingCalc(m));

  // bracing
  const bracing = braceCalcs(model);
  for (const sheet of bracing)
    for (const line of sheet.lines)
      for (const el of line.els) {
        const m = model.members.find((x) => x.id === el.memberId);
        if (!m) continue;
        const okLine = line.okW && line.okE;
        results.set(m.id, {
          memberId: m.id,
          mark: m.label,
          status: okLine && sheet.okTotal ? "pass" : "fail",
          ratio: Math.max(line.minW / Math.max(1, line.sumW), line.minE / Math.max(1, line.sumE)),
          summary: `${describeMember(m)} · ${el.W} W / ${el.E} EQ BU · line ${line.id} ${okLine ? "OK" : "NG"}`,
          utils: [],
          kv: [
            { label: "Line", value: `${line.id} (${sheet.dir})` },
            { label: "Length", value: `${fmt(el.L)} m` },
            { label: "Wind BUs", value: String(el.W) },
            { label: "EQ BUs", value: String(el.E) },
            { label: "Line achieved / min (W)", value: `${line.sumW} / ${line.minW}` },
            { label: "Line achieved / min (EQ)", value: `${line.sumE} / ${line.minE}` },
          ],
          inputs: [],
          loads: [],
          checks: [],
          notes: [
            "Ratings from GIB EzyBrace® Systems 2016 (BU/m), interpolated between 0.4 m and 1.2 m and multiplied by 2.4 / stud height; capped at 120 BU/m on timber floors and 150 on slab.",
          ],
          bu: { W: el.W, E: el.E, line: line.id, dir: sheet.dir },
        });
      }

  for (const m of model.members) {
    if (results.has(m.id)) continue;
    results.set(m.id, {
      memberId: m.id,
      mark: m.label,
      status: "none",
      ratio: null,
      summary: m.type === "wall" ? `${describeMember(m)}${m.wall?.openings.length ? ` · ${m.wall.openings.length} opening${m.wall.openings.length === 1 ? "" : "s"}` : ""}` : "No calculation for this element.",
      utils: [],
      kv: [],
      inputs: [],
      loads: [],
      checks: [],
      notes: [],
    });
  }
  return { results, lintels, bracing };
}

export const STATUS_COLOUR: Record<Status, string> = {
  pass: "#16a34a",
  close: "#d97706",
  fail: "#dc2626",
  none: "#64748b",
};
export const STATUS_LABEL: Record<Status, string> = { pass: "Passes", close: "Close to limit", fail: "Fails", none: "No check" };
