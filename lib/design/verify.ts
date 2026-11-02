// Verification cases for the design engine: each runs the engine on a small
// input and compares it with an independent answer (a textbook formula, a
// published capacity table, a hand calculation, or the result of an earlier
// Stable Structure job). The same list drives the automated test suite
// (npm test) and the live verification page, so what the page reports is
// exactly what the tests check.

import { buOf } from "./bracing";
import { alphaM, autoTrib, runCalcs, steelPhiMb } from "./calc";
import { designConcreteBeam } from "./concrete";
import { beamEnd, timberBearing } from "./connections";
import { designPad, slabPunch } from "./foundations";
import { solveBeam, solveFrame } from "./frame";
import { designPortal } from "./lateral";
import { fbAt, LVL, STEEL } from "./materials";
import { defaultRoof, defaultZone, emptyModel, type Level, type Member, type RoofSpec } from "./model";
import { defaultRaft, designRaft, raftSelfWeight } from "./raft";
import { deckLayout, defaultDeck, stairLayout } from "./deck";
import { DEFAULT_SITE, quakeBasis, windBasis } from "./site";

export type VCase = {
  group: string;
  name: string;
  source: string; // where the expected answer comes from
  want: number | string;
  tol?: number; // relative tolerance for numbers (default 0.2 %)
  unit?: string;
  run: () => number | string;
};
export type VResult = Omit<VCase, "run"> & { got: number | string | null; pass: boolean; error?: string };

const once = <T,>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

// ---------------------------------------------------------------- frame solver: textbook beam and frame cases
const EI = 10000,
  w = 5,
  L = 6;
const maxM = (r: { stations: { M: number }[] }) => Math.max(...r.stations.map((s) => s.M));
const minM = (r: { stations: { M: number }[] }) => Math.min(...r.stations.map((s) => s.M));
const maxD = (r: { stations: { d: number }[] }) => Math.max(...r.stations.map((s) => s.d));
const ss = once(() => solveBeam({ length: L, supports: [0, L], EI }, () => w, []));
const two = once(() => solveBeam({ length: 2 * L, supports: [0, L, 2 * L], EI }, () => w, []));
const over = once(() => solveBeam({ length: 5, supports: [0, 4], EI }, () => w, []));
const ssP = once(() => solveBeam({ length: L, supports: [0, L], EI }, () => 0, [{ at: L / 2, P: 10 }]));
const cant = once(() => solveFrame([{ x: 0, y: 0, fix: { x: true, y: true, r: true } }, { x: 3, y: 0 }], [{ i: 0, j: 1, EI }], [{ node: 1, fy: -10 }]));
const portal = (fixed: boolean) =>
  solveFrame(
    [{ x: 0, y: 0, fix: { x: true, y: true, r: fixed } }, { x: 0, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 0, fix: { x: true, y: true, r: fixed } }],
    [
      { i: 0, j: 1, EI },
      { i: 1, j: 2, EI },
      { i: 2, j: 3, EI },
    ],
    [{ node: 1, fx: 10 }],
  );
const pinned = once(() => portal(false));
const fixedP = once(() => portal(true));
const released = once(() => solveFrame([{ x: 0, y: 0, fix: { x: true, y: true, r: true } }, { x: 6, y: 0, fix: { y: true, r: true } }], [{ i: 0, j: 1, EI, pinI: true, pinJ: true, load: { w } }]));
const at = (r: { reactions: { at: number; R: number }[] }, x: number) => r.reactions.find((q) => Math.abs(q.at - x) < 1e-6)!.R;
const k = 0.5; // portal beam/column stiffness ratio (I/L)/(I/h) for L 6, h 3

const TEXTBOOK = "Textbook formula (Roark / steel designers' manual tables)";
const FRAME: VCase[] = [
  { name: "Simply supported UDL: max M = wL²/8", want: (w * L * L) / 8, unit: "kNm", run: () => maxM(ss()) },
  { name: "Simply supported UDL: deflection 5wL⁴/384EI", want: (5 * w * L ** 4) / (384 * EI), unit: "m", run: () => maxD(ss()) },
  { name: "Simply supported UDL: reaction wL/2", want: (w * L) / 2, unit: "kN", run: () => ss().reactions[0].R },
  { name: "Two equal spans UDL: support moment −wL²/8", want: -(w * L * L) / 8, unit: "kNm", run: () => minM(two()) },
  { name: "Two equal spans UDL: interior reaction 1.25wL", want: 1.25 * w * L, unit: "kN", run: () => at(two(), L) },
  { name: "Two equal spans UDL: end reaction 0.375wL", want: 0.375 * w * L, unit: "kN", run: () => two().reactions[0].R },
  { name: "Two equal spans UDL: max sagging 9wL²/128", want: (9 * w * L * L) / 128, unit: "kNm", run: () => maxM(two()) },
  { name: "Two equal spans UDL: deflection wL⁴/185EI", want: (w * L ** 4) / (184.6 * EI), tol: 0.01, unit: "m", run: () => maxD(two()) },
  { name: "Cantilever tip load: deflection PL³/3EI", want: (10 * 27) / (3 * EI), unit: "m", run: () => cant().members[0].stations.at(-1)!.d },
  { name: "Cantilever tip load: root moment −PL", want: -30, unit: "kNm", run: () => cant().members[0].stations[0].M },
  { name: "Overhanging beam: back-span reaction w·5·2.5/4", want: (w * 5 * 2.5) / 4, unit: "kN", run: () => at(over(), 4) },
  { name: "Overhanging beam: hogging at support −w·1²/2", want: -w / 2, unit: "kNm", run: () => minM(over()) },
  { name: "Simply supported point load: deflection PL³/48EI", want: (10 * L ** 3) / (48 * EI), unit: "m", run: () => maxD(ssP()) },
  { name: "Pinned-base portal, sway load: base shear H/2", want: 5, unit: "kN", tol: 0.001, run: () => Math.abs(pinned().reactions[0].fx) },
  { name: "Pinned-base portal, sway load: knee moment Hh/2", want: 15, unit: "kNm", tol: 0.001, run: () => Math.abs(pinned().members[0].end.Mj) },
  { name: "Pinned-base portal, sway load: base vertical Hh/L", want: 5, unit: "kN", run: () => Math.abs(pinned().reactions[0].fy) },
  { name: "Fixed-base portal: base moment Hh(3k+1)/(2(6k+1))", want: (10 * 3 * (3 * k + 1)) / (2 * (6 * k + 1)), unit: "kNm", run: () => Math.abs(fixedP().reactions[0].mz) },
  { name: "Fixed-base portal: knee moment Hh·3k/(2(6k+1))", want: (10 * 3 * 3 * k) / (2 * (6 * k + 1)), unit: "kNm", run: () => Math.abs(fixedP().members[0].end.Mj) },
  { name: "Member end releases act as simple supports (wL²/8)", want: (w * 36) / 8, unit: "kNm", run: () => maxM(released().members[0]) },
].map((c) => ({ ...c, group: "Frame solver", source: TEXTBOOK }));

// ---------------------------------------------------------------- steel member capacity
const UB = STEEL.find((s) => s.name === "310UB40.4")!;
const STEELCASES: VCase[] = [
  { name: "310UB40.4 section moment capacity φMs", want: 171, tol: 0.005, unit: "kNm", source: "ASI design capacity tables (Grade 300)", run: () => steelPhiMb(UB, 0.01, 1).phiMb },
  { name: "310UB40.4 member moment capacity φMb, le 4 m, αm 1", want: 99, tol: 0.01, unit: "kNm", source: "ASI design capacity tables (Grade 300)", run: () => steelPhiMb(UB, 4, 1).phiMb },
  { name: "αm, simply supported UDL: 1.7/√(0.75² + 1² + 0.75²)", want: 1.166, tol: 0.002, source: "AS 4100 cl 5.6.1.1(a)(iii) general formula (Table 5.6.1 gives 1.13 for this case: the formula is 3 % higher)", run: () => alphaM(1, 0.75, 1, 0.75) },
].map((c) => ({ ...c, group: "Steel (AS 4100)" }));

// ---------------------------------------------------------------- timber material
const TIMBERCASES: VCase[] = [
  { name: "hySPAN bending strength at 300 deep: 50 × (95/300)^0.154", want: 50 * (95 / 300) ** 0.154, tol: 1e-6, unit: "MPa", source: "Futurebuild LVL specific engineering design guide", run: () => fbAt(LVL, 300) },
].map((c) => ({ ...c, group: "Timber" }));

// ---------------------------------------------------------------- site loads
const quakeA = once(() => quakeBasis(DEFAULT_SITE));
const windA = once(() => windBasis(DEFAULT_SITE, 7));
const SITE: VCase[] = [
  { name: "Auckland, class C, IL2, μ 3.5: kμ = (μ−1)T/0.7 + 1 at T 0.4 s", want: 2.4286, tol: 0.001, source: "NZS 1170.5 cl 5.2.1.1, hand", run: () => quakeA().kmu },
  { name: "Auckland, class C: Cd = Ch·Z·R·Sp/kμ = 2.36 × 0.13 × 0.7 / 2.43", want: 0.0884, tol: 0.005, source: "NZS 1170.5 equivalent static, hand", run: () => quakeA().Cd },
  { name: "Christchurch, class D: Cd = 3.0 × 0.30 × 0.7 / 2.43", want: 0.2594, tol: 0.002, source: "NZS 1170.5 equivalent static, hand", run: () => quakeBasis({ ...DEFAULT_SITE, town: "Christchurch", soil: "D" }).Cd },
  { name: "Region A7, terrain 3, IL2, 7 m: Vdes = 45 × 0.83", want: 37.35, tol: 0.002, unit: "m/s", source: "AS/NZS 1170.2, hand", run: () => windA().Vdes },
  { name: "Same site: q = 0.6 V²", want: 0.837, tol: 0.002, unit: "kPa", source: "AS/NZS 1170.2, hand", run: () => windA().q / 1000 },
  { name: "Same site: NZS 3604 wind zone", want: "High", source: "NZS 3604 Table 5.4 (37.35 m/s ≤ 44)", run: () => windA().zone },
].map((c) => ({ ...c, group: "Site loads" }));

// ---------------------------------------------------------------- foundations
const pad = once(() => designPad(150, 150, DEFAULT_SITE));
const FDN: VCase[] = [
  { name: "Pad for N* 150 kN on good ground (φq 150 kPa): side", want: 1050, tol: 0, unit: "mm", source: "Hand: A ≥ (150 + self-weight)/150 kPa, 50 mm steps", run: () => pad().B },
  { name: "Same pad: bearing utilisation q*/φq", want: 0.96, tol: 0.01, source: "Hand: (150 + 1.2×24×1.05²×0.3) / 1.05² / 150", run: () => pad().uBearing },
  { name: "Slab punching under a 135 post, 100 slab: φVc = 0.75·(1/3)√25·4(c+d)·d", want: (0.75 * (1 / 3) * 5 * 4 * (135 + 65) * 65) / 1e3, tol: 1e-6, unit: "kN", source: "NZS 3101 cl 12.7, hand", run: () => slabPunch(40, 135).cap },
].map((c) => ({ ...c, group: "Foundations (NZS 3101)" }));

// ---------------------------------------------------------------- rib raft
// 10 × 10 m raft, 220 pods + 85 topping, ribs 100 @ 1200, Q 1.5 kPa, good ground, loss of support 2.0 m span
const raft = once(() => designRaft({ ...defaultRaft(), span: 2, cant: 0 }, { Lx: 10, Ly: 10, Gsup: 0, Q: 1.5, walls: [], posts: [{ mark: "P1", Nstar: 200 }] }, DEFAULT_SITE));
const raftLine = (label: string) => raft().lines.find((l) => l.label.startsWith(label))!.value;
const RAFT: VCase[] = [
  { name: "Self-weight: 24 × (0.085 + 0.22 × (2 × 100/1200 − (100/1200)²))", want: 2.8833, tol: 0.001, unit: "kPa", source: "Hand", run: () => raftSelfWeight(defaultRaft()) },
  { name: "Rib M* over a 2 m loss of support: (1.2 × 3.18 + 1.5 × 1.5) × 1.2 × 2²/8", want: 3.642, tol: 0.002, unit: "kNm", source: "Hand (finishes 0.3 kPa)", run: () => raft().Msag },
  { name: "Edge beam bearing: (1.2 × 24 × 0.3 × 0.305 + 6.07 × 0.6) / 0.3", want: 20.9, tol: 0.01, unit: "kPa", source: "Hand", run: () => parseFloat(raftLine("Edge beam q*")) },
  { name: "Thickening under a 200 kN post: √(200 / (150 − 1.2 × 24 × 0.305)), 50 mm steps", want: 1200, tol: 0, unit: "mm", source: "Hand", run: () => raft().thick[0].side },
].map((c) => ({ ...c, group: "Rib raft (NZS 3101)" }));

// ---------------------------------------------------------------- roof framing load paths
// a 6 m wide roof zone over the top storey, rafters running north-south, eaves beams along both long sides and a ridge beam down the middle
const roofTrib = (roof: RoofSpec, beam: "eave" | "ridge" | "end") => {
  const m = emptyModel();
  const gf = m.levels[1].id;
  const beams: Record<string, Member> = {
    eave: { id: "E", type: "beam", label: "E", levelId: gf, a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, material: "timber", section: "" },
    ridge: { id: "R", type: "beam", label: "R", levelId: gf, a: { x: 0, y: 3 }, b: { x: 10, y: 3 }, material: "timber", section: "" },
    end: { id: "N", type: "beam", label: "N", levelId: gf, a: { x: 0, y: 0 }, b: { x: 0, y: 6 }, material: "timber", section: "" },
  };
  m.members.push({ id: "Z", type: "joistzone", label: "RZ", levelId: gf, a: { x: 0, y: 0 }, b: { x: 10, y: 6 }, material: "timber", section: "190x45", zone: { ...defaultZone(), dir: "y", spacing: 900, roof } }, beams[beam]);
  return autoTrib(m, beams[beam])?.trib.roof ?? 0;
};
const ROOF: VCase[] = [
  { name: "Gable rafters, 6 m wide: each eave carries a quarter of the width", want: 1.5, unit: "m", run: () => roofTrib(defaultRoof(), "eave") },
  { name: "Gable rafters: the ridge beam carries half the width", want: 3, unit: "m", run: () => roofTrib(defaultRoof(), "ridge") },
  { name: "Trusses span the full 6 m: each eave carries half", want: 3, unit: "m", run: () => roofTrib({ ...defaultRoof(), framing: "trusses" }, "eave") },
  { name: "Hip roof: the end beam takes the jack rafters, a quarter of the width", want: 1.5, unit: "m", run: () => roofTrib({ ...defaultRoof(), form: "hip" }, "end") },
].map((c) => ({ ...c, group: "Roof framing", source: "Hand (tributary widths)" }));

// ---------------------------------------------------------------- decks and stairs
// a 5.0 m (joist direction) × 6.4 m deck, bearers at most 1.85 m apart, piles at most 2.5 m
const deck: Member = { id: "D", type: "deck", label: "DK1", levelId: "L", a: { x: 0, y: 0 }, b: { x: 6.4, y: 5 }, material: "timber", section: "240x45", deck: defaultDeck() };
const DECK: VCase[] = [
  { name: "Deck 5.0 m across the joists, bearers ≤ 1.85 m: 3 bays of 5.0/3", want: 5 / 3, unit: "m", source: "Hand", run: () => deckLayout(deck)!.joistSpan },
  { name: "Piles along a 6.4 m bearer ≤ 2.5 m apart: 3 bays of (6.4 − 0.12)/3", want: 6.28 / 3, unit: "m", source: "Hand (60 mm in from each end)", run: () => deckLayout(deck)!.pileSpan },
  { name: "Stair 2.7 m rise: 15 risers of 180 mm (≤ 190)", want: 0.18, unit: "m", source: "Hand", run: () => stairLayout({ ...deck, type: "stair", a: { x: 0, y: 0 }, b: { x: 3.6, y: 0 } }, 2.7)!.R },
  { name: "Same stair on a 3.6 m run: going 3.6/14 = 257 mm, under 280, so it fails", want: "fails", source: "D1/AS1 private stairway going ≥ 280 mm", run: () => (stairLayout({ ...deck, type: "stair", a: { x: 0, y: 0 }, b: { x: 3.6, y: 0 } }, 2.7)!.ok ? "passes" : "fails") },
].map((c) => ({ ...c, group: "Decks and stairs" }));

// ---------------------------------------------------------------- concrete beam
// SS 6 m, 300 × 500, f'c 30, G 10 + self-weight 3.6, Q 10: w* = 1.2×13.6 + 1.5×10 = 31.32 kN/m
const rc = once(() => designConcreteBeam({ L: 6, supports: [0, 6], b: 300, D: 500, fc: 30, G: 10, Q: 10, points: [] }));
const rcLine = (label: string) => rc().lines.find((l) => l.label.startsWith(label))!.value;
const CONC: VCase[] = [
  { name: "RC beam 300×500, 6 m: M* = 31.32 × 6²/8", want: 140.94, tol: 0.001, unit: "kNm", source: "Hand", run: () => parseFloat(rcLine("M*")) },
  { name: "Same beam: As from M* = 0.85·As·fy(d − a/2), d 440", want: 801, tol: 0.003, unit: "mm²", source: "NZS 3101 cl 7.4, hand", run: () => parseFloat(rcLine("Bottom steel").split("As ")[1]) },
  { name: "Same beam: bars that fit 300 wide with 40 cover", want: "4 HD16", source: "Hand (8 HD12 do not fit at 25 clear)", run: () => rcLine("Bottom steel").split(" (")[0] },
  { name: "Same beam: V* = 31.32 × 3", want: 93.96, tol: 0.002, unit: "kN", source: "Hand", run: () => parseFloat(rcLine("V*")) },
].map((c) => ({ ...c, group: "Concrete beams (NZS 3101)" }));

// ---------------------------------------------------------------- connections
const CONN: VCase[] = [
  { name: "310UB40.4 end, R* 100 kN: M16 8.8 bolts at φVf = 0.8 × 0.62 × 830 × 144", want: "2 M16 (59 kN each)", source: "AS 4100 cl 9.3.2.1, hand", run: () => beamEnd("B", "end 1", 100, UB).detail.match(/\d+ M\d+/)![0] + " (" + beamEnd("B", "end 1", 100, UB).detail.match(/\((\d+) kN each\)/)![1] + " kN each)" },
  { name: "90 beam on 90 post, SG8: φN = 0.8 × 0.8 × 8.9 × 90 × 90", want: (0.64 * 8.9 * 8100) / 1e3, tol: 0.001, unit: "kN", source: "NZS 3603 bearing, hand", run: () => parseFloat(timberBearing("B", 10, 90, 90, 8.9).detail.split("φN ")[1]) },
].map((c) => ({ ...c, group: "Connections" }));

// ---------------------------------------------------------------- portal frame (26121)
const prt = once(() => designPortal({ span: 4.96, height: 2.4, base: "fixed", H: 15, gG: 2, gQ: 1 }));
const LATERAL: VCase[] = [
  { name: "26121 portal, 4.96 × 2.4 m, 300 BU, fixed bases: section", want: "180UB16.1", source: "Stable Structure job 26121 (portal frame, specific design)", run: () => prt().sec?.name ?? "none" },
].map((c) => ({ ...c, group: "Portal frames" }));

// ---------------------------------------------------------------- Lot 6: beams, lintels, post and joists
// Results of the Lot 6 timber/steel design run by Stable Structure (Gajan's calculations).
const lot6 = once(() => {
  const m = emptyModel();
  m.params.k1Roof = 1.0;
  const gf = m.levels[1];
  m.levels.splice(2, 0, { ...gf, id: "ff", name: "First floor", elevation: 2.725, height: 2.42, kind: "floor", floor: "timber" });
  let y = 0;
  const beam = (id: string, span: number, trib: Member["trib"], sizing: Member["sizing"]): Member => ({ id, type: id.startsWith("L") ? "lintel" : "beam", label: id, levelId: gf.id, a: { x: 0, y: (y += 3) }, b: { x: span, y }, material: "timber", section: "", trib, sizing });
  m.members.push(
    beam("B1", 4.605, { floor: 2.7, wet: 0.25, wallInt: 1 }, { mode: "auto", minD: 240, maxB: 135, maxD: 250 }),
    beam("L1", 0.94, { floor: 1.9, wallExt: 1, roof: 2.2 }, { mode: "auto", maxD: 360, maxB: 90 }),
    beam("LG", 2.89, { floor: 0.2, wallExt: 1, roof: 3.51 }, { mode: "auto", maxD: 600, maxB: 90, dlim: 12 }),
    beam("LF7", 2.89, { roof: 3.51 }, { mode: "auto", maxD: 360, maxB: 90 }),
    { id: "P1", type: "post", label: "P1", levelId: gf.id, a: { x: 0, y: 3 }, material: "timber", section: "", height: 2.705 - 0.2 },
    { id: "JA", type: "joistzone", label: "JA", levelId: gf.id, a: { x: 20.09, y: 0.045 }, b: { x: 27.151, y: 3.852 }, material: "timber", grade: "SG8", section: "240x45", zone: { dir: "y", spacing: 400, wet: false, doubled: [], tableSpan: 4.0 } },
    { id: "JB", type: "joistzone", label: "JB", levelId: gf.id, a: { x: 21.55, y: 3.852 }, b: { x: 26.065, y: 5.445 }, material: "timber", grade: "SG8", section: "240x45", zone: { dir: "y", spacing: 400, wet: true, doubled: [], tableSpan: 4.0 } },
  );
  return runCalcs(m).results;
});
const L6 = "Stable Structure Lot 6 design (Gajan's calculations)";
const sec = (id: string) => () => lot6().get(id)?.sec?.name ?? "none";
const util = (id: string) => () => lot6().get(id)?.ratio ?? NaN;
const hanger = (id: string) => () => parseFloat(lot6().get(id)?.kv.find((x) => x.label.startsWith("Hanger"))?.value ?? "NaN");
const LOT6: VCase[] = [
  { name: "B1 4.605 m floor beam: section", want: "200PFC", run: sec("B1") },
  { name: "B1: utilisation (point-load deflection)", want: 0.761, tol: 0.001, run: util("B1") },
  { name: "L1 0.94 m lintel: section", want: "2/140×45 SG8", run: sec("L1") },
  { name: "L1: utilisation (bending)", want: 0.489, tol: 0.002, run: util("L1") },
  { name: "LG 2.89 m lintel, 12 mm limit: section", want: "2/240×45 SG8", run: sec("LG") },
  { name: "LG: utilisation", want: 0.866, tol: 0.001, run: util("LG") },
  { name: "LF7 2.89 m lintel: section", want: "2/240×45 SG8", run: sec("LF7") },
  { name: "P1 post under B1: section", want: "3/90×45 SG8", run: sec("P1") },
  { name: "P1: utilisation", want: 0.679, tol: 0.002, run: util("P1") },
  { name: "JA 240×45 SG8 joists @ 400: utilisation", want: 0.952, tol: 0.002, run: util("JA") },
  { name: "JA: hanger force per joist", want: 2.26, tol: 0.005, unit: "kN", run: hanger("JA") },
  { name: "JB wet-area joists: utilisation", want: 0.398, tol: 0.003, run: util("JB") },
  { name: "JB: hanger force per joist", want: 1.18, tol: 0.005, unit: "kN", run: hanger("JB") },
].map((c) => ({ ...c, group: "Lot 6 (past job)", source: L6 }));

// ---------------------------------------------------------------- 26121 bracing
const upper = { height: 3.02, floor: "timber" } as Level,
  lower = { height: 2.75, floor: "slab" } as Level;
const G26 = "Stable Structure job 26121 bracing calculation (GIB EzyBrace sheets)";
const BRACE: VCase[] = (
  [
    ["BL1H", 0.59, "U", 46, 47],
    ["BL1H", 2.7, "U", 268, 225],
    ["GS2N", 2.4, "U", 181, 162],
    ["GSPH", 1.39, "L", 182, 182],
    ["BLGH", 0.76, "L", 85, 85],
    ["BW", 19.325, "L", 2899, 2899],
    ["PORTAL", 4.96, "L", 300, 300],
  ] as const
).flatMap(([t, len, lv, W, E]) =>
  (["W", "E"] as const).map((d) => ({
    group: "Bracing (NZS 3604 / GIB)",
    name: `${t} ${len} m, ${lv === "U" ? "upper (timber floor, 3.02 m studs)" : "lower (slab, 2.75 m studs)"}: ${d === "W" ? "wind" : "earthquake"} BU`,
    source: G26,
    want: d === "W" ? W : E,
    tol: 0,
    unit: "BU",
    run: () => buOf(t, len, lv === "U" ? upper : lower)[d],
  })),
);

export const VERIFICATION_CASES: VCase[] = [...FRAME, ...STEELCASES, ...TIMBERCASES, ...SITE, ...FDN, ...RAFT, ...ROOF, ...DECK, ...CONC, ...CONN, ...LATERAL, ...LOT6, ...BRACE];

export function checkCase(c: VCase): VResult {
  const { run, ...rest } = c;
  try {
    const got = run();
    let pass: boolean;
    if (typeof c.want === "number") {
      const tol = c.tol ?? 0.002;
      pass = typeof got === "number" && Number.isFinite(got) && Math.abs(got - c.want) <= tol * Math.max(1e-9, Math.abs(c.want)) + 1e-9;
    } else pass = got === c.want;
    return { ...rest, got, pass };
  } catch (e) {
    return { ...rest, got: null, pass: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const runVerification = () => VERIFICATION_CASES.map(checkCase);
