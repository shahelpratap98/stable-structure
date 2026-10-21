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
