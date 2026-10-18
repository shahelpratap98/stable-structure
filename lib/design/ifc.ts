// IFC4 export of the structural model, for Revit, ArchiCAD, AutoCAD and other
// BIM software, built from the same parts as the 3D view:
//   beams, lintels (incl. wall-opening lintels), joists -> IfcBeam
//   rafters -> IfcMember (RAFTER)   posts -> IfcColumn
//   walls -> IfcWall (SOLIDWALL / SHEAR for bracing elements)
//   joist zones -> one IfcBeam (JOIST) per joist
//   pad footings -> IfcFooting   piles -> IfcPile   retaining walls -> IfcWall
// Stud framing and glass are left out. Levels become IfcBuildingStorey.
// Units are metres. Plan y points down the drawing, so it is flipped to IFC y.

import type { Calcs } from "./calc";
import { allParts, type Part } from "./geometry";
import { describeMember, MEMBER_INFO, type DesignModel, type Member } from "./model";

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

// 128-bit id -> 22-character IFC GlobalId.
export function ifcGuid(uuid?: string) {
  let hex = (uuid ?? "").replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    // stable ids for derived elements: hash the text into 128 bits
    if (uuid) {
      let h1 = 0x811c9dc5,
        h2 = 0x01000193,
        h3 = 0x9e3779b9,
        h4 = 0x85ebca6b;
      for (const ch of uuid) {
        const c = ch.charCodeAt(0);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
        h3 = Math.imul(h3 ^ c, 3266489917) >>> 0;
        h4 = Math.imul(h4 ^ c, 668265263) >>> 0;
      }
      hex = [h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, "0")).join("");
    } else hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }
  let n = BigInt("0x" + hex);
  let out = "";
  for (let i = 0; i < 22; i++) {
    out = B64[Number(n & BigInt(63))] + out;
    n >>= BigInt(6);
  }
  return out;
}

// STEP string: quotes doubled, anything outside printable ASCII as \X2\....\X0\.
function str(s: string | null | undefined) {
  if (s == null) return "$";
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "'") out += "''";
    else if (ch === "\\") out += "\\\\";
    else if (code >= 32 && code < 127) out += ch;
    else if (code <= 0xffff) out += `\\X2\\${code.toString(16).toUpperCase().padStart(4, "0")}\\X0\\`;
  }
  return `'${out}'`;
}

function num(n: number) {
  const r = Math.round(n * 1e6) / 1e6;
  const s = (Object.is(r, -0) ? 0 : r).toString();
  return /[.eE]/.test(s) ? s : `${s}.`;
}

export function exportIfc(model: DesignModel, calcs: Calcs, job: { title: string; jobNo?: string; address?: string }, now = new Date()) {
  const lines: string[] = [];
  let next = 1;
  const add = (body: string) => {
    const id = next++;
    lines.push(`#${id}=${body};`);
    return `#${id}`;
  };

  const point3 = (x: number, y: number, z: number) => add(`IFCCARTESIANPOINT((${num(x)},${num(y)},${num(z)}))`);
  const dir3 = (x: number, y: number, z: number) => add(`IFCDIRECTION((${num(x)},${num(y)},${num(z)}))`);
  const place3 = (o: string, axis?: string, ref?: string) => add(`IFCAXIS2PLACEMENT3D(${o},${axis ?? "$"},${ref ?? "$"})`);

  const origin = point3(0, 0, 0);
  const zUp = dir3(0, 0, 1);
  const xDir = dir3(1, 0, 0);
  const world = place3(origin, zUp, xDir);
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`);
  const units = add(`IFCUNITASSIGNMENT((${add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")},${add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)")}))`);

  const name = [job.jobNo, job.title].filter(Boolean).join(" ");
  const project = add(`IFCPROJECT('${ifcGuid()}',$,${str(name || "Structure")},${str("Structural model")},$,$,$,(${context}),${units})`);
  const sitePlace = add(`IFCLOCALPLACEMENT($,${world})`);
  const site = add(`IFCSITE('${ifcGuid()}',$,'Site',${str(job.address || null)},$,${sitePlace},$,$,.ELEMENT.,$,$,$,$,$)`);
  const buildingPlace = add(`IFCLOCALPLACEMENT(${sitePlace},${world})`);
  const building = add(`IFCBUILDING('${ifcGuid()}',$,${str(job.title || "Building")},$,$,${buildingPlace},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,${site},(${building}))`);

  const storeys = new Map<string, { ref: string; place: string; elements: string[] }>();
  for (const l of [...model.levels].sort((a, b) => a.elevation - b.elevation)) {
    const place = add(`IFCLOCALPLACEMENT(${buildingPlace},${world})`);
    const ref = add(`IFCBUILDINGSTOREY('${ifcGuid(l.id)}',$,${str(l.name)},$,$,${place},$,$,.ELEMENT.,${num(l.elevation)})`);
    storeys.set(l.id, { ref, place, elements: [] });
  }
  if (storeys.size) add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,${building},(${[...storeys.values()].map((s) => s.ref).join(",")}))`);

  const rect = (xDim: number, yDim: number, ox = 0, oy = 0) =>
    add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${add(`IFCAXIS2PLACEMENT2D(${add(`IFCCARTESIANPOINT((${num(ox)},${num(oy)}))`)},$)`)},${num(xDim)},${num(yDim)})`);
  const circle = (r: number) => add(`IFCCIRCLEPROFILEDEF(.AREA.,$,${add(`IFCAXIS2PLACEMENT2D(${add("IFCCARTESIANPOINT((0.,0.))")},$)`)},${num(r)})`);

  // Each part as a swept solid in absolute (storey) coordinates.
  const solid = (p: Part): string | null => {
    if (p.kind === "bar") {
      const dx = p.b.x - p.a.x;
      const dy = -(p.b.y - p.a.y);
      const len = Math.hypot(dx, dy);
      if (len < 0.005 || p.z1 - p.z0 < 0.001) return null;
      // local z along the member, local x up, local y = left-hand normal
      const pos = place3(point3(p.a.x, -p.a.y, p.z0), dir3(dx / len, dy / len, 0), zUp);
      return add(`IFCEXTRUDEDAREASOLID(${rect(p.z1 - p.z0, p.w, (p.z1 - p.z0) / 2, p.off ?? 0)},${pos},${zUp},${num(len)})`);
    }
    const h = p.z1 - p.z0;
    if (h < 0.001) return null;
    const pos = place3(point3(p.x, -p.y, p.z0), zUp, xDir);
    return add(`IFCEXTRUDEDAREASOLID(${p.round ? circle(p.w / 2) : rect(p.w, p.d)},${pos},${zUp},${num(h)})`);
  };

  const byMaterial = new Map<string, string[]>();
  const placementFor = (storeyPlace: string) => add(`IFCLOCALPLACEMENT(${storeyPlace},${world})`);
  const element = (m: Member, levelId: string, parts: Part[], suffix = "", markOverride?: string) => {
    const storey = storeys.get(levelId);
    if (!storey) return;
    const items = parts.map(solid).filter((x): x is string => !!x);
    if (!items.length) return;
    const rep = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${items.join(",")}))`)}))`);
    const mark = markOverride ?? m.label;
    const r = calcs.results.get(m.id);
    const sec = r?.sec?.name ?? m.section;
    const head = `'${ifcGuid(m.id + suffix)}',$,${str(mark)},${str(`${MEMBER_INFO[m.type].label}, ${m.type === "wall" || m.type === "retaining" || m.type === "bracing" ? describeMember(m) : sec}`)},${str(m.type === "retaining" ? "Retaining wall" : sec)},${placementFor(storey.place)},${rep},${str(mark)}`;
    const ref = add(entityFor(m, head));
    storey.elements.push(ref);
    const mat = materialName(m, r?.sec?.fam);
    byMaterial.set(mat, [...(byMaterial.get(mat) ?? []), ref]);
  };

  const all = allParts(model, calcs).filter(({ part }) => part.layer !== "framing" && part.layer !== "glass");
  const grouped = new Map<string, Part[]>();
  for (const { part } of all) grouped.set(part.id, [...(grouped.get(part.id) ?? []), part]);

  for (const m of model.members) {
    const parts = grouped.get(m.id);
    if (!parts?.length) continue;
    if (m.type === "joistzone") parts.forEach((p, i) => element(m, m.levelId, [p], `#${i}`, `${m.label}-${i + 1}`));
    else element(m, m.levelId, parts);
  }
  for (const vl of calcs.lintels) {
    const parts = grouped.get(vl.id);
    if (parts?.length) element(vl.member, vl.wall.levelId, parts);
  }

  for (const s of storeys.values()) if (s.elements.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',$,$,$,(${s.elements.join(",")}),${s.ref})`);
  for (const [mat, els] of byMaterial) {
    const ref = add(`IFCMATERIAL(${str(mat)},$,$)`);
    add(`IFCRELASSOCIATESMATERIAL('${ifcGuid()}',$,$,$,(${els.join(",")}),${ref})`);
  }

  const stamp = now.toISOString().slice(0, 19);
  const file = `${(job.jobNo || job.title || "structure").replace(/[^\w.-]+/g, "-")}.ifc`;
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(file)},'${stamp}',('Stable Structure Limited'),('Stable Structure Limited'),'Stable Structure design app','Stable Structure design app','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    ...lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

function entityFor(m: Member, head: string) {
  switch (m.type) {
    case "beam":
      return `IFCBEAM(${head},.BEAM.)`;
    case "lintel":
      return `IFCBEAM(${head},.LINTEL.)`;
    case "joist":
    case "joistzone":
      return `IFCBEAM(${head},.JOIST.)`;
    case "rafter":
      return `IFCMEMBER(${head},.RAFTER.)`;
    case "post":
      return `IFCCOLUMN(${head},.COLUMN.)`;
    case "bracing":
      return `IFCWALL(${head},.SHEAR.)`;
    case "wall":
      return `IFCWALL(${head},.SOLIDWALL.)`;
    case "retaining":
      return `IFCWALL(${head},.USERDEFINED.)`;
    case "footing":
      return `IFCFOOTING(${head},.PAD_FOOTING.)`;
    case "pile":
      return `IFCPILE(${head},.NOTDEFINED.,$)`;
  }
}

function materialName(m: Member, fam?: string) {
  if (m.type === "footing") return "Concrete";
  if (m.type === "wall") return m.wall?.kind === "block" ? "Concrete masonry" : "Timber framed wall";
  if (m.type === "retaining") return m.rw?.kind === "block" ? "Concrete masonry" : "H5 timber poles";
  if (m.type === "bracing") return "GIB bracing element";
  if (m.type === "pile") return "H5 timber";
  if (fam === "PFC" || fam === "UB" || fam === "SHS" || m.material === "steel") return "Steel";
  if (fam === "LVL" || m.grade === "hySPAN" || m.grade === "hy90") return "hySPAN LVL";
  return "SG8 timber";
}
