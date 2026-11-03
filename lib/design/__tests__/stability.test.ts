import { describe, expect, it } from "vitest";
import { runCalcs } from "../calc";
import { completeness } from "../complete";
import { allParts } from "../geometry";
import { handlesFor } from "../edit3d";
import { defaultWall, emptyModel, lintelTop, normaliseModel, type DesignModel, type Member, type Opening } from "../model";

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

describe("beams of any length", () => {
  // Drawn with a mouse, a length has long decimals. Rounded up, the far support landed past
  // the end of the beam and fell off it, which left a mechanism that took the editor down.
  it.each([2.7342781, 2.7300001, 3.1415926, 4.0000499, 4.00005, 5.12346])("takes a post part-way along a %s m beam", (L) => {
    const m = emptyModel();
    const g = m.levels.find((l) => l.name === "Ground floor")!.id;
    const post = (id: string, x: number): Member => ({ id, type: "post", label: id, levelId: g, a: { x, y: 0 }, material: "timber", grade: "SG8", section: "90x90", sizing: { mode: "auto" } });
    const beam: Member = { id: "B", type: "beam", label: "B", levelId: g, a: { x: 0, y: 0 }, b: { x: L, y: 0 }, material: "timber", grade: "SG8", section: "", sizing: { mode: "auto" } };
    const calcs = runCalcs({ ...m, members: [post("P1", 0.4), post("P2", L), beam] });
    expect(calcs.results.get("B")?.sec).toBeTruthy();
  });

  it("copes with any length", () => {
    const m = emptyModel();
    const g = m.levels.find((l) => l.name === "Ground floor")!.id;
    const post = (id: string, x: number): Member => ({ id, type: "post", label: id, levelId: g, a: { x, y: 0 }, material: "timber", grade: "SG8", section: "90x90", sizing: { mode: "auto" } });
    for (let i = 0; i < 60; i++) {
      const L = 2 + i * 0.0687731;
      const beam: Member = { id: "B", type: "beam", label: "B", levelId: g, a: { x: 0, y: 0 }, b: { x: L, y: 0 }, material: "timber", grade: "SG8", section: "", sizing: { mode: "auto" } };
      expect(() => runCalcs({ ...m, members: [post("P1", 0.2 + i * 0.005), post("P2", L), beam] })).not.toThrow();
    }
  });

  it("treats two supports on one spot as one", () => {
    const m = emptyModel();
    const g = m.levels.find((l) => l.name === "Ground floor")!.id;
    const post = (id: string, x: number): Member => ({ id, type: "post", label: id, levelId: g, a: { x, y: 0 }, material: "timber", grade: "SG8", section: "90x90", sizing: { mode: "auto" } });
    const beam: Member = { id: "B", type: "beam", label: "B", levelId: g, a: { x: 0, y: 0 }, b: { x: 3.3, y: 0 }, material: "timber", grade: "SG8", section: "", sizing: { mode: "auto" } };
    expect(() => runCalcs({ ...m, members: [post("P1", 1.5), post("P2", 1.50001), beam] })).not.toThrow();
  });
});

describe("moving a lintel up or down", () => {
  const job = (o: Partial<Opening>, level = "Ground floor") => {
    const m = emptyModel(2);
    const id = m.levels.find((l) => l.name === level)!.id;
    const wall: Member = { id: "W", type: "wall", label: "W1", levelId: id, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, material: "timber", section: "90x45", wall: { ...defaultWall(), openings: [{ id: "o", label: "L1", offset: 2, width: 1.2, sill: 0, ...o }] } };
    return { ...m, members: [wall], level: m.levels.find((l) => l.id === id)! };
  };
  const zOf = (model: DesignModel, id: string) => {
    const zs = allParts(model, runCalcs(model)).filter((p) => p.part.id === id).flatMap((p) => (p.part.kind === "bar" || p.part.kind === "col" ? [p.part.z0, p.part.z1] : []));
    return { lo: Math.min(...zs), hi: Math.max(...zs) };
  };

  it("sits under the plates until it's moved", () => {
    const j = job({});
    expect(zOf(j, "W#o").hi).toBeCloseTo(lintelTop(j.level), 3);
  });

  it("goes down and up by the amount typed", () => {
    const base = zOf(job({}), "W#o").hi;
    expect(zOf(job({ dz: -0.3 }), "W#o").hi).toBeCloseTo(base - 0.3, 3);
    expect(zOf(job({ dz: 0.05 }), "W#o").hi).toBeCloseTo(base + 0.05, 3);
  });

  it("takes the top of the opening with it", () => {
    const parts = (j: DesignModel) => allParts(j, runCalcs(j)).filter((p) => p.part.layer === "framing" && p.part.kind === "bar" && p.part.id === "W").map((p) => p.part as Extract<typeof p.part, { kind: "bar" }>);
    const trimmers = (j: DesignModel) => Math.max(...parts(j).filter((b) => Math.hypot(b.a.x - 1.955, b.a.y) < 0.001 || Math.hypot(b.a.x - 3.2, b.a.y) < 0.001).map((b) => b.z1));
    expect(trimmers(job({ dz: -0.3 }))).toBeCloseTo(trimmers(job({})) - 0.3, 3);
  });

  it("adds cripple studs above a lowered lintel", () => {
    const count = (j: DesignModel) => allParts(j, runCalcs(j)).filter((p) => p.part.layer === "framing").length;
    expect(count(job({ dz: -0.4 }))).toBeGreaterThan(count(job({})));
  });

  it("stops a post above on the lintel, wherever it is", () => {
    const m = emptyModel(2);
    const [g, f] = ["Ground floor", "First floor"].map((n) => m.levels.find((l) => l.name === n)!.id);
    const wall: Member = { id: "W", type: "wall", label: "W1", levelId: g, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, material: "timber", section: "90x45", wall: { ...defaultWall(), openings: [{ id: "o", label: "L1", offset: 2, width: 2, sill: 0, dz: -0.3 }] } };
    const post: Member = { id: "P", type: "post", label: "P1", levelId: f, a: { x: 3, y: 0 }, material: "timber", grade: "SG8", section: "90x90", sizing: { mode: "auto" } };
    const c = runCalcs({ ...m, members: [wall, post] });
    expect(c.results.get("P")?.seatTop).toBeCloseTo(lintelTop(m.levels.find((l) => l.id === g)!) - 0.3, 3);
  });

  it("doesn't change the size of the lintel", () => {
    const sec = (j: DesignModel) => runCalcs(j).results.get("W#o")?.sec?.d;
    expect(sec(job({ dz: -0.3 }))).toBe(sec(job({})));
  });

  it("keeps working from a set head height", () => {
    const j = job({ head: 2.1, dz: -0.1 });
    const d = (runCalcs(j).results.get("W#o")?.sec?.d ?? 0) / 1000;
    expect(zOf(j, "W#o").hi).toBeCloseTo(j.level.elevation + 2.1 + d - 0.1, 3);
  });

  it("warns when it's raised into the plates", () => {
    const j = job({ dz: 0.05 });
    expect(completeness(j, runCalcs(j)).map((g) => g.what).join(" ")).toMatch(/L1: raised 50 mm into the top plates/);
  });

  it("warns when a door won't clear it", () => {
    const j = job({ dz: -0.5 });
    expect(completeness(j, runCalcs(j)).map((g) => g.what).join(" ")).toMatch(/L1: only \d+ mm clear under it/);
  });

  it("warns when a window is squeezed", () => {
    const j = job({ sill: 1.5, dz: -0.4 });
    expect(completeness(j, runCalcs(j)).map((g) => g.what).join(" ")).toMatch(/L1: only \d+ mm between the sill and the lintel/);
  });

  it("says nothing about a lintel left where it is", () => {
    const j = job({ width: 0.9 });
    expect(completeness(j, runCalcs(j)).filter((g) => g.key.startsWith("plates:"))).toEqual([]);
  });

  it("warns about a drawn lintel raised into the plates too", () => {
    const m = emptyModel(2);
    const id = m.levels.find((l) => l.name === "Ground floor")!.id;
    const lintel: Member = { id: "L", type: "lintel", label: "L9", levelId: id, a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, material: "timber", grade: "SG8", section: "", sizing: { mode: "auto", maxB: 90 }, dz: 0.05 };
    const j = { ...m, members: [lintel] };
    expect(completeness(j, runCalcs(j)).map((g) => g.what).join(" ")).toMatch(/raised 50 mm into the top plates/);
  });

  it("survives saving", () => {
    const j = job({ dz: -0.25 });
    expect(normaliseModel(JSON.parse(JSON.stringify(j))).members[0].wall?.openings[0].dz).toBe(-0.25);
  });

  it("offers width, slide and up-and-down handles on an opening's lintel", () => {
    const j = job({});
    const c = runCalcs(j);
    const vl = c.lintels[0];
    const parts = allParts(j, c).filter((p) => p.part.id === vl.id).map((p) => p.part);
    expect(handlesFor(vl.member, parts).map((h) => h.kind)).toEqual(["end", "end", "move", "lift"]);
  });
});

