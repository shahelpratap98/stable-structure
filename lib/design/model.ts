// The structural model the design editor works on. Saved as one jsonb
// document on design_jobs.model (see migration 1000_design).
//
// Coordinates are metres in one plan frame shared by every level, so a post
// on the ground floor sits under the beam it carries on the first floor. Each
// level places its architect's plan page into that frame with a scale (metres
// per PDF point) and an origin (the PDF point that is 0,0 on every level).
//
// Version 2 follows Stable Structure's own framing models (Lot 6, 26121):
// walls with openings (lintels come from the openings), tributary loads,
// automatic section selection SG8 -> hySPAN -> steel, joist zones, GIB
// bracing lines and pole / block retaining walls.

import { normaliseSite, type SiteData } from "./site";
import { normalisePaperwork, type Paperwork } from "./paperwork";
import { defaultRaft, type RaftSpec } from "./raft";
import { defaultDeck, defaultStair, type DeckSpec, type StairSpec } from "./deck";
export type Pt = { x: number; y: number };

export type MemberType =
  | "beam"
  | "lintel"
  | "joist"
  | "rafter"
  | "joistzone"
  | "raft"
  | "deck"
  | "stair"
  | "wall"
  | "post"
  | "bracing"
  | "footing"
  | "pile"
  | "retaining";
export type Material = "timber" | "steel" | "concrete";
export type TimberGrade = "SG8" | "SG10" | "GL8" | "GL10" | "GL12" | "hySPAN" | "hyONE" | "hy90" | "LVL11";
export type Family = "SG8" | "SG10" | "GL8" | "GL10" | "GL12" | "LVL" | "HYONE" | "HY90" | "LVL11" | "PFC" | "UB" | "UC";

export type PlanPlacement = {
  planId: string;
  page: number; // 1-based
  scale: number | null; // metres per PDF point; null until the scale is set
  origin: Pt; // PDF point that maps to plan 0,0
};

export type Level = {
  id: string;
  name: string;
  elevation: number; // m, floor (or top of foundation) level
  height: number; // m, floor to underside of the level above / stud height
  kind: "foundation" | "floor" | "roof";
  floor: "slab" | "timber"; // what this storey's walls stand on (bracing caps)
  plan: PlanPlacement | null;
};

// What a beam or lintel carries: loaded widths (m) of floor, wet area (extra
// over floor), roof on plan, and how many first-floor walls sit on it.
export type Trib = { floor?: number; wet?: number; roof?: number; wallExt?: number; wallInt?: number; wallBlock?: number };

export type Sizing = {
  mode: "auto" | "fixed";
  families?: Family[]; // order tried; default SG8, LVL, PFC, UB, UC
  minD?: number; // mm
  maxD?: number; // mm, e.g. 250 to stay near flush with 240 joists
  maxB?: number; // mm, e.g. 90 to fit in a 90 wall
  dlim?: number; // mm, absolute long-term deflection cap (12 over garage doors)
};

export type Opening = {
  id: string;
  label: string; // lintel mark, L1, LF3 ...
  offset: number; // m from the wall's start to the opening's near edge
  width: number; // m, clear
  sill: number; // m above floor; 0 = door
  head?: number; // m above floor to the top of the opening; default under the lintel at the top plates
  trib?: Trib;
  sizing?: Sizing;
  note?: string;
};

export type WallSpec = {
  kind: "ext" | "int" | "block";
  thickness: number; // mm
  loadbearing: boolean;
  cladding: "light" | "brick";
  studSpacing: number; // mm
  openings: Opening[];
};

export type ZoneSpec = {
  dir: "x" | "y"; // the direction the joists span
  spacing: number; // mm
  wet: boolean;
  doubled: number[]; // positions (m, plan coordinate across the span) of doubled joists under walls
  tableSpan?: number; // m, NZS 3604 Table 7.1 span to check against
  roof?: RoofSpec; // set when the zone is roof framing (on the top storey or a roof level)
};

// Roof framing over a zone: the rafters (or trusses) span the zone's `dir`;
// gable and hip roofs have their ridge down the middle, across that span.
// "low": level rafters on the plates, tapered firrings giving the fall to a box gutter, purlins on the firrings
export type RoofForm = "flat" | "mono" | "gable" | "hip" | "low";
export type RoofSpec = {
  form: RoofForm;
  pitch: number; // degrees
  framing: "rafters" | "trusses";
  purlins: number; // mm centres along the slope, 0 = none
  overhang: number; // m, eaves past the zone edge
  gutter?: number; // low roofs: m from the zone's start edge (north or west) to the box gutter the firrings fall to; default the far edge
};
export const defaultRoof = (): RoofSpec => ({ form: "gable", pitch: 20, framing: "rafters", purlins: 900, overhang: 0.45 });
export const roofHalfSpan = (r: RoofSpec) => r.framing === "rafters" && (r.form === "gable" || r.form === "hip");

export type BraceSystem = "GS1N" | "GS2N" | "GS2NOM" | "GSPH" | "BL1H" | "BLGH" | "BLPH" | "BW" | "PORTAL";
export type RetainSpec = { kind: "pole" | "block"; h0: number; h1: number; fall?: number }; // retained heights (m) at each end; fall: how far the base drops from start to end (m, sloping ground)

export type Member = {
  id: string;
  type: MemberType;
  label: string;
  levelId: string;
  a: Pt;
  b?: Pt; // line members, and the opposite corner of a joist zone
  material: Material;
  grade?: TimberGrade;
  section: string; // fixed sizing: "190x45", "2/240x45", "250PFC", "600x600x300"
  role?: string; // what it is, for the schedule ("Flush floor beam")
  spacing?: number; // mm, single joists and rafters
  tribWidth?: number; // v1 loaded width, migrated to trib
  trib?: Trib;
  sizing?: Sizing;
  extraG?: number; // kN/m
  extraQ?: number; // kN/m
  wall?: WallSpec;
  zone?: ZoneSpec;
  raft?: RaftSpec;
  deck?: DeckSpec;
  stair?: StairSpec;
  brace?: { system: BraceSystem; line?: string; bu?: number; base?: "fixed" | "pinned" }; // bu: rating for specifically designed elements; base: portal leg bases
  rw?: RetainSpec;
  height?: number; // m, post height override
  free?: "a" | "b"; // beams: this end is unsupported (a cantilever)
  restraint?: "full" | "ends"; // steel beams: compression flange held continuously (default) or only at supports
  segment?: number; // m, spacing of intermediate lateral restraints when restraint is "ends"
  dz?: number; // m, height offset from the level (split levels): + raises the member
  lateral?: number; // kN (ULS) at the top of a post: a cantilever post, fixed at its base
  fc?: number; // MPa, concrete members
  notes?: string;
};

// Job design parameters (Lot 6 "Design loads"). kPa unless noted.
export type DesignParams = {
  Gf: number; // floor dead
  Gwet: number; // tiled wet area dead
  Qf: number; // floor live
  Groof: number; // roof dead on plan
  Qroof: number; // roof live
  Su: number; // snow
  gWallExt: number; // external wall, per m2
  gWallInt: number; // internal wall
  gWallBlock: number; // concrete block wall, per m2
  wallHeight: number; // m, height of walls above (for their weight)
  Ppt: number; // kN, imposed point load at midspan of every beam / lintel
  dPlim: number; // mm, deflection under that point load alone
  dAbs: number; // mm, absolute long-term deflection cap
  beamMaxD: number; // mm, default max depth for auto-sized beams (0 = none)
  k1Roof: number; // duration factor for roof live load combinations
};

export type BracingDemand = { windAlong: number; windAcross: number; eq: number }; // BU

export type DesignModel = {
  version: 2;
  levels: Level[];
  members: Member[];
  params: DesignParams;
  bracing: Record<string, BracingDemand>; // by level id
  notes: string[]; // assumptions to confirm before issue
  site?: SiteData; // wind, earthquake and ground data for specific design
  paperwork?: Paperwork; // PS1 and design features report details
  grids?: { x: GridLine[]; y: GridLine[] }; // set-out grid: x lines (constant x) and y lines (constant y)
  ack?: string[]; // completeness gaps the engineer has marked OK (a stair void, say): keys from complete.ts
};

export type GridLine = { n: string; at: number }; // label and plan coordinate, m

// "1=0, 2=0.35, 3=6.33" -> grid lines
export const gridFromText = (text: string): GridLine[] =>
  text
    .split(/[,;\n]+/)
    .map((p) => p.trim().match(/^([^=\s]+)\s*=\s*(-?[\d.]+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ n: m[1].slice(0, 6), at: Number(m[2]) }))
    .filter((g) => Number.isFinite(g.at));
export const gridToText = (g: GridLine[]) => g.map((l) => `${l.n}=${l.at}`).join(", ");

export const MEMBER_TYPES: MemberType[] = ["beam", "lintel", "joist", "rafter", "joistzone", "wall", "post", "bracing", "footing", "pile", "raft", "deck", "stair", "retaining"];

export const MEMBER_INFO: Record<MemberType, { label: string; prefix: string; line: boolean; colour: string; key: string; area?: boolean }> = {
  beam: { label: "Beam", prefix: "B", line: true, colour: "#2563eb", key: "b" },
  lintel: { label: "Lintel", prefix: "L", line: true, colour: "#0891b2", key: "l" },
  joist: { label: "Joist", prefix: "J", line: true, colour: "#7c3aed", key: "j" },
  rafter: { label: "Rafter", prefix: "R", line: true, colour: "#c026d3", key: "r" },
  joistzone: { label: "Joist zone", prefix: "JZ", line: true, colour: "#b7791f", key: "z", area: true },
  wall: { label: "Wall", prefix: "W", line: true, colour: "#475569", key: "w" },
  post: { label: "Post", prefix: "P", line: false, colour: "#ea580c", key: "p" },
  bracing: { label: "Bracing element", prefix: "BR", line: true, colour: "#65a30d", key: "g" },
  footing: { label: "Pad footing", prefix: "F", line: false, colour: "#57534e", key: "f" },
  pile: { label: "Timber pile", prefix: "PL", line: false, colour: "#a16207", key: "i" },
  raft: { label: "Rib raft slab", prefix: "RF", line: true, colour: "#0f766e", key: "k", area: true },
  deck: { label: "Deck", prefix: "DK", line: true, colour: "#6b7a3a", key: "d", area: true },
  stair: { label: "Stair", prefix: "ST", line: true, colour: "#7d6a4f", key: "e" },
  retaining: { label: "Retaining wall", prefix: "RW", line: true, colour: "#7c5a35", key: "t" },
};

export const DEFAULT_SECTION: Record<MemberType, string> = {
  beam: "2/240x45",
  lintel: "2/190x45",
  joist: "240x45",
  rafter: "140x45",
  joistzone: "240x45",
  wall: "90x45",
  post: "90x90",
  bracing: "",
  footing: "600x600x300",
  pile: "125",
  raft: "",
  deck: "240x45",
  stair: "240x45",
  retaining: "",
};

export const DEFAULT_PARAMS: DesignParams = {
  Gf: 0.6,
  Gwet: 1.2,
  Qf: 1.5,
  Groof: 0.55,
  Qroof: 0.25,
  Su: 0,
  gWallExt: 0.45,
  gWallInt: 0.3,
  gWallBlock: 3.0,
  wallHeight: 2.42,
  Ppt: 1.0,
  dPlim: 0.7,
  dAbs: 20,
  beamMaxD: 0,
  k1Roof: 0.97,
};

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function emptyModel(): DesignModel {
  const level = (name: string, kind: Level["kind"], elevation: number, height: number, floor: Level["floor"]): Level => ({
    id: newId(),
    name,
    kind,
    elevation,
    height,
    floor,
    plan: null,
  });
  return {
    version: 2,
    levels: [level("Foundation", "foundation", -0.3, 0.3, "slab"), level("Ground floor", "floor", 0, 2.4, "slab"), level("Roof", "roof", 2.4, 1.2, "timber")],
    members: [],
    params: { ...DEFAULT_PARAMS },
    bracing: {},
    notes: [],
  };
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

// Anything stored in the database goes through here, so a half-written or
// older (version 1) document can never crash the editor.
export function normaliseModel(raw: unknown): DesignModel {
  const base = emptyModel();
  if (!raw || typeof raw !== "object") return base;
  const m = raw as Partial<DesignModel> & { loads?: { floor?: { G?: number; Q?: number }; roof?: { G?: number; Q?: number } } };
  const levels: Level[] = (Array.isArray(m.levels) && m.levels.length ? m.levels : base.levels).map((l) => ({
    ...l,
    floor: l.floor === "timber" || l.floor === "slab" ? l.floor : l.kind === "floor" && l.elevation > 0.5 ? "timber" : "slab",
  }));
  const ids = new Set(levels.map((l) => l.id));
  const byId = new Map(levels.map((l) => [l.id, l]));
  const v1 = m.version !== 2;

  const params: DesignParams = { ...DEFAULT_PARAMS };
  if (v1 && m.loads) {
    params.Gf = num(m.loads.floor?.G, params.Gf);
    params.Qf = num(m.loads.floor?.Q, params.Qf);
    params.Groof = num(m.loads.roof?.G, params.Groof);
    params.Qroof = num(m.loads.roof?.Q, params.Qroof);
  } else if (m.params) {
    for (const k of Object.keys(DEFAULT_PARAMS) as (keyof DesignParams)[]) params[k] = num(m.params[k], DEFAULT_PARAMS[k]);
  }

  const members = (Array.isArray(m.members) ? m.members : [])
    .filter((x) => x && (MEMBER_TYPES.includes(x.type) || (x.type as string) === "bracing") && ids.has(x.levelId) && isPt(x.a))
    .map((x): Member => {
      const out: Member = { ...x };
      // v1 bracing walls were plain lines with a length in the section field
      if (out.type === "bracing" && !out.brace) out.brace = { system: "GS2N" };
      if (out.type === "wall") out.wall = { ...defaultWall(), ...(out.wall ?? {}), openings: Array.isArray(out.wall?.openings) ? out.wall!.openings : [] };
      if (out.type === "joistzone") out.zone = { ...defaultZone(), ...(out.zone ?? {}), ...(out.zone?.roof ? { roof: { ...defaultRoof(), ...out.zone.roof } } : {}) };
      if (out.type === "raft") out.raft = { ...defaultRaft(), ...(out.raft ?? {}) };
      if (out.type === "deck") out.deck = { ...defaultDeck(), ...(out.deck ?? {}) };
      if (out.type === "stair") out.stair = { ...defaultStair(), ...(out.stair ?? {}) };
      if (out.type === "retaining") out.rw = { kind: "pole", h0: 1, h1: 1, ...(out.rw ?? {}) };
      // v1 loaded width -> tributaries on whatever surface the level carries
      if (!out.trib && out.tribWidth !== undefined && (out.type === "beam" || out.type === "lintel")) {
        const lvl = byId.get(out.levelId);
        const roof = lvl?.kind === "roof" || levelAboveOf(levels, lvl)?.kind === "roof";
        out.trib = roof ? { roof: out.tribWidth } : { floor: out.tribWidth };
      }
      if (v1 && (out.type === "beam" || out.type === "lintel") && !out.sizing) out.sizing = { mode: "fixed" };
      return out;
    });

  const bracing: Record<string, BracingDemand> = {};
  if (m.bracing && typeof m.bracing === "object") {
    for (const [k, d] of Object.entries(m.bracing)) if (ids.has(k) && d) bracing[k] = { windAlong: num(d.windAlong, 0), windAcross: num(d.windAcross, 0), eq: num(d.eq, 0) };
  }

  return {
    version: 2,
    levels,
    members,
    params,
    bracing,
    notes: Array.isArray(m.notes) ? m.notes.filter((n) => typeof n === "string").slice(0, 100) : [],
    site: normaliseSite(m.site),
    paperwork: normalisePaperwork(m.paperwork),
    grids:
      m.grids && typeof m.grids === "object"
        ? {
            x: (Array.isArray(m.grids.x) ? m.grids.x : []).filter((g) => g && typeof g.n === "string" && Number.isFinite(g.at)).slice(0, 60),
            y: (Array.isArray(m.grids.y) ? m.grids.y : []).filter((g) => g && typeof g.n === "string" && Number.isFinite(g.at)).slice(0, 60),
          }
        : undefined,
    ack: Array.isArray(m.ack) ? [...new Set(m.ack.filter((k): k is string => typeof k === "string" && k.length <= 120))].slice(0, 300) : undefined,
  };
}

export const defaultWall = (): WallSpec => ({ kind: "ext", thickness: 90, loadbearing: true, cladding: "light", studSpacing: 600, openings: [] });
export const defaultZone = (): ZoneSpec => ({ dir: "y", spacing: 400, wet: false, doubled: [] });

export function levelAboveOf(levels: Level[], level: Level | undefined) {
  if (!level) return undefined;
  return [...levels].filter((l) => l.elevation > level.elevation + 1e-6).sort((a, b) => a.elevation - b.elevation)[0];
}

// Top of the framing a storey carries: floor framing sits on the wall top
// plates up to the underside of the flooring above (20 mm); under a roof (or
// with nothing above) it is the wall top.
export function framingTop(model: Pick<DesignModel, "levels">, level: Level) {
  const top = level.elevation + level.height;
  const above = levelAboveOf(model.levels, level);
  return above && above.kind !== "roof" ? Math.max(top, above.elevation - 0.02) : top;
}

export const isPt = (p: unknown): p is Pt =>
  !!p && typeof p === "object" && Number.isFinite((p as Pt).x) && Number.isFinite((p as Pt).y);

// A lintel sits in the wall, under its top plates, not up in the floor framing.
export const lintelTop = (level: Level) => level.elevation + level.height - 0.09;

export const memberLength = (m: { a: Pt; b?: Pt }) => (m.b ? Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) : 0);

// Every mark in use: members plus wall-opening lintels.
export function allLabels(model: Pick<DesignModel, "members">) {
  const out: string[] = [];
  for (const m of model.members) {
    out.push(m.label);
    for (const o of m.wall?.openings ?? []) out.push(o.label);
  }
  return out;
}

// Next free mark: B1, B2 ... gaps are reused only at the end.
export function nextMark(model: Pick<DesignModel, "members">, prefix: string) {
  let max = 0;
  for (const l of allLabels(model)) {
    if (!l.startsWith(prefix)) continue;
    const n = Number(l.slice(prefix.length));
    if (Number.isInteger(n)) max = Math.max(max, n);
  }
  return `${prefix}${max + 1}`;
}
export const nextLabel = (model: Pick<DesignModel, "members">, type: MemberType) => nextMark(model, MEMBER_INFO[type].prefix);

// Natural sort so B2 comes before B10.
export const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true });

export function describeMember(m: Member) {
  switch (m.type) {
    case "wall":
      return `${m.wall?.kind === "block" ? "Block" : m.wall?.kind === "int" ? "Internal" : "External"} ${m.wall?.thickness ?? 90} wall`;
    case "joistzone":
      return m.zone?.roof
        ? m.zone.roof.framing === "trusses"
          ? `Trusses @ ${m.zone.spacing}, ${m.zone.roof.form} ${m.zone.roof.pitch}°`
          : `${m.section} ${m.grade ?? "SG8"} rafters @ ${m.zone.spacing}, ${m.zone.roof.form} ${m.zone.roof.pitch}°`
        : `${m.section} ${m.grade ?? "SG8"} @ ${m.zone?.spacing ?? 400}`;
    case "bracing":
      return BRACE_NAME[m.brace?.system ?? "GS2N"];
    case "retaining":
      return `${m.rw?.kind === "block" ? "Block" : "Pole"} wall, ${m.rw?.h0 ?? 0}–${m.rw?.h1 ?? 0} m`;
    case "footing":
      return `${m.section} mm pad`;
    case "pile":
      return `${m.section} mm pile`;
    case "deck":
      return `Deck, ${m.section} H3.2 joists @ ${m.deck?.spacing ?? 400}`;
    case "stair":
      return `Stair, ${m.stair?.stringers ?? 3} × ${m.section} H3.2 stringers, ${((m.stair?.width ?? 1) * 1000).toFixed(0)} wide`;
    case "raft": {
      const r = m.raft ?? defaultRaft();
      return `Rib raft, ${r.pod + r.topping} deep, ribs ${r.ribWidth} @ ${r.ribSpacing}`;
    }
    default:
      return m.material === "steel" ? m.section : `${m.section} ${m.grade ?? "SG8"}`;
  }
}

export const BRACE_NAME: Record<BraceSystem, string> = {
  GS1N: "GS1-N",
  GS2N: "GS2-N",
  GS2NOM: "GS2-NOM",
  GSPH: "GSP-H",
  BL1H: "BL1-H",
  BLGH: "BLG-H",
  BLPH: "BLP-H",
  BW: "Blockwork (SED)",
  PORTAL: "Portal frame (SED)",
};

export const formatLength = (metres: number) => `${(metres * 1000).toFixed(0)} mm`;

// Point a given distance along a line member.
export function along(m: { a: Pt; b?: Pt }, d: number): Pt {
  if (!m.b) return m.a;
  const L = memberLength(m) || 1;
  return { x: m.a.x + ((m.b.x - m.a.x) * d) / L, y: m.a.y + ((m.b.y - m.a.y) * d) / L };
}
