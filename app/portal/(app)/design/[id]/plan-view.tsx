"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { STATUS_COLOUR, type Result } from "@/lib/design/calc";
import { MEMBER_INFO, type Level, type Member, type MemberType, type Pt } from "@/lib/design/model";
import type { RenderedPage } from "./pdf";

export type Tool = "select" | "pan" | "scale" | "origin" | MemberType;

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
  | { kind: "end"; id: string; end: "a" | "b"; to: Pt };

type Props = {
  level: Level;
  members: Member[]; // this level
  ghosts: Member[]; // level below, drawn faintly for alignment
  page: RenderedPage | null;
  pageLoading: boolean;
  tool: Tool;
  selectedId: string | null;
  results: Map<string, Result>;
  colourBy: "type" | "result";
  onSelect: (id: string | null) => void;
  onCreate: (type: MemberType, a: Pt, b?: Pt) => void;
  onMove: (id: string, a: Pt, b?: Pt) => void;
  onScale: (p1: Pt, p2: Pt) => void; // PDF points
  onOrigin: (p: Pt) => void; // PDF point
  onCursor: (p: Pt | null) => void; // metres
  focus: { id: string; n: number } | null; // centre the view on this member
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
  const { level, members, ghosts, page, tool, selectedId, results, colourBy } = props;
  const frame = useMemo(() => frameFor(level, page), [level, page]);
  const box = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [cursor, setCursor] = useState<Pt | null>(null); // PDF space, snapped
  // First click of a line or scale pick; dropped when the tool or level changes.
  const startKey = `${tool}|${level.id}`;
  const [startState, setStartState] = useState<{ key: string; p: Pt } | null>(null);
  const start = startState?.key === startKey ? startState.p : null;
  const setStart = (p: Pt | null) => setStartState(p ? { key: startKey, p } : null);
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
    const target = members.find((x) => x.id === props.focus!.id);
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

  const pdfFromEvent = (e: { clientX: number; clientY: number }): Pt => {
    const r = box.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.pan.x) / view.zoom, y: (e.clientY - r.top - view.pan.y) / view.zoom };
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
      const d = s.b ? distToSegment(p, s.a, s.b) : Math.hypot(s.a.x - p.x, s.a.y - p.y) * 0.7;
      if (d < tol && (!best || d < best.d)) best = { id: s.m.id, d };
    }
    return best ? { id: best.id } : null;
  };

  const lineTool = tool !== "select" && tool !== "pan" && tool !== "scale" && tool !== "origin" && MEMBER_INFO[tool].line;
  const pointTool = tool !== "select" && tool !== "pan" && tool !== "scale" && tool !== "origin" && !MEMBER_INFO[tool].line;
  const needsScale = frame.hasPlan && !frame.scale && (lineTool || pointTool);

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
    // select
    const hit = hitTest(raw);
    if (!hit) {
      props.onSelect(null);
      setDrag({ kind: "pan", startX: e.clientX, startY: e.clientY, pan: view.pan });
      return;
    }
    props.onSelect(hit.id);
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
    if (drag?.kind === "end") {
      const s = shapes.find((x) => x.m.id === drag.id);
      const other = s ? (drag.end === "a" ? s.b : s.a) ?? null : null;
      setDrag({ ...drag, to: snap(raw, other, drag.id) });
      return;
    }
    const p = tool === "select" || tool === "pan" ? raw : snap(raw, start);
    setCursor(p);
    props.onCursor(frame.scale ? toWorld(frame, p) : null);
  };

  const onPointerUp = () => {
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
  const colourOf = (m: Member) => (colourBy === "result" ? STATUS_COLOUR[results.get(m.id)?.status ?? "none"] : MEMBER_INFO[m.type].colour);

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
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
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
              b ? (
                <line key={m.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#475569" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              ) : (
                <rect key={m.id} x={a.x - px(4)} y={a.y - px(4)} width={px(8)} height={px(8)} fill="#475569" />
              ),
            )}
          </g>

          {shapes.map(({ m, a, b }) => {
            const colour = colourOf(m);
            const selected = m.id === selectedId;
            const res = results.get(m.id);
            if (b) {
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
              const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
              const dash = m.type === "joist" || m.type === "rafter" ? "10 5" : undefined;
              const width = m.type === "bracing" ? 7 : m.type === "beam" ? 4.5 : 3.5;
              return (
                <g key={m.id}>
                  {selected ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1da9e3" strokeOpacity={0.35} strokeWidth={width + 9} strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colour} strokeOpacity={m.type === "bracing" ? 0.55 : 1} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
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
                </text>
              </g>
            );
          })}

          {/* line or scale in progress */}
          {start && cursor ? (
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
      {lineTool && !needsScale ? (
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
