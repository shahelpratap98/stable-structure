import { describe, expect, it } from "vitest";
import { runCalcs } from "../calc";
import { defaultDeck, deckLayout } from "../deck";
import { partsFor } from "../geometry";
import { defaultZone, emptyModel, type DesignModel, type Member } from "../model";

function model(members: Member[]): DesignModel {
  const m = emptyModel();
  m.levels = [{ id: "FF", name: "First floor", kind: "floor", elevation: 3.02, height: 3.02, floor: "timber", plan: null }];
  m.members = members;
  return m;
}

describe("low-slope roof on firrings (as the 26121 model)", () => {
  // rafters run north-south over y -0.85…5.95; the box gutter is at the far (south) edge
  const zone: Member = {
    id: "r",
    type: "joistzone",
    label: "R2",
    levelId: "FF",
    a: { x: 7.9275, y: -0.85 },
    b: { x: 16.1325, y: 5.95 },
    material: "timber",
    grade: "SG8",
    section: "240x45",
    zone: { ...defaultZone(), spacing: 480, roof: { form: "low", pitch: 3, framing: "rafters", purlins: 900, overhang: 0, gutter: 6.8 } },
  };
  const m = model([zone]);
  const parts = partsFor(m, runCalcs(m), zone);

  it("keeps the rafters level on the plates", () => {
    const rafters = parts.filter((p) => p.layer === "roof");
    expect(rafters.length).toBe(18); // 7.95, 8.43 … 16.11 at 480
    for (const p of rafters) if (p.kind === "beam3") expect(p.a.z).toBeCloseTo(p.b.z, 6);
  });
  it("tapers the firrings to 20 mm at the gutter, rising at 3°", () => {
    const f = parts.find((p) => p.kind === "wedge");
    if (f?.kind !== "wedge") throw new Error("no firring");
    expect(f.z0).toBeCloseTo(6.04 + 0.24, 6); // on the rafters (RTOP)
    expect(f.h1).toBeCloseTo(0.02, 6); // at the gutter
    expect(f.h0).toBeCloseTo(0.02 + 6.8 * Math.tan((3 * Math.PI) / 180), 6); // 376 mm at the high eave
  });
  it("puts purlins at 900 on the firrings", () => {
    const purlins = parts.filter((p) => p.layer === "purlins" && p.kind === "beam3");
    expect(purlins.length).toBe(8); // -0.815 … 5.485
  });
});

describe("a deck carried on beams at both edges", () => {
  const deck: Member = { id: "d", type: "deck", label: "DECK2", levelId: "FF", a: { x: -2.4, y: 0 }, b: { x: 0, y: 13.68 }, material: "timber", grade: "SG8", section: "240x45", deck: { ...defaultDeck(), dir: "x", ledger: "both" } };
  it("has no bearers on piles: the joists span the deck", () => {
    const lay = deckLayout(deck)!;
    expect(lay.joistSpan).toBeCloseTo(2.4, 6);
    expect(lay.bearers.every((b) => b.ledger && b.piles.length === 0)).toBe(true);
  });
  it("designs just the joists", () => {
    const r = runCalcs(model([deck])).results.get("d")!;
    expect(r.summary).toMatch(/on beams/);
    expect(r.kv.some((k) => k.label === "Piles")).toBe(false);
    expect(r.status).not.toBe("fail");
  });
});

describe("supports read off the model, as the 26121 calcs take them", () => {
  const wall = (id: string, a: [number, number], b: [number, number], openings: { offset: number; width: number }[] = []): Member => ({
    id,
    type: "wall",
    label: id,
    levelId: "FF",
    a: { x: a[0], y: a[1] },
    b: { x: b[0], y: b[1] },
    material: "timber",
    section: "140x45",
    wall: { kind: "ext", thickness: 140, loadbearing: true, cladding: "light", studSpacing: 600, openings: openings.map((o, i) => ({ id: `o${i}`, label: `L${i}`, sill: 0, ...o })) },
  });
  const beam: Member = { id: "rb", type: "beam", label: "RB2", levelId: "FF", a: { x: -2.33, y: 9.95 }, b: { x: 7.85, y: 9.95 }, material: "steel", section: "250UB25.7", sizing: { mode: "fixed" }, trib: { roof: 3.98 } };

  it("takes a loadbearing wall crossing under a beam as a support", () => {
    const r = runCalcs(model([beam, wall("w", [0.42, 0.14], [0.42, 13.54])])).results.get("rb")!;
    expect(r.inputs.find((i) => i.label === "Length")?.note).toMatch(/3 supports at 0.00, 2.75, 10.18/);
  });
  it("puts the beam's reaction on the lintel where it lands in an opening", () => {
    const c = runCalcs(model([beam, wall("w", [0.42, 0.14], [0.42, 13.54], [{ offset: 6.18, width: 4.2 }])]));
    const lintel = c.results.get("w#o0")!;
    const pt = lintel.loads.find((l) => l.label === "Point load from RB2");
    expect(pt?.value).toMatch(/^3\.67 m/);
  });
  it("spans flat-roof rafters between the walls under them, the eaves as overhangs", () => {
    const zone: Member = {
      id: "r",
      type: "joistzone",
      label: "R2",
      levelId: "FF",
      a: { x: 7.9275, y: -0.85 },
      b: { x: 16.1325, y: 5.95 },
      material: "timber",
      grade: "SG8",
      section: "240x45",
      zone: { ...defaultZone(), spacing: 480, roof: { form: "low", pitch: 3, framing: "rafters", purlins: 900, overhang: 0 } },
    };
    const m = model([zone, wall("n", [0.35, 0.07], [25.46, 0.07]), wall("s", [7.92, 5.88], [25.46, 5.88])]);
    m.params = { ...m.params, Groof: 0.4 };
    const r = runCalcs(m).results.get("r")!;
    expect(r.summary).toMatch(/span 5\.81 m/);
    // his R2: δ 13.6 mm long term on 5.79 m; the 0.92 m eave lifting is not counted against it
    const d = r.checks.find((x) => x.name === "Deflection, long term")!;
    expect(d.demand).toBeGreaterThan(12.5);
    expect(d.demand).toBeLessThan(14.5);
    expect(r.status).not.toBe("fail");
  });
  it("loads an edge bearer with half the joist span", () => {
    const d: Member = { id: "d", type: "deck", label: "DECK1", levelId: "FF", a: { x: 7.92, y: 5.95 }, b: { x: 28.21, y: 9.95 }, material: "timber", grade: "SG8", section: "240x45", deck: { ...defaultDeck(), ledger: "start", bearerSpan: 4, height: 0, drop: 1 } };
    const r = runCalcs(model([d])).results.get("d")!;
    // his DP: N* ≈ 18 kN per pile
    const n = Number(r.kv.find((k) => k.label === "Piles")!.value.match(/N\* ([\d.]+)/)![1]);
    expect(n).toBeGreaterThan(16);
    expect(n).toBeLessThan(20);
  });
});

describe("block walls drawn block by block", () => {
  const wall = (openings: { offset: number; width: number; sill: number }[] = []): Member => ({
    id: "bw",
    type: "wall",
    label: "BW1",
    levelId: "FF",
    a: { x: 0, y: 0 },
    b: { x: 4, y: 0 },
    material: "timber",
    section: "190x45",
    wall: { kind: "block", thickness: 190, loadbearing: true, cladding: "light", studSpacing: 600, openings: openings.map((o, i) => ({ id: `o${i}`, label: `L${i}`, ...o })) },
  });
  const parts = (w: Member) => {
    const m = model([w]);
    return partsFor(m, runCalcs(m), w);
  };
  it("lays 390 x 190 units in running bond, a bond beam on top", () => {
    const p = parts(wall());
    const units = p.filter((x) => x.kind === "bar" && x.tone === "blockUnit");
    const beam = p.filter((x) => x.kind === "bar" && x.tone === "bondBeam");
    // 3.02 m storey: 15 courses, the top one the bond beam
    expect(beam).toHaveLength(1);
    const courses = new Set(units.map((u) => (u.kind === "bar" ? u.z0.toFixed(3) : "")));
    expect(courses.size).toBe(14);
    // running bond: alternate courses start half a unit in
    const starts = (z: string) => units.filter((u) => u.kind === "bar" && u.z0.toFixed(3) === z).map((u) => (u.kind === "bar" ? Math.min(u.a.x, u.b.x) : 0)).sort((a, b) => a - b);
    const [c0, c1] = [...courses].sort();
    expect(starts(c0)[1]).toBeCloseTo(0.4, 6);
    expect(starts(c1)[1]).toBeCloseTo(0.2, 6);
    // the plain panel sits inside the units (for IFC and when blockwork is off)
    expect(p.some((x) => x.kind === "bar" && x.layer === "walls" && x.w < 0.19)).toBe(true);
  });
  it("leaves the opening clear up to its lintel", () => {
    const p = parts(wall([{ offset: 1.2, width: 1.0, sill: 0.9 }]));
    const inOpening = p.filter((x) => x.kind === "bar" && x.tone === "blockUnit" && Math.max(x.a.x, x.b.x) > 1.25 && Math.min(x.a.x, x.b.x) < 2.15 && x.z0 > 3.02 + 0.95 && x.z1 < 3.02 + 2.0);
    expect(inOpening).toHaveLength(0);
    expect(p.some((x) => x.kind === "bar" && x.tone === "blockUnit" && x.z1 <= 3.02 + 0.9 && Math.min(x.a.x, x.b.x) >= 1.2 && Math.max(x.a.x, x.b.x) <= 2.2)).toBe(true); // under the sill
  });
});
