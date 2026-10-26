"use client";

// The 3D framing model, drawn the way Stable Structure's own framing models
// (Lot 6, 26121) are: matte timber and steel in their role colours with
// faint edges, tinted see-through wall shading, GIB bracing panels on the
// wall faces, coloured ID tags in the model, set-out grid lines with
// bubbles, a layer panel grouped by structure, walls and IDs, a toggle per
// level and a "lift roof" slider.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RATINGS } from "@/lib/design/bracing";
import { loadKind, STATUS_COLOUR, type Calcs } from "@/lib/design/calc";
import { allParts, tagPoint, type Layer, type Part, type Tone } from "@/lib/design/geometry";
import { FAMILY_COLOUR } from "@/lib/design/materials";
import { type BraceSystem, type DesignModel, type MemberType } from "@/lib/design/model";

export type ColourBy = "type" | "result" | "material";

// The framing models were drawn with three.js r147, which applied hex colours as
// they are and wrote the result without colour conversion. Match that, so the
// timber and steel come out the same shades.
THREE.ColorManagement.enabled = false;

type Props = {
  model: DesignModel;
  calcs: Calcs;
  selectedId: string | null;
  colourBy: ColourBy;
  upToLevel?: string | "all";
  onSelect: (id: string | null) => void;
};

type TagCat = "id_beam" | "id_lintel" | "id_post" | "id_wall" | "id_rw";
type Key = Layer | "grid" | "ground" | TagCat;

// role colours, as in the framing models
const FRAME = {
  joist: "#c79a5b",
  joistDbl: "#b8874a",
  stud: "#d9b67c",
  studInt: "#e8d3a8",
  timberBeam: "#c79a5b",
  lvl: "#b5763a",
  lintel: "#c66a2c",
  steelFloor: "#3f6f8f",
  steelRoof: "#2f5f86",
  postSteel: "#4a4f55",
  postTimber: "#9c7442",
  rafter: "#d8b47a",
  purlin: "#e6d3a8",
  pile: "#5b5246",
  concrete: "#a9aeb0",
  grid: "#7a8580",
};

const LAYERS: { key: Key; label: string; on: boolean; sw: string; group: string }[] = [
  { key: "joists", label: "Floor joists", on: true, sw: FRAME.joist, group: "Structure" },
  { key: "beams", label: "Beams", on: true, sw: FRAME.steelFloor, group: "Structure" },
  { key: "lintels", label: "Lintels", on: true, sw: FRAME.lintel, group: "Structure" },
  { key: "posts", label: "Posts", on: true, sw: FRAME.postSteel, group: "Structure" },
  { key: "framing", label: "Wall framing (studs, plates, nogs)", on: true, sw: FRAME.stud, group: "Structure" },
  { key: "roof", label: "Rafters & trusses", on: true, sw: FRAME.rafter, group: "Structure" },
  { key: "purlins", label: "Firrings & purlins", on: true, sw: FRAME.purlin, group: "Structure" },
  { key: "flooring", label: "Flooring", on: false, sw: "#cdb58a", group: "Structure" },
  { key: "foundations", label: "Footings, piles & slabs", on: true, sw: FRAME.concrete, group: "Structure" },
  { key: "deck", label: "Deck framing H3.2", on: true, sw: "#8c9a5b", group: "Structure" },
  { key: "deckboards", label: "Deck boards", on: true, sw: "#a58a63", group: "Structure" },
  { key: "stairs", label: "External stairs", on: true, sw: "#7d6a4f", group: "Structure" },
  { key: "walls", label: "Wall shading", on: true, sw: "#9fb6c4", group: "Walls & bracing" },
  { key: "glass", label: "Glazing", on: false, sw: "#8fc3e8", group: "Walls & bracing" },
  { key: "bracing", label: "Bracing elements (GIB)", on: true, sw: "#d1495b", group: "Walls & bracing" },
  { key: "roofing", label: "Roofing", on: false, sw: "#59626b", group: "Walls & bracing" },
  { key: "grid", label: "Grid lines", on: true, sw: FRAME.grid, group: "Walls & bracing" },
  { key: "ground", label: "Ground grid (1 m)", on: true, sw: "#b7c2ce", group: "Site" },
  { key: "retaining", label: "Retaining walls", on: true, sw: "#8a6f4a", group: "Site" },
  { key: "id_beam", label: "Beam IDs", on: true, sw: "#2f5f86", group: "IDs" },
  { key: "id_lintel", label: "Lintel IDs", on: true, sw: "#b25820", group: "IDs" },
  { key: "id_post", label: "Post IDs", on: true, sw: "#282c30", group: "IDs" },
  { key: "id_wall", label: "Wall IDs", on: false, sw: "#4c6050", group: "IDs" },
  { key: "id_rw", label: "Retaining wall IDs", on: true, sw: "#5e4b33", group: "IDs" },
];

const TAG_BG: Record<TagCat, string> = {
  id_beam: "rgba(47,95,134,.92)",
  id_lintel: "rgba(178,88,32,.92)",
  id_post: "rgba(40,44,48,.92)",
  id_wall: "rgba(76,96,80,.92)",
  id_rw: "rgba(94,75,51,.92)",
};
const tagCat = (t: MemberType | "lintel"): TagCat | null =>
  t === "lintel" ? "id_lintel" : t === "post" || t === "pile" || t === "footing" ? "id_post" : t === "wall" ? "id_wall" : t === "retaining" ? "id_rw" : t === "bracing" ? null : "id_beam";

const TONE: Record<Exclude<Tone, "member" | `brace:${string}`>, { c: string; o?: number }> = {
  framing: { c: FRAME.stud },
  studInt: { c: FRAME.studInt },
  trimmer: { c: FRAME.stud },
  wallExt: { c: "#9fb6c4", o: 0.3 },
  wallGround: { c: "#c9b48f", o: 0.3 },
  wallUpper: { c: "#9fb6c4", o: 0.3 },
  wallInt: { c: "#d8d0bd", o: 0.22 },
  block: { c: "#8f989c", o: 0.55 },
  glass: { c: "#8fc3e8", o: 0.25 },
  joist: { c: FRAME.joist },
  joistDbl: { c: FRAME.joistDbl },
  floorSheet: { c: "#cdb58a", o: 0.85 },
  deckJoist: { c: "#8c9a5b" },
  deckBoard: { c: "#a58a63" },
  pile: { c: FRAME.pile },
  stringer: { c: "#7d6a4f" },
  tread: { c: "#b59a70" },
  rafter: { c: FRAME.rafter },
  truss: { c: FRAME.rafter },
  purlin: { c: FRAME.purlin },
  roofing: { c: "#59626b", o: 0.55 },
  concrete: { c: FRAME.concrete, o: 0.6 },
  pole: { c: "#5e4b33" },
  rail: { c: "#8a6f4a" },
};
const ROOF_LAYERS = new Set<Layer>(["roof", "purlins", "roofing"]);
const WALL_LAYERS = new Set<Layer>(["walls", "framing", "glass", "bracing", "posts", "lintels", "foundations"]);

// The model's sets, as the framing models have them: "GF walls", "Mid floor", "FF walls", "Roof", "Retaining walls".
type ViewSet = { key: string; label: string };
const short = (name: string) => (/^ground/i.test(name) ? "GF" : /^first/i.test(name) ? "FF" : /^second/i.test(name) ? "SF" : /^found|^lower|^base/i.test(name) ? "Lower" : name);
function viewSets(model: DesignModel) {
  const levels = [...model.levels].sort((a, b) => a.elevation - b.elevation);
  const storeys = levels.filter((l) => l.kind !== "roof");
  const sets: ViewSet[] = [];
  const top = storeys[storeys.length - 1];
  const floors = storeys.slice(0, -1);
  for (const l of storeys) {
    if (model.members.some((m) => m.levelId === l.id && ["wall", "post", "bracing", "footing", "pile", "raft"].includes(m.type))) sets.push({ key: `w:${l.id}`, label: `${short(l.name)} walls` });
    if (l !== top && model.members.some((m) => m.levelId === l.id && !["wall", "post", "bracing", "footing", "pile", "raft", "retaining"].includes(m.type)))
      sets.push({ key: `f:${l.id}`, label: floors.length === 1 ? "Mid floor" : `${short(storeys[storeys.indexOf(l) + 1].name)} floor` });
  }
  sets.push({ key: "roof", label: "Roof" });
  if (model.members.some((m) => m.type === "retaining")) sets.push({ key: "rw", label: "Retaining walls" });
  return { sets, top };
}
// which set a part (or a member's tag) belongs to
function setOf(model: DesignModel, top: { id: string } | undefined, levelId: string, layer: Layer | "tag", type?: MemberType | "lintel") {
  const level = model.levels.find((l) => l.id === levelId);
  if (layer === "retaining" || type === "retaining") return "rw";
  if (level?.kind === "roof" || ROOF_LAYERS.has(layer as Layer)) return "roof";
  const wallish = layer === "tag" ? ["wall", "post", "bracing", "footing", "pile", "raft", "lintel"].includes(type ?? "") : WALL_LAYERS.has(layer);
  if (wallish) return `w:${levelId}`;
  return levelId === top?.id ? "roof" : `f:${levelId}`;
}

type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  framed: boolean;
};

// Plan x -> X, plan y -> Z, height -> Y (three.js is y-up).
function partGeometry(p: Part): THREE.BufferGeometry | null {
  if (p.kind === "beam3") {
    const dx = p.b.x - p.a.x,
      dy = p.b.y - p.a.y,
      dz = p.b.z - p.a.z;
    const run = Math.hypot(dx, dy);
    const len = Math.hypot(run, dz);
    if (len < 0.003) return null;
    const g = new THREE.BoxGeometry(len, Math.max(0.004, p.d), Math.max(0.004, p.w));
    g.rotateZ(Math.atan2(dz, run));
    g.rotateY(-Math.atan2(dy, dx));
    g.translate((p.a.x + p.b.x) / 2, (p.a.z + p.b.z) / 2, (p.a.y + p.b.y) / 2);
    return g;
  }
  if (p.kind === "wedge") {
    const dx = p.b.x - p.a.x,
      dy = p.b.y - p.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.003) return null;
    const g = new THREE.BoxGeometry(len, 1, Math.max(0.004, p.w));
    const pos = g.attributes.position;
    // flat underside, top rising from h0 at a to h1 at b
    for (let i = 0; i < pos.count; i++) {
      const f = pos.getX(i) / len + 0.5;
      pos.setY(i, pos.getY(i) > 0 ? p.h0 + (p.h1 - p.h0) * f : 0);
    }
    g.computeVertexNormals();
    g.rotateY(-Math.atan2(dy, dx));
    g.translate((p.a.x + p.b.x) / 2, p.z0, (p.a.y + p.b.y) / 2);
    return g;
  }
  if (p.kind === "poly") {
    if (p.pts.length < 3) return null;
    const pos: number[] = [];
    for (let i = 1; i < p.pts.length - 1; i++) for (const q of [p.pts[0], p.pts[i], p.pts[i + 1]]) pos.push(q.x, q.z, q.y);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
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

// matte, as the framing models are drawn; see-through panels both sides, pushed back behind the framing
function frameMaterial(c: string, o?: number, selected = false) {
  return new THREE.MeshLambertMaterial({
    color: selected ? "#ff7a1a" : c,
    emissive: selected ? "#662200" : "#000000",
    transparent: o !== undefined,
    opacity: o ?? 1,
    depthWrite: o === undefined || o > 0.5,
    side: o !== undefined ? THREE.DoubleSide : THREE.FrontSide,
    polygonOffset: o !== undefined,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

function addLights(scene: THREE.Scene) {
  // the framing models' lighting, scaled for physically based light units
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f8c, 0.85 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7 * Math.PI);
  sun.position.set(-20, 40, -30);
  const sun2 = new THREE.DirectionalLight(0xffffff, 0.3 * Math.PI);
  sun2.position.set(30, 20, 40);
  scene.add(sun, sun2);
}

// colour of a designed member in the framing palette: by role, then steel or timber
function memberColour(model: DesignModel, calcs: Calcs, id: string): string {
  const r = calcs.results.get(id);
  const fam = r?.sec?.fam ?? "";
  const steel = /PFC|UB|UC|SHS/.test(fam);
  if (id.includes("#")) return steel ? FRAME.steelRoof : FRAME.lintel;
  const m = model.members.find((x) => x.id === id);
  if (!m) return "#64748b";
  if (m.material === "concrete") return FRAME.concrete;
  const roof = loadKind(model, model.levels.find((l) => l.id === m.levelId)) === "roof";
  switch (m.type) {
    case "post":
      return steel || m.material === "steel" ? FRAME.postSteel : FRAME.postTimber;
    case "pile":
      return FRAME.pile;
    case "footing":
      return FRAME.concrete;
    case "lintel":
      return steel ? FRAME.steelRoof : FRAME.lintel;
    case "rafter":
      return steel ? FRAME.steelRoof : FRAME.rafter;
    case "joist":
      return FRAME.joist;
    default:
      return steel ? (roof ? FRAME.steelRoof : FRAME.steelFloor) : /LVL|HYONE|HY90|LVL11/.test(fam) ? FRAME.lvl : FRAME.timberBeam;
  }
}

const texCache = new Map<string, THREE.CanvasTexture>();
function tagTexture(text: string, bg: string) {
  const key = text + "|" + bg;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = '600 44px "IBM Plex Mono", Consolas, ui-monospace, monospace';
  c.width = Math.ceil(g.measureText(text).width + 28);
  c.height = 64;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#ffffff";
  g.font = '600 44px "IBM Plex Mono", Consolas, ui-monospace, monospace';
  g.textBaseline = "middle";
  g.fillText(text, 14, 34);
  const t = new THREE.CanvasTexture(c);
  t.userData = { ratio: c.width / c.height };
  texCache.set(key, t);
  return t;
}
function bubbleTexture(text: string) {
  const key = "bubble|" + text;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = "#1c2326";
  g.stroke();
  g.fillStyle = "#1c2326";
  g.font = `600 ${text.length > 1 ? 50 : 64}px "IBM Plex Sans", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c);
  texCache.set(key, t);
  return t;
}
function sprite(tex: THREE.Texture, h: number, ratio: number, x: number, y: number, z: number) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(h * ratio, h, 1);
  sp.position.set(x, z, y);
  sp.renderOrder = 10;
  return sp;
}

// the model's plan extents, for grid lines
function extents(model: DesignModel) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  const take = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  };
  for (const m of model.members) for (const p of [m.a, m.b]) if (p) take(p.x, p.y);
  return Number.isFinite(x0) ? { x0, x1, y0, y1 } : null;
}

// X / Y / Z arrows drawn in a corner of the view, turning with the camera:
// X along plan x, Y along plan y, Z up (three.js x, z and y).
function axesGizmo() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f8f9f6");
  const axis = (to: [number, number, number], colour: number, label: string) => {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), new THREE.MeshBasicMaterial({ color: colour }));
    shaft.position.set(to[0] / 2, to[1] / 2, to[2] / 2);
    shaft.lookAt(to[0], to[1], to[2]);
    shaft.rotateX(Math.PI / 2);
    scene.add(shaft);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 12), new THREE.MeshBasicMaterial({ color: colour }));
    cone.position.set(...to);
    cone.lookAt(to[0] * 2, to[1] * 2, to[2] * 2);
    cone.rotateX(Math.PI / 2);
    scene.add(cone);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(label), depthTest: false }));
    sp.scale.set(0.5, 0.5, 1);
    sp.position.set(to[0] * 1.38, to[1] * 1.38, to[2] * 1.38);
    scene.add(sp);
  };
  axis([1, 0, 0], 0xd1495b, "X");
  axis([0, 0, 1], 0x2a9d8f, "Y");
  axis([0, 1, 0], 0x2c5e7d, "Z");
  const camera = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 10);
  return { scene, camera };
}

// A 1 m ground grid under the model at floor level 0.
function groundObjects(model: DesignModel): THREE.Object3D[] {
  const ex = extents(model);
  const cx = ex ? Math.round((ex.x0 + ex.x1) / 2) : 0,
    cy = ex ? Math.round((ex.y0 + ex.y1) / 2) : 0;
  const size = ex ? Math.max(20, 2 * Math.ceil((Math.max(ex.x1 - ex.x0, ex.y1 - ex.y0) * 1.5) / 2)) : 40;
  const grid = new THREE.GridHelper(size, size, 0xb7c2ce, 0xd6dde5);
  grid.position.set(cx, -0.002, cy);
  return [grid];
}

function gridObjects(model: DesignModel): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const gx = model.grids?.x ?? [],
    gy = model.grids?.y ?? [];
  const ex = extents(model);
  if (!ex || (!gx.length && !gy.length)) return out;
  const x0 = Math.min(ex.x0, ...gx.map((g) => g.at)),
    x1 = Math.max(ex.x1, ...gx.map((g) => g.at)),
    y0 = Math.min(ex.y0, ...gy.map((g) => g.at)),
    y1 = Math.max(ex.y1, ...gy.map((g) => g.at));
  const z = Math.min(...model.levels.map((l) => l.elevation)) + 0.005;
  const mat = new THREE.LineDashedMaterial({ color: FRAME.grid, dashSize: 0.4, gapSize: 0.25 });
  const line = (a: [number, number], b: [number, number]) => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], z, a[1]), new THREE.Vector3(b[0], z, b[1])]);
    const l = new THREE.Line(g, mat);
    l.computeLineDistances();
    out.push(l);
  };
  for (const g of gx) {
    line([g.at, y0 - 4], [g.at, y1 + 3]);
    out.push(sprite(bubbleTexture(g.n), 1.1, 1, g.at, y0 - 4.9, z));
  }
  for (const g of gy) {
    line([x0 - 4, g.at], [x1 + 3, g.at]);
    out.push(sprite(bubbleTexture(g.n), 1.1, 1, x0 - 4.9, g.at, z));
  }
  return out;
}

export function View3D({ model, calcs, selectedId, colourBy, upToLevel, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const select = useRef(onSelect);
  const [layers, setLayers] = useState<Record<Key, boolean>>(() => Object.fromEntries(LAYERS.map((l) => [l.key, l.on])) as Record<Key, boolean>);
  const [explode, setExplode] = useState(0);
  const [liftRoof, setLiftRoof] = useState(0);
  const [panel, setPanel] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]); // sets switched off (storey walls, floor framing, roof, retaining)
  const [view, setViewName] = useState<"iso" | "top" | "north" | "south" | "east" | "west" | null>("iso"); // null once orbited
  const [built, setBuilt] = useState(0); // bumps after each rebuild, so the selection is reapplied
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  // Renderer, camera, lights and controls: once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e4e8e3");
    addLights(scene);

    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / Math.max(1, el.clientHeight), 0.05, 600);
    camera.position.set(14, 11, 16);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.addEventListener("start", () => setViewName(null)); // orbiting leaves the named view
    const root = new THREE.Group();
    scene.add(root);
    stage.current = { renderer, scene, camera, controls, root, framed: false };

    const gizmo = axesGizmo();
    const dir = new THREE.Vector3();
    let frame = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      // the axes gizmo, bottom right above the hint, looking the same way as the camera
      const size = 96,
        w = el.clientWidth;
      dir.copy(camera.position).sub(controls.target).normalize().multiplyScalar(4);
      gizmo.camera.position.copy(dir);
      gizmo.camera.up.copy(camera.up);
      gizmo.camera.lookAt(0, 0, 0);
      renderer.autoClear = false;
      renderer.setScissorTest(true);
      renderer.setScissor(w - size - 8, 34, size, size);
      renderer.setViewport(w - size - 8, 34, size, size);
      renderer.clearDepth();
      renderer.render(gizmo.scene, gizmo.camera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, el.clientHeight);
      renderer.autoClear = true;
      frame = requestAnimationFrame(loop);
    };
    loop();

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    // Click (not drag) picks a member or its tag; a see-through panel gives way to framing just behind it.
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const visible = (o: THREE.Object3D | null): boolean => !o || (o.visible && visible(o.parent));
      const hits = ray.intersectObjects(root.children, true).filter((h) => visible(h.object) && h.object.userData.id);
      let h = hits.find((x) => x.object instanceof THREE.Sprite) ?? hits[0];
      if (h && h.object.userData.see) {
        const solid = hits.find((x) => !x.object.userData.see);
        if (solid && solid.distance - h.distance < 0.45) h = solid;
      }
      select.current((h?.object.userData.id as string | undefined) ?? null);
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
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss(); // browsers cap live WebGL contexts; switching views must not leak them
      el.removeChild(renderer.domElement);
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
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
        if (o instanceof THREE.Sprite) o.material.dispose();
      });
    }

    const levels = [...model.levels].sort((a, b) => a.elevation - b.elevation);
    const cutoff = !upToLevel || upToLevel === "all" ? Infinity : (model.levels.find((l) => l.id === upToLevel)?.elevation ?? Infinity);
    const lift = new Map(levels.map((l, i) => [l.id, i * explode]));
    const typeOf = (id: string): MemberType | "lintel" | undefined => (id.includes("#") ? "lintel" : model.members.find((m) => m.id === id)?.type);
    const { top } = viewSets(model);
    const shown = (levelId: string | undefined, layer: Layer | "tag", type?: MemberType | "lintel") => {
      const l = model.levels.find((x) => x.id === levelId);
      return !!l && l.elevation <= cutoff + 1e-6 && !hidden.includes(setOf(model, top, l.id, layer, type));
    };

    const colourFor = (id: string, tone: Tone): { c: string; o?: number } => {
      if (tone.startsWith("brace:")) return { c: RATINGS[tone.slice(6) as BraceSystem]?.colour ?? "#65a30d", o: 0.72 };
      if (tone !== "member") return TONE[tone as keyof typeof TONE];
      const r = calcs.results.get(id);
      if (colourBy === "result") return { c: STATUS_COLOUR[r?.status ?? "none"] };
      if (colourBy === "material") {
        if (r?.status === "fail") return { c: "#b8342a" };
        const fam = r?.sec?.fam;
        return { c: fam && fam in FAMILY_COLOUR ? FAMILY_COLOUR[fam as keyof typeof FAMILY_COLOUR] : "#8a5a2b" };
      }
      return { c: memberColour(model, calcs, id) };
    };

    // merge each member's parts by tone, so a whole joist zone or wall frame is one mesh
    const buckets = new Map<string, { id: string; tone: Tone; layer: Layer; geos: THREE.BufferGeometry[] }>();
    for (const { part, level } of allParts(model, calcs)) {
      if (!shown(level.id, part.layer) || !layers[part.layer]) continue;
      const g = partGeometry(part);
      if (!g) continue;
      g.translate(0, (lift.get(level.id) ?? 0) + (ROOF_LAYERS.has(part.layer) ? liftRoof : 0), 0);
      const key = `${part.id}|${part.tone}|${part.layer}`;
      const b = buckets.get(key) ?? { id: part.id, tone: part.tone, layer: part.layer, geos: [] };
      b.geos.push(g);
      buckets.set(key, b);
    }
    const box = new THREE.Box3();
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 });
    for (const b of buckets.values()) {
      const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      if (b.geos.length > 1) b.geos.forEach((g) => g.dispose());
      if (!geo) continue;
      const { c, o } = colourFor(b.id, b.tone);
      const mesh = new THREE.Mesh(geo, frameMaterial(c, o));
      mesh.userData.id = b.id;
      mesh.userData.base = c;
      mesh.userData.selectable = b.layer !== "walls" && b.layer !== "glass";
      mesh.userData.see = o !== undefined && o < 0.8 && !b.tone.startsWith("brace:");
      if ((o === undefined || b.tone.startsWith("brace:")) && b.layer !== "roofing") mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), edgeMat));
      if (o !== undefined) mesh.renderOrder = 2;
      // the camera frames the building; site retaining walls can run well past it
      mesh.userData.frame = b.layer !== "glass" && b.layer !== "retaining";
      s.root.add(mesh);
      if (mesh.userData.frame) box.expandByObject(mesh);
    }

    // ID tags, coloured by kind as the framing models have them (failing members in red when colouring by result); the selected one in orange
    const tagIds = [...model.members.map((m) => m.id), ...calcs.lintels.map((l) => l.id)];
    for (const id of tagIds) {
      const t = typeOf(id);
      if (!t) continue;
      const cat = tagCat(t);
      if (!cat || !layers[cat]) continue;
      if (t === "lintel" && calcs.lintels.find((l) => l.id === id)?.wall.wall?.loadbearing === false) continue;
      const lvlId = id.includes("#") ? calcs.lintels.find((l) => l.id === id)?.wall.levelId : model.members.find((m) => m.id === id)?.levelId;
      if (!shown(lvlId, "tag", t)) continue;
      const p = tagPoint(model, calcs, id);
      const r = calcs.results.get(id);
      const mark = r?.mark ?? model.members.find((m) => m.id === id)?.label;
      if (!p || !mark) continue;
      const roofTag = t === "joistzone" && !!model.members.find((m) => m.id === id)?.zone?.roof;
      const bg = colourBy === "result" && r?.status === "fail" ? "rgba(178,58,42,.95)" : TAG_BG[cat];
      const tex = tagTexture(mark, bg);
      const sp = sprite(tex, cat === "id_wall" ? 0.3 : 0.34, tex.userData.ratio as number, p.x, p.y, p.z + (lift.get(lvlId ?? "") ?? 0) + (roofTag ? liftRoof : 0));
      sp.userData.id = id;
      sp.userData.mark = mark;
      sp.userData.bg = bg;
      s.root.add(sp);
    }

    if (layers.grid) for (const o of gridObjects(model)) s.root.add(o);
    if (layers.ground) for (const o of groundObjects(model)) s.root.add(o);

    if (box.isEmpty())
      s.root.children.forEach((o) => {
        if (o instanceof THREE.Mesh) box.expandByObject(o);
      });
    if (!s.framed && !box.isEmpty()) {
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      s.controls.target.copy(centre);
      s.camera.position.set(centre.x - size * 0.62, centre.y + size * 0.51, centre.z + size * 0.61);
      s.framed = true;
    }
    setBuilt((n) => n + 1);
  }, [model, calcs, colourBy, upToLevel, layers, explode, liftRoof, hidden]);

  // Selection only recolours: the selected member's framing and tag turn orange.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const hit = (id: string) => !!selectedId && (id === selectedId || id.startsWith(selectedId + "#"));
    for (const o of s.root.children) {
      const id = o.userData.id as string | undefined;
      if (!id) continue;
      if (o instanceof THREE.Mesh && o.userData.selectable) {
        const on = hit(id);
        const m = o.material as THREE.MeshLambertMaterial;
        m.color.set(on ? "#ff7a1a" : (o.userData.base as string));
        m.emissive.set(on ? "#662200" : "#000000");
      } else if (o instanceof THREE.Sprite && o.userData.mark) {
        const tex = tagTexture(o.userData.mark as string, id === selectedId ? "rgba(255,122,26,.95)" : (o.userData.bg as string));
        if (o.material.map !== tex) {
          o.material.setValues({ map: tex }); // swapping one texture for another needs no shader rebuild
          const h = o.scale.y;
          o.scale.set(h * (tex.userData.ratio as number), h, 1);
        }
      }
    }
  }, [selectedId, built]);

  const setView = (v: "iso" | "top" | "north" | "south" | "east" | "west") => {
    const s = stage.current;
    if (!s) return;
    setViewName(v);
    const box = new THREE.Box3();
    s.root.children.forEach((o) => {
      if (o instanceof THREE.Mesh && o.userData.frame) box.expandByObject(o);
    });
    if (box.isEmpty())
      s.root.children.forEach((o) => {
        if (o instanceof THREE.Mesh) box.expandByObject(o);
      });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(6, box.getSize(new THREE.Vector3()).length());
    const pos: Record<typeof v, [number, number, number]> = {
      iso: [c.x - r * 0.62, c.y + r * 0.51, c.z + r * 0.61],
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

  const groups = [...new Set(LAYERS.map((l) => l.group))];
  const btn = (on: boolean) =>
    `press rounded-sm border px-2 py-1 font-mono text-[11px] font-medium whitespace-nowrap shadow-sm ${on ? "border-[#2c5e7d] bg-[#2c5e7d] text-white" : "border-[#c9cfca] bg-[#f8f9f6] text-[#1c2326] hover:border-[#4b575c]"}`;
  // one segment of the joined view control
  const seg = (on: boolean) => `press px-2 py-1 font-mono text-[11px] font-medium whitespace-nowrap ${on ? "bg-[#2c5e7d] text-white" : "bg-[#f8f9f6] text-[#1c2326] hover:bg-[#eceee9]"}`;

  return (
    <div className="@container relative h-full w-full overflow-hidden">
      <div ref={host} className="absolute inset-0 overflow-hidden" />
      <div className="absolute top-2 right-2 left-2 flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-1.5">
          {/* the view: one joined control; north and west only when there's room */}
          <div role="group" aria-label="View" className="flex divide-x divide-[#c9cfca] overflow-hidden rounded-sm border border-[#c9cfca] shadow-sm">
            {(
              [
                ["iso", "Iso"],
                ["top", "Plan"],
                ["south", "South"],
                ["east", "East"],
                ["north", "North"],
                ["west", "West"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`${seg(view === k)} ${k === "north" || k === "west" ? "@max-xl:hidden" : ""}`}>
                {l}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
            {viewSets(model).sets.map((v) => {
              const on = !hidden.includes(v.key);
              return (
                <button key={v.key} type="button" aria-pressed={on} onClick={() => setHidden((h) => (on ? [...h, v.key] : h.filter((x) => x !== v.key)))} className={btn(on)}>
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" onClick={() => setPanel((p) => !p)} aria-expanded={panel} className={`${btn(panel)} shrink-0`}>
          Layers
        </button>
      </div>
      {selectedId && calcs.results.get(selectedId) ? (
        <div className="absolute bottom-9 left-2 w-64 rounded-sm border border-[#c9cfca] bg-[#f8f9f6]/95 p-3 text-[#1c2326] shadow-sm">
          <div className="font-mono text-[11px] font-semibold tracking-wider text-[#4b575c] uppercase">Selected</div>
          <div className="mt-1 text-2xl leading-none font-bold" style={{ fontFamily: '"Barlow Condensed","Arial Narrow",Arial,sans-serif' }}>
            {calcs.results.get(selectedId)!.mark}
          </div>
          <div className="mt-1 text-xs text-[#4b575c]">{calcs.results.get(selectedId)!.summary}</div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {calcs.results
              .get(selectedId)!
              .kv.slice(0, 6)
              .map((k, i) => (
                <div key={i} className="contents">
                  <dt className="text-[#4b575c]">{k.label}</dt>
                  <dd className="text-right tabular-nums">{k.value}</dd>
                </div>
              ))}
          </dl>
        </div>
      ) : null}
      {panel ? (
        <div className="pop-in absolute top-10 right-2 max-h-[calc(100%-3rem)] w-64 origin-top-right overflow-y-auto rounded-sm border border-[#c9cfca] bg-[#f8f9f6]/95 p-3 text-xs text-[#1c2326] shadow-lg">
          {groups.map((g) => (
            <div key={g} className="mb-1.5">
              <div className="mt-1 mb-1 font-mono text-[11px] font-semibold tracking-wider text-[#4b575c] uppercase">{g}</div>
              <div className="flex flex-col gap-1">
                {LAYERS.filter((l) => l.group === g).map((l) => (
                  <label key={l.key} className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={layers[l.key]} onChange={(e) => setLayers((s) => ({ ...s, [l.key]: e.target.checked }))} />
                    <span className="inline-block h-3.5 w-3.5 flex-none border border-[#4b575c]" style={{ background: l.sw }} />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <label className="mt-2 flex items-center gap-2 border-t border-[#c9cfca] pt-2 text-[#4b575c]">
            Lift roof
            <input type="range" min={0} max={4} step={0.1} value={liftRoof} onChange={(e) => setLiftRoof(Number(e.target.value))} className="min-w-0 flex-1" />
            <span className="w-9 text-right tabular-nums">{liftRoof.toFixed(1)} m</span>
          </label>
          <label className="mt-1 flex items-center gap-2 text-[#4b575c]">
            Lift levels
            <input type="range" min={0} max={4} step={0.1} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="min-w-0 flex-1" />
            <span className="w-9 text-right tabular-nums">{explode.toFixed(1)} m</span>
          </label>
        </div>
      ) : null}
      <p className="pointer-events-none absolute right-2 bottom-2 rounded-sm bg-[#f8f9f6]/90 px-2 py-0.5 font-mono text-[10.5px] whitespace-nowrap text-[#4b575c] @max-2xl:hidden">drag orbit · right-drag pan · scroll zoom · click member</p>
    </div>
  );
}

// A still of the whole model for the report, in the framing-model palette
// (wall framing and sheets left out). Returns a PNG data URL.
export function snapshot3d(model: DesignModel, calcs: Calcs, width = 1600, height = 1000): string | null {
  const parts = allParts(model, calcs).filter(({ part }) => !["framing", "flooring", "roofing"].includes(part.layer));
  if (!parts.length) return null;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ffffff");
  addLights(scene);

  const buckets = new Map<string, { c: string; o?: number; geos: THREE.BufferGeometry[] }>();
  for (const { part } of parts) {
    const g = partGeometry(part);
    if (!g) continue;
    let tone: { c: string; o?: number };
    if (part.tone.startsWith("brace:")) tone = { c: RATINGS[part.tone.slice(6) as BraceSystem]?.colour ?? "#65a30d", o: 0.72 };
    else if (part.tone !== "member") tone = TONE[part.tone as keyof typeof TONE];
    else tone = { c: memberColour(model, calcs, part.id) };
    const key = `${tone.c}|${tone.o ?? 1}`;
    const b = buckets.get(key) ?? { ...tone, geos: [] };
    b.geos.push(g);
    buckets.set(key, b);
  }
  const box = new THREE.Box3();
  const disposables: { dispose: () => void }[] = [];
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
  disposables.push(edgeMat);
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (b.geos.length > 1) b.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const material = frameMaterial(b.c, b.o);
    const mesh = new THREE.Mesh(geo, material);
    if (b.o === undefined) {
      const edges = new THREE.EdgesGeometry(geo, 20);
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
  camera.position.set(centre.x - size * 0.55, centre.y + size * 0.7, centre.z + size * 0.95);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");
  disposables.forEach((d) => d.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}
