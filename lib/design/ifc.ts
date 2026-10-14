// IFC4 export of the structural model, for Revit, ArchiCAD, AutoCAD and other
// BIM software. Each member becomes a swept solid of its real section:
//   beams, lintels, joists -> IfcBeam    rafters -> IfcMember (RAFTER)
//   posts -> IfcColumn    bracing walls -> IfcWall (SHEAR)
//   pad footings -> IfcFooting (PAD_FOOTING)    timber piles -> IfcPile
// Levels become IfcBuildingStorey. Units are metres. Plan y points down the
// drawing, so it is flipped to IFC's y (north up).

import { solidFor } from "./geometry";
import { describeMember, MEMBER_INFO, type DesignModel, type Member } from "./model";

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

// 128-bit id -> 22-character IFC GlobalId.
export function ifcGuid(uuid?: string) {
  let hex = (uuid ?? "").replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
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

export function exportIfc(model: DesignModel, job: { title: string; jobNo?: string; address?: string }, now = new Date()) {
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

  const levels = [...model.levels].sort((a, b) => a.elevation - b.elevation);
  const storeys = new Map<string, { ref: string; place: string; elements: string[] }>();
  for (const l of levels) {
    const place = add(`IFCLOCALPLACEMENT(${buildingPlace},${world})`);
    const ref = add(`IFCBUILDINGSTOREY('${ifcGuid(l.id)}',$,${str(l.name)},$,$,${place},$,$,.ELEMENT.,${num(l.elevation)})`);
    storeys.set(l.id, { ref, place, elements: [] });
  }
  if (storeys.size) add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,${building},(${[...storeys.values()].map((s) => s.ref).join(",")}))`);

  const byMaterial = new Map<string, string[]>();
  const rect = (xDim: number, yDim: number, ox = 0, oy = 0) =>
    add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${add(`IFCAXIS2PLACEMENT2D(${add(`IFCCARTESIANPOINT((${num(ox)},${num(oy)}))`)},$)`)},${num(xDim)},${num(yDim)})`);
  const circle = (r: number) => add(`IFCCIRCLEPROFILEDEF(.AREA.,$,${add(`IFCAXIS2PLACEMENT2D(${add("IFCCARTESIANPOINT((0.,0.))")},$)`)},${num(r)})`);
  const shape = (profile: string, depth: number) => {
    const solid = add(`IFCEXTRUDEDAREASOLID(${profile},${place3(origin)},${zUp},${num(depth)})`);
    return add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)}))`);
  };

  for (const m of model.members) {
    const storey = storeys.get(m.levelId);
    const solid = solidFor(model, m);
    if (!storey || !solid) continue;
    let placement: string;
    let rep: string;

    if (solid.shape === "bar" || solid.shape === "wall") {
      const ax = solid.a.x;
      const ay = -solid.a.y;
      const dx = solid.b.x - solid.a.x;
      const dy = -(solid.b.y - solid.a.y);
      const len = Math.hypot(dx, dy);
      if (len < 0.01) continue;
      // Local z runs along the member, local x points up.
      const z0 = solid.shape === "bar" ? solid.top : solid.bottom;
      placement = add(`IFCLOCALPLACEMENT(${storey.place},${place3(point3(ax, ay, z0), dir3(dx / len, dy / len, 0), zUp)})`);
      rep =
        solid.shape === "bar"
          ? shape(rect(solid.depth, solid.width, -solid.depth / 2, 0), len)
          : shape(rect(solid.top - solid.bottom, solid.thickness, (solid.top - solid.bottom) / 2, 0), len);
    } else {
      placement = add(`IFCLOCALPLACEMENT(${storey.place},${place3(point3(solid.x, -solid.y, solid.bottom), zUp, xDir)})`);
      const h = Math.max(0.01, solid.top - solid.bottom);
      rep = shape(solid.round ? circle(solid.width / 2) : rect(solid.width, solid.depth), h);
    }

    const head = `'${ifcGuid(m.id)}',$,${str(m.label)},${str(`${MEMBER_INFO[m.type].label}, ${describeMember(m)}`)},${str(m.section)},${placement},${rep},${str(m.label)}`;
    const element = add(entityFor(m, head));
    storey.elements.push(element);
    const mat = materialName(m);
    byMaterial.set(mat, [...(byMaterial.get(mat) ?? []), element]);
  }

  for (const s of storeys.values()) {
    if (s.elements.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',$,$,$,(${s.elements.join(",")}),${s.ref})`);
  }
  for (const [mat, elements] of byMaterial) {
    const ref = add(`IFCMATERIAL(${str(mat)},$,$)`);
    add(`IFCRELASSOCIATESMATERIAL('${ifcGuid()}',$,$,$,(${elements.join(",")}),${ref})`);
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
      return `IFCBEAM(${head},.JOIST.)`;
    case "rafter":
      return `IFCMEMBER(${head},.RAFTER.)`;
    case "post":
      return `IFCCOLUMN(${head},.COLUMN.)`;
    case "bracing":
      return `IFCWALL(${head},.SHEAR.)`;
    case "footing":
      return `IFCFOOTING(${head},.PAD_FOOTING.)`;
    case "pile":
      return `IFCPILE(${head},.NOTDEFINED.,$)`;
  }
}

function materialName(m: Member) {
  if (m.type === "footing") return "Concrete";
  if (m.type === "bracing") return "Timber framed bracing";
  if (m.material === "steel") return "Steel";
  return m.type === "pile" ? "H5 timber" : `${m.grade ?? "SG8"} timber`;
}
