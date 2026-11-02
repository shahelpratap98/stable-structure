// What changed between two revisions of a design: members added, removed,
// moved or resized, and changes to the loads, site and levels. Feeds the
// "Changes since revision N" table, the revision clouds on the report plans
// and the highlighting in the editor.

import type { Calcs } from "./calc";
import { describeMember, MEMBER_INFO, type DesignModel, type Member, type Pt } from "./model";

export type Change = {
  id: string; // member id, or "" for job-wide changes
  mark: string;
  levelId: string;
  kind: "added" | "removed" | "changed";
  what: string;
  at: Pt[]; // plan points to cloud
};

const moved = (p?: Pt, q?: Pt) => (!p && !q ? false : !p || !q ? true : Math.hypot(p.x - q.x, p.y - q.y) > 0.01);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const pts = (m: Member) => [m.a, ...(m.b ? [m.b] : [])];

function memberChanges(a: Member, b: Member, ra: string | undefined, rb: string | undefined): string[] {
  const out: string[] = [];
  if (moved(a.a, b.a) || moved(a.b, b.b)) out.push("moved");
  if (a.label !== b.label) out.push(`mark ${a.label} → ${b.label}`);
  if (a.levelId !== b.levelId) out.push("moved to another level");
  if (ra !== rb) out.push(`section ${ra ?? "–"} → ${rb ?? "–"}`);
  if (!same(a.trib, b.trib)) out.push("loads changed");
  if (a.material !== b.material) out.push(`${a.material} → ${b.material}`);
  if (!same(a.sizing, b.sizing) || a.section !== b.section || a.grade !== b.grade) if (ra === rb) out.push("sizing rules changed");
  if (!same(a.wall, b.wall)) out.push(a.wall?.openings.length !== b.wall?.openings.length ? "openings changed" : "wall changed");
  if (!same(a.zone, b.zone)) out.push("joist layout changed");
  if (!same(a.brace, b.brace)) out.push("bracing changed");
  if ((a.height ?? null) !== (b.height ?? null) || (a.dz ?? 0) !== (b.dz ?? 0)) out.push("height changed");
  if (a.free !== b.free || a.restraint !== b.restraint || a.segment !== b.segment || (a.lateral ?? 0) !== (b.lateral ?? 0)) out.push("supports or restraint changed");
  return out;
}

export function diffModels(prev: DesignModel, prevCalcs: Calcs, cur: DesignModel, curCalcs: Calcs): Change[] {
  const out: Change[] = [];
  const before = new Map(prev.members.map((m) => [m.id, m]));
  const after = new Map(cur.members.map((m) => [m.id, m]));
  const secOf = (c: Calcs, id: string) => c.results.get(id)?.sec?.name;
  for (const m of cur.members) {
    const o = before.get(m.id);
    if (!o) out.push({ id: m.id, mark: m.label, levelId: m.levelId, kind: "added", what: `${MEMBER_INFO[m.type].label} added: ${secOf(curCalcs, m.id) ?? describeMember(m)}`, at: pts(m) });
    else {
      const what = memberChanges(o, m, secOf(prevCalcs, m.id), secOf(curCalcs, m.id));
      if (what.length) out.push({ id: m.id, mark: m.label, levelId: m.levelId, kind: "changed", what: `${MEMBER_INFO[m.type].label}: ${what.join(", ")}`, at: [...pts(m), ...(moved(o.a, m.a) || moved(o.b, m.b) ? pts(o) : [])] });
    }
  }
  for (const o of prev.members) if (!after.has(o.id)) out.push({ id: o.id, mark: o.label, levelId: o.levelId, kind: "removed", what: `${MEMBER_INFO[o.type].label} removed (was ${secOf(prevCalcs, o.id) ?? describeMember(o)})`, at: pts(o) });

  // opening lintels: same wall, re-sized
  for (const l of curCalcs.lintels) {
    const a = secOf(prevCalcs, l.id),
      b = secOf(curCalcs, l.id);
    if (a && b && a !== b && !out.some((c) => c.id === l.wall.id)) out.push({ id: l.id, mark: curCalcs.results.get(l.id)?.mark ?? l.member.label, levelId: l.wall.levelId, kind: "changed", what: `Lintel: section ${a} → ${b}`, at: pts(l.member) });
  }

  // job-wide
  const job = (what: string) => out.push({ id: "", mark: "–", levelId: "", kind: "changed", what, at: [] });
  for (const k of Object.keys(cur.params) as (keyof DesignModel["params"])[]) if (prev.params[k] !== cur.params[k]) job(`Design load ${k}: ${prev.params[k]} → ${cur.params[k]}`);
  if (!same(prev.site, cur.site)) job("Site data changed (wind, earthquake or ground)");
  if (!same(prev.bracing, cur.bracing)) job("Bracing demand changed");
  const lv = (m: DesignModel) => m.levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation, height: l.height, kind: l.kind, floor: l.floor }));
  if (!same(lv(prev), lv(cur))) job("Levels changed");
  if (!same(prev.notes, cur.notes)) job("Assumptions to confirm changed");
  return out;
}

// points to cloud on one level (a cloud per changed member)
export const cloudsOn = (changes: Change[], levelId: string) => changes.filter((c) => c.levelId === levelId && c.at.length);
