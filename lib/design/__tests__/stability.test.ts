import { describe, expect, it } from "vitest";
import { runCalcs } from "../calc";
import { completeness } from "../complete";
import { allParts } from "../geometry";
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

  it("follows the load path: a beam on posts with nothing below is unstable", () => {
    const top = [beam("B12", "FF", 0, 4), post("P1", "FF", 0, 0), post("P2", "FF", 4, 0)];
    const u = unstable(model(top));
    expect(u.get("B12")).toMatch(/post P1 and post P2 have no load path/);
    expect(unstable(model([...top, post("G1", "GF", 0, 0)])).get("B12")).toMatch(/^post P2 has no load path/);
  });

  it("passes it down: a post on a beam that is itself unsupported", () => {
    const u = unstable(model([beam("B1", "GF", 0, 4), post("P9", "GF", 0, 0), post("P1", "FF", 2, 0)]));
    expect(u.get("B1")).toMatch(/end 2/);
    expect(u.get("P1")).toMatch(/stands on B1, which is unstable/);
  });

  it("warns when a post is off the beam it stands on, and says where it belongs", () => {
    const parts = [beam("B1", "GF", 0, 4), post("G1", "GF", 0, 0), post("G2", "GF", 4, 0)];
    const off = runCalcs(model([...parts, post("P1", "FF", 2, 0.18)])).results.get("P1")!;
    expect(off.misaligned).toMatchObject({ mm: 180, mark: "B1", to: { x: 2, y: 0 } });
    expect(off.unstable).toBeUndefined();
    expect(runCalcs(model([...parts, post("P1", "FF", 2, 0.03)])).results.get("P1")!.misaligned).toBeUndefined();
    expect(runCalcs(model([...parts, post("P1", "FF", 2, 0.4)])).results.get("P1")!.unstable).toBeDefined();
  });

  it("stops a post on the lintel below it, and the lintel takes the point load", () => {
    const m = model([beam("L1", "GF", 0, 3, { type: "lintel" }), post("G1", "GF", 0, 0), post("G2", "GF", 3, 0), post("P1", "FF", 1.5, 0), beam("B1", "FF", -1, 4, { a: { x: 1.5, y: -2 }, b: { x: 1.5, y: 2 } } as Partial<Member>), wall("W1", "FF", 1.5)]);
    const c = runCalcs(m);
    expect(c.results.get("L1")!.carried?.[0]).toMatchObject({ at: 1.5, from: "P1 above" });
    const col = allParts(m, c).find((x) => x.part.id === "P1")!.part as { z0: number; z1: number };
    const gf = m.levels[0];
    expect(col.z0).toBeCloseTo(gf.elevation + gf.height - 0.09);
    expect(col.z1).toBeGreaterThan(m.levels[1].elevation);
  });

  it("lists unstable members first in To finish", () => {
    const m = model([beam("B1", "GF", 0, 4), post("P1", "GF", 0, 0)]);
    const g = completeness(m, runCalcs(m));
    expect(g[0]).toMatchObject({ kind: "unstable", id: "B1" });
  });
});
