"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STATUS_COLOUR, type Result } from "@/lib/design/calc";
import { solidFor } from "@/lib/design/geometry";
import { MEMBER_INFO, type DesignModel } from "@/lib/design/model";

type Props = {
  model: DesignModel;
  results: Map<string, Result>;
  selectedId: string | null;
  colourBy: "type" | "result";
  upToLevel: string | "all"; // show levels up to and including this one
  onSelect: (id: string | null) => void;
};

type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  group: THREE.Group;
  framed: boolean;
};

// Plan x -> X, plan y -> Z, elevation -> Y (three.js is y-up).
export function View3D({ model, results, selectedId, colourBy, upToLevel, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const select = useRef(onSelect);
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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef2f6");
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96a3, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(12, 20, 8);
    scene.add(sun);
    const grid = new THREE.GridHelper(60, 60, 0xb7c2ce, 0xd6dde5);
    grid.position.y = -0.001;
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 500);
    camera.position.set(14, 11, 16);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(5, 1, 4);

    const group = new THREE.Group();
    scene.add(group);
    stage.current = { renderer, scene, camera, controls, group, framed: false };

    let frame = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
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

    // Click (not drag) picks a member.
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(group.children, false)[0];
      select.current((hit?.object.userData.id as string | undefined) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
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

  // Rebuild the members whenever the model, results or selection change.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    for (const child of [...s.group.children]) {
      s.group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }

    const cutoff = upToLevel === "all" ? Infinity : (model.levels.find((l) => l.id === upToLevel)?.elevation ?? Infinity);
    const box = new THREE.Box3();

    for (const m of model.members) {
      const level = model.levels.find((l) => l.id === m.levelId);
      if (!level || level.elevation > cutoff + 1e-6) continue;
      const solid = solidFor(model, m);
      if (!solid) continue;
      const status = results.get(m.id)?.status ?? "none";
      const base = colourBy === "result" ? STATUS_COLOUR[status] : MEMBER_INFO[m.type].colour;
      const selected = m.id === selectedId;
      const material = new THREE.MeshStandardMaterial({
        color: selected ? "#1da9e3" : base,
        roughness: 0.75,
        metalness: m.material === "steel" ? 0.35 : 0,
        transparent: solid.shape === "wall",
        opacity: solid.shape === "wall" ? 0.35 : 1,
        emissive: selected ? new THREE.Color("#1da9e3") : new THREE.Color("#000000"),
        emissiveIntensity: selected ? 0.35 : 0,
      });

      let mesh: THREE.Mesh;
      if (solid.shape === "bar" || solid.shape === "wall") {
        const dx = solid.b.x - solid.a.x;
        const dy = solid.b.y - solid.a.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.01) continue;
        const height = solid.shape === "bar" ? solid.depth : solid.top - solid.bottom;
        const thick = solid.shape === "bar" ? solid.width : solid.thickness;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(len, height, thick), material);
        const midY = solid.shape === "bar" ? solid.top - solid.depth / 2 : (solid.top + solid.bottom) / 2;
        mesh.position.set((solid.a.x + solid.b.x) / 2, midY, (solid.a.y + solid.b.y) / 2);
        mesh.rotation.y = -Math.atan2(dy, dx);
      } else {
        const h = Math.max(0.01, solid.top - solid.bottom);
        const geom = solid.round ? new THREE.CylinderGeometry(solid.width / 2, solid.width / 2, h, 20) : new THREE.BoxGeometry(solid.width, h, solid.depth);
        mesh = new THREE.Mesh(geom, material);
        mesh.position.set(solid.x, (solid.top + solid.bottom) / 2, solid.y);
      }
      mesh.userData.id = m.id;
      s.group.add(mesh);
      box.expandByObject(mesh);
    }

    // Frame the structure the first time there is something to see.
    if (!s.framed && !box.isEmpty()) {
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      s.controls.target.copy(centre);
      s.camera.position.set(centre.x + size * 0.9, centre.y + size * 0.7, centre.z + size * 1.0);
      s.framed = true;
    }
  }, [model, results, selectedId, colourBy, upToLevel]);

  return <div ref={host} className="h-full w-full" />;
}
