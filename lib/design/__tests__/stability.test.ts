import { describe, expect, it } from "vitest";
import { runCalcs } from "../calc";
import { completeness } from "../complete";
import { defaultWall, emptyModel, type DesignModel, type Member } from "../model";

// Two storeys: ground floor on a slab, first floor on timber.
function model(members: Member[]): DesignModel {
  const m = emptyModel();
  m.levels = [
    { id: "GF", name: "Ground floor", kind: "floor", elevation: 0, height: 2.4, floor: "slab", plan: null },
    { id: "FF", name: "First floor", kind: "floor", elevation: 2.7, height: 2.4, floor: "timber", plan: null },
  ];
  m.members = members;
  return m;
}
const post = (id: string, levelId: string, x: number, y: number): Member => ({ id, type: "post", label: id, levelId, a: { x, y }, material: "timber", section: "90x90" }) as Member;
const beam = (id: string, levelId: string, x1: number, x2: number, extra: Partial<Member> = {}): Member =>
  ({ id, type: "beam", label: id, levelId, a: { x: x1, y: 0 }, b: { x: x2, y: 0 }, material: "timber", section: "", trib: { floor: 2 }, ...extra }) as Member;
const wall = (id: string, levelId: string, x: number): Member =>
  ({ id, type: "wall", label: id, levelId, a: { x, y: -3 }, b: { x, y: 3 }, material: "timber", section: "90x45", wall: { ...defaultWall(), openings: [] } }) as Member;

const unstable = (m: DesignModel) => new Map([...runCalcs(m).results.values()].filter((r) => r.unstable).map((r) => [r.memberId, r.unstable!]));

describe("stability", () => {
  it("accepts a beam on two posts standing on the slab", () => {
    expect(unstable(model([beam("B1", "GF", 0, 4), post("P1", "GF", 0, 0), post("P2", "GF", 4, 0)])).size).toBe(0);
  });

  it("flags a beam end with nothing under it", () => {
    const u = unstable(model([beam("B1", "GF", 0, 4), post("P1", "GF", 0, 0)]));
    expect(u.get("B1")).toMatch(/end 2/);
  });

  it("takes a loadbearing wall or another beam as an end support", () => {
    expect(unstable(model([beam("B1", "GF", 0, 4), wall("W1", "GF", 0), wall("W2", "GF", 4)])).size).toBe(0);
    const carried = { ...beam("B2", "GF", 2, 2), a: { x: 2, y: 0 }, b: { x: 2, y: 3 } } as Member;
    const u = unstable(model([beam("B1", "GF", 0, 4), post("P1", "GF", 0, 0), post("P2", "GF", 4, 0), carried, post("P3", "GF", 2, 3)]));
    expect(u.size).toBe(0);
  });

  it("designs an end overhanging two posts as a cantilever, not as unstable", () => {
    const m = model([beam("B1", "GF", 0, 5), post("P1", "GF", 1, 0), post("P2", "GF", 4, 0)]);
    const r = runCalcs(m).results.get("B1")!;
    expect(r.unstable).toBeUndefined();
    expect(r.notes[0]).toMatch(/end 1 or end 2: it overhangs/);
    expect(r.supportLoads?.map((s) => s.at)).toEqual([1, 4]);
  });

  it("flags a cantilever held at only one point, not one with a back span", () => {
    expect(unstable(model([beam("B1", "GF", 0, 2, { free: "b" }), post("P1", "GF", 0, 0)])).get("B1")).toMatch(/cantilever/);
    expect(unstable(model([beam("B1", "GF", 0, 4, { free: "b" }), post("P1", "GF", 0, 0), post("P2", "GF", 2.5, 0)])).size).toBe(0);
  });

  it("flags a first-floor post with nothing below, not one over a post or wall", () => {
    const top = [beam("B1", "FF", 0, 4), post("P1", "FF", 0, 0), post("P2", "FF", 4, 0)];
    const u = unstable(model(top));
    expect(u.get("P1")).toMatch(/Ground floor/);
    expect(u.get("P2")).toBeDefined();
    expect(unstable(model([...top, post("G1", "GF", 0, 0), wall("W1", "GF", 4)])).size).toBe(0);
  });

  it("lists unstable members first in To finish", () => {
    const m = model([beam("B1", "GF", 0, 4), post("P1", "GF", 0, 0)]);
    const g = completeness(m, runCalcs(m));
    expect(g[0]).toMatchObject({ kind: "unstable", id: "B1" });
  });
});
