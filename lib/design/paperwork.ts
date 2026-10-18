// Consent paperwork drawn from the model: the details a PS1 (producer
// statement, design) asks for, in the order of the Engineering New Zealand
// form, and a Design Features Report (the basis of design a council
// reviewer reads first). Both are drafts for the CPEng: the PS1 values are
// transferred to the current official form and signed there, never here.

import type { Calcs } from "./calc";
import type { DesignModel, Member } from "./model";
import { DEFAULT_SITE, quakeBasis, windBasis, WIND_NOTE, type SiteData } from "./site";

export type Monitoring = "CM1" | "CM2" | "CM3" | "CM4" | "CM5";
export type Drawing = { no: string; title: string; rev: string };
export type Paperwork = {
  firm: string; // design firm issuing the PS1 (blank: the company)
  owner: string; // owner / developer
  bca: string; // building consent authority
  description: string; // the building work
  legal: string; // legal description (Lot, DP)
  clauses: string; // Building Code clauses covered
  extent: string; // what the engagement covers
  part: "all" | "part";
  basis: string; // compliance documents or alternative solution
  drawings: Drawing[];
  monitoring: Monitoring;
  engineer: string; // design professional
  cpeng: string; // CPEng number
  qualifications: string;
  pi: boolean; // professional indemnity insurance of at least $200,000
  acenz: boolean; // ACE New Zealand member
  designLife: number; // years
};

export const DEFAULT_PAPERWORK: Paperwork = {
  firm: "",
  owner: "",
  bca: "",
  description: "",
  legal: "",
  clauses: "B1 Structure, B2 Durability",
  extent: "Structural design of the specifically designed members, foundations and bracing shown in these calculations",
  part: "part",
  basis: "B1/VM1, B1/VM4 and B2/AS1 (compliance documents issued by MBIE), with NZS 3604:2011 where cited",
  drawings: [],
  monitoring: "CM2",
  engineer: "",
  cpeng: "",
  qualifications: "",
  pi: false,
  acenz: false,
  designLife: 50,
};

export const MONITORING: Record<Monitoring, string> = {
  CM1: "CM1: construction review of key elements at the owner's request",
  CM2: "CM2: review of key elements at key stages",
  CM3: "CM3: review of most elements at key stages",
  CM4: "CM4: frequent review of all elements",
  CM5: "CM5: full-time review",
};

export function normalisePaperwork(raw: unknown): Paperwork | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<Paperwork>;
  const t = (v: unknown, d: string) => (typeof v === "string" ? v.slice(0, 1000) : d);
  return {
    firm: t(r.firm, ""),
    owner: t(r.owner, ""),
    bca: t(r.bca, ""),
    description: t(r.description, ""),
    legal: t(r.legal, ""),
    clauses: t(r.clauses, DEFAULT_PAPERWORK.clauses),
    extent: t(r.extent, DEFAULT_PAPERWORK.extent),
    part: r.part === "all" ? "all" : "part",
    basis: t(r.basis, DEFAULT_PAPERWORK.basis),
    drawings: Array.isArray(r.drawings) ? r.drawings.filter((d) => d && typeof d === "object").slice(0, 200).map((d) => ({ no: t(d.no, ""), title: t(d.title, ""), rev: t(d.rev, "") })) : [],
    monitoring: (["CM1", "CM2", "CM3", "CM4", "CM5"] as const).includes(r.monitoring as Monitoring) ? (r.monitoring as Monitoring) : "CM2",
    engineer: t(r.engineer, ""),
    cpeng: t(r.cpeng, ""),
    qualifications: t(r.qualifications, ""),
    pi: !!r.pi,
    acenz: !!r.acenz,
    designLife: typeof r.designLife === "number" && r.designLife > 0 ? r.designLife : 50,
  };
}

// drawings typed one per line as "number | title | revision"
export const drawingsFromText = (text: string): Drawing[] =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [no = "", title = "", rev = ""] = l.split("|").map((x) => x.trim());
      return { no, title, rev };
    });
export const drawingsToText = (d: Drawing[]) => d.map((x) => [x.no, x.title, x.rev].join(" | ")).join("\n");

export type Row = [string, string];
export type PaperSection = { title: string; rows: Row[]; notes?: string[] };

const BLANK = "(to complete)";
const or = (v: string, d = BLANK) => (v.trim() ? v.trim() : d);

// ---------------------------------------------------------------- PS1
export function ps1Rows(model: DesignModel, job: { title: string; jobNo: string; address: string }, company: string): PaperSection[] {
  const p = model.paperwork ?? DEFAULT_PAPERWORK;
  const site = model.site;
  const verify = [
    ...(site ? [`Ground bearing of at least ${site.bearing} kPa ultimate under all footings${site.expansive !== "none" ? `; expansive soil (${site.expansive}) as assumed` : ""}`] : ["Good ground to NZS 3604 cl 3.1.3 under all footings"]),
    ...model.notes,
  ];
  return [
    {
      title: "Parties and building work",
      rows: [
        ["Issued by (design firm)", or(p.firm, company)],
        ["To (owner / developer)", or(p.owner)],
        ["To be supplied to (building consent authority)", or(p.bca)],
        ["In respect of (building work)", or(p.description, job.title)],
        ["At (address)", or(job.address)],
        ["Legal description", or(p.legal)],
        ["Job number", or(job.jobNo, "–")],
      ],
    },
    {
      title: "Engagement and design basis",
      rows: [
        ["Services provided", or(p.extent)],
        ["Building Code clause(s)", or(p.clauses)],
        ["All or part of the building work", p.part === "all" ? "All" : "Part only, as described in the schedule (these calculations)"],
        ["Design prepared in accordance with", or(p.basis)],
      ],
    },
    {
      title: "Drawings and documents",
      rows: p.drawings.length ? p.drawings.map((d): Row => [d.no || "–", `${d.title || "–"}${d.rev ? `, revision ${d.rev}` : ""}`]) : [["Drawings", BLANK]],
      notes: ["Together with these structural calculations and the specification."],
    },
    {
      title: "Subject to",
      rows: [
        ["Site verification of these design assumptions", verify.join("; ")],
        ["Proprietary products", "All proprietary products meeting their performance specification requirements"],
      ],
    },
    {
      title: "Construction monitoring and the design professional",
      rows: [
        ["Recommended construction monitoring", MONITORING[p.monitoring]],
        ["Design professional", or(p.engineer)],
        ["CPEng number", or(p.cpeng)],
        ["Qualifications", or(p.qualifications)],
        ["Professional indemnity insurance of at least $200,000", p.pi ? "Held (confirm the current policy)" : BLANK],
        ["Member of ACE New Zealand", p.acenz ? "Yes" : "No / to confirm"],
        ["Signed", "On the official form, by the design professional"],
        ["Date", "On the official form"],
      ],
    },
  ];
}

// ---------------------------------------------------------------- Design Features Report
const AEP: Record<1 | 2 | 3, { wind: string; eq: string; sls: string }> = {
  1: { wind: "1/100", eq: "1/100", sls: "1/25" },
  2: { wind: "1/500", eq: "1/500", sls: "1/25" },
  3: { wind: "1/1000", eq: "1/1000", sls: "1/25" },
};

const FIXINGS: Record<SiteData["exposure"], { zone: string; fixings: string; steel: string }> = {
  B: { zone: "Zone B (low)", fixings: "Hot-dip galvanised steel fixings and connectors in exposed and sheltered positions", steel: "atmospheric corrosivity about C2" },
  C: { zone: "Zone C (medium)", fixings: "Hot-dip galvanised steel fixings in exposed positions; Type 304 stainless steel in sheltered positions not washed by rain", steel: "atmospheric corrosivity about C3" },
  D: { zone: "Zone D (high)", fixings: "Type 304 stainless steel fixings and connectors in exposed and sheltered positions", steel: "atmospheric corrosivity about C4" },
  E: { zone: "Zone E (sea spray)", fixings: "Specific design: Type 316 stainless steel fixings", steel: "atmospheric corrosivity C5 or worse" },
  SED: { zone: "Specific design (geothermal or other)", fixings: "Specific design of all fixings", steel: "specific assessment" },
};

const count = (ms: Member[], f: (m: Member) => boolean) => ms.filter(f).length;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function designFeatures(model: DesignModel, calcs: Calcs): PaperSection[] {
  const site = model.site ?? DEFAULT_SITE;
  const entered = !!model.site;
  const p = model.params;
  const pw = model.paperwork ?? DEFAULT_PAPERWORK;
  const ms = model.members;
  const res = [...calcs.results.values()];
  const fams = new Set(res.map((r) => r.sec?.fam).filter(Boolean) as string[]);
  const timber = [...fams].some((f) => !["PFC", "UB", "UC", "SHS", "other"].includes(f));
  const steel = fams.has("PFC") || fams.has("UB") || fams.has("UC") || fams.has("SHS");
  const concrete = ms.some((m) => m.material === "concrete") || ms.some((m) => m.type === "footing" || m.type === "pile") || res.some((r) => /pad|strip/i.test(r.summary));
  const portals = res.some((r) => r.summary.startsWith("Portal"));
  const top = Math.max(...model.levels.map((l) => l.elevation + l.height)) - Math.min(...model.levels.map((l) => l.elevation));
  const q = quakeBasis(site);
  const w = windBasis(site, top);
  const aep = AEP[site.importance];
  const fx = FIXINGS[site.exposure];

  const n = (f: (m: Member) => boolean) => count(ms, f);
  const scope = [
    plural(n((m) => m.type === "beam" || m.type === "lintel") + calcs.lintels.length, "beam or lintel", "beams and lintels"),
    plural(n((m) => m.type === "joistzone" || m.type === "joist"), "joist area", "joist areas"),
    plural(n((m) => m.type === "rafter"), "rafter", "rafters"),
    plural(n((m) => m.type === "post"), "post", "posts"),
    plural(n((m) => m.type === "footing"), "pad footing", "pad footings"),
    plural(n((m) => m.type === "pile"), "pile", "piles"),
    plural(n((m) => m.type === "bracing"), "bracing element", "bracing elements"),
    plural(n((m) => m.type === "retaining"), "retaining wall", "retaining walls"),
  ].filter((t) => !t.startsWith("0 "));
  const strips = res.some((r) => r.summary.includes(" strip "));
  const slabPosts = res.some((r) => r.kv.some((k) => k.label.startsWith("Slab punching")));
  const foundations = [
    ...(n((m) => m.type === "footing") ? ["pad footings sized for bearing, punching and one-way shear (NZS 3101)"] : []),
    ...(n((m) => m.type === "pile") ? ["ordinary timber piles on concrete footings (gravity only; bracing and anchor piles to NZS 3604 Section 6)"] : []),
    ...(strips ? ["strip footings under loadbearing walls on the lowest level"] : []),
    ...(slabPosts ? ["posts on the ground slab checked for punching"] : []),
  ];

  const standards: Row[] = [
    ["Loads and combinations", "AS/NZS 1170.0:2002, AS/NZS 1170.1:2002 (as cited by B1/VM1)"],
    ["Wind", "AS/NZS 1170.2:2011"],
    ["Earthquake", "NZS 1170.5:2004, equivalent static method"],
    ...(timber ? ([["Timber", "NZS 3603:1993; LVL to the manufacturers' published properties; treatment to NZS 3602:2003"]] as Row[]) : []),
    ...(steel ? ([["Steel", "NZS 3404.1:2009 (AS 4100 methods), Grade 300 / 350 sections"]] as Row[]) : []),
    ...(concrete ? ([["Concrete", "NZS 3101.1:2006, f'c 25 MPa foundations, 500E reinforcement"]] as Row[]) : []),
    ["Foundations", "B1/VM4"],
    ["Light timber framing", "NZS 3604:2011 where members are within its scope; bracing to Section 5 with GIB EzyBrace® Systems (2016) ratings"],
  ];

  return [
    {
      title: "Scope",
      rows: [
        ["Structure", scope.join(", ") || "No members yet"],
        ["Extent of this design", pw.extent],
        ["Not included", "Barriers and balustrades (by the supplier to NZS 1170.1 Table 3.3), proprietary trusses and cladding systems unless shown, temporary works"],
      ],
    },
    { title: "Standards", rows: standards },
    {
      title: "Importance level and design life",
      rows: [
        ["Importance level", `IL${site.importance} (AS/NZS 1170.0 Table 3.2)${entered ? "" : " (assumed: site data not entered)"}`],
        ["Design working life", `${pw.designLife} years`],
        ["Annual probability of exceedance (ULS)", `wind ${aep.wind}, earthquake ${aep.eq}`],
        ["Serviceability (SLS1)", `${aep.sls}`],
      ],
    },
    {
      title: "Gravity loads",
      rows: [
        ["Floor dead / live", `${p.Gf} / ${p.Qf} kPa${p.Gwet ? ` (tiled wet areas +${p.Gwet} kPa)` : ""}`],
        ["Roof dead / live", `${p.Groof} / ${p.Qroof} kPa on plan`],
        ["Walls", `external ${p.gWallExt}, internal ${p.gWallInt}, block ${p.gWallBlock} kPa of wall, ${p.wallHeight} m high`],
        ...(p.Ppt ? ([["Floor stiffness point load", `${p.Ppt} kN at midspan of every beam and lintel, deflection under it alone ≤ ${p.dPlim} mm`]] as Row[]) : []),
        ["Snow", p.Su ? `Su ${p.Su} kPa` : "Not significant at this site (confirm to AS/NZS 1170.3)"],
      ],
    },
    {
      title: "Wind",
      rows: [
        ["Region / terrain category", `${site.windRegion} / TC${site.terrain}`],
        ["Multipliers", `Mz,cat ${w.Mz.toFixed(2)} at ${top.toFixed(1)} m, Ms ${w.Ms}, Mt ${w.Mt}, Mlee ${w.Mlee}`],
        ["Design wind speed and pressure", `${w.Vdes.toFixed(1)} m/s, q ${(w.q / 1000).toFixed(2)} kPa`],
        ["NZS 3604 wind zone", w.zone],
      ],
      notes: [WIND_NOTE],
    },
    {
      title: "Earthquake",
      rows: [
        ["Site subsoil class", site.soil],
        ["Hazard factor Z", `${q.Z.toFixed(2)} (${site.town === "custom" ? "entered" : site.town})`],
        ["Return period factor R", q.R.toFixed(1)],
        ["Structural ductility μ / Sp", `${site.mu} / ${q.Sp.toFixed(2)}`],
        ["Period T1 / kμ", `${q.T1.toFixed(2)} s (equivalent static, taken as at least 0.4 s) / ${q.kmu.toFixed(2)}`],
        ["Spectral shape Ch(T1)", q.Ch.toFixed(2)],
        ["Horizontal design action coefficient Cd", `${q.Cd.toFixed(3)}${q.Cd <= q.minCd + 1e-9 ? " (the minimum governs)" : ""}`],
      ],
    },
    {
      title: "Serviceability and ductility",
      rows: [
        ["Beams, long term", `k2(G + 0.4Q) ≤ span/300 and ${p.dAbs} mm (cantilevers 2 × length / 300)`],
        ["Beams, short term", "0.7Q ≤ span/360"],
        ...(p.Ppt ? ([["Point load stiffness", `${p.Ppt} kN alone ≤ ${p.dPlim} mm`]] as Row[]) : []),
        ["Floor vibration", "Natural frequency at least 8 Hz under G + 0.3Q (BRANZ SR57)"],
        ...(portals ? ([["Portal frames", "Drift h/40 at ULS (assumed limit) and h/300 at SLS"]] as Row[]) : []),
        ["Ductility", `Bracing and portal frames designed for μ ${site.mu}; gravity members are not part of a ductile system`],
      ],
    },
    {
      title: "Ground and foundations",
      rows: [
        ["Bearing", `${site.bearing} kPa ultimate, φb ${site.phiBearing} (B1/VM4), so φq ${(site.bearing * site.phiBearing).toFixed(0)} kPa${site.bearing === 300 ? ": good ground, to NZS 3604 cl 3.1.3" : ""}`],
        ["Expansive soil", site.expansive === "none" ? "Not expansive (class S or better): to confirm on site" : `Expansive (${site.expansive}): footings and slab to be designed for ground movement (AS 2870 / B1/AS1 Amdt 19 expansive soils)`],
        ["Foundation type", foundations.length ? foundations.join("; ") : "No foundations in this design"],
      ],
      notes: ["Ground bearing must be verified on site before pouring (scala penetrometer to NZS 4402 Test 6.5.2, or a geotechnical engineer). If the site is on TC2 or TC3 land, a site-specific geotechnical report and foundation design are needed."],
    },
    {
      title: "Durability (Building Code B2)",
      rows: [
        ["Exposure zone (NZS 3604 Section 4)", fx.zone],
        ["Fixings and connectors", fx.fixings],
        ...(steel ? ([["Structural steel", `Coating system to AS/NZS 2312.1 for ${fx.steel}, giving the life required by B2 or with access for maintenance; hot-dip galvanising to AS/NZS 4680 where it is buried, embedded or inaccessible`]] as Row[]) : []),
        ...(concrete
          ? ([["Concrete cover (NZS 3101 Table 3.7)", "75 mm cast against ground, 50 mm formed and exposed to ground or weather, 40 mm to stirrups in sheltered beams (exposure A1/A2: increase for B1 or worse)"]] as Row[])
          : []),
        ...(timber ? ([["Timber treatment (NZS 3602)", "H1.2 enclosed framing, H3.2 exposed above ground, H4 posts in ground, H5 piles; LVL to the maker's treatment for its position"]] as Row[]) : []),
      ],
      notes: ["Confirm fixings against NZS 3604 Tables 4.1 to 4.3 as amended, and the connector makers' own exposure guidance."],
    },
  ];
}
