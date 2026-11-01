import { describe, expect, it } from "vitest";
import { houseParts, readHouse, type SheetData } from "../base-house";
import { alignWalls, isHipped, readEaves, readPaths, readWalls, roofPitch, scaleFromDimensions, type BaseWall, type SheetPath, type SheetWord } from "../base-read";
import { runCalcs } from "../calc";
import { emptyModel, normaliseModel, type DesignModel, type Pt } from "../model";

const M = (50 * 0.0254) / 72; // metres per point at 1:50
const pt = (m: number) => m / M;
const P = (x: number, y: number): Pt => ({ x: pt(x), y: pt(y) });
const GREY = "bababa";

// a wall band, filled the way CAD writes it
const band = (x0: number, y0: number, x1: number, y1: number, fill = GREY): SheetPath => ({ fill, stroke: null, width: 0, pts: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)] });
const across = (x0: number, y: number, x1: number, t = 0.09) => band(x0, y - t / 2, x1, y + t / 2);
const down = (x: number, y0: number, y1: number, t = 0.09) => band(x - t / 2, y0, x + t / 2, y1);

// a 10 x 8 m box of walls, with the rest of a sheet's drawing around it
const box = (ox = 0, oy = 0) => [across(ox, oy, ox + 10, 0.09), across(ox, oy + 8, ox + 10, 0.09), down(ox, oy, oy + 8), down(ox + 10, oy, oy + 8)];
const line = (a: Pt, b: Pt, stroke = "000000", width = 0.48): SheetPath => ({ fill: null, stroke, width, pts: [a, b] });

const longest = (walls: BaseWall[]) => [...walls].sort((p, q) => Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y))[0];
const metres = (w: BaseWall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) * M;

describe("reading walls", () => {
  it("reads filled bands as walls, at their true thickness", () => {
    const { walls } = readWalls(box(), M);
    expect(walls).toHaveLength(4);
    expect(metres(longest(walls))).toBeCloseTo(10.09, 0);
    for (const w of walls) expect(w.t * M).toBeCloseTo(0.09, 1);
    expect(walls.every((w) => w.ext)).toBe(true);
  });

  it("isn't taken in by stairs, furniture or dimensions, which are only lines", () => {
    const treads = Array.from({ length: 12 }, (_, i) => line(P(2, 2 + i * 0.25), P(3, 2 + i * 0.25)));
    const dims = [line(P(0, -1), P(10, -1)), line(P(0, -1.2), P(5, -1.2))];
    expect(readWalls([...box(), ...treads, ...dims], M).walls).toHaveLength(4);
  });

  it("leaves out a filled floor area, which is too wide to be a wall", () => {
    expect(readWalls([...box(), band(2, 2, 5, 4, "c5c5f0")], M).walls).toHaveLength(4);
  });

  it("reads hatched walls, one angle of strokes", () => {
    const hatch = Array.from({ length: 200 }, (_, i) => line(P(i * 0.04, 0.2), P(i * 0.04 + 0.2, 0), "aaae1e"));
    const { walls } = readWalls([...hatch, ...box(0, 3)], M);
    expect(walls.some((w) => w.t * M > 0.15 && metres(w) > 7)).toBe(true);
  });

  it("doesn't take a duct's zigzag for hatching", () => {
    const zig = Array.from({ length: 200 }, (_, i) => line(P(1 + i * 0.03, i % 2 ? 4 : 4.1), P(1 + (i + 1) * 0.03, i % 2 ? 4.1 : 4), "afd9aa"));
    expect(readWalls([...box(), ...zig], M).walls).toHaveLength(4);
  });

  it("drops a legend's swatches, even near the building", () => {
    const swatches = [0.4, 3, 5.6].map((y) => band(12, y, 12.7, y + 0.09));
    expect(readWalls([...box(), ...swatches], M).walls).toHaveLength(4);
  });

  it("marks inside walls", () => {
    const { walls } = readWalls([...box(), down(5, 0, 8)], M);
    expect(walls.filter((w) => !w.ext)).toHaveLength(1);
  });

  it("joins a wall through a window and a door", () => {
    const north = [across(0, 0, 3), across(5, 0, 7), across(8, 0, 10)];
    const glass = [0, 0.03, 0.06].map((o) => line(P(3, o - 0.03), P(5, o - 0.03), "0070e0", 0.72));
    const { walls } = readWalls([...north, ...glass, across(0, 8, 10), down(0, 0, 8), down(10, 0, 8)], M);
    const wall = walls.find((w) => w.openings.length);
    expect(wall?.openings.map((o) => o.kind).sort()).toEqual(["door", "window"]);
    expect(wall?.openings.map((o) => Math.round((o.s1 - o.s0) * M))).toEqual([2, 1]);
  });

  it("brings in a wall drawn with no fill, to close the outline", () => {
    // the south wall stops short of the west wall, which has no fill: two lines, at its faces
    const parts = [across(0, 0, 10), across(0, 3, 10), across(0.3, 8, 10), down(10, 0, 8), down(0, 0, 3)];
    const faces = [line(P(-0.045, 3), P(-0.045, 8)), line(P(0.045, 3), P(0.045, 8))];
    const { walls } = readWalls([...parts, ...faces], M);
    const made = walls.find((w) => w.inferred);
    expect(made).toBeTruthy();
    expect(walls.find((w) => Math.abs(w.a.y - w.b.y) < 1 && Math.abs(w.a.y - pt(3)) < 3)?.ext).toBe(false); // so the wall across the middle is inside
  });

  it("gives back nothing for a scan", () => {
    expect(readWalls([], M).walls).toEqual([]);
  });

  it("reads walls on the skew", () => {
    const turn = (p: Pt): Pt => ({ x: p.x * Math.cos(0.5) - p.y * Math.sin(0.5) + 300, y: p.x * Math.sin(0.5) + p.y * Math.cos(0.5) + 50 });
    const skewed = box().map((q) => ({ ...q, pts: q.pts.map(turn) }));
    const { walls } = readWalls(skewed, M);
    expect(walls.length).toBeGreaterThanOrEqual(4);
    expect(metres(longest(walls))).toBeGreaterThan(9.5);
  });
});

describe("the sheet's scale", () => {
  const dim = (mm: number, x: number, y: number): [SheetPath, SheetWord] => {
    const m = mm / 1000;
    return [line(P(x, y), P(x + m, y)), { text: String(mm), x: pt(x + m / 2), y: pt(y) - 5 }];
  };
  const dims = [dim(4000, 0, 0), dim(2400, 0, 1), dim(1800, 3, 2), dim(3200, 1, 3), dim(5526, 0, 4)];

  it("comes from the numbers on the dimension lines", () => {
    expect(scaleFromDimensions(dims.map((d) => d[1]), dims.map((d) => d[0]))).toBe(50);
  });

  it("gives up rather than guess", () => {
    expect(scaleFromDimensions(dims.slice(0, 2).map((d) => d[1]), dims.slice(0, 2).map((d) => d[0]))).toBeNull();
    expect(scaleFromDimensions([{ text: "CHECK", x: 0, y: 0 }], [])).toBeNull();
  });
});

describe("lining the sheets up", () => {
  it("finds the shift between two sheets of one building", () => {
    const a = readWalls(box(), M).walls;
    const b = readWalls(box(1.5, -0.7), M).walls;
    const fit = alignWalls(a, M, b, M);
    expect(fit?.dx).toBeCloseTo(-1.5, 1);
    expect(fit?.dy).toBeCloseTo(0.7, 1);
    expect(fit?.share).toBeGreaterThan(0.9);
  });

  it("copes with a sheet at another scale", () => {
    const M2 = M * 2;
    const half = box().map((q) => ({ ...q, pts: q.pts.map((p) => ({ x: p.x / 2, y: p.y / 2 })) }));
    const fit = alignWalls(readWalls(box(), M).walls, M, readWalls(half, M2).walls, M2);
    expect(fit?.dx).toBeCloseTo(0, 1);
    expect(fit?.share).toBeGreaterThan(0.9);
  });

  it("won't line up sheets that share nothing", () => {
    expect(alignWalls(readWalls(box(), M).walls.slice(0, 1), M, readWalls(box(), M).walls, M)).toBeNull();
  });
});

describe("the roof", () => {
  const eaves = [P(-0.5, -0.5), P(10.5, -0.5), P(10.5, 8.5), P(-0.5, 8.5), P(-0.5, -0.5)];
  const outline: SheetPath = { fill: null, stroke: "000000", width: 0.48, pts: eaves };
  const walls = readWalls(box(), M).walls;

  it("finds the eaves around the building, not the sheet's border", () => {
    const border: SheetPath = { fill: null, stroke: "000000", width: 1, pts: [P(-5, -5), P(20, -5), P(20, 14), P(-5, 14), P(-5, -5)] };
    expect(readEaves([border, outline], walls)).toHaveLength(4);
  });

  it("sees hips running in from the corners", () => {
    const hips = [line(P(-0.5, -0.5), P(3.5, 3.5)), line(P(10.5, -0.5), P(6.5, 3.5))];
    expect(isHipped([outline, ...hips], eaves.slice(0, 4))).toBe(true);
    expect(isHipped([outline], eaves.slice(0, 4))).toBe(false);
  });

  it("reads a printed pitch", () => {
    expect(roofPitch("ROOF PITCH 25°")).toBe(25);
    expect(roofPitch("22.5 deg roof pitch")).toBe(22.5);
    expect(roofPitch("compass 45° north")).toBeNull();
  });
});

function twoStorey(): { model: DesignModel; sheets: Map<string, SheetData> } {
  const m = emptyModel(2);
  const pages: Record<string, number> = { "Ground floor": 1, "First floor": 2, Roof: 3 };
  const model = { ...m, levels: m.levels.map((l) => (pages[l.name] ? { ...l, plan: { planId: "p", page: pages[l.name], scale: M, origin: { x: 0, y: 0 } } } : l)) };
  const ground = [...box(1, 1), across(11, 1, 14), across(11, 5, 14), down(14, 1, 5)]; // a wing past the upper floor
  const first = box(3, 2);
  const roof: SheetPath = { fill: null, stroke: "000000", width: 0.48, pts: [P(2.5, 1.5), P(13.5, 1.5), P(13.5, 10.5), P(2.5, 10.5), P(2.5, 1.5)] };
  const hips = [line(P(2.5, 1.5), P(6.5, 5.5)), line(P(13.5, 1.5), P(9.5, 5.5))];
  const sheet = (paths: SheetPath[]): SheetData => ({ paths, words: [], text: "" });
  const by = (n: string) => model.levels.find((l) => l.name === n)!.id;
  return { model, sheets: new Map([[by("Ground floor"), sheet(ground)], [by("First floor"), sheet(first)], [by("Roof"), sheet([...first, roof, ...hips])]]) };
}
const placed = (model: DesignModel, sheets: Map<string, SheetData>) => {
  const read = readHouse(model, sheets);
  return { read, model: { ...model, base: read.base, levels: model.levels.map((l) => (read.plans.has(l.id) ? { ...l, plan: { ...l.plan!, ...read.plans.get(l.id)! } } : l)) } };
};

describe("the house", () => {
  it("lines the upper levels up over the first, leaving a set origin alone", () => {
    const { model, sheets } = twoStorey();
    const clear = { ...model, levels: model.levels.map((l) => (l.name === "First floor" && l.plan ? { ...l, plan: { ...l.plan, origin: { x: 0, y: 0 } } } : l)) };
    const start = { ...clear, levels: clear.levels.map((l) => (l.name === "Ground floor" && l.plan ? { ...l, plan: { ...l.plan, origin: P(1, 1) } } : l)) };
    const { read } = placed(start, sheets);
    const ground = start.levels.find((l) => l.name === "Ground floor")!;
    expect(read.plans.get(ground.id)!.origin).toEqual(P(1, 1));
    expect(read.notes.join(" ")).toMatch(/First floor: lined up with Ground floor/);
  });

  it("warns when a set scale disagrees with the sheet's dimensions", () => {
    const { model, sheets } = twoStorey();
    const id = model.levels.find((l) => l.name === "Ground floor")!.id;
    const words = [4000, 2400, 3200, 1800].map((mm, i) => ({ text: String(mm), x: pt(1 + mm / 2000), y: pt(20 + i) - 5 }));
    const paths = [4000, 2400, 3200, 1800].map((mm, i) => line(P(1, 20 + i), P(1 + mm / 1000, 20 + i)));
    const s = sheets.get(id)!;
    sheets.set(id, { ...s, words, paths: [...s.paths, ...paths] });
    const wrong = { ...model, levels: model.levels.map((l) => (l.id === id && l.plan ? { ...l, plan: { ...l.plan, scale: M * 3 } } : l)) };
    expect(readHouse(wrong, sheets).notes.join(" ")).toMatch(/set to 1:150, but the dimensions on the sheet say 1:50/);
  });

  it("builds walls, a hipped roof, and a lower roof on what sticks out", () => {
    const { model, sheets } = twoStorey();
    const parts = houseParts(placed(model, sheets).model);
    const bars = parts.filter((p) => p.part.kind === "bar");
    expect(bars.length).toBeGreaterThan(8);
    const roofs = parts.flatMap((p) => (p.part.kind === "mesh" && p.part.tone === "baseRoof" ? [p] : []));
    expect(roofs).toHaveLength(2);
    const zs = (p: (typeof roofs)[number]) => (p.part as { pos: number[] }).pos.filter((_, i) => i % 3 === 2);
    const main = roofs.find((r) => r.level.kind === "roof")!;
    const low = roofs.find((r) => r.level.kind === "floor")!;
    expect(Math.max(...zs(main))).toBeGreaterThan(Math.max(...zs(low))); // the main roof ridge is the top of the house
    expect(Math.min(...zs(low))).toBeLessThan(model.levels.find((l) => l.name === "First floor")!.elevation + 0.1);
  });

  it("steps aside where a structural wall has been drawn over it", () => {
    const { model, sheets } = twoStorey();
    const m = placed(model, sheets).model;
    const before = houseParts(m).filter((p) => p.part.kind === "bar").length;
    const id = m.levels.find((l) => l.name === "Ground floor")!.id;
    const wall = { id: "w", type: "wall" as const, label: "W1", levelId: id, a: { x: 0, y: 0 }, b: { x: 0, y: 8 }, material: "timber" as const, section: "90x45" };
    expect(houseParts({ ...m, members: [wall] }).filter((p) => p.part.kind === "bar").length).toBeLessThan(before);
  });

  it("never touches the calcs", () => {
    const { model, sheets } = twoStorey();
    const m = placed(model, sheets).model;
    const a = runCalcs(m),
      b = runCalcs({ ...m, base: undefined });
    expect([...a.results.keys()]).toEqual([...b.results.keys()]);
    expect(a.results.size).toBe(0);
  });

  it("survives saving", () => {
    const { model, sheets } = twoStorey();
    const m = placed(model, sheets).model;
    const back = normaliseModel(JSON.parse(JSON.stringify(m)));
    expect(back.base?.sheets).toEqual(m.base?.sheets);
    expect(normaliseModel({ ...m, base: { sheets: { nosuch: { walls: [] } }, pitch: "x" } }).base).toEqual({ sheets: {}, pitch: 20 });
  });
});

describe("reading a page", () => {
  const OPS = { save: 1, restore: 2, transform: 3, setLineWidth: 4, setStrokeRGBColor: 5, setFillRGBColor: 6, setFillColorN: 7, constructPath: 8, paintFormXObjectBegin: 9, paintFormXObjectEnd: 10, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28 };

  it("keeps colours and places points on the page", () => {
    const path = [new Float32Array([0, 10, 10, 1, 110, 10, 1, 110, 20, 4])];
    const ops = { fnArray: [OPS.setFillRGBColor, OPS.constructPath, OPS.endPath], argsArray: [["#bababa"], [OPS.fill, path, null], null] };
    const [p] = readPaths(ops, OPS, [1, 0, 0, -1, 0, 100]);
    expect(p.fill).toBe("bababa");
    expect(p.pts[0]).toEqual({ x: 10, y: 90 });
    expect(p.pts).toHaveLength(4);
  });

  it("skips paths that only clip", () => {
    const path = [new Float32Array([0, 0, 0, 1, 10, 10])];
    expect(readPaths({ fnArray: [OPS.constructPath], argsArray: [[OPS.endPath, path, null]] }, OPS, [1, 0, 0, 1, 0, 0])).toEqual([]);
  });

  it("follows drawings nested in a form", () => {
    const path = [new Float32Array([0, 0, 0, 1, 10, 0])];
    const ops = { fnArray: [OPS.paintFormXObjectBegin, OPS.constructPath, OPS.paintFormXObjectEnd], argsArray: [[[2, 0, 0, 2, 5, 5], null], [OPS.stroke, path, null], []] };
    expect(readPaths(ops, OPS, [1, 0, 0, 1, 0, 0])[0].pts).toEqual([{ x: 5, y: 5 }, { x: 25, y: 5 }]);
  });
});
