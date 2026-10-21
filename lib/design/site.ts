// Site loads for specific design: earthquake to NZS 1170.5:2004 (equivalent
// static method) and wind to AS/NZS 1170.2:2011, the editions B1/VM1 cites,
// turned into bracing demand per storey (20 BU = 1 kN, NZS 3604 cl 5.1).
//
// Earthquake values were checked against the MBIE-sponsored NZS 1170.5 text;
// the wind multipliers come from secondary sources (see WIND_NOTE) and must be
// checked against the standard before issue. Every result is preliminary.

import type { DesignModel, Level, Member } from "./model";

export type SoilClass = "A" | "B" | "C" | "D" | "E";
export type WindRegion = "A6" | "A7" | "W";
export type Terrain = 1 | 2 | 2.5 | 3 | 4;
export type Exposure = "B" | "C" | "D" | "E" | "SED";

export type SiteData = {
  town: string; // key of TOWNS, or "custom"
  Z?: number; // custom hazard factor
  soil: SoilClass;
  importance: 1 | 2 | 3;
  mu: number; // structural ductility factor
  windRegion: WindRegion;
  terrain: Terrain;
  Ms: number; // shielding multiplier
  Mt: number; // topographic multiplier (hill shape)
  lee: boolean; // in a lee zone (Mlee 1.35)
  exposure: Exposure;
  bearing: number; // kPa, ultimate geotechnical bearing capacity
  phiBearing: number; // strength reduction for bearing (B1/VM4: 0.45-0.60)
  expansive: "none" | "moderate" | "high"; // AS 2870 class M / H and above, or a TC2/TC3 site
  lookup?: SiteLookup; // where the site was found from its address (LINZ)
};

// The address lookup: the LINZ address, its position, the nearest Z-table
// location, and the distance to the 1:50k coastline (null: more than 1 km).
export type SiteLookup = { address: string; lat: number; lon: number; town: string; townKm: number; coastM: number | null; on: string };

export const DEFAULT_SITE: SiteData = {
  town: "Auckland",
  soil: "C",
  importance: 2,
  mu: 3.5,
  windRegion: "A7",
  terrain: 3,
  Ms: 1,
  Mt: 1,
  lee: false,
  exposure: "C",
  bearing: 300,
  phiBearing: 0.5,
  expansive: "none",
};

// NZS 1170.5 Table 3.3 hazard factor Z (as cited by B1/VM1: Christchurch and
// the Canterbury earthquake region at least 0.30, cl 2.6.2.1). D = distance
// to a major fault (km) where it matters for the near-fault factor.
// lat / lon: town centre, for finding the nearest location to a site.
export const TOWNS: Record<string, { Z: number; D?: number; region: WindRegion; lat: number; lon: number }> = {
  Whangarei: { Z: 0.13, region: "A7", lat: -35.725, lon: 174.323 },
  Auckland: { Z: 0.13, region: "A7", lat: -36.848, lon: 174.763 },
  Hamilton: { Z: 0.16, region: "A7", lat: -37.787, lon: 175.279 },
  Tauranga: { Z: 0.2, region: "A7", lat: -37.687, lon: 176.165 },
  Rotorua: { Z: 0.24, region: "A7", lat: -38.137, lon: 176.251 },
  Napier: { Z: 0.38, region: "A7", lat: -39.493, lon: 176.912 },
  Hastings: { Z: 0.39, region: "A7", lat: -39.639, lon: 176.84 },
  "New Plymouth": { Z: 0.18, region: "A7", lat: -39.057, lon: 174.075 },
  "Palmerston North": { Z: 0.38, D: 8, region: "A7", lat: -40.356, lon: 175.611 },
  Wellington: { Z: 0.4, D: 2, region: "W", lat: -41.286, lon: 174.776 },
  Nelson: { Z: 0.27, region: "A6", lat: -41.271, lon: 173.284 },
  Christchurch: { Z: 0.3, region: "A6", lat: -43.532, lon: 172.636 },
  Queenstown: { Z: 0.32, region: "A6", lat: -45.031, lon: 168.663 },
  Dunedin: { Z: 0.13, region: "A6", lat: -45.879, lon: 170.503 },
  Invercargill: { Z: 0.17, region: "A6", lat: -46.413, lon: 168.353 },
};

// Great-circle distance, km.
export function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// The nearest location in the Z table. Between listed towns the engineer checks the standard's Z map.
export function nearestTown(lat: number, lon: number): { town: string; km: number } {
  let best = { town: "Auckland", km: Infinity };
  for (const [town, t] of Object.entries(TOWNS)) {
    const km = kmBetween(lat, lon, t.lat, t.lon);
    if (km < best.km) best = { town, km };
  }
  return best;
}

// Metres from a point to the nearest of some polylines ([lon, lat] vertices), flat-earth near the point.
export function distanceToLines(lat: number, lon: number, lines: [number, number][][]): number | null {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180),
    ky = 110540;
  let best: number | null = null;
  for (const line of lines)
    for (let i = 0; i < line.length; i++) {
      const ax = (line[i][0] - lon) * kx,
        ay = (line[i][1] - lat) * ky;
      const [bx, by] = i + 1 < line.length ? [(line[i + 1][0] - lon) * kx, (line[i + 1][1] - lat) * ky] : [ax, ay];
      const dx = bx - ax,
        dy = by - ay;
      const L2 = dx * dx + dy * dy;
      const t = L2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (best === null || d < best) best = d;
    }
  return best;
}

// Ch(T) for the equivalent static method: held at its T = 0.4 s value for short periods (Table 3.1)
function chESM(soil: SoilClass, T: number) {
  const t = Math.max(T, 0.4);
  if (soil === "A" || soil === "B") return t < 1.5 ? (t < 0.3 ? 2.35 : 1.6 * (0.5 / t) ** 0.75) : 1.05 / t;
  if (soil === "C") return t < 1.5 ? (t < 0.3 ? 2.93 : 2.0 * (0.5 / t) ** 0.75) : 1.32 / t;
  if (soil === "D") return t < 0.56 ? 3.0 : 2.4 * (0.75 / t) ** 0.75;
  return t < 1.0 ? 3.0 : 3.0 / t ** 0.75;
}
// Table 3.5 return period factors: IL1 1/100, IL2 1/500, IL3 1/1000 (50-year life)
const RU: Record<1 | 2 | 3, number> = { 1: 0.5, 2: 1.0, 3: 1.3 };

export type QuakeBasis = { Z: number; Ch: number; R: number; N: number; Sp: number; kmu: number; T1: number; Cd: number; minCd: number };
export function quakeBasis(site: SiteData, T1 = 0.4): QuakeBasis {
  const town = TOWNS[site.town];
  const Z = site.town === "custom" ? (site.Z ?? 0.13) : Math.max(0.13, town?.Z ?? 0.13);
  const R = RU[site.importance];
  const N = 1; // near-fault factor is 1.0 for periods under 1.5 s (houses)
  const mu = Math.max(1, site.mu);
  const Sp = mu < 2 ? (mu <= 1 ? 1 : 1.3 - 0.3 * mu) : 0.7;
  const Tk = Math.max(0.4, T1);
  const kmu = site.soil === "E" ? (mu < 1.5 || Tk >= 1 ? mu : (mu - 1.5) * Tk + 1.5) : Tk >= 0.7 ? mu : ((mu - 1) * Tk) / 0.7 + 1;
  const Ch = chESM(site.soil, T1);
  const C = Ch * Z * R * N;
  const minCd = Math.max((Z / 20 + 0.02) * R, 0.03 * R);
  const Cd = Math.max((C * Sp) / kmu, minCd);
  return { Z, Ch, R, N, Sp, kmu, T1, Cd, minCd };
}

// AS/NZS 1170.2:2011 regional speeds (m/s) and terrain/height multipliers (secondary sources)
const VR: Record<WindRegion, Record<1 | 2 | 3, number>> = {
  A6: { 1: 41, 2: 45, 3: 46 },
  A7: { 1: 41, 2: 45, 3: 46 },
  W: { 1: 47, 2: 51, 3: 53 },
};
const MZ: Record<Terrain, [number, number, number]> = { 1: [0.99, 1.05, 1.12], 2: [0.91, 0.91, 1.0], 2.5: [0.87, 0.87, 0.92], 3: [0.83, 0.83, 0.83], 4: [0.75, 0.75, 0.75] };
function mzcat(t: Terrain, z: number) {
  const [a, b, c] = MZ[t];
  if (z <= 3) return a;
  if (z <= 5) return a + ((b - a) * (z - 3)) / 2;
  if (z <= 10) return b + ((c - b) * (z - 5)) / 5;
  return c; // houses: taken as the 10 m value above 10 m
}
export const WIND_NOTE =
  "Wind to AS/NZS 1170.2:2011 (the edition B1/VM1 cites): regional speeds and terrain/height multipliers from secondary sources, Md = 1.0, Cdyn = 1.0, net along-wind shape factor 1.2 (windward 0.7 + leeward 0.5). Check against the standard.";

export type WindBasis = { VR: number; Mz: number; Ms: number; Mt: number; Mlee: number; Vdes: number; q: number; zone: string };
export function windBasis(site: SiteData, height: number): WindBasis {
  const vr = VR[site.windRegion][site.importance];
  const Mz = mzcat(site.terrain, height);
  const Mlee = site.lee ? 1.35 : 1;
  const Vdes = Math.max(30, vr * Mz * site.Ms * site.Mt * Mlee);
  const q = 0.6 * Vdes * Vdes; // Pa = 0.5 × 1.2 × V²
  // NZS 3604 Table 5.4 wind zone for the same site speed (for reference)
  const v = vr * Mz * site.Ms * site.Mt * Mlee;
  const zone = v <= 32 ? "Low" : v <= 37 ? "Medium" : v <= 44 ? "High" : v <= 50 ? "Very high" : v <= 55 ? "Extra high" : "SED";
  return { VR: vr, Mz, Ms: site.Ms, Mt: site.Mt, Mlee, Vdes, q, zone };
}

// ---------------------------------------------------------------- bracing demand per storey

export type StoreyDemand = {
  level: Level;
  weight: number; // kN, seismic weight carried at the top of this storey
  eqShear: number; // kN, storey shear
  eqBU: number;
  windAlong: number; // BU, wind blowing along x (resisted by lines running along x)
  windAcross: number;
  extentX: number;
  extentY: number;
  height: number; // m, wind height above this storey's mid-height
};

const bbox = (ms: Member[]) => {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const m of ms)
    for (const p of [m.a, m.b]) {
      if (!p) continue;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return x0 === Infinity ? null : { x0, y0, x1, y1, w: x1 - x0, d: y1 - y0 };
};
const zoneArea = (ms: Member[]) => ms.filter((z) => z.type === "joistzone" && z.b && !z.zone?.roof).reduce((a, z) => a + Math.abs((z.b!.x - z.a.x) * (z.b!.y - z.a.y)), 0);

export function demandFromSite(model: DesignModel, site: SiteData): StoreyDemand[] {
  const p = model.params;
  const levels = [...model.levels].sort((a, b) => a.elevation - b.elevation);
  const storeys = levels.filter((l) => l.kind !== "roof" && model.members.some((m) => m.levelId === l.id));
  if (!storeys.length) return [];
  const top = Math.max(...levels.map((l) => l.elevation + l.height));
  const base = levels[0].elevation;
  const on = (l: Level) => model.members.filter((m) => m.levelId === l.id);
  const above = (l: Level) => levels.filter((x) => x.elevation > l.elevation + 1e-6);
  // weight lumped at the top of each storey: framing area there (joist zones, else the storey's footprint)
  // × (G + 0.3Q) or roof G, plus half the walls of this storey and of the one above
  const wallW = (l: Level) =>
    on(l)
      .filter((m) => m.type === "wall" && m.b)
      .reduce((a, w) => a + Math.hypot(w.b!.x - w.a.x, w.b!.y - w.a.y) * l.height * (w.wall?.kind === "block" ? p.gWallBlock : w.wall?.kind === "int" ? p.gWallInt : p.gWallExt), 0);
  const Ws = storeys.map((l, i) => {
    const nextUp = storeys[i + 1];
    const isTop = !nextUp;
    const box = bbox(on(l));
    const area = zoneArea(on(l)) || (box ? box.w * box.d : 0);
    const surface = isTop ? area * p.Groof : area * (p.Gf + 0.3 * p.Qf);
    return { l, W: surface + wallW(l) / 2 + (nextUp ? wallW(nextUp) / 2 : 0), h: l.elevation + l.height - base };
  });
  const q = quakeBasis(site);
  const Wt = Ws.reduce((a, s) => a + s.W, 0);
  const V = q.Cd * Wt;
  const sumWh = Ws.reduce((a, s) => a + s.W * Math.max(0.1, s.h), 0) || 1;
  const F = Ws.map((s) => (V * s.W * Math.max(0.1, s.h)) / sumWh);
  return storeys.map((l, i) => {
    const shear = F.slice(i).reduce((a, f) => a + f, 0);
    const box = bbox([...on(l), ...above(l).flatMap(on)]) ?? { w: 0, d: 0 };
    const mid = l.elevation + l.height / 2;
    const h = Math.max(0, top - mid);
    const w = windBasis(site, top - base);
    // wind along x pushes on the faces facing x: their width is the building's depth in y
    const Fx = (w.q * 1.2 * box.d * h) / 1000;
    const Fy = (w.q * 1.2 * box.w * h) / 1000;
    return { level: l, weight: Ws[i].W, eqShear: shear, eqBU: Math.round(shear * 20), windAlong: Math.round(Fx * 20), windAcross: Math.round(Fy * 20), extentX: box.w, extentY: box.d, height: h };
  });
}

export function normaliseSite(raw: unknown): SiteData | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<SiteData>;
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const one = <T,>(v: unknown, opts: readonly T[], d: T) => (opts.includes(v as T) ? (v as T) : d);
  return {
    town: typeof r.town === "string" && (r.town in TOWNS || r.town === "custom") ? r.town : DEFAULT_SITE.town,
    Z: r.Z === undefined ? undefined : n(r.Z, 0.13),
    soil: one(r.soil, ["A", "B", "C", "D", "E"] as const, "C"),
    importance: one(r.importance, [1, 2, 3] as const, 2),
    mu: n(r.mu, 3.5),
    windRegion: one(r.windRegion, ["A6", "A7", "W"] as const, "A7"),
    terrain: one(r.terrain, [1, 2, 2.5, 3, 4] as const, 3),
    Ms: n(r.Ms, 1),
    Mt: n(r.Mt, 1),
    lee: !!r.lee,
    exposure: one(r.exposure, ["B", "C", "D", "E", "SED"] as const, "C"),
    bearing: n(r.bearing, 300),
    phiBearing: n(r.phiBearing, 0.5),
    expansive: one(r.expansive, ["none", "moderate", "high"] as const, "none"),
    lookup: normaliseLookup(r.lookup),
  };
}

function normaliseLookup(raw: unknown): SiteLookup | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<SiteLookup>;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!num(r.lat) || !num(r.lon) || typeof r.address !== "string") return undefined;
  return {
    address: r.address.slice(0, 300),
    lat: r.lat!,
    lon: r.lon!,
    town: typeof r.town === "string" ? r.town.slice(0, 60) : "",
    townKm: num(r.townKm) ? r.townKm! : 0,
    coastM: num(r.coastM) ? r.coastM! : null,
    on: typeof r.on === "string" ? r.on.slice(0, 40) : "",
  };
}
