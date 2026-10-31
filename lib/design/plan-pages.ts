// Which page of the architect's set shows which level, read from the sheet titles
// ("GROUND FLOOR PLAN", "FOUNDATION PLAN", "ROOF FRAMING PLAN"), and what else the
// sheet says about itself.
import type { Level } from "./model";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Title words for a level, strongest first.
function titles(l: Level, onlyFloor: boolean): string[] {
  const own = norm(l.name) ? [norm(l.name)] : [];
  if (l.kind === "foundation") return [...own, "foundation", "slab", "pile", "footing"];
  if (l.kind === "roof") return [...own, "roof framing", "roof"];
  return onlyFloor ? [...own, "floor"] : own;
}

function score(text: string, words: string[]) {
  for (let i = 0; i < words.length; i++) {
    const w = esc(words[i]).replace(/ floor$/, "");
    const hit = new RegExp(`\\b${w}( floor)?( framing)?( dimension)? (plan|layout)\\b`).exec(text);
    // the dimension plan is the one to scale and trace from, ahead of the plain plan
    if (hit) return 10 - i + (hit[3] ? 0.5 : 0);
  }
  return 0;
}

// The sheet's scale as printed on it: 50 for "Scale: 1:50".
export function sheetScale(text: string) {
  const n = /scale\s*[:=]?\s*1\s*:\s*(\d{1,4})\b/i.exec(text);
  return n ? Number(n[1]) : null;
}

// The drawing's title. Title blocks run into phone numbers and addresses, so
// keep the capitalised words after the last number, and prefer drawing words.
export function sheetTitle(text: string) {
  const found = text.match(/[A-Z0-9][A-Z0-9 &/-]*\b(PLAN|ELEVATIONS?|SECTIONS?|DETAILS?|NOTES|LAYOUT|BRACING)\b/g) ?? [];
  const titles = found.map((t) => t.split(/\s+/).reduce<string[]>((kept, w) => (/\d/.test(w) ? [] : [...kept, w]), []).slice(-6).join(" ")).filter((t) => t.length > 4);
  const drawing = /PROPOSED|EXISTING|FLOOR|ROOF|FOUNDATION|FRAMING|ELEVATION|SECTION|SITE/;
  return titles.sort((a, b) => Number(drawing.test(b)) - Number(drawing.test(a)) || b.length - a.length)[0] ?? null;
}

// Level id → page number (1-based) for the levels a page clearly belongs to.
// A cover sheet listing every drawing matches every level, so a page's score is
// shared between the levels it names; each page goes to one level at most.
export function matchPlanPages(levels: Level[], pageTexts: string[]): Map<string, number> {
  const floors = levels.filter((l) => l.kind === "floor").length;
  const texts = pageTexts.map(norm);
  const raw = levels.map((l) => texts.map((t) => score(t, titles(l, floors === 1))));
  const named = texts.map((_, p) => raw.filter((r) => r[p] > 0).length);
  const pairs = levels.flatMap((l, i) => texts.map((_, p) => ({ id: l.id, page: p + 1, s: raw[i][p] / Math.max(1, named[p]) })));
  pairs.sort((a, b) => b.s - a.s || a.page - b.page);
  const out = new Map<string, number>();
  const used = new Set<number>();
  for (const x of pairs) {
    if (x.s <= 0 || out.has(x.id) || used.has(x.page)) continue;
    out.set(x.id, x.page);
    used.add(x.page);
  }
  return out;
}
