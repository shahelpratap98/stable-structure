"use client";

// Marked-up plan of one level for the report: the architect's page (when
// placed and scaled) faded underneath, with every member drawn and labelled.

import type { Calcs } from "@/lib/design/calc";
import type { Change } from "@/lib/design/diff";
import { MEMBER_INFO, type DesignModel, type Level, type Member, type Pt } from "@/lib/design/model";
import { loadPdf, renderPage } from "./pdf";

export type PlanSource = { id: string; url: string };

const pad = 1.2; // m around the members

function bounds(members: Member[]) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const m of members)
    for (const p of [m.a, m.b].filter(Boolean) as Pt[]) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

// Revision cloud: scallops round a box, as drawn by hand on a marked-up sheet.
function cloud(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: number) {
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / (2 * r)));
    const ux = (bx - ax) / n,
      uy = (by - ay) / n;
    const ang = Math.atan2(uy, ux);
    for (let i = 0; i < n; i++) {
      const cx = ax + ux * (i + 0.5),
        cy = ay + uy * (i + 0.5);
      ctx.arc(cx, cy, Math.hypot(ux, uy) / 2, ang + Math.PI, ang + 2 * Math.PI);
    }
  };
  ctx.beginPath();
  edge(x0, y0, x1, y0);
  edge(x1, y0, x1, y1);
  edge(x1, y1, x0, y1);
  edge(x0, y1, x0, y0);
  ctx.stroke();
}

export async function planImage(
  model: DesignModel,
  calcs: Calcs,
  level: Level,
  plans: PlanSource[],
  revs: { changes: Change[]; revision: number } | null = null,
  maxW = 2200,
  maxH = 1500,
): Promise<{ url: string; w: number; h: number } | null> {
  const members = model.members.filter((m) => m.levelId === level.id);
  const lintels = calcs.lintels.filter((l) => l.wall.levelId === level.id);
  if (!members.length) return null;
  const clouds = revs ? revs.changes.filter((c) => c.levelId === level.id && c.at.length) : [];
  const b = bounds([...members, ...clouds.flatMap((c) => c.at.map((a) => ({ a }) as Member))]);
  const wm = b.x1 - b.x0,
    hm = b.y1 - b.y0;
  const k = Math.min(maxW / wm, maxH / hm); // px per metre
  const W = Math.round(wm * k),
    H = Math.round(hm * k);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  const P = (p: Pt) => ({ x: (p.x - b.x0) * k, y: (p.y - b.y0) * k });

  // underlay
  const src = level.plan && level.plan.scale ? plans.find((p) => p.id === level.plan!.planId) : null;
  if (src?.url && level.plan?.scale) {
    try {
      const page = await renderPage(await loadPdf(src.id, src.url), level.plan.page);
      const ratio = page.canvas.width / page.width; // image px per PDF point
      const s = level.plan.scale; // m per point
      const o = level.plan.origin;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(page.canvas, (o.x + b.x0 / s) * ratio, (o.y + b.y0 / s) * ratio, (wm / s) * ratio, (hm / s) * ratio, 0, 0, W, H);
      ctx.globalAlpha = 1;
    } catch {
      // the plan couldn't be fetched; draw the members on the grid
    }
  } else {
    ctx.strokeStyle = "#e3e8ec";
    ctx.lineWidth = 1;
    for (let x = Math.ceil(b.x0); x <= b.x1; x++) {
      ctx.beginPath();
      ctx.moveTo((x - b.x0) * k, 0);
      ctx.lineTo((x - b.x0) * k, H);
      ctx.stroke();
    }
    for (let y = Math.ceil(b.y0); y <= b.y1; y++) {
      ctx.beginPath();
      ctx.moveTo(0, (y - b.y0) * k);
      ctx.lineTo(W, (y - b.y0) * k);
      ctx.stroke();
    }
  }

  const fail = (id: string) => calcs.results.get(id)?.status === "fail";
  const line = (a: Pt, c: Pt, colour: string, width: number, dash: number[] = []) => {
    const p = P(a),
      q = P(c);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const tags: { at: Pt; text: string; colour: string; round?: boolean }[] = [];
  // weights and text sized to the image, so a whole house reads as well as a deck
  const px = Math.max(2, Math.max(W, H) / 650);

  // joist zones first, then walls, then framing members on top
  for (const m of members.filter((x) => x.type === "joistzone" && x.b)) {
    const a = P(m.a),
      c = P(m.b!);
    const colour = MEMBER_INFO.joistzone.colour;
    ctx.fillStyle = colour + "22";
    ctx.fillRect(a.x, a.y, c.x - a.x, c.y - a.y);
    ctx.strokeStyle = colour;
    ctx.lineWidth = px;
    ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);
    const s = (m.zone?.spacing ?? 400) / 1000;
    ctx.lineWidth = Math.max(0.75, px * 0.4);
    ctx.strokeStyle = colour + "99";
    if (m.zone?.dir === "x")
      for (let y = m.a.y + s; y < m.b!.y; y += s) line({ x: m.a.x, y }, { x: m.b!.x, y }, colour + "88", Math.max(0.75, px * 0.4));
    else for (let x = m.a.x + s; x < m.b!.x; x += s) line({ x, y: m.a.y }, { x, y: m.b!.y }, colour + "88", Math.max(0.75, px * 0.4));
    tags.push({ at: { x: (m.a.x + m.b!.x) / 2, y: (m.a.y + m.b!.y) / 2 }, text: m.label, colour });
  }
  for (const m of members.filter((x) => (x.type === "wall" || x.type === "retaining") && x.b)) {
    const t = m.type === "wall" ? (m.wall?.thickness ?? 90) / 1000 : 0.2;
    line(m.a, m.b!, m.type === "wall" ? (m.wall?.kind === "int" ? "#9aa6b2" : "#5f6f80") : MEMBER_INFO.retaining.colour, Math.max(px, t * k));
    if (m.type === "retaining") tags.push({ at: { x: (m.a.x + m.b!.x) / 2, y: (m.a.y + m.b!.y) / 2 }, text: m.label, colour: MEMBER_INFO.retaining.colour });
  }
  for (const l of lintels) {
    const m = l.member;
    if (!m.b) continue;
    line(m.a, m.b, "#ffffff", px * 4.2);
    line(m.a, m.b, fail(l.id) ? "#b8342a" : MEMBER_INFO.lintel.colour, px * 2.2);
    tags.push({ at: { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 }, text: calcs.results.get(l.id)?.mark ?? m.label, colour: MEMBER_INFO.lintel.colour });
  }
  for (const m of members.filter((x) => x.b && ["beam", "lintel", "joist", "rafter", "bracing"].includes(x.type))) {
    const colour = fail(m.id) ? "#b8342a" : MEMBER_INFO[m.type].colour;
    const w = m.type === "bracing" ? px * 1.6 : px * 2.2;
    line(m.a, m.b!, "#ffffff", w + px * 2); // halo, so members stand clear of the underlay
    line(m.a, m.b!, colour, w, m.type === "bracing" ? [px * 4, px * 2] : []);
    tags.push({ at: { x: (m.a.x + m.b!.x) / 2, y: (m.a.y + m.b!.y) / 2 }, text: m.label, colour });
  }
  for (const m of members.filter((x) => x.type === "post" || x.type === "pile" || x.type === "footing")) {
    const p = P(m.a);
    const colour = fail(m.id) ? "#b8342a" : MEMBER_INFO[m.type].colour;
    const r = Math.max(px * 2.5, (m.type === "footing" ? 0.3 : 0.09) * k);
    ctx.fillStyle = m.type === "footing" ? colour + "33" : colour;
    ctx.strokeStyle = colour;
    ctx.lineWidth = px;
    ctx.beginPath();
    if (m.type === "pile") ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    else ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
    ctx.fill();
    ctx.stroke();
    tags.push({ at: { x: m.a.x + 0.25, y: m.a.y - 0.25 }, text: m.label, colour, round: m.type !== "footing" });
  }

  // labels
  const fs = Math.round(Math.max(16, Math.max(W, H) / 80));
  ctx.font = `600 ${fs}px Consolas, ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of tags) {
    const p = P(t.at);
    const w = ctx.measureText(t.text).width + fs * 0.6;
    const h = fs * 1.35;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = t.colour;
    ctx.lineWidth = px * 0.8;
    ctx.beginPath();
    if (t.round) ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, h / 2);
    else ctx.rect(p.x - w / 2, p.y - h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = t.colour === "#b8342a" ? "#b8342a" : "#1b2530";
    ctx.fillText(t.text, p.x, p.y + 1);
  }

  // revision clouds, each with its revision triangle
  if (clouds.length) {
    const tri = fs * 1.5;
    ctx.strokeStyle = "#c2410c";
    ctx.lineWidth = px * 1.1;
    for (const c of clouds) {
      const ps = c.at.map(P);
      const m = Math.max(0.35 * k, fs);
      const x0 = Math.min(...ps.map((p) => p.x)) - m,
        x1 = Math.max(...ps.map((p) => p.x)) + m,
        y0 = Math.min(...ps.map((p) => p.y)) - m,
        y1 = Math.max(...ps.map((p) => p.y)) + m;
      cloud(ctx, x0, y0, x1, y1, Math.max(fs * 0.45, px * 3));
      ctx.beginPath();
      ctx.moveTo(x1, y0 - tri * 0.9);
      ctx.lineTo(x1 + tri * 0.55, y0);
      ctx.lineTo(x1 - tri * 0.55, y0);
      ctx.closePath();
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c2410c";
      ctx.font = `700 ${Math.round(fs * 0.7)}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(String(revs!.revision), x1, y0 - tri * 0.3);
    }
  }

  // scale bar
  const bar = wm > 25 ? 10 : wm > 10 ? 5 : 2;
  ctx.fillStyle = "#1b2530";
  ctx.fillRect(20, H - fs * 1.4, bar * k, px * 2);
  ctx.font = `600 ${fs}px Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`${bar} m`, 26 + bar * k, H - fs * 1.4 + px);

  return { url: canvas.toDataURL("image/png"), w: W, h: H };
}
