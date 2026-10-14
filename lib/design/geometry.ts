// Solid sizes and heights for the 3D view and the IFC export, so both show
// the same structure. All values in metres; z is up, plan y is kept as is.

import { parseTimberSection } from "./calc";
import type { DesignModel, Level, Member } from "./model";

export type Solid =
  | { shape: "bar"; id: string; a: { x: number; y: number }; b: { x: number; y: number }; top: number; width: number; depth: number }
  | { shape: "column"; id: string; x: number; y: number; bottom: number; top: number; width: number; depth: number; round?: boolean }
  | { shape: "wall"; id: string; a: { x: number; y: number }; b: { x: number; y: number }; bottom: number; top: number; thickness: number };

// Width x depth (m) of a section string. Steel sections give an approximate
// envelope from their nominal depth (e.g. 200UB25 -> 200 deep).
export function sectionSize(m: Member): { width: number; depth: number } {
  const t = parseTimberSection(m.section);
  if (t) return { width: t.b / 1000, depth: t.d / 1000 };
  const steel = /^(\d{2,3})/.exec(m.section.trim());
  if (m.material === "steel" && steel) {
    const d = Number(steel[1]) / 1000;
    return { width: Math.max(0.075, d * 0.5), depth: d };
  }
  return { width: 0.09, depth: 0.19 };
}

function levelAbove(model: DesignModel, level: Level) {
  return [...model.levels].filter((l) => l.elevation > level.elevation + 1e-6).sort((a, b) => a.elevation - b.elevation)[0];
}

export function solidFor(model: DesignModel, m: Member): Solid | null {
  const level = model.levels.find((l) => l.id === m.levelId);
  if (!level) return null;
  const top = level.elevation + level.height;
  switch (m.type) {
    case "beam":
    case "lintel":
    case "joist":
    case "rafter": {
      if (!m.b) return null;
      const { width, depth } = sectionSize(m);
      // A storey's framing sits at its top, under the level above; on the
      // roof level it sits on the wall plates.
      if (level.kind === "roof") return { shape: "bar", id: m.id, a: m.a, b: m.b, top: level.elevation + depth, width, depth };
      const above = levelAbove(model, level);
      return { shape: "bar", id: m.id, a: m.a, b: m.b, top: Math.min(top, above?.elevation ?? top), width, depth };
    }
    case "bracing": {
      if (!m.b) return null;
      return { shape: "wall", id: m.id, a: m.a, b: m.b, bottom: level.elevation, top, thickness: 0.09 };
    }
    case "post": {
      const { width, depth } = sectionSize(m);
      return { shape: "column", id: m.id, x: m.a.x, y: m.a.y, bottom: level.elevation, top, width, depth };
    }
    case "pile": {
      const dia = (Number.parseFloat(m.section) || 125) / 1000;
      return { shape: "column", id: m.id, x: m.a.x, y: m.a.y, bottom: level.elevation - 0.9, top: level.elevation + Math.max(0, level.height - 0.15), width: dia, depth: dia, round: true };
    }
    case "footing": {
      const [w, l, t] = m.section.split(/x/i).map((n) => Number(n) / 1000);
      const width = w > 0 ? w : 0.6;
      const depth = l > 0 ? l : width;
      const thick = t > 0 ? t : 0.3;
      return { shape: "column", id: m.id, x: m.a.x, y: m.a.y, bottom: level.elevation - thick, top: level.elevation, width, depth };
    }
  }
}
