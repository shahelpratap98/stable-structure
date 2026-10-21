// Solid parts for the 3D view and the IFC export, so both show the same
// structure. Metres; z is up; plan coordinates as drawn (y down the plan).
//
// "bar": a box running horizontally from a to b, between heights z0 and z1,
// w wide, shifted sideways by off along the left-hand normal (-uy, ux).
// "col": an upright box or cylinder.

import type { Calcs, Result } from "./calc";
import { parseTimberSection, STEEL } from "./materials";
import { along, framingTop, memberLength, type DesignModel, type Level, type Member, type Pt, type RoofSpec } from "./model";
import { poleLayout } from "./retaining";
import { defaultRaft } from "./raft";
import { deckLayout, stairLayout } from "./deck";

export type Layer = "walls" | "framing" | "glass" | "joists" | "flooring" | "roof" | "purlins" | "roofing" | "beams" | "lintels" | "posts" | "foundations" | "bracing" | "retaining" | "deck" | "deckboards" | "stairs";
export type Tone =
  | "member"
  | "framing"
  | "trimmer"
  | "wallExt"
  | "wallGround"
  | "wallUpper"
  | "wallInt"
  | "studInt"
  | "block"
  | "glass"
  | "joist"
  | "joistDbl"
  | "floorSheet"
  | "deckJoist"
  | "deckBoard"
  | "pile"
  | "stringer"
  | "tread"
  | "rafter"
  | "truss"
  | "purlin"
  | "roofing"
  | "concrete"
  | "pole"
  | "rail"
  | `brace:${string}`;

export type P3 = { x: number; y: number; z: number };
export type Part =
  | { kind: "bar"; id: string; layer: Layer; tone: Tone; a: Pt; b: Pt; z0: number; z1: number; w: number; off?: number }
  // a member between two points in space (rafters, truss chords): w across in plan, d deep
  | { kind: "beam3"; id: string; layer: Layer; tone: Tone; a: P3; b: P3; w: number; d: number }
  // a flat plane through 3+ points (roofing): drawn only, not exported
  | { kind: "poly"; id: string; layer: Layer; tone: Tone; pts: P3[] }
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
      if (m.zone.roof) return roofParts(m, m.zone.roof, level.kind === "roof" ? base : level.elevation + level.height, s);
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
      // 20 mm flooring over the joists
      out.push({ kind: "beam3", id: m.id, layer: "flooring", tone: "floorSheet", a: { x: x0, y: (y0 + y1) / 2, z: t + 0.01 }, b: { x: x1, y: (y0 + y1) / 2, z: t + 0.01 }, w: y1 - y0, d: 0.02 });
      return out;
    }
    case "wall": {
      if (!m.b || !m.wall) return [];
      const w = m.wall;
      const L = memberLength(m);
      const th = w.thickness / 1000;
      // shading by storey, as on a framing model: ground floor walls tan, upper floors blue-grey
      const tone: Tone = w.kind === "block" ? "block" : w.kind === "int" ? "wallInt" : level.floor === "slab" ? "wallGround" : "wallUpper";
      const ops = [...w.openings].sort((a, b) => a.offset - b.offset);
      const lintelTop = top - 0.045;
      const head = (o: (typeof ops)[number]) => {
        const lr = calcs.results.get(`${m.id}#${o.id}`);
        return lintelTop - (lr?.sec?.d ?? 190) / 1000;
      };
      const panel = (s0: number, s1: number, z0: number, z1: number) => {
        if (s1 - s0 < 0.001 || z1 - z0 < 0.005) return;
        out.push({ kind: "bar", id: m.id, layer: "walls", tone, ...sub(m, s0, s1), z0, z1, w: th + (w.kind === "block" ? 0 : 0.016) });
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
      const studTone: Tone = w.kind === "int" ? "studInt" : "framing";
      const fr = (s0: number, s1: number, z0: number, z1: number, t: Tone = studTone) => {
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
        fr(o.offset - 0.045, o.offset, zb, h);
        fr(o.offset + o.width, o.offset + o.width + 0.045, zb, h);
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
    case "deck": {
      const lay = deckLayout(m);
      if (!lay || !m.deck) return [];
      const top = base + m.deck.height;
      const jd = secOf(m, undefined).d;
      const bs = parseTimberSection((r?.kv.find((k) => k.label === "Bearers")?.value.split(" ")[0] ?? "").replace("×", "x")) ?? { d: 190, b: 90 };
      const bd = bs.d / 1000,
        bw = bs.b / 1000;
      const P = (u: number, v: number): Pt => (lay.ns ? { x: v, y: u } : { x: u, y: v });
      const zj1 = top - 0.02,
        zj0 = zj1 - jd;
      // boards across the joists
      for (let u = lay.u0 + 0.072, k = 0; u < lay.u1 && k < 400; u += 0.145, k++)
        out.push({ kind: "bar", id: m.id, layer: "deckboards", tone: "deckBoard", a: P(u, lay.v0), b: P(u, lay.v1), z0: top - 0.02, z1: top, w: 0.14 });
      // joists, with an edge joist each side
      const vs: number[] = [];
      for (let v = lay.v0 + 0.0225; v <= lay.v1 - 0.0225 + 1e-6 && vs.length < 400; v += m.deck.spacing / 1000) vs.push(v);
      if (lay.v1 - 0.0225 - vs[vs.length - 1] > 0.05) vs.push(lay.v1 - 0.0225);
      for (const v of vs) out.push({ kind: "bar", id: m.id, layer: "deck", tone: "deckJoist", a: P(lay.u0, v), b: P(lay.u1, v), z0: zj0, z1: zj1, w: 0.045 });
      for (const bline of lay.bearers) {
        if (bline.ledger) {
          // stringer bolted to the building, beside the joist ends
          out.push({ kind: "bar", id: m.id, layer: "deck", tone: "deckJoist", a: P(bline.u, lay.v0), b: P(bline.u, lay.v1), z0: zj0, z1: zj1, w: 0.045 });
          continue;
        }
        out.push({ kind: "bar", id: m.id, layer: "deck", tone: "deckJoist", a: P(bline.u, lay.v0), b: P(bline.u, lay.v1), z0: zj0 - bd, z1: zj0, w: bw });
        for (const v of bline.piles) {
          const q = P(bline.u, v);
          const ground = top - m.deck.drop;
          out.push({ kind: "col", id: m.id, layer: "foundations", tone: "pile", x: q.x, y: q.y, z0: ground - 0.45, z1: zj0 - bd, w: 0.125, d: 0.125 });
          out.push({ kind: "col", id: m.id, layer: "foundations", tone: "concrete", x: q.x, y: q.y, z0: ground - 0.6, z1: ground - 0.05, w: 0.4, d: 0.4 });
        }
      }
      return out;
    }
    case "stair": {
      if (!m.b || !m.stair) return [];
      const lvl = model.levels.find((l) => l.id === m.levelId)!;
      const above = levelAbove(model, lvl);
      const lay = stairLayout(m, m.stair.rise ?? (above ? above.elevation - lvl.elevation : lvl.height));
      if (!lay) return [];
      const L = lay.run;
      const tx = (m.b.x - m.a.x) / L,
        ty = (m.b.y - m.a.y) / L;
      const nx = -ty,
        ny = tx;
      const at = (s: number, lat: number): Pt => ({ x: m.a.x + tx * s + nx * lat, y: m.a.y + ty * s + ny * lat });
      const w = m.stair.width;
      const lats = m.stair.stringers === 3 ? [-(w / 2 - 0.0225), 0, w / 2 - 0.0225] : [-(w / 2 - 0.0225), w / 2 - 0.0225];
      const sd = secOf(m, r).d;
      // stringer centre line, just under the tread nosings
      const zc = (s: number) => base + (lay.R * s) / lay.G + lay.R - 0.03 - (sd / 2) * Math.hypot(lay.R, lay.G) / lay.G;
      for (const lat of lats) {
        const a = at(-0.05, lat),
          b = at(L, lat);
        out.push({ kind: "beam3", id: m.id, layer: "stairs", tone: "stringer", a: { ...a, z: zc(-0.05) }, b: { ...b, z: zc(L) }, w: 0.045, d: sd });
      }
      for (let k = 1; k < lay.risers; k++) {
        const zt = base + k * lay.R;
        for (const sc of [(k - 1) * lay.G + 0.07, (k - 1) * lay.G + Math.min(0.21, lay.G - 0.07)])
          out.push({ kind: "bar", id: m.id, layer: "stairs", tone: "tread", a: at(sc, -w / 2), b: at(sc, w / 2), z0: zt - 0.03, z1: zt, w: 0.14 });
      }
      return out;
    }
    case "raft": {
      if (!m.b) return [];
      const rs = m.raft ?? defaultRaft();
      const x0 = Math.min(m.a.x, m.b.x),
        x1 = Math.max(m.a.x, m.b.x),
        y0 = Math.min(m.a.y, m.b.y),
        y1 = Math.max(m.a.y, m.b.y);
      // top of the slab: this level's floor, or the floor above a foundation level
      const t = level.kind === "foundation" ? (levelAbove(model, level)?.elevation ?? top) : base;
      const tp = rs.topping / 1000,
        D = (rs.pod + rs.topping) / 1000,
        De = (rs.edgeDepth ?? rs.pod + rs.topping) / 1000,
        sp = rs.ribSpacing / 1000,
        rw = rs.ribWidth / 1000,
        ew = rs.edgeWidth / 1000;
      const ym = (y0 + y1) / 2;
      const bar = (a: Pt, b: Pt, z0: number, w: number): Part => ({ kind: "bar", id: m.id, layer: "foundations", tone: "concrete", a, b, z0, z1: t - tp, w });
      out.push({ kind: "bar", id: m.id, layer: "foundations", tone: "concrete", a: { x: x0, y: ym }, b: { x: x1, y: ym }, z0: t - tp, z1: t, w: y1 - y0 });
      out.push(bar({ x: x0, y: y0 + ew / 2 }, { x: x1, y: y0 + ew / 2 }, t - De, ew), bar({ x: x0, y: y1 - ew / 2 }, { x: x1, y: y1 - ew / 2 }, t - De, ew));
      out.push(bar({ x: x0 + ew / 2, y: y0 }, { x: x0 + ew / 2, y: y1 }, t - De, ew), bar({ x: x1 - ew / 2, y: y0 }, { x: x1 - ew / 2, y: y1 }, t - De, ew));
      let n = 0;
      for (let x = x0 + ew + sp - rw / 2; x < x1 - ew - rw && n < 150; x += sp, n++) out.push(bar({ x, y: y0 + ew }, { x, y: y1 - ew }, t - D, rw));
      for (let y = y0 + ew + sp - rw / 2; y < y1 - ew - rw && n < 300; y += sp, n++) out.push(bar({ x: x0 + ew, y }, { x: x1 - ew, y }, t - D, rw));
      return out;
    }
    case "footing": {
      const [w, l, t] = m.section.split(/x/i).map((n) => Number(n) / 1000);
      return [{ kind: "col", id: m.id, layer: "foundations", tone: "member", x: m.a.x, y: m.a.y, z0: base - (t > 0 ? t : 0.3), z1: base, w: w > 0 ? w : 0.6, d: l > 0 ? l : w > 0 ? w : 0.6 }];
    }
    case "bracing": {
      if (!m.b) return [];
      // a lined panel on the wall face
      return [{ kind: "bar", id: m.id, layer: "bracing", tone: `brace:${m.brace?.system ?? "GS2N"}`, a: m.a, b: m.b, z0: base + 0.045, z1: top - 0.09, w: 0.014, off: 0.06 }];
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
    // split levels: the member sits dz above (or below) its level
    const dz = m.dz ?? 0;
    for (const part of partsFor(model, calcs, m)) out.push({ part: dz ? lift(part, dz) : part, level });
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

function lift(p: Part, dz: number): Part {
  if (p.kind === "beam3") return { ...p, a: { ...p.a, z: p.a.z + dz }, b: { ...p.b, z: p.b.z + dz } };
  if (p.kind === "poly") return { ...p, pts: p.pts.map((q) => ({ ...q, z: q.z + dz })) };
  return { ...p, z0: p.z0 + dz, z1: p.z1 + dz };
}

// Roof framing over a zone, built in the zone's own frame: u runs along the
// rafters (the zone's dir), v along the eaves. zE is the underside of the
// rafters at the wall plate. Equal pitch all round, so hips run at 45° in plan.
function roofParts(m: Member, rs: RoofSpec, zE: number, s: Sec): Part[] {
  const out: Part[] = [];
  const ns = m.zone!.dir === "y";
  const x0 = Math.min(m.a.x, m.b!.x),
    x1 = Math.max(m.a.x, m.b!.x),
    y0 = Math.min(m.a.y, m.b!.y),
    y1 = Math.max(m.a.y, m.b!.y);
  const [u0, u1, v0, v1] = ns ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
  const W = u1 - u0,
    Lv = v1 - v0,
    um = (u0 + u1) / 2;
  const tp = Math.tan((Math.max(0, Math.min(60, rs.pitch)) * Math.PI) / 180);
  const ov = Math.max(0, rs.overhang);
  const sp = Math.max(0.3, m.zone!.spacing / 1000);
  const P = (u: number, v: number, z: number): P3 => (ns ? { x: v, y: u, z } : { x: u, y: v, z });
  const ridged = rs.form === "gable" || rs.form === "hip";
  const hipped = rs.form === "hip";
  const half = Math.min(W, hipped ? Lv : W) / 2; // a hip roof shorter than it is wide ends in a point
  // height of the rafters' underside above zE at (u, v): rises from every eave
  const rise = (u: number, v: number) => {
    let run = !ridged ? u - u0 : Math.min(u - u0, u1 - u);
    if (hipped) run = Math.min(run, v - v0, v1 - v);
    return Math.min(run, ridged ? half : W) * tp;
  };
  const d = rs.framing === "trusses" ? 0.09 : s.d,
    b = rs.framing === "trusses" ? 0.045 : s.b;
  const mid = d / 2; // centre line above the underside
  const bar = (layer: Layer, tone: Tone, ua: number, va: number, za: number, ub: number, vb: number, zb: number, w = b, dd = d) => {
    if (Math.hypot(ub - ua, vb - va, zb - za) < 0.02) return;
    out.push({ kind: "beam3", id: m.id, layer, tone, a: P(ua, va, za), b: P(ub, vb, zb), w, d: dd });
  };
  const vs: number[] = [];
  for (let v = v0 + 0.0225; v <= v1 - 0.0225 + 1e-6 && vs.length < 300; v += sp) vs.push(v);
  if (vs.length && v1 - 0.0225 - vs[vs.length - 1] > 0.1) vs.push(v1 - 0.0225);

  if (rs.framing === "rafters") {
    // common and jack rafters from each eave, tails past the wall by the overhang
    for (const v of vs) {
      const e = hipped ? Math.min(v - v0, v1 - v) : Infinity; // where the hip cuts the rafter
      if (!ridged) bar("roof", "rafter", u0 - ov, v, zE - ov * tp + mid, u1 + (rs.form === "flat" ? ov : 0), v, zE + (W + (rs.form === "flat" ? ov : 0)) * tp + mid);
      else {
        const top = Math.min(half, e);
        bar("roof", "rafter", u0 - ov, v, zE - ov * tp + mid, u0 + top, v, zE + top * tp + mid);
        bar("roof", "rafter", u1 + ov, v, zE - ov * tp + mid, u1 - top, v, zE + top * tp + mid);
      }
    }
    if (hipped) {
      // jack rafters on the hip ends, running along v
      for (let u = u0 + sp / 2; u < u1 - 0.05; u += sp) {
        const top = Math.min(u - u0, u1 - u, half);
        bar("roof", "rafter", u, v0 - ov, zE - ov * tp + mid, u, v0 + top, zE + top * tp + mid);
        bar("roof", "rafter", u, v1 + ov, zE - ov * tp + mid, u, v1 - top, zE + top * tp + mid);
      }
      // hip rafters from each corner to the ridge ends, and the ridge
      const hz = zE + half * tp + mid;
      const ra = v0 + half,
        rb = v1 - half;
      for (const [uc, vc, vr] of [
        [u0, v0, ra],
        [u1, v0, ra],
        [u0, v1, rb],
        [u1, v1, rb],
      ] as const)
        bar("roof", "rafter", uc - Math.sign(um - uc) * ov, vc - Math.sign(vr - vc) * ov, zE - ov * tp * Math.SQRT2 + mid, um, vr, hz, b, d + 0.05);
      if (rb > ra) bar("roof", "rafter", um, ra, hz, um, rb, hz, b, d + 0.05);
    } else if (ridged) bar("roof", "rafter", um, v0, zE + half * tp + mid, um, v1, zE + half * tp + mid, b, d + 0.05);
    // purlins across the rafters, at their spacing up the slope
    if (rs.purlins > 0) {
      const step = (rs.purlins / 1000) * Math.cos(Math.atan(tp));
      const pz = (u: number, v: number) => zE + rise(u, v) + d + 0.0225;
      const slopes: [number, number][] = ridged ? [[u0 - ov, 1], [u1 + ov, -1]] : [[u0 - ov, 1]];
      for (const [ue, dirn] of slopes) {
        const limit = ridged ? half + ov : W + ov * (rs.form === "flat" ? 2 : 1);
        for (let k = 0.15; k <= limit + 1e-6; k += step) {
          const u = ue + dirn * k;
          const inset = hipped ? Math.max(0, k - ov) : 0; // purlins stop at the hips
          const va = v0 - ov + inset,
            vb = v1 + ov - inset;
          if (vb - va < 0.1) continue;
          const z = pz(Math.min(Math.max(u, u0), u1), Math.max(Math.min((va + vb) / 2, v1), v0)) - (k < ov ? (ov - k) * tp : 0);
          bar("purlins", "purlin", u, va, z, u, vb, z, 0.07, 0.045);
        }
      }
    }
  } else {
    // trusses: bottom chord across the zone, top chords to the apex (cut flat on hip ends), webs
    for (const v of vs) {
      const peak = rise(um, v);
      const zb = zE + 0.045;
      bar("roof", "truss", u0 - 0.05, v, zb, u1 + 0.05, v, zb, b, 0.09);
      if (!ridged) {
        bar("roof", "truss", u0 - ov, v, zE - ov * tp + mid, u1, v, zE + W * tp + mid, b, 0.09);
        bar("roof", "truss", u1, v, zb, u1, v, zE + W * tp, b, 0.09);
        bar("roof", "truss", um, v, zb, um, v, zE + (W / 2) * tp, b, 0.09);
        continue;
      }
      const flat = peak / tp; // horizontal run before the top chord levels off (hip ends)
      bar("roof", "truss", u0 - ov, v, zE - ov * tp + mid, u0 + flat, v, zE + peak + mid, b, 0.09);
      bar("roof", "truss", u1 + ov, v, zE - ov * tp + mid, u1 - flat, v, zE + peak + mid, b, 0.09);
      if (u1 - flat > u0 + flat + 0.02) bar("roof", "truss", u0 + flat, v, zE + peak + mid, u1 - flat, v, zE + peak + mid, b, 0.09);
      if (peak > 0.25) {
        bar("roof", "truss", um, v, zb, um, v, zE + peak, b, 0.09);
        const q = W / 4;
        bar("roof", "truss", u0 + q, v, zb, um, v, zE + peak * 0.55, b, 0.09);
        bar("roof", "truss", u1 - q, v, zb, um, v, zE + peak * 0.55, b, 0.09);
      }
    }
  }

  // roofing over everything, eaves and verges included
  const t = d + (rs.purlins > 0 && rs.framing === "rafters" ? 0.045 : 0) + 0.02;
  const z = (h: number) => zE + h + t;
  const poly = (pts: P3[]) => out.push({ kind: "poly", id: m.id, layer: "roofing", tone: "roofing", pts });
  if (!ridged) {
    const hi = rs.form === "flat" ? W + 2 * ov : W + ov;
    poly([P(u0 - ov, v0 - ov, z(-ov * tp)), P(u0 - ov, v1 + ov, z(-ov * tp)), P(u0 - ov + hi, v1 + ov, z((hi - ov) * tp)), P(u0 - ov + hi, v0 - ov, z((hi - ov) * tp))]);
  } else if (!hipped) {
    for (const ue of [u0 - ov, u1 + ov])
      poly([P(ue, v0 - ov, z(-ov * tp)), P(ue, v1 + ov, z(-ov * tp)), P(um, v1 + ov, z(half * tp)), P(um, v0 - ov, z(half * tp))]);
  } else {
    const ra = v0 + half,
      rb = Math.max(v1 - half, ra);
    const zr = z(half * tp),
      ze = z(-ov * tp);
    poly([P(u0 - ov, v0 - ov, ze), P(u0 - ov, v1 + ov, ze), P(um, rb, zr), P(um, ra, zr)]);
    poly([P(u1 + ov, v0 - ov, ze), P(um, ra, zr), P(um, rb, zr), P(u1 + ov, v1 + ov, ze)]);
    poly([P(u0 - ov, v0 - ov, ze), P(um, ra, zr), P(u1 + ov, v0 - ov, ze)]);
    poly([P(u0 - ov, v1 + ov, ze), P(u1 + ov, v1 + ov, ze), P(um, rb, zr)]);
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
  if (m.type === "deck") return { x: mid.x, y: mid.y, z: level.elevation + (m.deck?.height ?? 0) + 0.4 };
  if (m.type === "stair") return { x: mid.x, y: mid.y, z: level.elevation + (level.height / 2) };
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
