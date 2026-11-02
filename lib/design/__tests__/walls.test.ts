import { describe, expect, it } from "vitest";
import { joinWallRuns } from "../walls";

describe("joining wall pieces read off a drawing", () => {
  it("joins pieces in line and makes the breaks openings", () => {
    const runs = joinWallRuns([
      { a: { x: 0, y: 0 }, b: { x: 3, y: 0 } },
      { a: { x: 4.2, y: 0.05 }, b: { x: 7, y: 0.05 } }, // 1.2 m window
      { a: { x: 9.8, y: 0 }, b: { x: 12, y: 0 } }, // 2.8 m slider
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].a.x).toBeCloseTo(0, 2);
    expect(runs[0].b.x).toBeCloseTo(12, 2);
    expect(runs[0].openings.map((o) => [Number(o.offset.toFixed(2)), Number(o.width.toFixed(2)), o.sill])).toEqual([
      [3, 1.2, 0.9],
      [7, 2.8, 0],
    ]);
  });
  it("keeps far-apart pieces and parallel walls separate", () => {
    const runs = joinWallRuns([
      { a: { x: 0, y: 0 }, b: { x: 3, y: 0 } },
      { a: { x: 8, y: 0 }, b: { x: 10, y: 0 } }, // 5 m apart: two walls
      { a: { x: 0, y: 2 }, b: { x: 3, y: 2 } }, // another line
      { a: { x: 5, y: 0 }, b: { x: 5, y: 4 } }, // across
    ]);
    expect(runs).toHaveLength(4);
    expect(runs.every((r) => r.openings.length === 0)).toBe(true);
  });
  it("ignores small drafting gaps", () => {
    const runs = joinWallRuns([
      { a: { x: 3, y: 1 }, b: { x: 0, y: 1 } }, // drawn backwards
      { a: { x: 3.2, y: 1 }, b: { x: 6, y: 1 } },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].openings).toHaveLength(0);
  });
});
