import "server-only";

// LINZ Data Service (WFS) lookups for the site panel: official NZ Addresses
// (layer 123113) and the 1:50k topographic coastline (layer 50258). The key
// stays on the server (LINZ_KEY); nothing here is sent to the browser except
// the results. WFS 1.0.0 is used so coordinates are always longitude, latitude.

import { addressFilter } from "./linz-query";
import { distanceToLines } from "./site";

const LDS = "https://data.linz.govt.nz/services";
const ADDRESSES = "layer-123113"; // republished Sept 2025 (layer 105689 retired)
const COASTLINE = "layer-50258";

export type FoundAddress = { address: string; lat: number; lon: number };
export type LinzResult<T> = { ok: true; value: T } | { ok: false; message: string };

function key() {
  const k = process.env.LINZ_KEY?.trim();
  return k ? k : null;
}

async function wfs(params: Record<string, string>): Promise<LinzResult<{ features?: { geometry?: { type: string; coordinates: unknown }; properties?: Record<string, unknown> }[] }>> {
  const k = key();
  if (!k) return { ok: false, message: "The LINZ key isn't set on this deployment (LINZ_KEY)." };
  const qs = new URLSearchParams({ service: "WFS", version: "1.0.0", request: "GetFeature", srsName: "EPSG:4326", outputFormat: "json", ...params });
  try {
    const res = await fetch(`${LDS};key=${encodeURIComponent(k)}/wfs?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    // LINZ's own words from an exception report, never the URL (it holds the key)
    const why = () => {
      const m = text.match(/<(?:ows:)?(?:ServiceException|ExceptionText)[^>]*>([\s\S]*?)<\//);
      return (m ? m[1] : text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().replaceAll(k, "…").slice(0, 300);
    };
    if (!res.ok) return { ok: false, message: `LINZ answered ${res.status}: ${why()}` };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false, message: `LINZ: ${why()}` };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.name === "TimeoutError" ? "LINZ took too long to answer." : "Couldn't reach LINZ." };
  }
}

// [lon, lat] whichever order the service used (NZ: latitude negative, longitude 165-179)
function lonLat(c: unknown): [number, number] | null {
  if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== "number" || typeof c[1] !== "number") return null;
  return c[0] < 0 && c[1] > 0 ? [c[1], c[0]] : [c[0], c[1]];
}

export async function findAddresses(q: string): Promise<LinzResult<FoundAddress[]>> {
  const filter = addressFilter(q);
  if (!filter) return { ok: false, message: "Type more of the address." };
  // WFS 1.0.0 first; LINZ's own examples use 2.0.0, so fall back to it
  let r = await wfs({ typeName: ADDRESSES, maxFeatures: "8", cql_filter: filter });
  if (!r.ok) {
    const r2 = await wfs({ version: "2.0.0", typeNames: ADDRESSES, count: "8", cql_filter: filter });
    r = r2.ok ? r2 : { ok: false, message: `${r.message} (2.0.0: ${r2.message})` };
  }
  if (!r.ok) return r;
  const out: FoundAddress[] = [];
  for (const f of r.value.features ?? []) {
    const p = f.properties ?? {};
    const c = lonLat(f.geometry?.coordinates);
    const address = typeof p.full_address === "string" ? p.full_address : null;
    // the town after the address, unless the address already names it
    const town = address && typeof p.town_city === "string" && p.town_city && !address.includes(p.town_city) ? p.town_city : null;
    if (c && address) out.push({ address: town ? `${address}, ${town}` : address, lon: c[0], lat: c[1] });
  }
  return { ok: true, value: out };
}

// Metres to the nearest mapped coastline (harbours included), or null when none is within about 1 km.
export async function coastDistance(lat: number, lon: number): Promise<LinzResult<number | null>> {
  const dLat = 0.01,
    dLon = 0.01 / Math.cos((lat * Math.PI) / 180);
  const r = await wfs({ typeName: COASTLINE, bbox: [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(6)).join(",") });
  if (!r.ok) return r;
  const lines: [number, number][][] = [];
  for (const f of r.value.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    const parts = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? (g.coordinates as unknown[]) : [];
    for (const part of parts) if (Array.isArray(part)) lines.push(part.map(lonLat).filter((x): x is [number, number] => !!x));
  }
  const d = distanceToLines(lat, lon, lines);
  return { ok: true, value: d !== null && d <= 1000 ? d : null };
}
