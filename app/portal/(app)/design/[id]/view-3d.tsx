"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RATINGS } from "@/lib/design/bracing";
import { STATUS_COLOUR, type Calcs } from "@/lib/design/calc";
import { allParts, tagPoint, type Layer, type Part, type Tone } from "@/lib/design/geometry";
import { FAMILY_COLOUR } from "@/lib/design/materials";
import { MEMBER_INFO, type BraceSystem, type DesignModel } from "@/lib/design/model";

export type ColourBy = "type" | "result" | "material";

type Props = {
  model: DesignModel;
  calcs: Calcs;
  selectedId: string | null;
  colourBy: ColourBy;
  upToLevel: string | "all";
  onSelect: (id: string | null) => void;
};

const LAYERS: { key: Layer; label: string; on: boolean }[] = [
  { key: "walls", label: "Walls", on: true },
  { key: "glass", label: "Glazing", on: true },
  { key: "framing", label: "Wall framing", on: false },
  { key: "joists", label: "Joists", on: true },
  { key: "beams", label: "Beams & rafters", on: true },
  { key: "lintels", label: "Lintels", on: true },
  { key: "posts", label: "Posts", on: true },
  { key: "foundations", label: "Piles & footings", on: true },
  { key: "bracing", label: "Bracing", on: true },
  { key: "retaining", label: "Retaining walls", on: true },
];

const TONE: Record<Exclude<Tone, "member" | `brace:${string}`>, { c: string; o?: number }> = {
  framing: { c: "#d9b67c" },
  trimmer: { c: "#b9894a" },
  wallExt: { c: "#6f8296", o: 0.24 },
  wallInt: { c: "#9aa6b2", o: 0.16 },
  block: { c: "#9b948a", o: 0.9 },
  glass: { c: "#8fc3e8", o: 0.25 },
  joist: { c: "#e2c793" },
  joistDbl: { c: "#b9894a" },
  concrete: { c: "#a9aeb0", o: 0.5 },
  pole: { c: "#5e4b33" },
  rail: { c: "#8a6f4a" },
};

type Stage = {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  tags: THREE.Group;
  framed: boolean;
};

// Plan x -> X, plan y -> Z, height -> Y (three.js is y-up).
function partGeometry(p: Part): THREE.BufferGeometry | null {
  if (p.kind === "bar") {
    const dx = p.b.x - p.a.x;
    const dy = p.b.y - p.a.y;
    const len = Math.hypot(dx, dy);
    const h = p.z1 - p.z0;
    if (len < 0.003 || h < 0.002) return null;
    const g = new THREE.BoxGeometry(len, h, Math.max(0.004, p.w));
    const ux = dx / len,
      uy = dy / len;
    const off = p.off ?? 0;
    const cx = (p.a.x + p.b.x) / 2 - uy * off;
    const cy = (p.a.y + p.b.y) / 2 + ux * off;
    g.rotateY(-Math.atan2(dy, dx));
    g.translate(cx, (p.z0 + p.z1) / 2, cy);
    return g;
  }
  const h = p.z1 - p.z0;
  if (h < 0.002) return null;
  const g = p.round ? new THREE.CylinderGeometry(p.w / 2, p.w / 2, h, 14) : new THREE.BoxGeometry(p.w, h, p.d);
  g.translate(p.x, (p.z0 + p.z1) / 2, p.y);
  return g;
}

export function View3D({ model, calcs, selectedId, colourBy, upToLevel, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const select = useRef(onSelect);
  const [layers, setLayers] = useState<Record<Layer, boolean>>(() => Object.fromEntries(LAYERS.map((l) => [l.key, l.on])) as Record<Layer, boolean>);
  const [tagsOn, setTagsOn] = useState(true);
  const [explode, setExplode] = useState(0);
  const [panel, setPanel] = useState(false);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  // Renderer, camera, lights and controls: once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.setSize(el.clientWidth, el.clientHeight);
    labels.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e6e9ea");
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-8, 16, -10);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(10, 6, 12);
    scene.add(fill);
    const grid = new THREE.GridHelper(80, 80, 0xb7c2ce, 0xd6dde5);
    grid.position.y = -0.002;
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(38, el.clientWidth / Math.max(1, el.clientHeight), 0.05, 600);
    camera.position.set(14, 11, 16);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    const root = new THREE.Group();
    const tags = new THREE.Group();
    scene.add(root, tags);
    stage.current = { renderer, labels, scene, camera, controls, root, tags, framed: false };

    let frame = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    loop();

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h);
      labels.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    // Click (not drag) picks a member.
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const visible = (o: THREE.Object3D | null): boolean => !o || (o.visible && visible(o.parent));
      const hits = ray.intersectObjects(root.children, true).filter((h) => visible(h.object) && h.object.userData.id && h.object.userData.pick !== false);
      select.current((hits[0]?.object.userData.id as string | undefined) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss(); // browsers cap live WebGL contexts; switching views must not leak them
      el.removeChild(renderer.domElement);
      el.removeChild(labels.domElement);
      stage.current = null;
    };
  }, []);

  // Rebuild whenever the model, results, colours or filters change.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    for (const child of [...s.root.children]) {
      s.root.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    for (const t of [...s.tags.children]) {
      s.tags.remove(t);
      if (t instanceof CSS2DObject) t.element.remove();
    }

    const levels = [...model.levels].sort((a, b) => a.elevation - b.elevation);
    const cutoff = upToLevel === "all" ? Infinity : (model.levels.find((l) => l.id === upToLevel)?.elevation ?? Infinity);
    const lift = new Map(levels.map((l, i) => [l.id, i * explode]));
    const typeOf = (id: string) => (id.includes("#") ? "lintel" : model.members.find((m) => m.id === id)?.type);

    const colourFor = (id: string, tone: Tone): { c: string; o?: number } => {
      if (tone.startsWith("brace:")) return { c: RATINGS[tone.slice(6) as BraceSystem]?.colour ?? "#65a30d", o: 0.75 };
      if (tone !== "member") return TONE[tone as keyof typeof TONE];
      const r = calcs.results.get(id);
      if (colourBy === "result") return { c: STATUS_COLOUR[r?.status ?? "none"] };
      if (colourBy === "material") {
        if (r?.status === "fail") return { c: "#b8342a" };
        const fam = r?.sec?.fam;
        return { c: fam && fam in FAMILY_COLOUR ? FAMILY_COLOUR[fam as keyof typeof FAMILY_COLOUR] : "#8a5a2b" };
      }
      const t = typeOf(id);
      return { c: t ? MEMBER_INFO[t].colour : "#64748b" };
    };

    // merge each member's parts by tone, so a whole joist zone or wall frame is one mesh
    const buckets = new Map<string, { id: string; tone: Tone; layer: Layer; geos: THREE.BufferGeometry[] }>();
    for (const { part, level } of allParts(model, calcs)) {
      if (level.elevation > cutoff + 1e-6) continue;
      if (!layers[part.layer]) continue;
      const g = partGeometry(part);
      if (!g) continue;
      g.translate(0, lift.get(level.id) ?? 0, 0);
      const key = `${part.id}|${part.tone}`;
      const b = buckets.get(key) ?? { id: part.id, tone: part.tone, layer: part.layer, geos: [] };
      b.geos.push(g);
      buckets.set(key, b);
    }
    const box = new THREE.Box3();
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x1b2530, transparent: true, opacity: 0.25 });
    for (const b of buckets.values()) {
      const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      if (b.geos.length > 1) b.geos.forEach((g) => g.dispose());
      if (!geo) continue;
      const { c, o } = colourFor(b.id, b.tone);
      const selected = b.id === selectedId || (selectedId && b.id.startsWith(selectedId + "#"));
      const steel = b.tone === "member" && /PFC|UB|SHS/.test(calcs.results.get(b.id)?.sec?.fam ?? "");
      const material = new THREE.MeshStandardMaterial({
        color: c,
        roughness: steel ? 0.45 : 0.75,
        metalness: steel ? 0.35 : 0,
        transparent: o !== undefined,
        opacity: o ?? 1,
        depthWrite: o === undefined || o > 0.5,
        emissive: selected ? new THREE.Color("#2a6fd0") : new THREE.Color("#000000"),
        emissiveIntensity: selected ? 0.55 : 0,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.userData.id = b.id;
      // see-through wall panels and glass shouldn't steal clicks from members inside them
      mesh.userData.pick = !(o !== undefined && o < 0.5);
      if (o === undefined && b.layer !== "framing" && b.layer !== "joists") mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat));
      if (o !== undefined) mesh.renderOrder = 2;
      s.root.add(mesh);
      if (b.layer !== "glass") box.expandByObject(mesh);
    }

    if (tagsOn) {
      const tagIds = [
        ...model.members.filter((m) => ["beam", "lintel", "post", "joistzone", "retaining", "rafter", "joist"].includes(m.type)).map((m) => m.id),
        ...calcs.lintels.map((l) => l.id),
      ];
      for (const id of tagIds) {
        const t = typeOf(id);
        if (!t) continue;
        const layer: Layer = t === "lintel" ? "lintels" : t === "post" ? "posts" : t === "joistzone" || t === "joist" ? "joists" : t === "retaining" ? "retaining" : "beams";
        if (!layers[layer]) continue;
        const p = tagPoint(model, calcs, id);
        const r = calcs.results.get(id);
        const lvlId = id.includes("#") ? calcs.lintels.find((l) => l.id === id)?.wall.levelId : model.members.find((m) => m.id === id)?.levelId;
        const lvl = model.levels.find((l) => l.id === lvlId);
        if (!p || !r || !lvl || lvl.elevation > cutoff + 1e-6) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = r.mark;
        const sel = id === selectedId;
        el.style.cssText = `font:500 10.5px ui-monospace,Consolas,monospace;padding:1px 5px;cursor:pointer;pointer-events:auto;white-space:nowrap;border:1px solid ${
          r.status === "fail" ? "#b8342a" : "#1b2530"
        };color:${sel ? "#fff" : r.status === "fail" ? "#b8342a" : "#1b2530"};background:${sel ? "#2a6fd0" : "#fff"};border-radius:${t === "post" ? "999px" : "0"}`;
        el.addEventListener("pointerdown", (e) => e.stopPropagation());
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          select.current(id);
        });
        const o = new CSS2DObject(el);
        o.position.set(p.x, p.z + (lift.get(lvl.id) ?? 0), p.y);
        s.tags.add(o);
      }
    }

    if (!s.framed && !box.isEmpty()) {
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      s.controls.target.copy(centre);
      s.camera.position.set(centre.x - size * 0.8, centre.y + size * 0.75, centre.z + size * 0.95);
      s.framed = true;
    }
  }, [model, calcs, selectedId, colourBy, upToLevel, layers, tagsOn, explode]);

  const setView = (v: "iso" | "top" | "north" | "south" | "east" | "west") => {
    const s = stage.current;
    if (!s) return;
    const box = new THREE.Box3().setFromObject(s.root);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(6, box.getSize(new THREE.Vector3()).length());
    const pos: Record<typeof v, [number, number, number]> = {
      iso: [c.x - r * 0.8, c.y + r * 0.75, c.z + r * 0.95],
      top: [c.x, c.y + r * 1.6, c.z + 0.01],
      north: [c.x, c.y + r * 0.15, c.z - r * 1.4],
      south: [c.x, c.y + r * 0.15, c.z + r * 1.4],
      east: [c.x + r * 1.4, c.y + r * 0.15, c.z],
      west: [c.x - r * 1.4, c.y + r * 0.15, c.z],
    };
    s.camera.position.set(...pos[v]);
    s.controls.target.copy(c);
    s.controls.update();
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={host} className="absolute inset-0 overflow-hidden" />
      <div className="absolute top-2 right-2 flex flex-wrap justify-end gap-1">
        <div className="flex rounded-lg bg-surface/95 p-0.5 text-[11px] font-semibold shadow">
          {(
            [
              ["iso", "3D"],
              ["top", "Plan"],
              ["north", "N"],
              ["south", "S"],
              ["east", "E"],
              ["west", "W"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setView(k)} className="rounded-md px-2 py-1 text-ink hover:bg-surface-2">
              {l}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setPanel((p) => !p)} aria-expanded={panel} className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold shadow ${panel ? "bg-ink text-white" : "bg-surface/95 text-ink"}`}>
          Layers
        </button>
      </div>
      {panel ? (
        <div className="absolute top-11 right-2 w-52 rounded-lg bg-surface/95 p-3 text-xs shadow-lg">
          <div className="flex flex-col gap-1">
            {LAYERS.map((l) => (
              <label key={l.key} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={layers[l.key]} onChange={(e) => setLayers((s) => ({ ...s, [l.key]: e.target.checked }))} />
                {l.label}
              </label>
            ))}
            <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-line pt-1.5">
              <input type="checkbox" checked={tagsOn} onChange={(e) => setTagsOn(e.target.checked)} />
              Tags
            </label>
          </div>
          <label className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-muted">
            Lift levels
            <input type="range" min={0} max={4} step={0.1} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="min-w-0 flex-1" />
            <span className="w-9 text-right tabular-nums">{explode.toFixed(1)} m</span>
          </label>
        </div>
      ) : null}
      <p className="pointer-events-none absolute right-2 bottom-2 rounded bg-surface/90 px-2 py-0.5 text-[10.5px] text-muted">Drag to orbit · scroll to zoom · click a member</p>
    </div>
  );
}

// A still of the whole model for the report: coloured by member type, wall
// framing hidden, from the usual corner view. Returns a PNG data URL.
export function snapshot3d(model: DesignModel, calcs: Calcs, width = 1600, height = 1000): string | null {
  const parts = allParts(model, calcs).filter(({ part }) => part.layer !== "framing");
  if (!parts.length) return null;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ffffff");
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-8, 16, -10);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(10, 6, 12);
  scene.add(sun, fill);

  const typeOf = (id: string) => (id.includes("#") ? "lintel" : model.members.find((m) => m.id === id)?.type);
  const buckets = new Map<string, { c: string; o?: number; geos: THREE.BufferGeometry[] }>();
  for (const { part } of parts) {
    const g = partGeometry(part);
    if (!g) continue;
    let tone: { c: string; o?: number };
    if (part.tone.startsWith("brace:")) tone = { c: RATINGS[part.tone.slice(6) as BraceSystem]?.colour ?? "#65a30d", o: 0.75 };
    else if (part.tone !== "member") tone = TONE[part.tone as keyof typeof TONE];
    else {
      const t = typeOf(part.id);
      tone = { c: t ? MEMBER_INFO[t].colour : "#64748b" };
    }
    const key = `${tone.c}|${tone.o ?? 1}`;
    const b = buckets.get(key) ?? { ...tone, geos: [] };
    b.geos.push(g);
    buckets.set(key, b);
  }
  const box = new THREE.Box3();
  const disposables: { dispose: () => void }[] = [];
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x1b2530, transparent: true, opacity: 0.3 });
  disposables.push(edgeMat);
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (b.geos.length > 1) b.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const material = new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.75, transparent: b.o !== undefined, opacity: b.o ?? 1, depthWrite: b.o === undefined || b.o > 0.5 });
    const mesh = new THREE.Mesh(geo, material);
    if (b.o === undefined) {
      const edges = new THREE.EdgesGeometry(geo, 25);
      mesh.add(new THREE.LineSegments(edges, edgeMat));
      disposables.push(edges);
    } else mesh.renderOrder = 2;
    disposables.push(geo, material);
    scene.add(mesh);
    box.expandByObject(mesh);
  }
  const centre = box.getCenter(new THREE.Vector3());
  const size = Math.max(4, box.getSize(new THREE.Vector3()).length());
  const camera = new THREE.PerspectiveCamera(34, width / height, 0.05, 800);
  camera.position.set(centre.x - size * 0.8, centre.y + size * 0.7, centre.z + size * 0.95);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");
  disposables.forEach((d) => d.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}
