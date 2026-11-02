// Site loads for specific design: earthquake to NZS 1170.5:2004 (equivalent
// static method) and wind to AS/NZS 1170.2:2011, the editions B1/VM1 cites,
// turned into bracing demand per storey (20 BU = 1 kN, NZS 3604 cl 5.1).
//
// Earthquake values were checked against the MBIE-sponsored NZS 1170.5 text, and
// the Z table is the full Table 3.3 list. B1/VM1 2nd edition (28 July 2025) still
// cites AS/NZS 1170.2:2011 including Amendments 1-5; its one change (2.4.1) is that
// local wind design information published by a territorial authority governs
// where more onerous. The wind values here are cross-checked against published
// sources, not the standard itself (see WIND_NOTE). Every result is preliminary.

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

// NZS 1170.5:2004 (incl. Amendment 1) Table 3.3 hazard factor Z for every listed
// location, as MBIE publishes it ("Z-values to determine seismic risk",
// building.govt.nz, under Standards NZ licence LN001239; "Manakau City" and
// "Ta Awamutu" there corrected to Manukau City and Te Awamutu). Design uses Z of
// at least 0.13 (quakeBasis) and Christchurch and the Canterbury earthquake
// region at least 0.30 (B1/VM1). D = distance to a major fault (km) where it
// matters for the near-fault factor. lat / lon: town centre (OpenStreetMap), for
// finding the nearest location to a site. Wind region: A7 North Island, A6 South
// Island, W the Wellington metropolitan area; confirm on BRANZ Maps.
export const TOWNS: Record<string, { Z: number; D?: number; region: WindRegion; lat: number; lon: number }> = {
  Kaitaia: { Z: 0.1, region: "A7", lat: -35.114, lon: 173.264 },
  "Paihia/Russell": { Z: 0.1, region: "A7", lat: -35.281, lon: 174.092 },
  Kaikohe: { Z: 0.1, region: "A7", lat: -35.407, lon: 173.8 },
  Whangarei: { Z: 0.1, region: "A7", lat: -35.728, lon: 174.319 },
  Dargaville: { Z: 0.1, region: "A7", lat: -35.941, lon: 173.869 },
  Warkworth: { Z: 0.13, region: "A7", lat: -36.398, lon: 174.666 },
  Auckland: { Z: 0.13, region: "A7", lat: -36.852, lon: 174.763 },
  "Manukau City": { Z: 0.13, region: "A7", lat: -36.993, lon: 174.877 },
  Waiuku: { Z: 0.13, region: "A7", lat: -37.249, lon: 174.73 },
  Pukekohe: { Z: 0.13, region: "A7", lat: -37.201, lon: 174.904 },
  Thames: { Z: 0.16, region: "A7", lat: -37.138, lon: 175.542 },
  Paeroa: { Z: 0.18, region: "A7", lat: -37.38, lon: 175.67 },
  Waihi: { Z: 0.18, region: "A7", lat: -37.391, lon: 175.84 },
  Huntly: { Z: 0.15, region: "A7", lat: -37.558, lon: 175.159 },
  Ngaruawahia: { Z: 0.15, region: "A7", lat: -37.666, lon: 175.15 },
  Morrinsville: { Z: 0.18, region: "A7", lat: -37.658, lon: 175.528 },
  "Te Aroha": { Z: 0.18, region: "A7", lat: -37.543, lon: 175.712 },
  Tauranga: { Z: 0.2, region: "A7", lat: -37.683, lon: 176.168 },
  "Mount Maunganui": { Z: 0.2, region: "A7", lat: -37.638, lon: 176.184 },
  Hamilton: { Z: 0.16, region: "A7", lat: -37.788, lon: 175.282 },
  Cambridge: { Z: 0.18, region: "A7", lat: -37.892, lon: 175.469 },
  "Te Awamutu": { Z: 0.17, region: "A7", lat: -38.01, lon: 175.326 },
  Matamata: { Z: 0.19, region: "A7", lat: -37.81, lon: 175.773 },
  "Te Puke": { Z: 0.22, region: "A7", lat: -37.785, lon: 176.327 },
  Putaruru: { Z: 0.21, region: "A7", lat: -38.051, lon: 175.779 },
  Tokoroa: { Z: 0.21, region: "A7", lat: -38.217, lon: 175.871 },
  Otorohanga: { Z: 0.17, region: "A7", lat: -38.186, lon: 175.211 },
  "Te Kuiti": { Z: 0.18, region: "A7", lat: -38.334, lon: 175.166 },
  Mangakino: { Z: 0.21, region: "A7", lat: -38.371, lon: 175.77 },
  Rotorua: { Z: 0.24, region: "A7", lat: -38.136, lon: 176.253 },
  Kawerau: { Z: 0.29, region: "A7", lat: -38.086, lon: 176.703 },
  Whakatane: { Z: 0.3, region: "A7", lat: -37.952, lon: 176.995 },
  Opotiki: { Z: 0.3, region: "A7", lat: -38.004, lon: 177.287 },
  Ruatoria: { Z: 0.33, region: "A7", lat: -37.892, lon: 178.319 },
  Murupara: { Z: 0.3, region: "A7", lat: -38.456, lon: 176.706 },
  Taupo: { Z: 0.28, region: "A7", lat: -38.687, lon: 176.069 },
  Taumarunui: { Z: 0.21, region: "A7", lat: -38.883, lon: 175.262 },
  Turangi: { Z: 0.27, region: "A7", lat: -38.989, lon: 175.809 },
  Gisborne: { Z: 0.36, region: "A7", lat: -38.661, lon: 178.021 },
  Wairoa: { Z: 0.37, region: "A7", lat: -39.039, lon: 177.427 },
  Waitara: { Z: 0.18, region: "A7", lat: -39.003, lon: 174.236 },
  "New Plymouth": { Z: 0.18, region: "A7", lat: -39.058, lon: 174.081 },
  Inglewood: { Z: 0.18, region: "A7", lat: -39.156, lon: 174.208 },
  Stratford: { Z: 0.18, region: "A7", lat: -39.34, lon: 174.284 },
  Opunake: { Z: 0.18, region: "A7", lat: -39.455, lon: 173.86 },
  Hawera: { Z: 0.18, region: "A7", lat: -39.589, lon: 174.284 },
  Patea: { Z: 0.19, region: "A7", lat: -39.757, lon: 174.475 },
  Raetihi: { Z: 0.26, region: "A7", lat: -39.427, lon: 175.28 },
  Ohakune: { Z: 0.27, region: "A7", lat: -39.417, lon: 175.4 },
  Waiouru: { Z: 0.29, region: "A7", lat: -39.478, lon: 175.669 },
  Napier: { Z: 0.38, region: "A7", lat: -39.49, lon: 176.918 },
  Hastings: { Z: 0.39, region: "A7", lat: -39.642, lon: 176.843 },
  Wanganui: { Z: 0.25, region: "A7", lat: -39.932, lon: 175.052 },
  Waipawa: { Z: 0.41, region: "A7", lat: -39.942, lon: 176.589 },
  Waipukurau: { Z: 0.41, region: "A7", lat: -39.996, lon: 176.557 },
  Taihape: { Z: 0.33, region: "A7", lat: -39.677, lon: 175.798 },
  Marton: { Z: 0.3, region: "A7", lat: -40.072, lon: 175.379 },
  Bulls: { Z: 0.31, region: "A7", lat: -40.175, lon: 175.385 },
  Feilding: { Z: 0.37, region: "A7", lat: -40.226, lon: 175.564 },
  "Palmerston North": { Z: 0.38, D: 8, region: "A7", lat: -40.356, lon: 175.611 },
  Dannevirke: { Z: 0.42, region: "A7", lat: -40.207, lon: 176.098 },
  Woodville: { Z: 0.41, region: "A7", lat: -40.337, lon: 175.867 },
  Pahiatua: { Z: 0.42, region: "A7", lat: -40.453, lon: 175.841 },
  "Foxton/Foxton Beach": { Z: 0.36, region: "A7", lat: -40.473, lon: 175.282 },
  Levin: { Z: 0.4, region: "A7", lat: -40.622, lon: 175.287 },
  Otaki: { Z: 0.4, region: "A7", lat: -40.759, lon: 175.147 },
  Waikanae: { Z: 0.4, region: "A7", lat: -40.876, lon: 175.064 },
  Paraparaumu: { Z: 0.4, region: "A7", lat: -40.914, lon: 175.006 },
  Masterton: { Z: 0.42, region: "A7", lat: -40.95, lon: 175.659 },
  Porirua: { Z: 0.4, region: "W", lat: -41.135, lon: 174.84 },
  Wellington: { Z: 0.4, D: 2, region: "W", lat: -41.289, lon: 174.777 },
  "Hutt Valley–south of Taita Gorge": { Z: 0.4, region: "W", lat: -41.213, lon: 174.906 },
  "Upper Hutt": { Z: 0.42, region: "W", lat: -41.124, lon: 175.07 },
  "Eastbourne–Point Howard": { Z: 0.4, region: "W", lat: -41.291, lon: 174.898 },
  Wainuiomata: { Z: 0.4, region: "W", lat: -41.262, lon: 174.948 },
  Takaka: { Z: 0.23, region: "A6", lat: -40.857, lon: 172.806 },
  Motueka: { Z: 0.26, region: "A6", lat: -41.112, lon: 173.009 },
  Nelson: { Z: 0.27, region: "A6", lat: -41.271, lon: 173.284 },
  Picton: { Z: 0.3, region: "A6", lat: -41.291, lon: 174.007 },
  Blenheim: { Z: 0.33, region: "A6", lat: -41.512, lon: 173.955 },
  "St Arnaud": { Z: 0.36, region: "A6", lat: -41.801, lon: 172.848 },
  Westport: { Z: 0.3, region: "A6", lat: -41.754, lon: 171.604 },
  Reefton: { Z: 0.37, region: "A6", lat: -42.116, lon: 171.863 },
  Murchison: { Z: 0.34, region: "A6", lat: -41.8, lon: 172.329 },
  "Springs Junction": { Z: 0.45, region: "A6", lat: -42.335, lon: 172.182 },
  "Hanmer Springs": { Z: 0.55, region: "A6", lat: -42.522, lon: 172.83 },
  Seddon: { Z: 0.4, region: "A6", lat: -41.671, lon: 174.073 },
  Ward: { Z: 0.4, region: "A6", lat: -41.826, lon: 174.138 },
  Cheviot: { Z: 0.4, region: "A6", lat: -42.812, lon: 173.274 },
  Greymouth: { Z: 0.37, region: "A6", lat: -42.45, lon: 171.208 },
  Kaikoura: { Z: 0.42, region: "A6", lat: -42.401, lon: 173.681 },
  Harihari: { Z: 0.46, region: "A6", lat: -43.148, lon: 170.558 },
  Hokitika: { Z: 0.45, region: "A6", lat: -42.718, lon: 170.965 },
  "Fox Glacier": { Z: 0.44, region: "A6", lat: -43.464, lon: 170.018 },
  "Franz Josef": { Z: 0.44, region: "A6", lat: -43.387, lon: 170.182 },
  Otira: { Z: 0.6, region: "A6", lat: -42.831, lon: 171.561 },
  "Arthurs Pass": { Z: 0.6, region: "A6", lat: -42.941, lon: 171.563 },
  Rangiora: { Z: 0.33, region: "A6", lat: -43.303, lon: 172.596 },
  Darfield: { Z: 0.3, region: "A6", lat: -43.488, lon: 172.109 },
  Akaroa: { Z: 0.3, region: "A6", lat: -43.804, lon: 172.968 },
  Christchurch: { Z: 0.3, region: "A6", lat: -43.531, lon: 172.636 },
  Geraldine: { Z: 0.19, region: "A6", lat: -44.092, lon: 171.243 },
  Ashburton: { Z: 0.2, region: "A6", lat: -43.902, lon: 171.75 },
  Fairlie: { Z: 0.24, region: "A6", lat: -44.098, lon: 170.829 },
  Temuka: { Z: 0.17, region: "A6", lat: -44.244, lon: 171.28 },
  Timaru: { Z: 0.15, region: "A6", lat: -44.393, lon: 171.251 },
  "Mt Cook": { Z: 0.38, region: "A6", lat: -43.735, lon: 170.098 },
  Twizel: { Z: 0.27, region: "A6", lat: -44.257, lon: 170.099 },
  Waimate: { Z: 0.14, region: "A6", lat: -44.734, lon: 171.042 },
  Cromwell: { Z: 0.24, region: "A6", lat: -45.037, lon: 169.197 },
  Wanaka: { Z: 0.3, region: "A6", lat: -44.694, lon: 169.136 },
  Arrowtown: { Z: 0.3, region: "A6", lat: -44.941, lon: 168.835 },
  Alexandra: { Z: 0.21, region: "A6", lat: -45.255, lon: 169.392 },
  Queenstown: { Z: 0.32, region: "A6", lat: -45.032, lon: 168.661 },
  "Milford Sound": { Z: 0.54, region: "A6", lat: -44.672, lon: 167.925 },
  Palmerston: { Z: 0.13, region: "A6", lat: -45.484, lon: 170.715 },
  Oamaru: { Z: 0.13, region: "A6", lat: -45.1, lon: 170.97 },
  Dunedin: { Z: 0.13, region: "A6", lat: -45.874, lon: 170.504 },
  Mosgiel: { Z: 0.13, region: "A6", lat: -45.875, lon: 170.347 },
  Riverton: { Z: 0.2, region: "A6", lat: -46.351, lon: 168.02 },
  "Te Anau": { Z: 0.36, region: "A6", lat: -45.414, lon: 167.717 },
  Gore: { Z: 0.18, region: "A6", lat: -46.098, lon: 168.945 },
  Winton: { Z: 0.2, region: "A6", lat: -46.141, lon: 168.324 },
  Balclutha: { Z: 0.13, region: "A6", lat: -46.238, lon: 169.74 },
  Mataura: { Z: 0.17, region: "A6", lat: -46.193, lon: 168.864 },
  Bluff: { Z: 0.15, region: "A6", lat: -46.599, lon: 168.343 },
  Invercargill: { Z: 0.17, region: "A6", lat: -46.412, lon: 168.347 },
  Oban: { Z: 0.14, region: "A6", lat: -46.898, lon: 168.128 },
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

// AS/NZS 1170.2:2011 Table 3.1 regional speeds V100 / V500 / V1000 (m/s) for IL1-3, and
// Table 4.1(A) terrain/height multipliers at 3, 5 and 10 m. Region A (A6, A7) V500 and V1000
// and the TC2.5 and TC3 multipliers match published reproductions of the tables; V100, the
// Region W speeds and the TC1, TC2 and TC4 multipliers had no public source to check against.
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
  "Wind to AS/NZS 1170.2:2011 with Amendments 1-5, the edition B1/VM1 (2nd edition, 2025) cites; a council's published local wind data governs where more onerous (B1/VM1 2.4.1). Regional speeds and terrain/height multipliers cross-checked against published sources: Region A V500/V1000 and terrain categories 2.5 and 3 confirmed; V100, Region W and terrain categories 1, 2 and 4 to confirm in the standard. Md = 1.0, Cdyn = 1.0, net along-wind shape factor 1.2 (windward 0.7 + leeward 0.5).";

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
