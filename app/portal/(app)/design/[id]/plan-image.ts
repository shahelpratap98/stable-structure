"use client";

// Marked-up plan of one level for the report: the architect's page (when
// placed and scaled) faded underneath, with every member drawn and labelled.

import type { Calcs } from "@/lib/design/calc";
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

export async function planImage(model: DesignModel, calcs: Calcs, level: Level, plans: PlanSource[], maxW = 2200, maxH = 1500): Promise<{ url: string; w: number; h: number } | null> {
  const members = model.members.filter((m) => m.levelId === level.id);
  const lintels = calcs.lintels.filter((l) => l.wall.levelId === level.id);
  if (!members.length) return null;
  const b = bounds(members);
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
      ctx.globalAlpha = 0.45;
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
  const px = Math.max(1.5, k * 0.012); // a line weight that reads at any scale

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
    line(m.a, m.b, fail(l.id) ? "#b8342a" : MEMBER_INFO.lintel.colour, px * 2.2);
    tags.push({ at: { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 }, text: calcs.results.get(l.id)?.mark ?? m.label, colour: MEMBER_INFO.lintel.colour });
  }
  for (const m of members.filter((x) => x.b && ["beam", "lintel", "joist", "rafter", "bracing"].includes(x.type))) {
    const colour = fail(m.id) ? "#b8342a" : MEMBER_INFO[m.type].colour;
    line(m.a, m.b!, colour, m.type === "bracing" ? px * 1.6 : px * 2.2, m.type === "bracing" ? [px * 4, px * 2] : []);
    tags.push({ at: { x: (m.a.x + m.b!.x) / 2, y: (m.a.y + m.b!.y) / 2 }, text: m.label, colour });
  }
  for (const m of members.filter((x) => x.type === "post" || x.type === "pile" || x.type === "footing")) {
    const p = P(m.a);
    const colour = fail(m.id) ? "#b8342a" : MEMBER_INFO[m.type].colour;
    const r = Math.max(5, (m.type === "footing" ? 0.3 : 0.09) * k);
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
  const fs = Math.round(Math.max(13, Math.min(22, k * 0.16)));
  ctx.font = `600 ${fs}px Consolas, ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of tags) {
    const p = P(t.at);
    const w = ctx.measureText(t.text).width + fs * 0.6;
    const h = fs * 1.35;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = t.colour;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (t.round) ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, h / 2);
    else ctx.rect(p.x - w / 2, p.y - h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1b2530";
    ctx.fillText(t.text, p.x, p.y + 1);
  }

  // scale bar
  const bar = wm > 25 ? 10 : wm > 10 ? 5 : 2;
  ctx.fillStyle = "#1b2530";
  ctx.fillRect(20, H - 28, bar * k, 6);
  ctx.font = `600 ${fs}px Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`${bar} m`, 26 + bar * k, H - 25);

  return { url: canvas.toDataURL("image/png"), w: W, h: H };
}
