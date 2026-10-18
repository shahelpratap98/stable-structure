// Solid parts for the 3D view and the IFC export, so both show the same
// structure. Metres; z is up; plan coordinates as drawn (y down the plan).
//
// "bar": a box running horizontally from a to b, between heights z0 and z1,
// w wide, shifted sideways by off along the left-hand normal (-uy, ux).
// "col": an upright box or cylinder.

import type { Calcs, Result } from "./calc";
import { parseTimberSection, STEEL } from "./materials";
import { along, framingTop, memberLength, type DesignModel, type Level, type Member, type Pt } from "./model";
import { poleLayout } from "./retaining";

export type Layer = "walls" | "framing" | "glass" | "joists" | "beams" | "lintels" | "posts" | "foundations" | "bracing" | "retaining";
export type Tone =
  | "member"
  | "framing"
  | "trimmer"
  | "wallExt"
  | "wallInt"
  | "block"
  | "glass"
  | "joist"
  | "joistDbl"
  | "concrete"
  | "pole"
  | "rail"
  | `brace:${string}`;

export type Part =
  | { kind: "bar"; id: string; layer: Layer; tone: Tone; a: Pt; b: Pt; z0: number; z1: number; w: number; off?: number }
  | { kind: "col"; id: string; layer: Layer; tone: Tone; x: number; y: number; z0: number; z1: number; w: number; d: number; round?: boolean };

export function levelAbove(model: DesignModel, level: Level) {
  return [...model.levels].filter((l) => l.elevation > level.elevation + 1e-6).sort((a, b) => a.elevation - b.elevation)[0];
}

// Top of this storey's framing (see framingTop in model.ts).
export const storeyTop = (model: DesignModel, level: Level) => framingTop(model, level);

type Sec = { b: number; d: number; steel?: (typeof STEEL)[number] };

function secOf(m: Member, r: Result | undefined): Sec {
  const s = r?.sec;
  if (s) {
    const steel = STEEL.find((x) => x.name === s.name);
    return { b: s.b / 1000, d: s.d / 1000, steel };
  }
  const steel = STEEL.find((x) => x.name.toUpperCase() === m.section.replace(/\s/g, "").toUpperCase());
  if (steel) return { b: steel.b / 1000, d: steel.d / 1000, steel };
  const t = parseTimberSection(m.section);
  return t ? { b: t.b / 1000, d: t.d / 1000 } : { b: 0.09, d: 0.24 };
}

// A beam-shaped member between a and b with its top at `top`.
function beamParts(id: string, layer: Layer, a: Pt, b: Pt, top: number, s: Sec): Part[] {
  if (!s.steel) return [{ kind: "bar", id, layer, tone: "member", a, b, z0: top - s.d, z1: top, w: s.b }];
  const st = s.steel;
  const d = st.d / 1000,
    bf = st.b / 1000,
    tw = st.tw / 1000,
    tf = st.tf / 1000;
  const flanges: Part[] = [
    { kind: "bar", id, layer, tone: "member", a, b, z0: top - tf, z1: top, w: bf },
    { kind: "bar", id, layer, tone: "member", a, b, z0: top - d, z1: top - d + tf, w: bf },
  ];
  const webOff = st.fam === "PFC" ? -bf / 2 + tw / 2 : 0;
  return [...flanges, { kind: "bar", id, layer, tone: "member", a, b, z0: top - d + tf, z1: top - tf, w: tw, off: webOff }];
}

function sub(m: { a: Pt; b?: Pt }, s0: number, s1: number) {
  return { a: along(m, s0), b: along(m, s1) };
}

export function partsFor(model: DesignModel, calcs: Calcs, m: Member): Part[] {
  const level = model.levels.find((l) => l.id === m.levelId);
  if (!level) return [];
  const r = calcs.results.get(m.id);
  const base = level.elevation;
  const top = level.elevation + level.height;
  const sTop = storeyTop(model, level);
  const out: Part[] = [];

  switch (m.type) {
    case "beam":
    case "lintel":
    case "joist":
    case "rafter": {
      if (!m.b) return [];
      const s = secOf(m, r);
      const t = level.kind === "roof" ? base + s.d : sTop;
      return beamParts(m.id, m.type === "lintel" ? "lintels" : m.type === "joist" ? "joists" : "beams", m.a, m.b, t, s);
    }
    case "joistzone": {
      if (!m.b || !m.zone) return [];
      const s = secOf(m, r);
      const sp = m.zone.spacing / 1000;
      const x0 = Math.min(m.a.x, m.b.x),
        x1 = Math.max(m.a.x, m.b.x),
        y0 = Math.min(m.a.y, m.b.y),
        y1 = Math.max(m.a.y, m.b.y);
      const t = level.kind === "roof" ? base + s.d : sTop;
      const ns = m.zone.dir === "y";
      const lo = ns ? x0 : y0,
        hi = ns ? x1 : y1;
      const dbl = m.zone.doubled;
      const joist = (v: number, tone: Tone) =>
        out.push(ns ? { kind: "bar", id: m.id, layer: "joists", tone, a: { x: v, y: y0 }, b: { x: v, y: y1 }, z0: t - s.d, z1: t, w: 0.045 } : { kind: "bar", id: m.id, layer: "joists", tone, a: { x: x0, y: v }, b: { x: x1, y: v }, z0: t - s.d, z1: t, w: 0.045 });
      let n = 0;
      for (let v = lo + 0.0225; v <= hi - 0.0225 + 1e-6 && n < 400; v += sp, n++) if (!dbl.some((d) => Math.abs(d - v) < 0.18)) joist(v, "joist");
      for (const d of dbl) {
        joist(d - 0.0225, "joistDbl");
        joist(d + 0.0225, "joistDbl");
      }
      return out;
    }
    case "wall": {
      if (!m.b || !m.wall) return [];
      const w = m.wall;
      const L = memberLength(m);
      const th = w.thickness / 1000;
      const tone: Tone = w.kind === "block" ? "block" : w.kind === "int" ? "wallInt" : "wallExt";
      const ops = [...w.openings].sort((a, b) => a.offset - b.offset);
      const lintelTop = top - 0.045;
      const head = (o: (typeof ops)[number]) => {
        const lr = calcs.results.get(`${m.id}#${o.id}`);
        return lintelTop - (lr?.sec?.d ?? 190) / 1000;
      };
      const panel = (s0: number, s1: number, z0: number, z1: number) => {
        if (s1 - s0 < 0.001 || z1 - z0 < 0.005) return;
        out.push({ kind: "bar", id: m.id, layer: "walls", tone, ...sub(m, s0, s1), z0, z1, w: th });
      };
      let cur = 0;
      for (const o of ops) {
        panel(cur, o.offset, base, top);
        panel(o.offset, o.offset + o.width, lintelTop, top); // plates over the lintel
        if (o.sill > 0) {
          panel(o.offset, o.offset + o.width, base, base + o.sill);
          out.push({ kind: "bar", id: m.id, layer: "glass", tone: "glass", ...sub(m, o.offset, o.offset + o.width), z0: base + o.sill, z1: head(o), w: 0.012 });
        }
        cur = o.offset + o.width;
      }
      panel(cur, L, base, top);
      if (w.kind === "block") return out;

      // stud framing: plates, studs at spacing, nogs, trimmers and jack studs
      const sp = w.studSpacing / 1000;
      const fr = (s0: number, s1: number, z0: number, z1: number, t: Tone = "framing") => {
        if (s1 - s0 < 0.001 || z1 - z0 < 0.005) return;
        out.push({ kind: "bar", id: m.id, layer: "framing", tone: t, ...sub(m, s0, s1), z0, z1, w: th });
      };
      const zb = base + 0.045,
        zt = top - 0.09;
      let q = 0;
      for (const o of ops)
        if (o.sill <= 0.05) {
          fr(q, o.offset, base, zb);
          q = o.offset + o.width;
        }
      fr(q, L, base, zb);
      fr(0, L, zt, zt + 0.045);
      fr(0, L, zt + 0.045, top);
      const inOpening = (s: number) => ops.some((o) => s + 0.0225 > o.offset - 0.09 && s - 0.0225 < o.offset + o.width + 0.09);
      let full: number[] = [];
      for (let s = 0.0225; s <= L - 0.0225 + 1e-6; s += sp) if (!inOpening(s)) full.push(s);
      if (!inOpening(L - 0.0225)) full.push(L - 0.0225);
      for (const o of ops) {
        if (o.offset - 0.0675 > 0) full.push(o.offset - 0.0675);
        if (o.offset + o.width + 0.0675 < L) full.push(o.offset + o.width + 0.0675);
      }
      full = full.sort((a, b) => a - b).filter((s, i, arr) => i === 0 || s - arr[i - 1] >= 0.05);
      for (const s of full) fr(s - 0.0225, s + 0.0225, zb, zt);
      for (let z = zb + 0.8; z < zt - 0.1; z += 0.8)
        for (let i = 0; i < full.length - 1; i++) {
          const a = full[i] + 0.0225,
            b = full[i + 1] - 0.0225;
          if (b - a < 0.04 || ops.some((o) => a < o.offset + o.width + 0.09 && b > o.offset - 0.09)) continue;
          fr(a, b, z, z + 0.045);
        }
      for (const o of ops) {
        const h = head(o);
        fr(o.offset - 0.045, o.offset, zb, h, "trimmer");
        fr(o.offset + o.width, o.offset + o.width + 0.045, zb, h, "trimmer");
        if (o.sill > 0.05) {
          fr(o.offset, o.offset + o.width, base + o.sill - 0.045, base + o.sill);
          for (let s = o.offset + 0.0225; s <= o.offset + o.width - 0.0225; s += sp) fr(s - 0.0225, s + 0.0225, zb, base + o.sill - 0.045);
        }
        for (let s = o.offset + 0.0225; s <= o.offset + o.width - 0.0225; s += sp) fr(s - 0.0225, s + 0.0225, lintelTop, zt);
      }
      return out;
    }
    case "post": {
      const s = secOf(m, r);
      const calcH = Number.parseFloat(r?.kv.find((k) => k.label === "Height")?.value ?? "");
      const h = m.height ?? (Number.isFinite(calcH) ? calcH : level.height);
      return [{ kind: "col", id: m.id, layer: "posts", tone: "member", x: m.a.x, y: m.a.y, z0: base, z1: base + h, w: s.b, d: s.d }];
    }
    case "pile": {
      const dia = (Number.parseFloat(m.section) || 125) / 1000;
      return [{ kind: "col", id: m.id, layer: "foundations", tone: "member", x: m.a.x, y: m.a.y, z0: base - 0.9, z1: base + Math.max(0, level.height - 0.15), w: dia, d: dia, round: true }];
    }
    case "footing": {
      const [w, l, t] = m.section.split(/x/i).map((n) => Number(n) / 1000);
      return [{ kind: "col", id: m.id, layer: "foundations", tone: "member", x: m.a.x, y: m.a.y, z0: base - (t > 0 ? t : 0.3), z1: base, w: w > 0 ? w : 0.6, d: l > 0 ? l : w > 0 ? w : 0.6 }];
    }
    case "bracing": {
      if (!m.b) return [];
      return [{ kind: "bar", id: m.id, layer: "bracing", tone: `brace:${m.brace?.system ?? "GS2N"}`, a: m.a, b: m.b, z0: base + 0.045, z1: top - 0.09, w: 0.02, off: 0.06 }];
    }
    case "retaining": {
      if (!m.b || !m.rw) return [];
      const L = memberLength(m);
      if (m.rw.kind === "block") {
        const h = Math.max(m.rw.h0, m.rw.h1);
        out.push({ kind: "bar", id: m.id, layer: "retaining", tone: "block", a: m.a, b: m.b, z0: base, z1: base + h, w: 0.19 });
        out.push({ kind: "bar", id: m.id, layer: "retaining", tone: "concrete", a: m.a, b: m.b, z0: base - (h > 1.0 ? 0.4 : 0.3), z1: base, w: h > 1.0 ? 1.6 : 0.8, off: h > 1.0 ? 0.6 : 0.2 });
        return out;
      }
      const poles = poleLayout(m);
      for (const p of poles) {
        out.push({ kind: "col", id: m.id, layer: "retaining", tone: "pole", x: p.x, y: p.y, z0: base - p.band.emb / 1000, z1: base + p.h + 0.05, w: p.band.sed / 1000, d: p.band.sed / 1000, round: true });
        out.push({ kind: "col", id: m.id, layer: "retaining", tone: "concrete", x: p.x, y: p.y, z0: base - p.band.emb / 1000 - 0.1, z1: base - 0.15, w: p.band.hole / 1000, d: p.band.hole / 1000, round: true });
      }
      void L;
      for (let i = 0; i < poles.length - 1; i++) {
        const a = poles[i],
          c = poles[i + 1];
        const h = (a.h + c.h) / 2;
        const t = Math.max(a.band.rail, c.band.rail) / 1000;
        const off = Math.max(a.band.sed, c.band.sed) / 2000 + t / 2;
        for (let z = 0; z < h - 0.02; z += 0.2) out.push({ kind: "bar", id: m.id, layer: "retaining", tone: "rail", a: { x: a.x, y: a.y }, b: { x: c.x, y: c.y }, z0: base + z, z1: base + Math.min(h, z + 0.196), w: t, off });
      }
      return out;
    }
  }
  return out;
}

// Parts for every member plus the lintels that wall openings make.
export function allParts(model: DesignModel, calcs: Calcs): { part: Part; level: Level }[] {
  const out: { part: Part; level: Level }[] = [];
  const lv = new Map(model.levels.map((l) => [l.id, l]));
  for (const m of model.members) {
    const level = lv.get(m.levelId);
    if (!level) continue;
    for (const part of partsFor(model, calcs, m)) out.push({ part, level });
  }
  for (const vl of calcs.lintels) {
    const level = lv.get(vl.wall.levelId);
    if (!level || !vl.member.b) continue;
    const r = calcs.results.get(vl.id);
    const s = secOf(vl.member, r);
    const top = level.elevation + level.height - 0.045;
    // lintels sit within the wall: cap the width to the wall
    const wallTh = (vl.wall.wall?.thickness ?? 90) / 1000;
    for (const part of beamParts(vl.id, "lintels", vl.member.a, vl.member.b, top, { ...s, b: Math.min(s.b, wallTh) })) out.push({ part, level });
  }
  return out;
}

// Where to put a member's tag in 3D.
export function tagPoint(model: DesignModel, calcs: Calcs, id: string): { x: number; y: number; z: number } | null {
  const vl = calcs.lintels.find((l) => l.id === id);
  const m = vl?.member ?? model.members.find((x) => x.id === id);
  if (!m) return null;
  const level = model.levels.find((l) => l.id === (vl?.wall.levelId ?? m.levelId));
  if (!level) return null;
  const mid = m.b ? { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 } : m.a;
  const z =
    m.type === "post" || m.type === "pile" || m.type === "footing"
      ? level.elevation + 0.6
      : m.type === "retaining"
        ? level.elevation + Math.max(m.rw?.h0 ?? 1, m.rw?.h1 ?? 1) + 0.3
        : vl
          ? level.elevation + level.height + 0.12
          : level.kind === "roof"
            ? level.elevation + 0.4
            : storeyTop(model, level) + 0.18;
  return { x: mid.x, y: mid.y, z };
}
