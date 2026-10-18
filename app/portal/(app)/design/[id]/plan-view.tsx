"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RATINGS } from "@/lib/design/bracing";
import { STATUS_COLOUR, type Calcs } from "@/lib/design/calc";
import { FAMILY_COLOUR } from "@/lib/design/materials";
import { MEMBER_INFO, memberLength, type Level, type Member, type MemberType, type Pt } from "@/lib/design/model";
import type { RenderedPage } from "./pdf";
import type { ColourBy } from "./view-3d";

export type Tool = "select" | "pan" | "scale" | "origin" | "opening" | MemberType;

// Where a level's plan sits in the shared metre frame. Levels without a plan
// get a 30 x 20 m sheet with a 1 m grid so work can start before plans arrive.
export type Frame = { w: number; h: number; scale: number | null; origin: Pt; hasPlan: boolean };

export const GRID_FRAME = { scale: 0.01, origin: { x: 200, y: 200 } };

// The level's transform applies even while its page is still loading, so
// members never jump when the drawing arrives.
export function frameFor(level: Level, page: RenderedPage | null): Frame {
  if (level.plan) return { w: page?.width ?? 3000, h: page?.height ?? 2000, scale: level.plan.scale, origin: level.plan.origin, hasPlan: !!page };
  return { w: 3000, h: 2000, ...GRID_FRAME, hasPlan: false };
}

// Until a plan's scale is set, members are shown at the grid scale.
export const toPdf = (f: Pick<Frame, "scale" | "origin">, p: Pt): Pt => ({ x: f.origin.x + p.x / (f.scale ?? GRID_FRAME.scale), y: f.origin.y + p.y / (f.scale ?? GRID_FRAME.scale) });
export const toWorld = (f: Pick<Frame, "scale" | "origin">, p: Pt): Pt => ({ x: (p.x - f.origin.x) * (f.scale ?? GRID_FRAME.scale), y: (p.y - f.origin.y) * (f.scale ?? GRID_FRAME.scale) });

type Drag =
  | { kind: "pan"; startX: number; startY: number; pan: Pt }
  | { kind: "move"; id: string; from: Pt; delta: Pt }
  | { kind: "end"; id: string; end: "a" | "b"; to: Pt }
  | { kind: "box"; from: Pt; to: Pt };

type Props = {
  level: Level;
  members: Member[]; // this level
  ghosts: Member[]; // level below, drawn faintly for alignment
  page: RenderedPage | null;
  pageLoading: boolean;
  tool: Tool;
  selectedId: string | null;
  calcs: Calcs;
  colourBy: ColourBy;
  onSelect: (id: string | null) => void;
  onCreate: (type: MemberType, a: Pt, b?: Pt) => void;
  onOpening: (wallId: string, s0: number, s1: number) => void; // metres along the wall
  onMove: (id: string, a: Pt, b?: Pt) => void;
  onScale: (p1: Pt, p2: Pt) => void; // PDF points
  onOrigin: (p: Pt) => void; // PDF point
  onCursor: (p: Pt | null) => void; // metres
  focus: { id: string; n: number } | null; // centre the view on this member
  multi?: string[]; // several members selected (shift-click, shift-drag a box)
  suggest?: { a: Pt; b: Pt; colour: string; label?: string }[]; // lines found on the sheet (PDF points), previewed
  clouds?: Pt[][]; // members changed since a compared revision (metres), boxed
  onToggle?: (id: string) => void;
  onBox?: (ids: string[]) => void;
};

const HIT_PX = 7;

function distToSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function PlanView(props: Props) {
  const { level, members, ghosts, page, tool, selectedId, calcs, colourBy } = props;
  const results = calcs.results;
  const isSel = (id: string) => id === selectedId || !!props.multi?.includes(id);
  const frame = useMemo(() => frameFor(level, page), [level, page]);
  const box = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null); // the transformed page; its screen box is the truth for clicks
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [cursor, setCursor] = useState<Pt | null>(null); // PDF space, snapped
  // First click of a line or scale pick; dropped when the tool or level changes.
  const startKey = `${tool}|${level.id}`;
  const [startState, setStartState] = useState<{ key: string; p: Pt; wallId?: string } | null>(null);
  const start = startState?.key === startKey ? startState.p : null;
  const startWall = startState?.key === startKey ? startState.wallId : undefined;
  const setStart = (p: Pt | null, wallId?: string) => setStartState(p ? { key: startKey, p, wallId } : null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [shift, setShift] = useState(false);
  const [space, setSpace] = useState(false);
  const fitted = useRef<string>("");

  // Keep the canvas element from pdf.js in the DOM.
  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;
    host.replaceChildren(...(page ? [page.canvas] : []));
  }, [page]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const zoom = Math.min(size.w / frame.w, size.h / frame.h) * 0.94;
    setView({ zoom, pan: { x: (size.w - frame.w * zoom) / 2, y: (size.h - frame.h * zoom) / 2 } });
  }, [frame.w, frame.h, size.w, size.h]);

  // Fit once per level / plan page, and whenever the box first gets a size.
  useEffect(() => {
    const key = `${level.id}:${frame.w}x${frame.h}:${size.w > 50}`;
    if (fitted.current !== key && size.w > 50) {
      fitted.current = key;
      fit();
    }
  }, [level.id, frame.w, frame.h, size.w, fit]);

  // Centre on a member picked elsewhere (3D view, schedule).
  const [focusSeen, setFocusSeen] = useState(0);
  if (props.focus && props.focus.n !== focusSeen) {
    const target = members.find((x) => x.id === props.focus!.id.split("#")[0]);
    if (target) {
      setFocusSeen(props.focus.n);
      const a = toPdf(frame, target.a);
      const b = target.b ? toPdf(frame, target.b) : a;
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setView((v) => ({ ...v, pan: { x: size.w / 2 - c.x * v.zoom, y: size.h / 2 - c.y * v.zoom } }));
    }
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShift(true);
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === " " && !typing) {
        setSpace(true);
        e.preventDefault();
      }
      if (e.key === "Escape") setStartState(null);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShift(false);
      if (e.key === " ") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Measured from where the page actually is on screen, so a scrolled box
  // (focus or find-in-page can scroll even an overflow-hidden element) can't
  // put clicks somewhere other than where the drawing shows them.
  const pdfFromEvent = (e: { clientX: number; clientY: number }): Pt => {
    const r = sheet.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.zoom, y: (e.clientY - r.top) / view.zoom };
  };

  // Member geometry in PDF space, with any drag in progress applied.
  const shapes = useMemo(() => {
    return members.map((m) => {
      let a = toPdf(frame, m.a);
      let b = m.b ? toPdf(frame, m.b) : undefined;
      if (drag?.kind === "move" && drag.id === m.id) {
        a = { x: a.x + drag.delta.x, y: a.y + drag.delta.y };
        if (b) b = { x: b.x + drag.delta.x, y: b.y + drag.delta.y };
      }
      if (drag?.kind === "end" && drag.id === m.id) {
        if (drag.end === "a") a = drag.to;
        else b = drag.to;
      }
      return { m, a, b };
    });
  }, [members, frame, drag]);

  const ghostShapes = useMemo(() => ghosts.map((m) => ({ m, a: toPdf(frame, m.a), b: m.b ? toPdf(frame, m.b) : undefined })), [ghosts, frame]);

  const snap = (p: Pt, from: Pt | null, skipId?: string): Pt => {
    const tol = 10 / view.zoom;
    let best: Pt | null = null;
    let bestD = tol;
    for (const s of [...shapes, ...ghostShapes]) {
      if (s.m.id === skipId) continue;
      for (const q of s.b ? [s.a, s.b] : [s.a]) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
    }
    if (best) return best;
    if (from) {
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const step = shift ? Math.PI / 12 : Math.PI / 2;
      const snapped = Math.round(ang / step) * step;
      // Shift: every 15°. Otherwise lock to square only when within 4°.
      if (shift || Math.abs(snapped - ang) < (4 * Math.PI) / 180) return { x: from.x + len * Math.cos(snapped), y: from.y + len * Math.sin(snapped) };
    }
    return p;
  };

  const scaleK = frame.scale ?? GRID_FRAME.scale; // metres per PDF unit
  const half = (m: Member) => (m.type === "wall" ? (m.wall?.thickness ?? 90) / 2000 / scaleK : 0);

  // Distance along a wall (metres) of the point nearest p, if p is on the wall.
  const onWall = (p: Pt, onlyId?: string): { id: string; s: number } | null => {
    let best: { id: string; s: number; d: number } | null = null;
    for (const sh of shapes) {
      if (sh.m.type !== "wall" || !sh.b || (onlyId && sh.m.id !== onlyId)) continue;
      const dx = sh.b.x - sh.a.x;
      const dy = sh.b.y - sh.a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((p.x - sh.a.x) * dx + (p.y - sh.a.y) * dy) / len2)) : 0;
      const d = Math.hypot(p.x - (sh.a.x + t * dx), p.y - (sh.a.y + t * dy));
      if (d < half(sh.m) + (HIT_PX / view.zoom) * 1.5 && (!best || d < best.d)) best = { id: sh.m.id, s: t * memberLength(sh.m), d };
    }
    return best ? { id: best.id, s: best.s } : null;
  };

  const hitTest = (p: Pt): { id: string; end?: "a" | "b" } | null => {
    const tol = HIT_PX / view.zoom;
    const sel = shapes.find((s) => s.m.id === selectedId);
    if (sel?.b) {
      if (Math.hypot(sel.a.x - p.x, sel.a.y - p.y) < tol * 1.4) return { id: sel.m.id, end: "a" };
      if (Math.hypot(sel.b.x - p.x, sel.b.y - p.y) < tol * 1.4) return { id: sel.m.id, end: "b" };
    }
    let best: { id: string; d: number } | null = null;
    // Points first (they sit on top of lines in the drawing)
    for (const s of shapes) {
      if (s.m.type === "joistzone") continue;
      const d = s.b ? Math.max(0, distToSegment(p, s.a, s.b) - half(s.m)) : Math.hypot(s.a.x - p.x, s.a.y - p.y) * 0.7;
      if (d < tol && (!best || d < best.d)) best = { id: s.m.id, d };
    }
    if (best) {
      const m = members.find((x) => x.id === best!.id);
      // a click on an opening picks its lintel
      if (m?.type === "wall" && m.wall?.openings.length) {
        const w = onWall(p, m.id);
        const o = w ? m.wall.openings.find((op) => w.s >= op.offset - 0.05 && w.s <= op.offset + op.width + 0.05) : undefined;
        if (o) return { id: `${m.id}#${o.id}` };
      }
      return { id: best.id };
    }
    // joist zones last: anywhere inside the rectangle
    for (const s of [...shapes].reverse()) {
      if (s.m.type !== "joistzone" || !s.b) continue;
      if (p.x >= Math.min(s.a.x, s.b.x) && p.x <= Math.max(s.a.x, s.b.x) && p.y >= Math.min(s.a.y, s.b.y) && p.y <= Math.max(s.a.y, s.b.y)) return { id: s.m.id };
    }
    return null;
  };

  const memberTool = tool !== "select" && tool !== "pan" && tool !== "scale" && tool !== "origin" && tool !== "opening";
  const lineTool = memberTool && MEMBER_INFO[tool as MemberType].line;
  const pointTool = memberTool && !MEMBER_INFO[tool as MemberType].line;
  const areaTool = memberTool && !!MEMBER_INFO[tool as MemberType].area;
  const needsScale = frame.hasPlan && !frame.scale && (lineTool || pointTool || tool === "opening");

  const onPointerDown = (e: React.PointerEvent) => {
    box.current?.setPointerCapture(e.pointerId);
    const raw = pdfFromEvent(e);
    if (e.button === 1 || e.button === 2 || tool === "pan" || space) {
      setDrag({ kind: "pan", startX: e.clientX, startY: e.clientY, pan: view.pan });
      return;
    }
    if (e.button !== 0) return;
    if (tool === "origin") {
      props.onOrigin(snap(raw, null));
      return;
    }
    if (tool === "scale") {
      const p = snap(raw, start);
      if (!start) setStart(p);
      else {
        props.onScale(start, p);
        setStart(null);
      }
      return;
    }
    if (needsScale) return;
    if (tool === "opening") {
      const w = onWall(raw, startWall);
      if (!w) return;
      if (!start) setStart(raw, w.id);
      else {
        const first = onWall(start, w.id);
        if (first && Math.abs(first.s - w.s) > 0.1) props.onOpening(w.id, Math.min(first.s, w.s), Math.max(first.s, w.s));
        setStart(null);
      }
      return;
    }
    if (areaTool) {
      const p = snap(raw, null);
      if (!start) setStart(p);
      else {
        if (Math.abs(p.x - start.x) * scaleK > 0.2 && Math.abs(p.y - start.y) * scaleK > 0.2) props.onCreate(tool as MemberType, toWorld(frame, start), toWorld(frame, p));
        setStart(null);
      }
      return;
    }
    if (lineTool) {
      const p = snap(raw, start);
      if (!start) setStart(p);
      else {
        if (Math.hypot(p.x - start.x, p.y - start.y) * (frame.scale ?? GRID_FRAME.scale) > 0.05) props.onCreate(tool as MemberType, toWorld(frame, start), toWorld(frame, p));
        setStart(null);
      }
      return;
    }
    if (pointTool) {
      props.onCreate(tool as MemberType, toWorld(frame, snap(raw, null)));
      return;
    }
    // select: shift adds to the selection, or drags a box
    const hit = hitTest(raw);
    if (e.shiftKey && tool === "select") {
      if (hit && props.onToggle) props.onToggle(hit.id);
      else if (!hit) setDrag({ kind: "box", from: raw, to: raw });
      return;
    }
    if (!hit) {
      props.onSelect(null);
      setDrag({ kind: "pan", startX: e.clientX, startY: e.clientY, pan: view.pan });
      return;
    }
    props.onSelect(hit.id);
    if (hit.id.includes("#")) return; // opening lintels move with their wall
    if (hit.end) setDrag({ kind: "end", id: hit.id, end: hit.end, to: raw });
    else setDrag({ kind: "move", id: hit.id, from: raw, delta: { x: 0, y: 0 } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const raw = pdfFromEvent(e);
    if (drag?.kind === "pan") {
      setView((v) => ({ ...v, pan: { x: drag.pan.x + e.clientX - drag.startX, y: drag.pan.y + e.clientY - drag.startY } }));
      return;
    }
    if (drag?.kind === "move") {
      setDrag({ ...drag, delta: { x: raw.x - drag.from.x, y: raw.y - drag.from.y } });
      return;
    }
    if (drag?.kind === "box") {
      setDrag({ ...drag, to: raw });
      return;
    }
    if (drag?.kind === "end") {
      const s = shapes.find((x) => x.m.id === drag.id);
      const other = s ? (drag.end === "a" ? s.b : s.a) ?? null : null;
      setDrag({ ...drag, to: snap(raw, other, drag.id) });
      return;
    }
    const p = tool === "select" || tool === "pan" || tool === "opening" ? raw : snap(raw, areaTool ? null : start);
    setCursor(p);
    props.onCursor(frame.scale ? toWorld(frame, p) : null);
  };

  const onPointerUp = () => {
    if (drag?.kind === "box") {
      const x0 = Math.min(drag.from.x, drag.to.x),
        x1 = Math.max(drag.from.x, drag.to.x),
        y0 = Math.min(drag.from.y, drag.to.y),
        y1 = Math.max(drag.from.y, drag.to.y);
      const inside = (q: Pt) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
      const ids = shapes.filter((sh) => inside(sh.a) && (!sh.b || inside(sh.b))).map((sh) => sh.m.id);
      props.onBox?.(ids);
      setDrag(null);
      return;
    }
    if (drag?.kind === "move" && (drag.delta.x || drag.delta.y)) {
      const s = shapes.find((x) => x.m.id === drag.id);
      if (s) props.onMove(drag.id, toWorld(frame, s.a), s.b ? toWorld(frame, s.b) : undefined);
    }
    if (drag?.kind === "end") {
      const s = shapes.find((x) => x.m.id === drag.id);
      if (s) props.onMove(drag.id, toWorld(frame, s.a), s.b ? toWorld(frame, s.b) : undefined);
    }
    setDrag(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = box.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    setView((v) => {
      const zoom = Math.min(40, Math.max(0.05, v.zoom * Math.exp(-e.deltaY * 0.0015)));
      const k = zoom / v.zoom;
      return { zoom, pan: { x: mx - (mx - v.pan.x) * k, y: my - (my - v.pan.y) * k } };
    });
  };

  // Stop the page scrolling while the wheel zooms the plan.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const px = (n: number) => n / view.zoom; // screen pixels -> PDF units
  const zoomBy = (k: number) =>
    setView((v) => {
      const zoom = Math.min(40, Math.max(0.05, v.zoom * k));
      const f = zoom / v.zoom;
      return { zoom, pan: { x: size.w / 2 - (size.w / 2 - v.pan.x) * f, y: size.h / 2 - (size.h / 2 - v.pan.y) * f } };
    });
  const colourOf = (m: Pick<Member, "id" | "type" | "brace">) => {
    const r = results.get(m.id);
    if (colourBy === "result") return STATUS_COLOUR[r?.status ?? "none"];
    if (colourBy === "material") {
      if (r?.status === "fail") return "#b8342a";
      const f = r?.sec?.fam;
      if (f && f in FAMILY_COLOUR) return FAMILY_COLOUR[f as keyof typeof FAMILY_COLOUR];
    }
    if (m.type === "bracing") return RATINGS[m.brace?.system ?? "GS2N"].colour;
    return MEMBER_INFO[m.type].colour;
  };

  const lengthLabel = (a: Pt, b: Pt) => (frame.scale ? `${Math.round(Math.hypot(b.x - a.x, b.y - a.y) * frame.scale * 1000)} mm` : "");
  const grid = !frame.hasPlan;

  const cursorStyle = drag?.kind === "pan" || tool === "pan" || space ? "grabbing" : tool === "select" ? "default" : "crosshair";

  return (
    <div
      ref={box}
      className="relative h-full w-full touch-none overflow-hidden bg-[#e9e7e1] select-none"
      style={{ cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        setCursor(null);
        props.onCursor(null);
      }}
      onWheel={onWheel}
      onScroll={(e) => {
        // pan and zoom move the page; the box itself never scrolls
        e.currentTarget.scrollLeft = 0;
        e.currentTarget.scrollTop = 0;
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={sheet}
        className="absolute top-0 left-0 origin-top-left bg-white shadow-[0_2px_18px_rgba(12,30,51,0.18)]"
        style={{ width: frame.w, height: frame.h, transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})` }}
      >
        <div ref={canvasHost} className="absolute inset-0" />
        <svg className="absolute inset-0 overflow-visible" width={frame.w} height={frame.h} viewBox={`0 0 ${frame.w} ${frame.h}`}>
          {grid ? (
            <g stroke="#e3e8ef" strokeWidth={1} vectorEffect="non-scaling-stroke">
              {Array.from({ length: 31 }, (_, i) => (
                <line key={`v${i}`} x1={frame.origin.x + i * 100 - 200} y1={0} x2={frame.origin.x + i * 100 - 200} y2={frame.h} vectorEffect="non-scaling-stroke" />
              ))}
              {Array.from({ length: 21 }, (_, i) => (
                <line key={`h${i}`} x1={0} y1={frame.origin.y + i * 100 - 200} x2={frame.w} y2={frame.origin.y + i * 100 - 200} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          ) : null}

          {/* origin marker */}
          <g stroke="#0c1e33" strokeWidth={1} opacity={0.55}>
            <line x1={frame.origin.x - px(10)} y1={frame.origin.y} x2={frame.origin.x + px(10)} y2={frame.origin.y} vectorEffect="non-scaling-stroke" />
            <line x1={frame.origin.x} y1={frame.origin.y - px(10)} x2={frame.origin.x} y2={frame.origin.y + px(10)} vectorEffect="non-scaling-stroke" />
            <circle cx={frame.origin.x} cy={frame.origin.y} r={px(4)} fill="none" vectorEffect="non-scaling-stroke" />
          </g>

          {/* level below, faint */}
          <g opacity={0.35}>
            {ghostShapes.map(({ m, a, b }) =>
              m.type === "joistzone" ? null : b ? (
                <line key={m.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#475569" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              ) : (
                <rect key={m.id} x={a.x - px(4)} y={a.y - px(4)} width={px(8)} height={px(8)} fill="#475569" />
              ),
            )}
          </g>

          {/* joist zones under everything else */}
          {shapes.map(({ m, a, b }) => {
            if (m.type !== "joistzone" || !b || !m.zone) return null;
            const x0 = Math.min(a.x, b.x),
              x1 = Math.max(a.x, b.x),
              y0 = Math.min(a.y, b.y),
              y1 = Math.max(a.y, b.y);
            const step = Math.max(px(3), m.zone.spacing / 1000 / scaleK);
            const ns = m.zone.dir === "y";
            const hatch: number[] = [];
            for (let v = (ns ? x0 : y0) + step / 2; v < (ns ? x1 : y1) && hatch.length < 300; v += step) hatch.push(v);
            const colour = colourOf(m);
            const selected = isSel(m.id);
            return (
              <g key={m.id}>
                <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={colour} fillOpacity={selected ? 0.16 : 0.07} stroke={colour} strokeWidth={selected ? 2.5 : 1.5} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />
                <g stroke={colour} strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke">
                  {hatch.map((v, i) => (ns ? <line key={i} x1={v} y1={y0} x2={v} y2={y1} vectorEffect="non-scaling-stroke" /> : <line key={i} x1={x0} y1={v} x2={x1} y2={v} vectorEffect="non-scaling-stroke" />))}
                  {m.zone.doubled.map((d, i) => {
                    const v = ns ? toPdf(frame, { x: d, y: 0 }).x : toPdf(frame, { x: 0, y: d }).y;
                    return ns ? <line key={`d${i}`} x1={v} y1={y0} x2={v} y2={y1} strokeOpacity={0.9} strokeWidth={3} vectorEffect="non-scaling-stroke" /> : <line key={`d${i}`} x1={x0} y1={v} x2={x1} y2={v} strokeOpacity={0.9} strokeWidth={3} vectorEffect="non-scaling-stroke" />;
                  })}
                </g>
                <text x={(x0 + x1) / 2} y={(y0 + y1) / 2} textAnchor="middle" fontSize={px(11)} fontWeight={700} fill={colour} stroke="white" strokeWidth={px(3)} paintOrder="stroke" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                  {m.label} · {m.section} @ {m.zone.spacing} {ns ? "↕" : "↔"}
                  {results.get(m.id)?.status === "fail" ? " ✕" : ""}
                </text>
                {selected ? (
                  <>
                    <circle cx={a.x} cy={a.y} r={px(5)} fill="white" stroke="#1da9e3" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    <circle cx={b.x} cy={b.y} r={px(5)} fill="white" stroke="#1da9e3" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  </>
                ) : null}
              </g>
            );
          })}

          {/* walls at true thickness, with their openings */}
          {shapes.map(({ m, a, b }) => {
            if (m.type !== "wall" || !b || !m.wall) return null;
            const L = memberLength(m) || 1;
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const ux = (b.x - a.x) / len,
              uy = (b.y - a.y) / len;
            const h = Math.max(px(2), half(m));
            const at = (sM: number) => ({ x: a.x + (ux * sM * len) / L, y: a.y + (uy * sM * len) / L });
            const quad = (s0: number, s1: number) => {
              const p0 = at(s0),
                p1 = at(s1);
              return `${p0.x - uy * h},${p0.y + ux * h} ${p1.x - uy * h},${p1.y + ux * h} ${p1.x + uy * h},${p1.y - ux * h} ${p0.x + uy * h},${p0.y - ux * h}`;
            };
            const ops = [...m.wall.openings].sort((o1, o2) => o1.offset - o2.offset);
            const segs: [number, number][] = [];
            let cur = 0;
            for (const o of ops) {
              segs.push([cur, Math.max(cur, o.offset)]);
              cur = o.offset + o.width;
            }
            segs.push([cur, L]);
            const selected = isSel(m.id);
            const fill = m.wall.kind === "block" ? "#9b948a" : m.wall.kind === "int" ? "#cbd5e1" : "#64748b";
            const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
            const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
            const mid = at(L / 2);
            return (
              <g key={m.id}>
                {segs.map(([s0, s1], i) => (s1 - s0 > 0.001 ? <polygon key={i} points={quad(s0, s1)} fill={fill} fillOpacity={0.75} stroke={selected ? "#1da9e3" : "#334155"} strokeWidth={selected ? 2.5 : 1} vectorEffect="non-scaling-stroke" /> : null))}
                {ops.map((o) => {
                  const lid = `${m.id}#${o.id}`;
                  const r = results.get(lid);
                  const c = colourOf({ id: lid, type: "lintel" });
                  const p0 = at(o.offset),
                    p1 = at(o.offset + o.width),
                    pm = at(o.offset + o.width / 2);
                  const sel = lid === selectedId;
                  return (
                    <g key={o.id}>
                      {sel ? <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#1da9e3" strokeOpacity={0.35} strokeWidth={14} vectorEffect="non-scaling-stroke" /> : null}
                      <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={c} strokeWidth={o.sill > 0.05 ? 2 : 1} strokeDasharray={o.sill > 0.05 ? undefined : "4 3"} vectorEffect="non-scaling-stroke" />
                      <g transform={`translate(${pm.x} ${pm.y}) rotate(${upright})`}>
                        <text y={-h - px(4)} textAnchor="middle" fontSize={px(10)} fontWeight={700} fill={c} stroke="white" strokeWidth={px(3)} paintOrder="stroke" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                          {o.label}
                          {r?.status === "fail" ? " ✕" : ""}
                        </text>
                      </g>
                    </g>
                  );
                })}
                <g transform={`translate(${mid.x} ${mid.y}) rotate(${upright})`}>
                  <text y={h + px(11)} textAnchor="middle" fontSize={px(9)} fontWeight={600} fill="#334155" stroke="white" strokeWidth={px(3)} paintOrder="stroke" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                    {m.label}
                  </text>
                </g>
                {selected ? (
                  <>
                    <circle cx={a.x} cy={a.y} r={px(5)} fill="white" stroke="#1da9e3" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    <circle cx={b.x} cy={b.y} r={px(5)} fill="white" stroke="#1da9e3" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  </>
                ) : null}
              </g>
            );
          })}

          {shapes.map(({ m, a, b }) => {
            if (m.type === "joistzone" || m.type === "wall") return null;
            const colour = colourOf(m);
            const selected = isSel(m.id);
            const res = results.get(m.id);
            if (b) {
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
              const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
              const dash = m.type === "joist" || m.type === "rafter" ? "10 5" : m.type === "retaining" ? "14 4 3 4" : undefined;
              const width = m.type === "bracing" ? 7 : m.type === "retaining" ? 6 : m.type === "beam" ? 4.5 : 3.5;
              return (
                <g key={m.id}>
                  {selected ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1da9e3" strokeOpacity={0.35} strokeWidth={width + 9} strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colour} strokeOpacity={m.type === "bracing" ? 0.7 : 1} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <g transform={`translate(${mid.x} ${mid.y}) rotate(${upright})`}>
                    <text y={-px(6)} textAnchor="middle" fontSize={px(11)} fontWeight={700} fill={colour} stroke="white" strokeWidth={px(3)} paintOrder="stroke" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                      {m.label}
                      {res?.status === "fail" ? " ✕" : ""}
                    </text>
                  </g>
                  {selected ? (
                    <>
                      <circle cx={a.x} cy={a.y} r={px(5)} fill="white" stroke="#1da9e3" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                      <circle cx={b.x} cy={b.y} r={px(5)} fill="white" stroke="#1da9e3" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    </>
                  ) : null}
                </g>
              );
            }
            const r = px(m.type === "footing" ? 8 : 6);
            return (
              <g key={m.id}>
                {selected ? <circle cx={a.x} cy={a.y} r={r + px(6)} fill="#1da9e3" fillOpacity={0.25} /> : null}
                {m.type === "pile" ? (
                  <circle cx={a.x} cy={a.y} r={r} fill={colour} stroke="white" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                ) : m.type === "footing" ? (
                  <rect x={a.x - r} y={a.y - r} width={r * 2} height={r * 2} fill="none" stroke={colour} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                ) : (
                  <rect x={a.x - r} y={a.y - r} width={r * 2} height={r * 2} fill={colour} stroke="white" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                )}
                <text x={a.x + r + px(3)} y={a.y - r} fontSize={px(11)} fontWeight={700} fill={colour} stroke="white" strokeWidth={px(3)} paintOrder="stroke" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                  {m.label}
                  {res?.status === "fail" ? " ✕" : ""}
                </text>
              </g>
            );
          })}

          {/* joist zone being drawn */}
          {areaTool && start && cursor ? (
            <rect x={Math.min(start.x, cursor.x)} y={Math.min(start.y, cursor.y)} width={Math.abs(cursor.x - start.x)} height={Math.abs(cursor.y - start.y)} fill="#b7791f" fillOpacity={0.08} stroke="#b7791f" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          ) : null}
          {/* opening being picked */}
          {tool === "opening" && start && cursor ? (
            <line x1={start.x} y1={start.y} x2={cursor.x} y2={cursor.y} stroke="#0891b2" strokeWidth={4} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />
          ) : null}

          {/* line or scale in progress */}
          {start && cursor && !areaTool && tool !== "opening" ? (
            <g>
              <line x1={start.x} y1={start.y} x2={cursor.x} y2={cursor.y} stroke={tool === "scale" ? "#dc2626" : "#1da9e3"} strokeWidth={2.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <text x={cursor.x + px(10)} y={cursor.y - px(10)} fontSize={px(12)} fontWeight={700} fill="#0c1e33" stroke="white" strokeWidth={px(3)} paintOrder="stroke">
                {tool === "scale" ? "" : lengthLabel(start, cursor)}
              </text>
            </g>
          ) : null}
          {cursor && tool !== "select" && tool !== "pan" ? (
            <circle cx={cursor.x} cy={cursor.y} r={px(4)} fill="none" stroke="#1da9e3" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ) : null}
                  {(props.clouds ?? []).map((ps, i) => {
            const q = ps.map((p) => toPdf(frame, p));
            const m = px(10);
            const x0 = Math.min(...q.map((p) => p.x)) - m,
              y0 = Math.min(...q.map((p) => p.y)) - m;
            return (
              <rect
                key={`cl${i}`}
                x={x0}
                y={y0}
                width={Math.max(...q.map((p) => p.x)) + m - x0}
                height={Math.max(...q.map((p) => p.y)) + m - y0}
                rx={px(8)}
                fill="#c2410c"
                fillOpacity={0.05}
                stroke="#c2410c"
                strokeWidth={2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            );
          })}
          {(props.suggest ?? []).map((l, i) => (
            <g key={`sg${i}`}>
              <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={l.colour} strokeWidth={6} strokeOpacity={0.45} strokeDasharray="10 6" vectorEffect="non-scaling-stroke" />
              {l.label ? (
                <text x={(l.a.x + l.b.x) / 2} y={(l.a.y + l.b.y) / 2 - px(6)} textAnchor="middle" fontSize={px(10)} fontWeight={700} fill={l.colour} stroke="white" strokeWidth={px(3)} paintOrder="stroke" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                  {l.label}
                </text>
              ) : null}
            </g>
          ))}
          {drag?.kind === "box" ? (
            <rect
              x={Math.min(drag.from.x, drag.to.x)}
              y={Math.min(drag.from.y, drag.to.y)}
              width={Math.abs(drag.to.x - drag.from.x)}
              height={Math.abs(drag.to.y - drag.from.y)}
              fill="#2563eb"
              fillOpacity={0.06}
              stroke="#2563eb"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
      </div>

      {props.pageLoading ? (
        <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">Loading plan…</p>
      ) : null}
      {needsScale ? (
        <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-warn-bg px-3 py-1 text-xs font-semibold text-warn">Set the scale first: choose Scale and click two ends of a known dimension.</p>
      ) : null}
      {tool === "scale" ? (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">{start ? "Click the other end of the dimension" : "Click one end of a dimension you know"}</p>
      ) : null}
      {tool === "origin" ? (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">Click the same corner on every level (for example the outside corner of the house)</p>
      ) : null}
      {tool === "opening" && !needsScale ? (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-xs text-white">
          {start ? "Click the other side of the opening on the same wall" : "Click one side of a door or window on a wall"}
        </p>
      ) : null}
      {areaTool && !needsScale ? (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-xs text-white">
          {start ? "Click the opposite corner of the joist zone" : "Click one corner of the joist zone"}
        </p>
      ) : null}
      {lineTool && !areaTool && !needsScale ? (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-xs text-white">
          {start ? "Click the other end · Shift for 15° steps · Esc to cancel" : `Click the start of the ${MEMBER_INFO[tool as MemberType].label.toLowerCase()}`}
        </p>
      ) : null}

      <div className="absolute right-3 bottom-3 flex gap-1">
        <button type="button" className="btn btn-quiet bg-surface px-2.5 py-1 text-xs" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button type="button" className="btn btn-quiet bg-surface px-2.5 py-1 text-xs" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
        <button type="button" className="btn btn-quiet bg-surface px-2.5 py-1 text-xs" onPointerDown={(e) => e.stopPropagation()} onClick={fit}>Fit</button>
      </div>
    </div>
  );
}
