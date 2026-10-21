// Timber decks and external stairs, laid out the way Stable Structure's
// framing models draw them: deck joists on 2/190×45 bearers, bearers on
// 125×125 H5 piles, 140×20 boards; stairs as two or three stringers with
// slatted treads. The layout here is shared by the design and the 3D model.

import { memberLength, type Member } from "./model";

export type DeckSpec = {
  dir: "x" | "y"; // the direction the joists span
  spacing: number; // mm, joist centres
  bearerSpan: number; // m, the joists' span between bearer lines (at most)
  pileSpan: number; // m, pile centres along a bearer (at most)
  ledger: "none" | "start" | "end" | "both"; // the low-u or high-u edge (or both) is a stringer on the building or a beam, not a bearer on piles
  height: number; // m, deck surface above the level's floor
  drop: number; // m, deck surface down to the ground (piles)
};
export const defaultDeck = (): DeckSpec => ({ dir: "y", spacing: 400, bearerSpan: 1.85, pileSpan: 2.5, ledger: "none", height: 0, drop: 0.6 });

export type StairSpec = {
  width: number; // m
  rise?: number; // m, foot to head; default the storey (floor to floor)
  stringers: 2 | 3;
};
export const defaultStair = (): StairSpec => ({ width: 1.0, stringers: 3 });

export const DECK_G = 0.7; // kPa, deck boards, joists and bearers (as the 26121 model)
export const DECK_Q = 2.0; // kPa, balconies and decks
export const STAIR_G = 0.3; // kPa, treads
export const STAIR_Q = 2.0; // kPa

export type DeckLayout = {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  ns: boolean; // joists run along y
  bearers: { u: number; ledger: boolean; piles: number[] }[]; // lines across the joists, and pile positions (v) along each
  joistSpan: number; // m
  pileSpan: number; // m, actual
};

export function deckLayout(m: Member): DeckLayout | null {
  if (!m.b || !m.deck) return null;
  const d = m.deck;
  const ns = d.dir === "y";
  const x0 = Math.min(m.a.x, m.b.x),
    x1 = Math.max(m.a.x, m.b.x),
    y0 = Math.min(m.a.y, m.b.y),
    y1 = Math.max(m.a.y, m.b.y);
  const [u0, u1, v0, v1] = ns ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
  const W = u1 - u0,
    L = v1 - v0;
  // carried at both edges: the joists span the deck, with no bearers or piles
  const n = d.ledger === "both" ? 1 : Math.max(1, Math.ceil(W / Math.max(0.6, d.bearerSpan) - 1e-6));
  const k = Math.max(1, Math.ceil((L - 0.12) / Math.max(0.6, d.pileSpan) - 1e-6));
  const piles = Array.from({ length: k + 1 }, (_, i) => v0 + 0.06 + (i * (L - 0.12)) / k);
  const bearers = Array.from({ length: n + 1 }, (_, i) => {
    const u = u0 + (i * W) / n;
    const ledger = d.ledger === "both" || (i === 0 && d.ledger === "start") || (i === n && d.ledger === "end");
    // edge bearers sit just inside the deck so the joists bear on them
    const uu = i === 0 ? u + 0.045 : i === n ? u - 0.045 : u;
    return { u: uu, ledger, piles: ledger ? [] : piles };
  });
  return { u0, u1, v0, v1, ns, bearers, joistSpan: W / n, pileSpan: (L - 0.12) / k };
}

export type StairLayout = { run: number; rise: number; risers: number; R: number; G: number; ok: boolean; pitch: number };

// risers of at most 190 mm; the treads share the run (the top riser lands on the floor above)
export function stairLayout(m: Member, rise: number): StairLayout | null {
  if (!m.b) return null;
  const run = memberLength(m);
  const risers = Math.max(2, Math.ceil(rise / 0.19 - 1e-6));
  const R = rise / risers;
  const G = run / (risers - 1);
  return { run, rise, risers, R, G, ok: R <= 0.19 + 1e-6 && G >= 0.28 - 1e-6, pitch: (Math.atan2(rise, run) * 180) / Math.PI };
}
