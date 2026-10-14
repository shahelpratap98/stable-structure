// DRAFT design calculations. Not yet checked against Stable Structure's own
// spreadsheets (quotation stage 3), so every result carries DRAFT_NOTE and must
// not be used for building consent until each calculator has been verified.
//
// What runs today:
//   - SG8 timber beams, lintels, joists and rafters, NZS 3603: simply supported,
//     uniformly distributed load; bending, shear, long- and short-term deflection.
//   - Loads passed down: beam reactions -> posts -> piles and footings.
// hySPAN / hy90 (properties from Stable Structure), steel (NZS 3404), posts,
// bracing (NZS 3604) and footings report their loads and wait for their checks.

import { MEMBER_INFO, memberLength, type DesignModel, type Level, type Member, type Pt } from "./model";

export const DRAFT_NOTE = "Draft calculation: not yet checked against Stable Structure's spreadsheets. Not for building consent.";

export type Status = "pass" | "close" | "fail" | "none";
export type Line = { label: string; value: string; note?: string };
export type Check = { name: string; demand: number; capacity: number; unit: string; ratio: number };

export type Result = {
  memberId: string;
  status: Status;
  ratio: number | null; // governing utilisation
  summary: string;
  inputs: Line[];
  loads: Line[];
  checks: Check[];
  notes: string[];
  // unfactored end reactions (kN) for line members; axial load for supports
  reaction?: { G: number; Q: number };
  suggestion?: string;
};

// ---------------------------------------------------------------- materials

// NZS 3603 (Amendment 4) SG8, dry, characteristic stresses (MPa).
const SG8 = { fb: 14.0, fs: 3.8, fc: 18.0, E: 8000 };
const PHI = 0.8; // sawn timber, NZS 3603 Table 2.1
const K1 = { permanent: 0.6, imposed: 0.8 }; // duration of load
const K2 = 2.0; // creep, seasoned timber under long-duration load
const PSI_S = 0.7; // AS/NZS 1170.0 short-term factor, residential floors
const PSI_L = 0.4; // long-term factor
const TIMBER_DENSITY = 5.0; // kN/m3, for self weight
const DEFLECTION_LONG = 300; // span / 300
const DEFLECTION_SHORT = 360; // span / 360

export const SG8_DEPTHS = [90, 140, 190, 240, 290];

// "190x45" -> depth 190, breadth 45; "2/240x45" -> two plies, breadth 90.
export function parseTimberSection(section: string): { d: number; b: number; plies: number } | null {
  const m = /^\s*(?:(\d)\s*\/\s*)?(\d{2,3})\s*[x×]\s*(\d{2,3})\s*$/i.exec(section);
  if (!m) return null;
  const plies = m[1] ? Number(m[1]) : 1;
  const d = Number(m[2]);
  const b = Number(m[3]) * plies;
  if (!d || !b || plies < 1 || plies > 4) return null;
  return { d, b, plies };
}

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
const areaLoads = (model: DesignModel, level: Level | undefined) => model.loads[loadKind(model, level)];

// Loaded width (m) a beam-like member carries.
export function loadedWidth(m: Member) {
  if (m.type === "joist" || m.type === "rafter") return (m.spacing ?? (m.type === "joist" ? 450 : 900)) / 1000;
  return m.tribWidth ?? 1.0;
}

// ---------------------------------------------------------------- timber beam

function timberBeam(model: DesignModel, m: Member, suggest = true): Result {
  const level = levelOf(model, m.levelId);
  const span = memberLength(m);
  const grade = m.grade ?? "SG8";
  const base: Result = { memberId: m.id, status: "none", ratio: null, summary: "", inputs: [], loads: [], checks: [], notes: [] };
  const sec = parseTimberSection(m.section);

  base.inputs.push(
    { label: "Member", value: `${m.label} · ${MEMBER_INFO[m.type].label}` },
    { label: "Section", value: `${m.section} ${grade}` },
    { label: "Span", value: `${fmt(span * 1000, 0)} mm`, note: "simply supported, from the plan" },
  );
  if (!sec) return { ...base, summary: "Section not recognised (use e.g. 190x45 or 2/240x45)." };
  if (span < 0.1) return { ...base, summary: "Span too short to check." };
  if (grade !== "SG8") {
    base.notes.push(`${grade} section properties will be added from the data Stable Structure supplies.`);
    return { ...base, summary: `${grade}: awaiting product properties.` };
  }

  const area = areaLoads(model, level);
  const width = loadedWidth(m);
  const self = (TIMBER_DENSITY * sec.b * sec.d) / 1e6; // kN/m
  const G = area.G * width + (m.extraG ?? 0) + self; // kN/m
  const Q = area.Q * width + (m.extraQ ?? 0);
  base.loads.push(
    { label: "Area loads", value: `G ${fmt(area.G)} kPa, Q ${fmt(area.Q)} kPa`, note: loadKind(model, level) },
    { label: "Loaded width", value: `${fmt(width)} m`, note: m.type === "joist" || m.type === "rafter" ? "member spacing" : "tributary width" },
    { label: "Self weight", value: `${fmt(self, 3)} kN/m` },
    ...(m.extraG || m.extraQ ? [{ label: "Extra line loads", value: `G ${fmt(m.extraG ?? 0)} kN/m, Q ${fmt(m.extraQ ?? 0)} kN/m` }] : []),
    { label: "Line loads", value: `G ${fmt(G)} kN/m, Q ${fmt(Q)} kN/m` },
  );

  // Section properties, mm
  const Z = (sec.b * sec.d ** 2) / 6;
  const I = (sec.b * sec.d ** 3) / 12;
  const As = (2 / 3) * sec.b * sec.d;

  // Strength: 1.35G (k1 0.6) and 1.2G + 1.5Q (k1 0.8)
  const combos = [
    { name: "1.35G", w: 1.35 * G, k1: K1.permanent },
    { name: "1.2G + 1.5Q", w: 1.2 * G + 1.5 * Q, k1: K1.imposed },
  ];
  for (const c of combos) {
    const M = (c.w * span ** 2) / 8; // kNm
    const V = (c.w * span) / 2; // kN
    const phiM = (PHI * c.k1 * SG8.fb * Z) / 1e6; // kNm (k4 = k5 = k8 = 1)
    const phiV = (PHI * c.k1 * SG8.fs * As) / 1e3; // kN
    base.checks.push({ name: `Bending, ${c.name}`, demand: M, capacity: phiM, unit: "kNm", ratio: M / phiM });
    base.checks.push({ name: `Shear, ${c.name}`, demand: V, capacity: phiV, unit: "kN", ratio: V / phiV });
  }

  // Serviceability, mm
  const L = span * 1000;
  const defl = (w: number) => (5 * w * L ** 4) / (384 * SG8.E * I); // w in N/mm = kN/m
  const dLong = K2 * defl(G + PSI_L * Q);
  const dShort = defl(PSI_S * Q);
  base.checks.push({ name: `Deflection, long term k2(G + ${PSI_L}Q)`, demand: dLong, capacity: L / DEFLECTION_LONG, unit: "mm", ratio: dLong / (L / DEFLECTION_LONG) });
  base.checks.push({ name: `Deflection, short term ${PSI_S}Q`, demand: dShort, capacity: L / DEFLECTION_SHORT, unit: "mm", ratio: dShort / (L / DEFLECTION_SHORT) });

  base.notes.push(
    `NZS 3603 SG8 dry: fb ${SG8.fb}, fs ${SG8.fs} MPa, E ${SG8.E / 1000} GPa; φ ${PHI}; k4 = k5 = 1.0.`,
    "k8 = 1.0: compression edge assumed continuously restrained (fixed sheathing or blocking).",
    `Deflection limits span/${DEFLECTION_LONG} long term (k2 = ${K2}) and span/${DEFLECTION_SHORT} short term.`,
    "Point loads from members bearing on this one are not yet included.",
  );

  const ratio = Math.max(...base.checks.map((c) => c.ratio));
  const gov = base.checks.reduce((a, c) => (c.ratio > a.ratio ? c : a));
  const status = statusFor(ratio);
  const reaction = { G: (G * span) / 2, Q: (Q * span) / 2 };

  let suggestion: string | undefined;
  if (status === "fail" && suggest) {
    for (const plies of [sec.plies, sec.plies + 1, sec.plies + 2].filter((p) => p <= 3)) {
      const found = SG8_DEPTHS.filter((d) => d >= sec.d).find((d) => {
        const trial = timberBeam(model, { ...m, section: `${plies > 1 ? plies + "/" : ""}${d}x${sec.b / sec.plies}` }, false);
        return trial.ratio !== null && trial.ratio <= 1;
      });
      if (found) {
        suggestion = `${plies > 1 ? plies + "/" : ""}${found}x${sec.b / sec.plies}`;
        break;
      }
    }
  }

  return {
    ...base,
    status,
    ratio,
    reaction,
    suggestion,
    summary: `${Math.round(ratio * 100)}% · governed by ${gov.name.toLowerCase()}`,
  };
}

// ---------------------------------------------------------------- load path

const near = (p: Pt, q: Pt, tol = 0.15) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
const BEAM_LIKE = new Set(["beam", "lintel", "joist", "rafter"]);
const SUPPORT = new Set(["post", "pile", "footing"]);

// Every member's result. Beams first, then supports from the top level down,
// so each support adds up the members and supports bearing on it.
export function runCalcs(model: DesignModel): Map<string, Result> {
  const out = new Map<string, Result>();

  for (const m of model.members) {
    if (!BEAM_LIKE.has(m.type)) continue;
    if (m.material === "steel") {
      const span = memberLength(m);
      out.set(m.id, {
        memberId: m.id,
        status: "none",
        ratio: null,
        summary: "Steel (NZS 3404): calculator to come.",
        inputs: [
          { label: "Member", value: `${m.label} · ${MEMBER_INFO[m.type].label}` },
          { label: "Section", value: m.section },
          { label: "Span", value: `${fmt(span * 1000, 0)} mm` },
        ],
        loads: [],
        checks: [],
        notes: ["Steel beams and posts to NZS 3404 arrive with the stage 3 calculators."],
      });
      continue;
    }
    out.set(m.id, timberBeam(model, m));
  }

  const ordered = model.members
    .filter((m) => SUPPORT.has(m.type))
    .sort((a, b) => (levelOf(model, b.levelId)?.elevation ?? 0) - (levelOf(model, a.levelId)?.elevation ?? 0));

  for (const s of ordered) {
    const level = levelOf(model, s.levelId);
    const above = levelAbove(model, level);
    // Framing at the top of this storey bears on its posts, piles and footings;
    // a post also carries roof framing sitting on its top.
    const beamLevels = new Set([s.levelId, ...(s.type === "post" && above?.kind === "roof" ? [above.id] : [])]);
    let G = 0;
    let Q = 0;
    const from: string[] = [];
    for (const m of model.members) {
      if (!BEAM_LIKE.has(m.type) || !beamLevels.has(m.levelId) || !m.b) continue;
      const r = out.get(m.id)?.reaction;
      if (!r) continue;
      const ends = (near(m.a, s.a) ? 1 : 0) + (near(m.b, s.a) ? 1 : 0);
      if (ends) {
        G += r.G * ends;
        Q += r.Q * ends;
        from.push(m.label);
      }
    }
    for (const p of model.members) {
      if (p.type !== "post" || p.id === s.id || !near(p.a, s.a)) continue;
      const pl = levelOf(model, p.levelId);
      const stacked = s.type === "post" ? pl?.id === above?.id : pl?.id === above?.id || pl?.id === s.levelId;
      const r = out.get(p.id)?.reaction;
      if (stacked && r) {
        G += r.G;
        Q += r.Q;
        from.push(p.label);
      }
    }
    const N = Math.max(1.35 * G, 1.2 * G + 1.5 * Q);
    const res: Result = {
      memberId: s.id,
      status: "none",
      ratio: null,
      summary: from.length ? `N* ${fmt(N, 1)} kN from ${from.join(", ")}` : "No members bearing on it yet.",
      inputs: [
        { label: "Member", value: `${s.label} · ${MEMBER_INFO[s.type].label}` },
        { label: "Size", value: s.section },
      ],
      loads: [
        { label: "Carries", value: from.length ? from.join(", ") : "nothing yet" },
        { label: "Axial load", value: `G ${fmt(G)} kN, Q ${fmt(Q)} kN` },
        { label: "Design load N*", value: `${fmt(N)} kN`, note: "max of 1.35G and 1.2G + 1.5Q" },
      ],
      checks: [],
      notes: [`${MEMBER_INFO[s.type].label} capacity check arrives with the stage 3 calculators.`],
      reaction: { G, Q },
    };
    if (s.type === "footing") {
      const dims = s.section.split(/x/i).map(Number);
      if (dims.length >= 2 && dims[0] > 0 && dims[1] > 0) {
        const areaM2 = (dims[0] / 1000) * (dims[1] / 1000);
        res.loads.push({ label: "Bearing pressure", value: `${fmt(N / areaM2, 0)} kPa`, note: "factored, before footing self weight" });
      }
    }
    out.set(s.id, res);
  }

  for (const m of model.members) {
    if (out.has(m.id)) continue;
    out.set(m.id, {
      memberId: m.id,
      status: "none",
      ratio: null,
      summary: m.type === "bracing" ? "Bracing (NZS 3604): calculator to come." : "No calculation yet.",
      inputs: [{ label: "Member", value: `${m.label} · ${MEMBER_INFO[m.type].label}` }],
      loads: [],
      checks: [],
      notes: m.type === "bracing" ? ["Bracing to NZS 3604 is subject to Standards NZ licensing."] : [],
    });
  }
  return out;
}

export const STATUS_COLOUR: Record<Status, string> = {
  pass: "#16a34a",
  close: "#d97706",
  fail: "#dc2626",
  none: "#64748b",
};
export const STATUS_LABEL: Record<Status, string> = { pass: "Passes", close: "Close to limit", fail: "Fails", none: "No check yet" };
