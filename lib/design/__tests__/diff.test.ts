import { describe, expect, it } from "vitest";
import { runCalcs } from "../calc";
import { diffModels } from "../diff";
import { emptyModel, type DesignModel, type Member } from "../model";

const beam = (id: string, x1: number, levelId: string): Member => ({ id, type: "beam", label: id, levelId, a: { x: 0, y: 0 }, b: { x: x1, y: 0 }, material: "timber", section: "", sizing: { mode: "auto" }, trib: { floor: 2 } });

describe("revision diff", () => {
  const base = emptyModel();
  const gf = base.levels[1].id;
  base.members.push(beam("B1", 3, gf), beam("B2", 2, gf));
  const changed: DesignModel = { ...base, members: [beam("B1", 5, gf), beam("B3", 2, gf)], params: { ...base.params, Qf: 2 } };
  const d = diffModels(base, runCalcs(base), changed, runCalcs(changed));

  it("finds added, removed and changed members", () => {
    expect(d.find((c) => c.mark === "B3")?.kind).toBe("added");
    expect(d.find((c) => c.mark === "B2")?.kind).toBe("removed");
    const b1 = d.find((c) => c.mark === "B1");
    expect(b1?.kind).toBe("changed");
    expect(b1?.what).toMatch(/moved/);
  });
  it("clouds a moved member at both its old and new positions", () => {
    expect(d.find((c) => c.mark === "B1")?.at).toHaveLength(4);
  });
  it("reports job-wide load changes", () => {
    expect(d.some((c) => c.id === "" && c.what.includes("Qf: 1.5 → 2"))).toBe(true);
  });
  it("finds nothing between identical revisions", () => {
    expect(diffModels(base, runCalcs(base), base, runCalcs(base))).toEqual([]);
  });
});
