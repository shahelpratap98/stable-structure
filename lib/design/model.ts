// The structural model the design editor works on. Saved as one jsonb
// document on design_jobs.model (see migration 1000_design).
//
// Coordinates are metres in one plan frame shared by every level, so a post
// on the ground floor sits under the beam it carries on the first floor. Each
// level places its architect's plan page into that frame with a scale (metres
// per PDF point) and an origin (the PDF point that is 0,0 on every level).

export type Pt = { x: number; y: number };

export type MemberType = "beam" | "lintel" | "joist" | "rafter" | "post" | "bracing" | "footing" | "pile";
export type Material = "timber" | "steel";
export type TimberGrade = "SG8" | "hySPAN" | "hy90";

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
  height: number; // m, floor to underside of the level above / wall height
  kind: "foundation" | "floor" | "roof";
  plan: PlanPlacement | null;
};

export type Member = {
  id: string;
  type: MemberType;
  label: string;
  levelId: string;
  a: Pt;
  b?: Pt; // line members only
  material: Material;
  grade?: TimberGrade; // timber
  section: string; // "190x45", "2/240x45", "150PFC", "600x600x300"
  spacing?: number; // mm, joists and rafters
  tribWidth?: number; // m, loaded width for beams and lintels
  extraG?: number; // kN/m, extra permanent line load (wall or roof above)
  extraQ?: number; // kN/m, extra imposed line load
  notes?: string;
};

export type Loads = { G: number; Q: number }; // kPa

export type DesignModel = {
  version: 1;
  levels: Level[];
  members: Member[];
  // Area loads by level kind, kPa. Floors default to AS/NZS 1170.1 domestic.
  loads: { floor: Loads; roof: Loads };
};

export const MEMBER_TYPES: MemberType[] = ["beam", "lintel", "joist", "rafter", "post", "bracing", "footing", "pile"];

export const MEMBER_INFO: Record<MemberType, { label: string; prefix: string; line: boolean; colour: string; key: string }> = {
  beam: { label: "Beam", prefix: "B", line: true, colour: "#2563eb", key: "b" },
  lintel: { label: "Lintel", prefix: "L", line: true, colour: "#0891b2", key: "l" },
  joist: { label: "Joist", prefix: "J", line: true, colour: "#7c3aed", key: "j" },
  rafter: { label: "Rafter", prefix: "R", line: true, colour: "#c026d3", key: "r" },
  post: { label: "Post", prefix: "P", line: false, colour: "#ea580c", key: "p" },
  bracing: { label: "Bracing wall", prefix: "BW", line: true, colour: "#65a30d", key: "w" },
  footing: { label: "Pad footing", prefix: "F", line: false, colour: "#57534e", key: "f" },
  pile: { label: "Timber pile", prefix: "PL", line: false, colour: "#a16207", key: "i" },
};

export const DEFAULT_SECTION: Record<MemberType, string> = {
  beam: "240x45",
  lintel: "190x45",
  joist: "190x45",
  rafter: "140x45",
  post: "90x90",
  bracing: "2400",
  footing: "600x600x300",
  pile: "125",
};

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function emptyModel(): DesignModel {
  const level = (name: string, kind: Level["kind"], elevation: number, height: number): Level => ({
    id: newId(),
    name,
    kind,
    elevation,
    height,
    plan: null,
  });
  return {
    version: 1,
    levels: [level("Foundation", "foundation", -0.3, 0.3), level("Ground floor", "floor", 0, 2.4), level("Roof", "roof", 2.4, 1.2)],
    members: [],
    loads: { floor: { G: 0.5, Q: 1.5 }, roof: { G: 0.4, Q: 0.25 } },
  };
}

// Anything stored in the database goes through here, so a half-written or
// older document can never crash the editor.
export function normaliseModel(raw: unknown): DesignModel {
  const base = emptyModel();
  if (!raw || typeof raw !== "object") return base;
  const m = raw as Partial<DesignModel>;
  const levels = Array.isArray(m.levels) && m.levels.length ? m.levels : base.levels;
  const ids = new Set(levels.map((l) => l.id));
  const members = Array.isArray(m.members) ? m.members.filter((x) => x && MEMBER_TYPES.includes(x.type) && ids.has(x.levelId) && isPt(x.a)) : [];
  return {
    version: 1,
    levels,
    members,
    loads: {
      floor: { ...base.loads.floor, ...(m.loads?.floor ?? {}) },
      roof: { ...base.loads.roof, ...(m.loads?.roof ?? {}) },
    },
  };
}

export const isPt = (p: unknown): p is Pt =>
  !!p && typeof p === "object" && Number.isFinite((p as Pt).x) && Number.isFinite((p as Pt).y);

export const memberLength = (m: Member) => (m.b ? Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) : 0);

// Next free label for a type: B1, B2 ... gaps are reused only at the end.
export function nextLabel(members: Member[], type: MemberType) {
  const prefix = MEMBER_INFO[type].prefix;
  let max = 0;
  for (const m of members) {
    if (m.type !== type) continue;
    const n = Number(m.label.slice(prefix.length));
    if (m.label.startsWith(prefix) && Number.isInteger(n)) max = Math.max(max, n);
  }
  return `${prefix}${max + 1}`;
}

// Natural sort so B2 comes before B10.
export const byLabel = (a: Member, b: Member) => a.label.localeCompare(b.label, undefined, { numeric: true });

export function describeMember(m: Member) {
  if (m.type === "bracing") return `${m.section} mm wall`;
  if (m.type === "footing") return `${m.section} mm pad`;
  if (m.type === "pile") return `${m.section} mm pile`;
  return m.material === "steel" ? m.section : `${m.section} ${m.grade ?? "SG8"}`;
}

export const formatLength = (metres: number) => `${(metres * 1000).toFixed(0)} mm`;
