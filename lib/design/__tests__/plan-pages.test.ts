import { describe, expect, it } from "vitest";
import { emptyModel, type Level } from "../model";
import { matchPlanPages, sheetScale, sheetTitle } from "../plan-pages";

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

const storeys = [lvl("G", "Ground floor", "floor"), lvl("1", "First floor", "floor"), lvl("R", "Roof", "roof")];

// A typical architect's set: plain plans at 1:100, dimension plans at 1:50.
const sheetSet = [
  "A Scale: 1:250 EXISTING SITE PLAN",
  "A Scale: 1:250 PROPOSED SITE PLAN",
  "A Scale: 1:100 PROPOSED GROUND FLOOR PLAN - LOT 6 SHEET TITLE:",
  "P 09 555 0100 M 021 555 0100 PROPOSED FIRST FLOOR PLAN - LOT 6 Scale: 1:100",
  "A BUILDING CONSENT Scale: 1:50 PROPOSED GROUND FLOOR DIMENSION PLAN",
  "A Scale: 1:50 PROPOSED FIRST FLOOR DIMENSION PLAN",
  "12 EXAMPLE STREET SUBURB 0000 AUCKLAND UNITARY PLAN ZONING: A Scale: 1:50 PROPOSED ROOF PLAN PROPOSED FIRST FLOOR DIMENSION PLAN - LOT 6",
  "SMITH P 09 555 0100 Scale: 1:50 PROPOSED NORTH ELEVATION",
];

describe("reading the sheets", () => {
  it("prefers the dimension plans, the sheets to trace from", () => {
    expect([...matchPlanPages(storeys, sheetSet)]).toEqual(expect.arrayContaining([["G", 5], ["1", 6], ["R", 7]]));
  });

  it("reads the printed scale", () => {
    expect(sheetScale(sheetSet[4])).toBe(50);
    expect(sheetScale("Scale : 1 : 150")).toBe(150);
    expect(sheetScale("Dwelling title")).toBeNull();
  });

  it("finds the drawing title among the title block", () => {
    expect(sheetTitle(sheetSet[3])).toBe("PROPOSED FIRST FLOOR PLAN");
    expect(sheetTitle(sheetSet[6])).toMatch(/PROPOSED/);
    expect(sheetTitle(sheetSet[7])).toBe("PROPOSED NORTH ELEVATION");
    expect(sheetTitle("nothing here")).toBeNull();
  });
});

describe("setting up a job", () => {
  it("builds the storeys with the roof on top", () => {
    const two = emptyModel(2).levels.map((l) => [l.name, l.elevation, l.floor]);
    expect(two).toEqual([
      ["Foundation", -0.3, "slab"],
      ["Ground floor", 0, "slab"],
      ["First floor", 2.7, "timber"],
      ["Roof", 5.1, "timber"],
    ]);
  });

  it("is unchanged for one storey", () => {
    expect(emptyModel().levels.map((l) => l.elevation)).toEqual([-0.3, 0, 2.4]);
  });
});
