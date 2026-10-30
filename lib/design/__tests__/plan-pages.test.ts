import { describe, expect, it } from "vitest";
import type { Level } from "../model";
import { matchPlanPages } from "../plan-pages";

const lvl = (id: string, name: string, kind: Level["kind"]): Level => ({ id, name, kind, elevation: 0, height: 2.4, floor: "slab", plan: null });
const house = [lvl("F", "Foundation", "foundation"), lvl("G", "Ground floor", "floor"), lvl("R", "Roof", "roof")];

describe("matchPlanPages", () => {
  it("skips the cover sheet that lists every drawing", () => {
    const pages = [
      "COVER SHEET Drawing list A001 Cover A101 Site plan A102 Foundation plan A103 Ground floor plan A104 Roof plan A201 Elevations",
      "SITE PLAN 1:200 boundary",
      "FOUNDATION PLAN 1:100 refer engineer",
      "PROPOSED GROUND FLOOR PLAN 1:100 Kitchen Lounge refer foundation plan",
      "ROOF PLAN 1:100 Colorsteel 15° pitch",
      "ELEVATIONS North South",
    ];
    const m = matchPlanPages(house, pages);
    expect(m.get("F")).toBe(3);
    expect(m.get("G")).toBe(4);
    expect(m.get("R")).toBe(5);
  });

  it("reads a two-storey set and roof framing titles", () => {
    const levels = [lvl("G", "Ground floor", "floor"), lvl("1", "First floor", "floor"), lvl("R", "Roof", "roof")];
    const pages = ["First Floor Plan", "Ground Floor Plan", "Roof Framing Plan"];
    const m = matchPlanPages(levels, pages);
    expect([m.get("G"), m.get("1"), m.get("R")]).toEqual([2, 1, 3]);
  });

  it("takes a plain 'floor plan' on a single-storey house", () => {
    expect(matchPlanPages(house, ["Cover", "FLOOR PLAN"]).get("G")).toBe(2);
  });

  it("leaves levels alone when nothing matches (scanned sheets)", () => {
    expect(matchPlanPages(house, ["", "", ""]).size).toBe(0);
  });
});
