"use client";

// Council report: the design as a PDF for building consent. Built in the
// browser (react-pdf), loaded only when someone downloads one. Logo on every
// sheet; watermarked DRAFT until a CPEng has signed the job.

import { Document, Font, Image, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { DRAFT_NOTE, STATUS_LABEL, type Calcs, type Result } from "@/lib/design/calc";
import type { Change } from "@/lib/design/diff";
import { BRACE_NAME, byLabel, describeMember, MEMBER_INFO, memberLength, type DesignModel, type Member } from "@/lib/design/model";
import { designFeatures, ps1Rows, type PaperSection } from "@/lib/design/paperwork";
import { runVerification, type VResult } from "@/lib/design/verify";
import { DetailSheet, detailsFor } from "./details";
import { PARAM_META } from "./panels";
import { planImage, type PlanSource } from "./plan-image";
import { personLabel, type Signoff, type Status } from "./signoff";
import { snapshot3d } from "./view-3d";

// Liberation Sans (metric twin of Arial, with Greek for δ and φ), shipped with pdf.js.
Font.register({
  family: "Sans",
  fonts: [
    { src: new URL("pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf", import.meta.url).toString() },
    { src: new URL("pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf", import.meta.url).toString(), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

export type ReportInput = {
  job: { title: string; jobNo: string; address: string };
  company: string;
  model: DesignModel;
  calcs: Calcs;
  revision: number;
  status: Status;
  signoff: Signoff | null;
  plans: PlanSource[];
  compare?: { revision: number; changes: Change[] } | null; // changes since an earlier revision, clouded on the plans
};

const INK = "#1b2530";
const MUTED = "#5b6773";
const LINE = "#d5dbe0";
const ACCENT = "#c8a24a";
const s = StyleSheet.create({
  page: { fontFamily: "Sans", fontSize: 8.5, color: INK, paddingTop: 58, paddingBottom: 48, paddingHorizontal: 36 },
  header: { position: "absolute", top: 18, left: 36, right: 36, flexDirection: "row", alignItems: "center", borderBottomWidth: 0.75, borderBottomColor: INK, paddingBottom: 6 },
  logo: { height: 22, objectFit: "contain" },
  headRight: { marginLeft: "auto", textAlign: "right", fontSize: 7.5, color: MUTED },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5, fontSize: 7, color: MUTED },
  watermark: { position: "absolute", top: 330, left: 0, right: 0, textAlign: "center", fontSize: 110, fontWeight: 700, color: "#b8342a", opacity: 0.09, transform: "rotate(-35deg)" },
  h1: { fontSize: 15, fontWeight: 700, marginBottom: 8 },
  h2: { fontSize: 11, fontWeight: 700, marginTop: 12, marginBottom: 5 },
  p: { marginBottom: 4 },
  muted: { color: MUTED },
  table: { borderTopWidth: 0.75, borderTopColor: INK },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 2.5 },
  th: { fontWeight: 700, fontSize: 7.5, color: MUTED },
  draft: { borderLeftWidth: 2.5, borderLeftColor: "#b7791f", backgroundColor: "#fdf6e7", padding: 6, color: "#8a5a12", marginTop: 6 },
});

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "–");
const today = () => new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });

function Row({ cells, widths, head, bold }: { cells: ReactNode[]; widths: (number | string)[]; head?: boolean; bold?: boolean }) {
  return (
    <View style={s.tr} wrap={false}>
      {cells.map((c, i) => (
        <Text key={i} style={[{ width: widths[i], paddingRight: 4 }, head ? s.th : {}, bold ? { fontWeight: 700 } : {}]}>
          {c}
        </Text>
      ))}
    </View>
  );
}

function Frame({ input, children, landscape }: { input: ReportInput; children: ReactNode; landscape?: boolean }) {
  const { job, signoff, status, revision } = input;
  const people = signoff?.people ?? [];
  return (
    <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={s.page} wrap>
      <View style={s.header} fixed>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        <Image src="/assets/logo.png" style={s.logo} />
        <View style={s.headRight}>
          <Text style={{ color: INK, fontWeight: 700 }}>
            {job.jobNo ? `${job.jobNo} · ` : ""}
            {job.title}
          </Text>
          <Text>
            Structural design and calculations · revision {status === "signed" && signoff?.signedRevision ? signoff.signedRevision : revision}
          </Text>
        </View>
      </View>
      {children}
      <View style={s.footer} fixed>
        <Text>
          Designed: {personLabel(people, signoff?.designerId ?? null)} · Checked: {personLabel(people, signoff?.checkerId ?? null)}
          {status === "signed" ? "" : " · DRAFT, not for construction"}
        </Text>
        <Text style={{ marginLeft: "auto" }} render={({ pageNumber, totalPages }) => `${input.company} · page ${pageNumber} of ${totalPages}`} />
      </View>
      {/* last, so it sits over plan and 3D images */}
      {status !== "signed" ? (
        <Text style={[s.watermark, landscape ? { top: 200 } : {}]} fixed>
          DRAFT
        </Text>
      ) : null}
    </Page>
  );
}

function CalcBlock({ r, member }: { r: Result; member?: Member }) {
  const kv = (rows: { label: string; value: string; note?: string }[]) =>
    rows.map((l, i) => (
      <View key={i} style={{ flexDirection: "row", paddingVertical: 1 }}>
        <Text style={{ width: "58%", color: MUTED }}>
          {l.label}
          {l.note ? ` (${l.note})` : ""}
        </Text>
        <Text style={{ width: "42%", textAlign: "right" }}>{l.value}</Text>
      </View>
    ));
  return (
    <View style={{ borderTopWidth: 0.75, borderTopColor: INK, paddingTop: 5, marginBottom: 10 }} wrap={false}>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: 700, width: 44 }}>{r.mark}</Text>
        <Text style={{ fontWeight: 700 }}>{r.sec?.name ?? (member ? describeMember(member) : "")}</Text>
        <Text style={{ marginLeft: "auto", fontWeight: 700, color: r.status === "fail" ? "#b8342a" : r.status === "close" ? "#b7791f" : r.status === "pass" ? "#2f7d3a" : MUTED }}>
          {STATUS_LABEL[r.status]}
          {r.ratio !== null ? ` · ${Math.round(r.ratio * 100)}%` : ""}
          {r.govName ? ` · ${r.govName}` : ""}
        </Text>
      </View>
      {r.summary ? <Text style={[s.muted, { marginBottom: 4 }]}>{r.summary}</Text> : null}
      <View style={{ flexDirection: "row", gap: 14 }}>
        <View style={{ flex: 1 }}>
          {r.inputs.length ? kv(r.inputs) : null}
          {r.loads.length ? (
            <>
              <Text style={[s.th, { marginTop: 3 }]}>LOADS</Text>
              {kv(r.loads)}
            </>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          {r.utils.length ? (
            <>
              <Text style={s.th}>UTILISATION</Text>
              {r.utils.map((u) => (
                <View key={u.label} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 1 }}>
                  <Text style={{ width: "42%" }}>{u.label}</Text>
                  <View style={{ width: "40%", height: 4, backgroundColor: "#eef1f3" }}>
                    <View style={{ width: `${Math.min(1, u.u) * 100}%`, height: 4, backgroundColor: u.u > 1 ? "#b8342a" : u.u > 0.9 ? "#b7791f" : "#2f7d3a" }} />
                  </View>
                  <Text style={{ width: "18%", textAlign: "right" }}>{fmt(u.u)}</Text>
                </View>
              ))}
            </>
          ) : null}
          {r.kv.length ? (
            <>
              <Text style={[s.th, { marginTop: 3 }]}>RESULTS</Text>
              {kv(r.kv)}
            </>
          ) : null}
        </View>
      </View>
      {r.seq?.length ? (
        <>
          <Text style={[s.th, { marginTop: 4 }]}>SELECTION ORDER (FIRST SECTION THAT PASSES)</Text>
          {r.seq.map((q, i) => (
            <View key={i} style={{ flexDirection: "row", paddingVertical: 0.8, backgroundColor: q.chosen ? "#f6efd9" : undefined }}>
              <Text style={{ width: "25%" }}>{q.family}</Text>
              <Text style={{ width: "60%" }}>{q.text}</Text>
              <Text style={{ width: "15%", textAlign: "right", color: q.pass ? "#2f7d3a" : "#b8342a" }}>
                {q.util !== null ? fmt(q.util) : "–"} {q.pass ? "OK" : "NG"}
              </Text>
            </View>
          ))}
        </>
      ) : null}
      {r.notes.length ? (
        <View style={{ marginTop: 3 }}>
          {r.notes.map((n, i) => (
            <Text key={i} style={s.muted}>
              • {n}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Sections({ sections }: { sections: PaperSection[] }) {
  return (
    <>
      {sections.map((sec) => (
        <View key={sec.title} wrap={false} style={{ marginBottom: 4 }}>
          <Text style={s.h2}>{sec.title}</Text>
          <View style={s.table}>
            {sec.rows.map(([k, v], i) => (
              <Row key={i} widths={["34%", "66%"]} cells={[k, v]} />
            ))}
          </View>
          {(sec.notes ?? []).map((n, i) => (
            <Text key={i} style={[s.muted, { marginTop: 2 }]}>
              {n}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

function ReportDoc({ input, planImages, view3d, checks }: { input: ReportInput; planImages: { name: string; url: string; w: number; h: number }[]; view3d: string | null; checks: VResult[] }) {
  const { job, model, calcs, status, signoff, revision, company, compare } = input;
  const details = detailsFor(calcs);
  const changes = compare?.changes ?? [];
  const people = signoff?.people ?? [];
  const levelName = (id: string) => model.levels.find((l) => l.id === id)?.name ?? "";
  const ordered = [...model.levels].sort((a, b) => a.elevation - b.elevation);
  const levelRank = new Map(ordered.map((l, i) => [l.id, i]));
  const items: { id: string; m: Member }[] = [
    ...model.members.filter((m) => calcs.results.has(m.id) && m.type !== "wall" && m.type !== "bracing").map((m) => ({ id: m.id, m })),
    ...calcs.lintels.filter((l) => calcs.results.has(l.id)).map((l) => ({ id: l.id, m: l.member })),
  ].sort((a, b) => (levelRank.get(a.m.levelId) ?? 0) - (levelRank.get(b.m.levelId) ?? 0) || byLabel(a.m, b.m));
  const fails = items.filter((i) => calcs.results.get(i.id)?.status === "fail").length;
  const shownRev = status === "signed" && signoff?.signedRevision ? signoff.signedRevision : revision;
  const n = (t: string) => sections.indexOf(t) + 1;
  const changesTitle = compare ? `Changes since revision ${compare.revision}` : "";
  const sections = [
    "Design features",
    ...(compare ? [changesTitle] : []),
    "Design basis",
    "Member schedule",
    ...(calcs.bracing.length ? ["Bracing"] : []),
    ...(calcs.connections.length ? ["Connections"] : []),
    ...(details.length ? ["Typical details"] : []),
    ...(planImages.length ? ["Framing plans"] : []),
    ...(view3d ? ["3D view"] : []),
    "Calculations",
    "Producer statement (PS1) details",
    "Engine verification",
  ];
  const groups = [...new Set(checks.map((c) => c.group))];

  return (
    <Document title={`${job.jobNo ? job.jobNo + " " : ""}${job.title} – structural calculations`} author={company} creator={company}>
      {/* cover */}
      <Page size="A4" style={[s.page, { paddingTop: 70 }]}>
        {status !== "signed" ? <Text style={s.watermark}>DRAFT</Text> : null}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        <Image src="/assets/logo.png" style={{ height: 56, objectFit: "contain", alignSelf: "flex-start" }} />
        <View style={{ marginTop: 120, borderLeftWidth: 4, borderLeftColor: ACCENT, paddingLeft: 14 }}>
          <Text style={{ fontSize: 11, color: MUTED, letterSpacing: 1 }}>STRUCTURAL DESIGN AND CALCULATIONS</Text>
          <Text style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{job.title}</Text>
          {job.address ? <Text style={{ fontSize: 12, marginTop: 4 }}>{job.address}</Text> : null}
          <Text style={{ fontSize: 10, marginTop: 10, color: MUTED }}>
            {job.jobNo ? `Job ${job.jobNo} · ` : ""}Revision {shownRev} · {today()}
          </Text>
        </View>
        <View style={{ marginTop: 60, borderTopWidth: 0.75, borderTopColor: INK }}>
          <Row widths={["30%", "70%"]} cells={["Designed by", personLabel(people, signoff?.designerId ?? null)]} />
          <Row widths={["30%", "70%"]} cells={["Checked by", personLabel(people, signoff?.checkerId ?? null)]} />
          <Row
            widths={["30%", "70%"]}
            cells={[
              "Sign-off",
              status === "signed" && signoff?.signedAt
                ? `Signed by ${personLabel(people, signoff.signedBy)} on ${new Date(signoff.signedAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })} (revision ${signoff.signedRevision})`
                : status === "in_review"
                  ? "Submitted for checking, not yet signed"
                  : "Not signed",
            ]}
          />
          <Row widths={["30%", "70%"]} cells={["Members", `${items.length} designed · ${fails ? `${fails} failing` : "all pass"}`]} />
        </View>
        {status !== "signed" ? <Text style={[s.draft, { marginTop: 18 }]}>DRAFT. Not for construction or building consent until checked and signed by a Chartered Professional Engineer. {DRAFT_NOTE}</Text> : null}
        <View style={{ position: "absolute", bottom: 36, left: 36, right: 36 }}>
          <Text style={s.th}>CONTENTS</Text>
          {sections.map((t, i) => (
            <Text key={t} style={{ marginTop: 2 }}>
              {i + 1}. {t}
            </Text>
          ))}
          <Text style={[s.muted, { marginTop: 10 }]}>{company}</Text>
        </View>
      </Page>

      {/* design features report */}
      <Frame input={input}>
        <Text style={s.h1}>{n("Design features")}. Design features</Text>
        <Text style={s.p}>The basis of this design, for the building consent authority&apos;s reviewer: what is designed, to which standards, for which loads, ground and exposure.</Text>
        <Sections sections={designFeatures(model, calcs)} />
      </Frame>

      {compare ? (
        <Frame input={input}>
          <Text style={s.h1}>
            {n(changesTitle)}. {changesTitle}
          </Text>
          <Text style={s.p}>
            {changes.length
              ? `${changes.length} change${changes.length === 1 ? "" : "s"} from revision ${compare.revision} to revision ${shownRev}. Changed members are clouded on the framing plans with a revision ${shownRev} triangle.`
              : `No changes from revision ${compare.revision}.`}
          </Text>
          {changes.length ? (
            <View style={s.table}>
              <Row head widths={["10%", "12%", "18%", "60%"]} cells={["Mark", "Change", "Level", "What"]} />
              {changes.map((c, i) => (
                <Row key={i} widths={["10%", "12%", "18%", "60%"]} cells={[c.mark, c.kind === "added" ? "Added" : c.kind === "removed" ? "Removed" : "Changed", c.levelId ? levelName(c.levelId) : "Whole job", c.what]} />
              ))}
            </View>
          ) : null}
        </Frame>
      ) : null}

      {/* basis */}
      <Frame input={input}>
        <Text style={s.h1}>{n("Design basis")}. Design basis</Text>
        <Text style={s.p}>
          Light timber framing to NZS 3604:2011, with members outside its scope designed specifically. Loads and combinations to AS/NZS 1170.0, 1170.1 and 1170.2; timber to NZS 3603:1993 (SG8
          sawn and hySPAN LVL properties); steel to NZS 3404.1:2009 (fy 300 MPa); bracing to NZS 3604 Section 5 with GIB EzyBrace® Systems (2016) ratings.
        </Text>
        <Text style={s.h2}>Load combinations</Text>
        <Text style={s.p}>1.35G (k1 0.6) · 1.2G + 1.5Q (k1 0.8) · 1.2G + 1.5Qr + 0.4Q (k1 {fmt(model.params.k1Roof)}) · 1.2G + Su + 0.4Q (k1 0.8)</Text>
        <Text style={s.p}>
          Serviceability: long-term k2(G + 0.4Q) ≤ min(span/300, {fmt(model.params.dAbs, 0)} mm); short-term 0.7(Q) ≤ span/360; {fmt(model.params.Ppt, 1)} kN point load at midspan ≤{" "}
          {fmt(model.params.dPlim, 1)} mm. Beams are simply supported; beams bearing on other beams pass their reactions on as point loads.
        </Text>
        <Text style={s.h2}>Design loads</Text>
        <View style={s.table}>
          <Row head widths={["38%", "14%", "48%"]} cells={["Load", "Value", "Note"]} />
          {PARAM_META.map(([k, label, unit, help]) => (
            <Row key={k} widths={["38%", "14%", "48%"]} cells={[label, `${model.params[k]}${unit ? " " + unit : ""}`, help]} />
          ))}
        </View>
        <Text style={s.h2}>Levels</Text>
        <View style={s.table}>
          <Row head widths={["34%", "22%", "22%", "22%"]} cells={["Level", "Elevation", "Stud height", "Floor"]} />
          {ordered.map((l) => (
            <Row key={l.id} widths={["34%", "22%", "22%", "22%"]} cells={[l.name, `${fmt(l.elevation, 3)} m`, `${fmt(l.height)} m`, l.kind === "floor" ? (l.floor === "slab" ? "Slab" : "Timber") : l.kind === "roof" ? "Roof" : "Foundation"]} />
          ))}
        </View>
        {model.notes.length ? (
          <>
            <Text style={s.h2}>Assumptions to confirm</Text>
            {model.notes.map((n, i) => (
              <Text key={i} style={s.p}>
                • {n}
              </Text>
            ))}
          </>
        ) : null}
        <Text style={s.draft}>{DRAFT_NOTE}</Text>
      </Frame>

      {/* schedule */}
      <Frame input={input}>
        <Text style={s.h1}>{n("Member schedule")}. Member schedule</Text>
        <View style={s.table}>
          <Row head widths={["8%", "15%", "15%", "9%", "29%", "14%", "10%"]} cells={["Mark", "Type", "Level", "Span / ht", "Section", "Governs", "Util."]} />
          {items.map(({ id, m }) => {
            const r = calcs.results.get(id)!;
            const span = m.type === "joistzone" && m.b ? Math.abs(m.zone?.dir === "x" ? m.b.x - m.a.x : m.b.y - m.a.y) : m.b ? memberLength(m) : null;
            const len = span !== null ? `${fmt(span)} m` : (r.kv.find((k) => k.label.startsWith("Height"))?.value ?? "");
            return (
              <Row
                key={id}
                widths={["8%", "15%", "15%", "9%", "29%", "14%", "10%"]}
                cells={[r.mark, id.includes("#") ? "Lintel (opening)" : MEMBER_INFO[m.type].label, levelName(m.levelId), len, r.sec?.name ?? describeMember(m), r.govName ?? "", r.ratio !== null ? `${Math.round(r.ratio * 100)}%${r.status === "fail" ? " NG" : ""}` : "–"]}
              />
            );
          })}
        </View>
      </Frame>

      {/* bracing */}
      {calcs.bracing.length ? (
        <Frame input={input}>
          <Text style={s.h1}>{n("Bracing")}. Bracing</Text>
          {calcs.bracing.map((b, i) => (
            <View key={i} style={{ marginBottom: 10 }} wrap={false}>
              <Text style={s.h2}>
                {b.level.name}, {b.dir === "along" ? "along (east–west lines)" : "across (north–south lines)"}: wind {b.totW}/{b.demandW} BU, earthquake {b.totE}/{b.demandE} BU {b.okTotal ? "OK" : "NOT ENOUGH"}
              </Text>
              <View style={s.table}>
                <Row head widths={["10%", "38%", "13%", "13%", "13%", "13%"]} cells={["Line", "Elements", "Wind", "Min", "EQ", "Min"]} />
                {b.lines.map((l) => (
                  <Row
                    key={l.id}
                    widths={["10%", "38%", "13%", "13%", "13%", "13%"]}
                    cells={[l.id, l.els.map((e) => `${e.mark} ${BRACE_NAME[e.system] ?? e.system} ${fmt(e.L)} m`).join(", "), `${l.sumW}${l.okW ? "" : " NG"}`, `${l.minW}`, `${l.sumE}${l.okE ? "" : " NG"}`, `${l.minE}`]}
                  />
                ))}
              </View>
              <Text style={[s.muted, { marginTop: 3 }]}>
                Demand {b.source === "site" ? "from the site data (NZS 1170.5 / AS/NZS 1170.2)" : b.source === "entered" ? "as entered" : "not set"}. Centre of rigidity {fmt(b.cr)} m against floor centre {fmt(b.cm)} m; widest line spacing {fmt(b.maxGap)} m.
              </Text>
              {b.notes.map((n, k) => (
                <Text key={k} style={{ color: "#8a5a12", marginTop: 2 }}>
                  {n}
                </Text>
              ))}
            </View>
          ))}
        </Frame>
      ) : null}

      {calcs.connections.length ? (
        <Frame input={input}>
          <Text style={s.h1}>{n("Connections")}. Connections</Text>
          <Text style={s.p}>Steel to AS 4100 / NZS 3404.1 chapter 9 (bolts φ 0.8, ply bearing φ 0.9, SP fillet welds φ 0.8, fuw 490 MPa); concrete bearing to NZS 3101 cl 16.3.1; timber bearing to NZS 3603. Proprietary connectors must be rated for at least the force shown.</Text>
          <View style={s.table}>
            <Row head widths={["20%", "17%", "12%", "51%"]} cells={["Where", "Connection", "Force", "Detail"]} />
            {calcs.connections.map((c, i) => (
              <Row key={i} widths={["20%", "17%", "12%", "51%"]} cells={[c.at, c.kind, `${c.demand.toFixed(1)} ${c.unit}`, `${c.detail}${c.ok ? "" : " — CHECK"}`]} />
            ))}
          </View>
        </Frame>
      ) : null}

      {details.length ? (
        <Frame input={input}>
          <Text style={s.h1}>{n("Typical details")}. Typical details</Text>
          <Text style={s.p}>Arrangements for the connections and foundations in this job. Sizes, bolts and ratings are in the connection and footing schedules; read these sketches with them.</Text>
          <DetailSheet keys={details} />
        </Frame>
      ) : null}

      {/* plans */}
      {planImages.map((img) => (
        <Frame key={img.name} input={input} landscape>
          <Text style={s.h1}>
            {n("Framing plans")}. Framing plan: {img.name}
          </Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image src={img.url} style={{ maxWidth: "100%", maxHeight: 440, objectFit: "contain" }} />
          <Text style={[s.muted, { marginTop: 4 }]}>Marks match the schedule and calculations. Members in red fail. Underlay: architect&apos;s plan, where placed to scale.</Text>
        </Frame>
      ))}

      {view3d ? (
        <Frame input={input} landscape>
          <Text style={s.h1}>{n("3D view")}. 3D view</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image src={view3d} style={{ maxWidth: "100%", maxHeight: 440, objectFit: "contain" }} />
        </Frame>
      ) : null}

      {/* calcs */}
      <Frame input={input}>
        <Text style={s.h1}>{n("Calculations")}. Calculations</Text>
        {items.map(({ id, m }) => (
          <CalcBlock key={id} r={calcs.results.get(id)!} member={m} />
        ))}
        <Text style={s.draft}>{DRAFT_NOTE}</Text>
      </Frame>

      {/* PS1 details */}
      <Frame input={input}>
        <Text style={s.h1}>{n("Producer statement (PS1) details")}. Producer statement (PS1) details</Text>
        <Text style={s.draft}>
          Information for the PS1, in the order of the Engineering New Zealand form. This page is not a producer statement: the design professional transfers it to the current official form, checks it, and signs that form.
        </Text>
        <Sections sections={ps1Rows(model, job, company)} />
      </Frame>

      {/* verification */}
      <Frame input={input}>
        <Text style={s.h1}>{n("Engine verification")}. Engine verification</Text>
        <Text style={s.p}>
          The design engine was run, when this report was made, against {checks.length} answers worked out independently (textbook formulas, published capacity tables, hand calculations and past Stable Structure jobs).{" "}
          {checks.every((c) => c.pass) ? "Every check matched." : `${checks.filter((c) => !c.pass).length} did not match: see below.`}
        </Text>
        <View style={s.table}>
          <Row head widths={["60%", "20%", "20%"]} cells={["Group", "Checks", "Result"]} />
          {groups.map((g) => {
            const cs = checks.filter((c) => c.group === g);
            const bad = cs.filter((c) => !c.pass).length;
            return <Row key={g} widths={["60%", "20%", "20%"]} cells={[g, String(cs.length), bad ? `${bad} differ` : "All match"]} />;
          })}
        </View>
        {checks
          .filter((c) => !c.pass)
          .map((c, i) => (
            <Text key={i} style={{ color: "#b8342a", marginTop: 2 }}>
              {c.group}: {c.name}: expected {String(c.want)}, got {c.got === null ? c.error : String(c.got)}
            </Text>
          ))}
        <Text style={[s.muted, { marginTop: 6 }]}>This checks the engine&apos;s arithmetic and methods on known cases. It does not check the model of this job, which is for the designer and the checker.</Text>
      </Frame>
    </Document>
  );
}

export async function buildReport(input: ReportInput): Promise<Blob> {
  const levels = [...input.model.levels].sort((a, b) => a.elevation - b.elevation);
  const planImages: { name: string; url: string; w: number; h: number }[] = [];
  for (const l of levels) {
    const shown = input.status === "signed" && input.signoff?.signedRevision ? input.signoff.signedRevision : input.revision;
    const img = await planImage(input.model, input.calcs, l, input.plans, input.compare ? { changes: input.compare.changes, revision: shown } : null);
    if (img) planImages.push({ name: l.name, ...img });
  }
  let view3d: string | null = null;
  try {
    view3d = snapshot3d(input.model, input.calcs);
  } catch {
    view3d = null; // no WebGL: leave the 3D page out
  }
  return pdf(<ReportDoc input={input} planImages={planImages} view3d={view3d} checks={runVerification()} />).toBlob();
}
