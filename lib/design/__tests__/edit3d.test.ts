import { describe, expect, it } from "vitest";
import { handlesFor, lengthTo, lift, moveBy, openingWidth, raiseBase, raiseTop, resizeZone, slideOpening, stretch, stretchOpening, zoneSize } from "../edit3d";
import type { Part } from "../geometry";
import { defaultWall, type Member } from "../model";

const beam = { id: "B1", type: "beam", label: "B1", levelId: "L", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, material: "timber", section: "" } as Member;
const post = { id: "P1", type: "post", label: "P1", levelId: "L", a: { x: 1, y: 2 }, material: "timber", section: "" } as Member;
const col = { kind: "col", id: "P1", layer: "posts", tone: "member", x: 1, y: 2, z0: 0, z1: 2.4, w: 0.1, d: 0.1 } as Part;

describe("3D editing", () => {
  it("stretches an end along the member's line, whatever the mouse does sideways", () => {
    expect(stretch(beam, "b", { x: 5.2, y: 0.7 }, [])).toEqual({ b: { x: 5.2, y: 0 } });
    expect(stretch(beam, "a", { x: -1, y: 0.3 }, [])).toEqual({ a: { x: -1, y: 0 } });
  });

  it("links to another member's end on its line, not one off to the side", () => {
    expect(stretch(beam, "b", { x: 4.9, y: 0 }, [{ x: 5, y: 0 }])).toEqual({ b: { x: 5, y: 0 } });
    expect(stretch(beam, "b", { x: 4.9, y: 0 }, [{ x: 5, y: 0.1 }])).toEqual({ b: { x: 4.9, y: 0 } });
  });

  it("moves an end anywhere when free, and snaps it", () => {
    expect(stretch(beam, "b", { x: 4.1, y: 1.9 }, [{ x: 4.2, y: 2 }], true)).toEqual({ b: { x: 4.2, y: 2 } });
  });

  it("won't fold a member past its other end", () => {
    expect(stretch(beam, "b", { x: -1, y: 0 }, [])).toBeNull();
  });

  it("keeps a wall's openings in place when its first end moves, and refuses to lose one", () => {
    const w = { ...beam, type: "wall", wall: { ...defaultWall(), openings: [{ id: "o", label: "L1", offset: 1, width: 1, sill: 0 }] } } as Member;
    expect(stretch(w, "a", { x: -0.5, y: 0 }, [])?.wall?.openings[0].offset).toBe(1.5);
    expect(stretch(w, "a", { x: 1.5, y: 0 }, [])).toBeNull();
  });

  it("sets the length from end 1", () => {
    expect(lengthTo(beam, 3.2)).toEqual({ b: { x: 3.2, y: 0 } });
  });

  it("lowers by a number, and clears the offset at zero", () => {
    expect(lift(beam, -0.2)).toEqual({ dz: -0.2 });
    expect(lift({ ...beam, dz: -0.2 }, 0.2)).toEqual({ dz: undefined });
  });

  it("slides a member and lands an end on a snap point", () => {
    expect(moveBy(beam, 0.95, 0, [{ x: 5, y: 0 }])).toEqual({ a: { x: 1, y: 0 }, b: { x: 5, y: 0 } });
    expect(moveBy(post, 0, 1, [])).toEqual({ a: { x: 1, y: 3 } });
  });

  it("shortens a post from the top, or from the base with the top staying put", () => {
    expect(raiseTop(post, 2.4, -0.3)).toEqual({ height: 2.1 });
    expect(raiseBase(post, 2.4, 0.3)).toEqual({ height: 2.1, dz: 0.3 });
  });

  it("gives a post top, base and move handles", () => {
    expect(handlesFor(post, [col]).map((h) => h.kind)).toEqual(["top", "base", "move"]);
  });

  it("steps a drag in 10 mm, unless it lands on a member", () => {
    expect(stretch(beam, "b", { x: 5.237, y: 0 }, [], false, 0.01)).toEqual({ b: { x: 5.24, y: 0 } });
    expect(stretch(beam, "b", { x: 4.96, y: 0 }, [{ x: 4.987, y: 0 }], false, 0.01)).toEqual({ b: { x: 4.987, y: 0 } });
    expect(moveBy(post, 0.123, 0.004, [], 0.01)).toEqual({ a: { x: 1.12, y: 2 } });
  });
});

describe("3D editing of zones, openings and walls", () => {
  const zone = { id: "Z", type: "joistzone", label: "JZ1", levelId: "L", a: { x: 0, y: 0 }, b: { x: 4, y: 3 }, material: "timber", section: "240x45" } as Member;
  const flat = { kind: "beam3", id: "Z", layer: "joists", tone: "member", a: { x: 0, y: 0, z: 2.7 }, b: { x: 4, y: 0, z: 2.7 }, w: 0.045, d: 0.24 } as Part;
  const wall = { ...beam, id: "W", type: "wall", wall: { ...defaultWall(), openings: [{ id: "o", label: "L1", offset: 1, width: 1, sill: 0 }, { id: "p", label: "L2", offset: 3, width: 0.6, sill: 0.9 }] } } as Member;
  const [op] = wall.wall!.openings;

  it("gives a zone a handle on each corner and one to move it", () => {
    const hs = handlesFor(zone, [flat]);
    expect(hs.filter((h) => h.kind === "corner").map((h) => [h.at.x, h.at.y])).toEqual([[0, 0], [0, 3], [4, 0], [4, 3]]);
    expect(hs.filter((h) => h.kind === "move")).toHaveLength(1);
  });

  it("resizes a zone by a corner, keeping the opposite one, and pulls a side up to a wall", () => {
    expect(resizeZone(zone, "b", "b", { x: 5.23, y: 2.5 }, [], 0.01)).toEqual({ a: { x: 0, y: 0 }, b: { x: 5.23, y: 2.5 } });
    expect(resizeZone(zone, "a", "b", { x: -0.96, y: 3 }, [{ x: -1, y: 9 }])).toEqual({ a: { x: -1, y: 0 }, b: { x: 4, y: 3 } });
    expect(resizeZone(zone, "b", "b", { x: 0.1, y: 3 }, [])).toBeNull(); // folded flat
  });

  it("sets a zone's size, keeping its west and north edges", () => {
    expect(zoneSize(zone, 5, 2)).toEqual({ a: { x: 0, y: 0 }, b: { x: 5, y: 2 } });
    expect(zoneSize({ ...zone, a: { x: 4, y: 3 }, b: { x: 0, y: 0 } }, 5, 2)).toEqual({ a: { x: 5, y: 2 }, b: { x: 0, y: 0 } });
  });

  it("widens an opening from either end of its lintel", () => {
    // the lintel runs 45 mm past the opening, so its end a sits at 0.955
    expect(stretchOpening(wall, op, "a", { x: 0.455, y: 0.2 })).toEqual({ offset: 0.5, width: 1.5 });
    expect(stretchOpening(wall, op, "b", { x: 2.545, y: 0 })).toEqual({ offset: 1, width: 1.5 });
  });

  it("won't run an opening into the next one, off the wall, or shut", () => {
    expect(stretchOpening(wall, op, "b", { x: 3.3, y: 0 })).toBeNull();
    expect(stretchOpening(wall, op, "a", { x: -0.5, y: 0 })).toBeNull();
    expect(stretchOpening(wall, op, "b", { x: 1.1, y: 0 })).toBeNull();
    expect(openingWidth(wall, op, 2.5)).toBeNull();
    expect(openingWidth(wall, op, 1.2)).toEqual({ width: 1.2 });
  });

  it("slides an opening along its wall", () => {
    expect(slideOpening(wall, op, { x: 1.5, y: 0 }, { x: 0.8, y: 0.4 }, 0.01)).toEqual({ offset: 0.3 });
    expect(slideOpening(wall, op, { x: 1.5, y: 0 }, { x: 2.8, y: 0 })).toBeNull(); // onto L2
  });

  it("gives an opening's lintel ends to widen it, and keeps bracing on its wall", () => {
    const lintel = { ...beam, id: "W#o", type: "lintel" } as Member;
    expect(handlesFor(lintel, [flat]).map((h) => h.kind)).toEqual(["end", "end", "move", "lift"]);
    expect(handlesFor({ ...beam, type: "bracing" } as Member, [flat]).map((h) => h.kind)).toEqual(["end", "end", "move"]);
  });
});
