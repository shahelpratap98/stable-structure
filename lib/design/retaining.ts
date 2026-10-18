// Retaining walls, from Stable Structure's 26121 model.
//
// Timber: cantilever H5 round poles in stock sizes, in 400 / 450 / 500 Ø
// concrete holes (at least 75 mm cover), H4 rails on the retained face,
// drainage behind. Each pole takes the band for the height at its position.
// Band designs assume φ' 30°, γ 18 kN/m³, drained, 2.5 kPa surcharge
// (5 kPa above 1.5 m), ULS factor 1.5, Broms embedment at least 1.0 × the
// retained height. Block: 20 series reinforced masonry to NZS 4230.
// Both are typical designs on assumed soil: specific design and a geotech
// report are needed before issue.

import type { Calcs, Result } from "./calc";
import { along, memberLength, type Member } from "./model";

export type Band = { k: string; h: number; sed: number; s: number; emb: number; hole: number; rail: number; r: number; M: number; cap: number };

export const POLE_BANDS: Band[] = [
  { k: "B1", h: 1.0, sed: 150, s: 1200, emb: 1000, hole: 400, rail: 50, r: 0.31, M: 2.5, cap: 8.1 },
  { k: "B2", h: 1.5, sed: 200, s: 1200, emb: 1500, hole: 400, rail: 50, r: 0.4, M: 7.7, cap: 19.1 },
  { k: "B3", h: 2.0, sed: 225, s: 1000, emb: 2000, hole: 400, rail: 75, r: 0.62, M: 16.8, cap: 27.2 },
  { k: "B4", h: 2.5, sed: 275, s: 1000, emb: 2500, hole: 450, rail: 75, r: 0.62, M: 31.0, cap: 49.7 },
  { k: "B5", h: 3.25, sed: 300, s: 900, emb: 3200, hole: 500, rail: 75, r: 0.86, M: 55.2, cap: 64.5 },
];
export const BLOCK_SPECS = [
  { k: "BRW-1.0", h: 1.0, spec: "20 series fully grouted, D12 @ 400 vertical and horizontal; base 800 × 300", foot: [800, 300], r: 0.2 },
  { k: "BRW-2.2", h: 2.2, spec: "20 series fully grouted, D16 @ 200 vertical (central), D12 @ 400 horizontal bond beams; base 1600 × 400", foot: [1600, 400], r: 0.6 },
];

const bandFor = (h: number) => POLE_BANDS.find((b) => h <= b.h + 0.005);

export type Pole = { x: number; y: number; h: number; band: Band };

// Walk the wall: each pole takes the band for the highest retained height over
// its adjoining bay, never exceeding that band's spacing.
export function poleLayout(m: Member): Pole[] {
  if (!m.b || !m.rw) return [];
  const L = memberLength(m);
  const hAt = (s: number) => m.rw!.h0 + ((m.rw!.h1 - m.rw!.h0) * Math.min(L, Math.max(0, s))) / (L || 1);
  const poles: Pole[] = [];
  let s = 0;
  for (let i = 0; i < 2000; i++) {
    let b = bandFor(Math.max(hAt(s), hAt(s + 1.2))) ?? POLE_BANDS[POLE_BANDS.length - 1];
    b = bandFor(Math.max(hAt(s), hAt(s + b.s / 1000))) ?? b;
    const p = along(m, s);
    poles.push({ x: p.x, y: p.y, h: hAt(s), band: b });
    if (s >= L) break;
    const nx = s + b.s / 1000;
    s = nx >= L ? L : L - nx < 0.3 ? (s + L) / 2 : nx;
  }
  return poles;
}

export function retainingCalc(m: Member): Result {
  const rw = m.rw ?? { kind: "pole", h0: 1, h1: 1 };
  const L = memberLength(m);
  const hMax = Math.max(rw.h0, rw.h1);
  const hMin = Math.min(rw.h0, rw.h1);
  const hTxt = hMin === hMax ? `${hMax.toFixed(2)} m` : `${hMin.toFixed(2)}–${hMax.toFixed(2)} m`;
  const base: Result = { memberId: m.id, mark: m.label, status: "none", ratio: null, summary: "", utils: [], kv: [], inputs: [], loads: [], checks: [], notes: [] };

  if (rw.kind === "block") {
    const spec = BLOCK_SPECS.find((b) => hMax <= b.h + 0.005);
    if (!spec)
      return { ...base, status: "fail", ratio: hMax / 2.2, summary: `Block wall ${hTxt}: over 2.2 m, needs specific design`, kv: [{ label: "Retained height", value: hTxt }], notes: ["Over the typical block designs: specific design to NZS 4230."] };
    return {
      ...base,
      status: "pass",
      ratio: spec.r,
      summary: `Block wall ${hTxt} · ${spec.k}`,
      utils: [{ label: "Stem bending", u: spec.r }],
      kv: [
        { label: "Retained height", value: hTxt },
        { label: "Length", value: `${L.toFixed(2)} m` },
        { label: "Construction", value: spec.spec },
      ],
      notes: ["Typical 20 series block design; specific design to NZS 4230 and a geotech report are needed before issue."],
    };
  }

  const poles = poleLayout(m);
  if (!poles.length) return { ...base, summary: "Draw the wall to lay out its poles." };
  if (hMax > POLE_BANDS[POLE_BANDS.length - 1].h + 0.005)
    return { ...base, status: "fail", ratio: hMax / 3.25, summary: `Timber wall ${hTxt}: over 3.25 m, needs specific design`, kv: [{ label: "Retained height", value: hTxt }], notes: ["Over the typical pole bands: specific design, possibly with tie-backs."] };
  const bands = [...new Set(poles.map((p) => p.band.k))].map((k) => POLE_BANDS.find((b) => b.k === k)!);
  const r = Math.max(...bands.map((b) => b.r));
  return {
    ...base,
    status: r > 1 ? "fail" : r > 0.9 ? "close" : "pass",
    ratio: r,
    summary: `Timber pole wall ${hTxt} · ${bands.map((b) => b.k).join(" / ")} · ${poles.length} poles`,
    utils: bands.map((b) => ({ label: `${b.k} pole bending`, u: b.r })),
    kv: [
      { label: "Retained height", value: hTxt },
      { label: "Length", value: `${L.toFixed(2)} m` },
      ...bands.map((b) => ({
        label: b.k,
        value: `${poles.filter((p) => p.band.k === b.k).length} × ${b.sed} SED H5 @ ≤ ${b.s / 1000} m, ${b.hole} Ø hole, embed ${b.emb / 1000} m, 200×${b.rail} H4 rails`,
      })),
    ],
    checks: bands.map((b) => ({ name: `${b.k} pole bending (H ≤ ${b.h} m)`, demand: b.M, capacity: b.cap, unit: "kNm", ratio: b.r })),
    notes: ["Typical band designs on assumed soil (φ' 30°, drained, 2.5–5 kPa surcharge). Check surcharges (driveways, fences, boundaries) and confirm with a geotech report."],
  };
}

export function poleTotals(calcs: Pick<Calcs, "results">, members: Member[]) {
  void calcs;
  const tot = new Map<string, number>();
  for (const m of members) if (m.type === "retaining" && m.rw?.kind !== "block") for (const p of poleLayout(m)) tot.set(`${p.band.sed} SED / ${p.band.hole} Ø`, (tot.get(`${p.band.sed} SED / ${p.band.hole} Ø`) ?? 0) + 1);
  return [...tot.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
}
