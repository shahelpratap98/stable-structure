import { describe, expect, it } from "vitest";
import { handlesFor, lengthTo, lift, moveBy, raiseBase, raiseTop, stretch } from "../edit3d";
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
});
