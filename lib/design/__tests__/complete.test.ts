import { describe, expect, it } from "vitest";
import { runCalcs } from "../calc";
import { completeness, openGaps } from "../complete";
import { defaultWall, defaultZone, emptyModel, type DesignModel, type Member } from "../model";
import { DEFAULT_SITE } from "../site";

// A 10 × 8 m single-storey box on a slab.
function house(extra: Member[] = [], opts: { openings?: boolean; site?: boolean } = {}): DesignModel {
  const m = emptyModel();
  m.levels = [{ id: "GF", name: "Ground floor", kind: "floor", elevation: 0, height: 2.4, floor: "slab", plan: null }];
  const corners: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ];
  m.members = corners.map(([x, y], i) => {
    const [x2, y2] = corners[(i + 1) % 4];
    return {
      id: `w${i}`,
      type: "wall",
      label: `W${i + 1}`,
      levelId: "GF",
      a: { x, y },
      b: { x: x2, y: y2 },
      material: "timber",
      section: "90x45",
      wall: { ...defaultWall(), openings: opts.openings && i === 0 ? [{ id: "o", label: "L1", offset: 2, width: 1.2, sill: 0.9 }] : [] },
    } as Member;
  });
  m.members.push(...extra);
  if (opts.site) m.site = { ...DEFAULT_SITE };
  return m;
}
const roof: Member = {
  id: "r",
  type: "joistzone",
  label: "R1",
  levelId: "GF",
  a: { x: 0, y: -0.45 },
  b: { x: 10, y: 8.45 },
  material: "timber",
  grade: "SG8",
  section: "190x45",
  zone: { ...defaultZone(), spacing: 900, roof: { form: "gable", pitch: 20, framing: "trusses", purlins: 0, overhang: 0.45 } },
};
const brace = (id: string, a: [number, number], b: [number, number]): Member => ({ id, type: "bracing", label: id, levelId: "GF", a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, material: "timber", section: "", brace: { system: "GS2N" } });
const gaps = (m: DesignModel) => completeness(m, runCalcs(m));

describe("is the model finished?", () => {
  it("lists what a bare set of walls lacks", () => {
    const keys = gaps(house()).map((g) => g.key);
    expect(keys).toContain("site");
    expect(keys.some((k) => k.startsWith("roof:GF"))).toBe(true);
    expect(keys).toContain("brace:GF:along");
    expect(keys).toContain("brace:GF:across");
    expect(keys).toContain("openings:GF");
  });
  it("finds the uncovered part of a roof, with its size and place", () => {
    const half: Member = { ...roof, b: { x: 5, y: 8.45 } };
    const g = gaps(house([half])).find((x) => x.key.startsWith("roof:GF"))!;
    expect(g.what).toMatch(/^(3[5-9]|4\d) m² over the Ground floor has no roof framing/);
  });
  it("is clear once the house is framed, braced, opened up and sited", () => {
    const m = house([roof, brace("BL1", [0.5, 0], [3, 0]), brace("BL2", [0, 0.5], [0, 3])], { openings: true, site: true });
    const left = gaps(m).filter((g) => g.kind === "missing");
    expect(left).toEqual([]);
  });
  it("hides a gap the engineer marks OK", () => {
    const m = house([roof], { openings: true, site: true });
    const g = gaps(m);
    m.ack = ["brace:GF:along"];
    expect(openGaps(m, g).map((x) => x.key)).not.toContain("brace:GF:along");
    expect(openGaps(m, g).map((x) => x.key)).toContain("brace:GF:across");
  });
  it("flags a lintel sized on an assumed load", () => {
    const g = gaps(house([], { openings: true }));
    expect(g.some((x) => x.kind === "assumed" && x.id === "w0#o")).toBe(true);
  });
});
