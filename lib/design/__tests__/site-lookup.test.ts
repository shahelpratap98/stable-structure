import { describe, expect, it } from "vitest";
import { addressFilter, rankAddresses } from "../linz-query";
import { distanceToLines, nearestTown, normaliseSite, DEFAULT_SITE } from "../site";

describe("site lookup", () => {
  it("builds a LINZ address filter that can't break out of its strings", () => {
    expect(addressFilter("10 Eckford Lane, Auckland")).toBe("full_address ILIKE '%10%' AND full_address ILIKE '%Eckford%' AND full_address ILIKE '%Lane%' AND full_address ILIKE '%Auckland%'");
    const f = addressFilter("1 Main St') OR 1=1 --")!;
    expect(f).not.toMatch(/[()=;]/);
    expect(f.match(/'/g)!.length % 2).toBe(0);
    expect(addressFilter("Ōtaki 12")).toContain("Ōtaki");
    expect(addressFilter("a")).toBeNull();
  });
  it("puts whole-word matches first", () => {
    const found = ["10 Seccombes Road, Epsom, Auckland", "110 Newcombes Road, Amberley", "10 Combes Road, Remuera, Auckland", "10/36 Seccombes Road, Epsom, Auckland", "10A Combes Road, Remuera, Auckland"].map((address) => ({ address }));
    expect(rankAddresses("10 Combes Road", found)[0].address).toBe("10 Combes Road, Remuera, Auckland");
  });
  it("finds the nearest Z-table town", () => {
    expect(nearestTown(-36.85, 174.76).town).toBe("Auckland"); // Auckland CBD
    expect(nearestTown(-41.21, 174.9).town).toBe("Wellington"); // Lower Hutt
    expect(nearestTown(-43.6, 172.5).town).toBe("Christchurch");
    expect(nearestTown(-37.7, 176.15).km).toBeLessThan(3); // Tauranga
  });
  it("measures the distance to a coastline", () => {
    // a north-south coast 0.01° of longitude east of the point at 37°S: about 889 m
    const d = distanceToLines(-37, 175, [[[175.01, -37.1], [175.01, -36.9]]])!;
    expect(d).toBeGreaterThan(870);
    expect(d).toBeLessThan(900);
    expect(distanceToLines(-37, 175, [])).toBeNull();
  });
  it("keeps the lookup when a site is saved", () => {
    const s = normaliseSite({ ...DEFAULT_SITE, lookup: { address: "10 Eckford Lane", lat: -36.9, lon: 174.8, town: "Auckland", townKm: 6, coastM: null, on: "2026-10-22" } })!;
    expect(s.lookup?.address).toBe("10 Eckford Lane");
    expect(s.lookup?.coastM).toBeNull();
    expect(normaliseSite({ ...DEFAULT_SITE, lookup: { lat: "x" } })!.lookup).toBeUndefined();
  });
});
