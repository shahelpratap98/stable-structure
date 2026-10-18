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
  ends?: Loads; // unfactored end reaction (per end) for beams; axial for supports
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

function combos(l: Loads, p: DesignParams, point: boolean): Combo[] {
  const c: Combo[] = [{ name: "1.35G", w: 1.35 * l.G, k1: 0.6, pf: 0, G: 1.35, Qf: 0, Qr: 0, S: 0 }];
  if (l.Qf > 0 || (point && p.Ppt > 0)) c.push({ name: "1.2G+1.5Q", w: 1.2 * l.G + 1.5 * l.Qf, k1: 0.8, pf: 1.5, G: 1.2, Qf: 1.5, Qr: 0, S: 0 });
  if (l.Qr > 0) c.push({ name: "1.2G+1.5Qr+0.4Q", w: 1.2 * l.G + 1.5 * l.Qr + 0.4 * l.Qf, k1: p.k1Roof, pf: 0.4, G: 1.2, Qf: 0.4, Qr: 1.5, S: 0 });
  if (l.S > 0) c.push({ name: "1.2G+Su+0.4Q", w: 1.2 * l.G + l.S + 0.4 * l.Qf, k1: 0.8, pf: 0.4, G: 1.2, Qf: 0.4, Qr: 0, S: 1 });
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
  end: Loads; // unfactored reaction per end, point load included as Qf
};

function selfWeight(sec: Candidate) {
  return "steel" in sec ? (sec.steel.kgm * 9.81) / 1000 : sec.b * sec.d * 1e-6 * sec.mat.dens;
}

function checkBeam(span: number, base: Loads, sec: Candidate, p: DesignParams, opts: { point: boolean; dlim?: number; selfWeight?: boolean }): BeamCheck {
  const L = span;
  const Lmm = L * 1000;
  // Floor and roof dead loads already include joists and rafters.
  const sw = opts.selfWeight === false ? 0 : selfWeight(sec);
  const l = { ...base, G: base.G + sw };
  const P = opts.point ? p.Ppt : 0;
  const cs = combos(l, p, opts.point);
  let uM = 0,
    uV = 0,
    gov = cs[0].name,
    Mg = 0,
    phiMg = 0,
    Vg = 0,
    phiVg = 0;
  for (const c of cs) {
    const M = (c.w * L * L) / 8 + (c.pf * P * L) / 4;
    const V = (c.w * L) / 2 + (c.pf * P) / 2;
    let phiM: number, phiV: number;
    if ("steel" in sec) {
      phiM = (0.9 * FY * sec.steel.Ze) / 1e6;
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
  const EI = "steel" in sec ? ES * sec.steel.Ix : (sec.mat.E * sec.b * sec.d ** 3) / 12;
  const k2 = "steel" in sec ? 1 : sec.mat.k2;
  const dP = (P * 1e3 * Lmm ** 3) / (48 * EI);
  const dl = ((5 * (l.G + 0.4 * l.Qf) * Lmm ** 4) / (384 * EI)) * k2 + 0.4 * dP * k2;
  const ds = (5 * (0.7 * (l.Qf + l.Qr)) * Lmm ** 4) / (384 * EI) + 0.7 * dP;
  const limL = Math.min(Lmm / 300, opts.dlim || p.dAbs || 1e9);
  const limS = Lmm / 360;
  const uDl = dl / limL;
  const uDs = ds / limS;
  const uDp = P > 0 && p.dPlim > 0 ? dP / p.dPlim : 0;
  const util = Math.max(uM, uV, uDl, uDs, uDp);
  const govName = util === uM ? "Bending" : util === uV ? "Shear" : util === uDl ? "Long-term δ" : util === uDs ? "Short-term δ" : "Point-load δ";
  const end = { G: (l.G * L) / 2, Qf: (l.Qf * L) / 2 + P / 2, Qr: (l.Qr * L) / 2, S: (l.S * L) / 2 };
  return { sec, ok: util <= 1, util, uM, uV, uDl, uDs, uDp, M: Mg, phiM: phiMg, V: Vg, phiV: phiVg, dl, limL, ds, limS, dP, gov, govName, l, sw, end };
}

function secInfo(c: Candidate): SecInfo {
  return "steel" in c ? { name: c.name, fam: c.fam, b: c.b, d: c.d, tw: c.steel.tw, tf: c.steel.tf } : { name: c.name, fam: c.fam, b: c.b, d: c.d };
}

type BeamSpec = { id: string; mark: string; role: string; span: number; trib: Trib; extraG?: number; extraQ?: number; sizing: Sizing; fixed: Candidate | null; point: boolean; fallbackMaxD: number; flush?: boolean; selfWeight?: boolean };

function designBeam(spec: BeamSpec, p: DesignParams): Result {
  const base: Result = { memberId: spec.id, mark: spec.mark, status: "none", ratio: null, summary: "", utils: [], kv: [], inputs: [], loads: [], checks: [], notes: [] };
  if (spec.span < 0.1) return { ...base, summary: "Span too short to check." };
  const loads = lineLoads(spec.trib, p, spec.extraG, spec.extraQ);

  let chosen: BeamCheck | null = null;
  let seq: SeqRow[] | undefined;
  if (spec.sizing.mode === "fixed") {
    if (!spec.fixed) return { ...base, summary: "Section not in the library (use e.g. 2/240x45, or 250PFC for steel)." };
    chosen = checkBeam(spec.span, loads, spec.fixed, p, { point: spec.point, dlim: spec.sizing.dlim, selfWeight: spec.selfWeight });
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
        const r = checkBeam(spec.span, loads, c, p, { point: spec.point, dlim: spec.sizing.dlim, selfWeight: spec.selfWeight });
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
      { label: "End reaction R* (max)", value: `${fmt(Math.max(1.35 * c.end.G, 1.2 * c.end.G + 1.5 * c.end.Qf, 1.2 * c.end.G + 1.5 * c.end.Qr + 0.4 * c.end.Qf), 1)} kN` },
      ...(downstand !== null ? [{ label: "Depth vs 240 joists", value: downstand > 0 ? `${downstand} mm downstand` : "flush" }] : []),
    ],
    inputs: [
      { label: "Member", value: `${spec.mark} · ${spec.role}` },
      { label: "Span", value: `${fmt(spec.span)} m`, note: "simply supported" },
      { label: "Sizing", value: spec.sizing.mode === "auto" ? "Automatic (first section that passes)" : "Fixed" },
    ],
    loads: [
      { label: "G (incl. self weight)", value: `${fmt(c.l.G)} kN/m` },
      { label: "Q floor", value: `${fmt(c.l.Qf)} kN/m` },
      { label: "Q roof", value: `${fmt(c.l.Qr)} kN/m` },
      ...(c.l.S > 0 ? [{ label: "Su", value: `${fmt(c.l.S)} kN/m` }] : []),
      { label: "Tributary", value: tribText(spec.trib) || "none set" },
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
        ? [`Steel fy ${FY}, φ 0.9, top flange restrained by the joists. Bolt a timber packer to the web for joist hangers.`]
        : [`${c.sec.fam === "LVL" ? "hySPAN: fb 48, fs 5.3 MPa, E 13.2 GPa, φ 0.9" : "SG8 dry: fb 14, fs 3.8 MPa, E 8.0 GPa, φ 0.8"}; k4 = k5 = k8 = 1.0 (compression edge restrained).`],
    ends: c.end,
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

type PostCand = { name: string; fam: "SG8" | "SHS"; b: number; d: number; phiN?: number };

function designPost(loads: Loads, h: number, p: DesignParams, fixed: PostCand | null) {
  const cs = combos(loads, p, false);
  const cands: PostCand[] = fixed
    ? [fixed]
    : [
        ...[2, 3, 4].map((n): PostCand => ({ name: `${n}/90×45 SG8`, fam: "SG8", b: 45 * n, d: 90 })),
        { name: "89×89×5.0 SHS", fam: "SHS", b: 89, d: 89, phiN: 290 },
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
      if (c.fam === "SHS") phiN = c.phiN ?? 290;
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
  for (const m of beamLike) {
    const level = levelOf(model, m.levelId);
    const single = m.type === "joist" || m.type === "rafter";
    const sizing: Sizing = m.sizing ?? { mode: single ? "fixed" : "auto", ...(m.type === "lintel" ? { maxB: 90 } : {}) };
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
    };
    results.set(m.id, designBeam(spec, p));
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
    if (r.ends) r.kv.push({ label: "Hanger / bearing R* per joist", value: `${fmt(Math.max(1.35 * r.ends.G, 1.2 * r.ends.G + 1.5 * r.ends.Qf), 2)} kN` });
    r.summary = r.sec ? `${z.section} @ ${z.zone.spacing} · span ${fmt(span)} m · ${Math.round((r.ratio ?? 0) * 100)}%` : r.summary;
    r.ends = undefined; // joist zones don't load posts directly
    results.set(z.id, r);
  }

  // posts, piles and footings, top level down, adding what bears on them
  const ordered = model.members.filter((m) => SUPPORT.has(m.type)).sort((a, b) => (levelOf(model, b.levelId)?.elevation ?? 0) - (levelOf(model, a.levelId)?.elevation ?? 0));
  for (const s of ordered) {
    const level = levelOf(model, s.levelId);
    const above = levelAbove(model, level);
    const beamLevels = new Set([s.levelId, ...(s.type === "post" && above?.kind === "roof" ? [above.id] : [])]);
    let loads: Loads = { ...ZERO };
    const from: string[] = [];
    for (const m of beamLike) {
      if (!beamLevels.has(m.levelId) || !m.b) continue;
      const e = results.get(m.id)?.ends;
      if (!e) continue;
      const n = (near(m.a, s.a) ? 1 : 0) + (near(m.b, s.a) ? 1 : 0);
      if (n) {
        loads = add(loads, e, n);
        from.push(m.label);
      }
    }
    for (const o of model.members) {
      if (o.type !== "post" || o.id === s.id || !near(o.a, s.a)) continue;
      const ol = levelOf(model, o.levelId);
      const stacked = s.type === "post" ? ol?.id === above?.id : ol?.id === above?.id || ol?.id === s.levelId;
      const e = results.get(o.id)?.ends;
      if (stacked && e) {
        loads = add(loads, e);
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
      ends: loads,
    };
    if (s.type === "post") {
      // up to the underside of the deepest beam it carries
      const deepest = Math.max(0, ...beamLike.filter((m) => from.includes(m.label) && beamLevels.has(m.levelId)).map((m) => (results.get(m.id)?.sec?.d ?? 0) / 1000));
      const topOfPost = level ? (level.kind === "roof" ? level.elevation : framingTop(model, level)) - deepest : 2.4;
      const h = s.height ?? Math.max(0.3, topOfPost - (level?.elevation ?? 0));
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
