"use client";

// Typical details for the council report, drawn as vector sketches. Only the
// details a job uses are included, picked from its connection schedule and
// foundations. Sizes come from the schedules; the sketches show the
// arrangement.

import { Circle, G, Line, Polygon, Polyline, Rect, Svg, Text, Text as PdfText, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { Calcs } from "@/lib/design/calc";

const INK = "#1b2530";
const STEEL = "#7f8b96";
const CONC = "#c9cdd1";
const TIMBER = "#d9b27c";
const NOTE = "#b8342a";

export type DetailKey = "cleat" | "base" | "portalBase" | "hanger" | "postCap" | "tieDown" | "pad" | "strip";

// small helpers so each sketch reads as a drawing, not as markup
const T = ({ x, y, children, anchor = "start", bold }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end"; bold?: boolean }) => (
  <Text x={x} y={y} fill={INK} textAnchor={anchor} style={{ fontSize: 6.2, fontFamily: "Sans", fontWeight: bold ? 700 : 400 } as never}>
    {children}
  </Text>
);
const Leader = ({ from, to }: { from: [number, number]; to: [number, number] }) => (
  <G>
    <Line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={NOTE} strokeWidth={0.5} />
    <Circle cx={to[0]} cy={to[1]} r={1.1} fill={NOTE} />
  </G>
);
const Hatch = ({ x, y, w, h, fill }: { x: number; y: number; w: number; h: number; fill: string }) => <Rect x={x} y={y} width={w} height={h} fill={fill} stroke={INK} strokeWidth={0.7} />;
const Bolt = ({ x, y }: { x: number; y: number }) => <Circle cx={x} cy={y} r={2.6} fill="#fff" stroke={INK} strokeWidth={0.8} />;
const Ground = ({ y, x0 = 10, x1 = 250 }: { y: number; x0?: number; x1?: number }) => (
  <G>
    <Line x1={x0} y1={y} x2={x1} y2={y} stroke={INK} strokeWidth={0.7} />
    {Array.from({ length: Math.floor((x1 - x0) / 10) }, (_, i) => (
      <Line key={i} x1={x0 + i * 10} y1={y + 4} x2={x0 + i * 10 + 4} y2={y} stroke={INK} strokeWidth={0.4} />
    ))}
  </G>
);

function Cleat() {
  return (
    <G>
      <Hatch x={36} y={10} w={14} h={130} fill={STEEL} />
      <T x={43} y={8} anchor="middle">
        support
      </T>
      {/* beam in elevation */}
      <Hatch x={60} y={38} w={180} h={6} fill={STEEL} />
      <Hatch x={60} y={106} w={180} h={6} fill={STEEL} />
      <Rect x={60} y={44} width={180} height={62} fill="#eef1f3" stroke={INK} strokeWidth={0.5} />
      <T x={160} y={78} anchor="middle">
        steel beam (web)
      </T>
      {/* cleat */}
      <Rect x={50} y={52} width={34} height={46} fill="#fff" stroke={INK} strokeWidth={1} />
      <Bolt x={72} y={62} />
      <Bolt x={72} y={88} />
      <Polygon points="50,52 54,52 50,57" fill={INK} />
      <Polygon points="50,98 54,98 50,93" fill={INK} />
      <Leader from={[120, 24]} to={[78, 54]} />
      <T x={122} y={22}>
        web cleat, thickness per schedule
      </T>
      <Leader from={[120, 130]} to={[74, 90]} />
      <T x={122} y={132}>
        8.8/S bolts per schedule, 35 edge, 70 pitch
      </T>
      <Leader from={[12, 124]} to={[51, 96]} />
      <T x={6} y={130}>
        6 SP fillet both sides
      </T>
      <T x={56} y={120}>
        10 gap
      </T>
    </G>
  );
}

function Base({ fixed }: { fixed?: boolean }) {
  return (
    <G>
      <Hatch x={108} y={10} w={44} h={78} fill={STEEL} />
      <T x={130} y={50} anchor="middle">
        {fixed ? "portal leg" : "SHS post"}
      </T>
      <Hatch x={86} y={88} w={88} h={7} fill={STEEL} />
      <Rect x={86} y={95} width={88} height={8} fill="#fff" stroke={INK} strokeWidth={0.5} strokeDasharray="2 1.5" />
      <Hatch x={36} y={103} w={188} h={40} fill={CONC} />
      {(fixed ? [94, 102, 158, 166] : [96, 164]).map((x) => (
        <G key={x}>
          <Line x1={x} y1={80} x2={x} y2={134} stroke={INK} strokeWidth={1.4} />
          <Line x1={x} y1={134} x2={x + 8} y2={134} stroke={INK} strokeWidth={1.4} />
          <Rect x={x - 3.5} y={83} width={7} height={5} fill={INK} />
        </G>
      ))}
      <Polygon points="108,88 104,88 108,84" fill={INK} />
      <Polygon points="152,88 156,88 152,84" fill={INK} />
      <Leader from={[190, 74]} to={[170, 91]} />
      <T x={192} y={72}>
        base plate per schedule
      </T>
      <Leader from={[190, 98]} to={[172, 99]} />
      <T x={192} y={100}>
        30–40 non-shrink grout
      </T>
      <Leader from={[18, 70]} to={[96, 110]} />
      <T x={4} y={62}>
        {fixed ? "4 cast-in hold-downs for" : "2 cast-in hold-downs"}
      </T>
      <T x={4} y={69}>
        {fixed ? "base moment, per schedule" : "per schedule"}
      </T>
      <Leader from={[60, 22]} to={[106, 86]} />
      <T x={4} y={20}>
        6 SP fillet all round
      </T>
      <T x={130} y={128} anchor="middle">
        pad per footing schedule
      </T>
    </G>
  );
}

function Hanger() {
  return (
    <G>
      <Hatch x={30} y={26} w={46} h={100} fill={TIMBER} />
      <T x={53} y={22} anchor="middle">
        beam or bearer
      </T>
      <Hatch x={80} y={40} w={160} h={70} fill={TIMBER} />
      <T x={170} y={78} anchor="middle">
        joist
      </T>
      <Polyline points="76,36 78,36 78,114 118,114 118,64" fill="none" stroke={INK} strokeWidth={1.8} />
      {[46, 60, 74, 88, 102].map((y) => (
        <Circle key={y} cx={73} cy={y} r={0.9} fill={INK} />
      ))}
      {[70, 84, 98].map((y) => (
        <Circle key={y} cx={112} cy={y} r={0.9} fill={INK} />
      ))}
      <Leader from={[150, 126]} to={[110, 113]} />
      <T x={152} y={128}>
        proprietary joist hanger,
      </T>
      <T x={152} y={135}>
        rated per schedule; nail
      </T>
      <T x={152} y={142}>
        every hole
      </T>
      <T x={30} y={140}>
        finish to suit the exposure zone
      </T>
    </G>
  );
}

function PostCap() {
  return (
    <G>
      <Hatch x={20} y={28} w={220} h={42} fill={TIMBER} />
      <T x={200} y={52} anchor="middle">
        beam
      </T>
      <Hatch x={108} y={70} w={44} h={74} fill={TIMBER} />
      <T x={130} y={120} anchor="middle">
        post
      </T>
      <Rect x={103} y={38} width={5} height={66} fill="#fff" stroke={INK} strokeWidth={0.9} />
      <Rect x={152} y={38} width={5} height={66} fill="#fff" stroke={INK} strokeWidth={0.9} />
      <Bolt x={130} y={50} />
      <Bolt x={130} y={88} />
      <Leader from={[180, 100]} to={[156, 80]} />
      <T x={182} y={102}>
        cap bracket or bolted side
      </T>
      <T x={182} y={109}>
        plates, rated per schedule
      </T>
      <Leader from={[40, 96]} to={[110, 70]} />
      <T x={10} y={102}>
        full bearing, checked to NZS 3603
      </T>
    </G>
  );
}

function TieDown() {
  return (
    <G>
      <Hatch x={20} y={30} w={220} h={24} fill={TIMBER} />
      <T x={60} y={45} anchor="middle">
        rafter or roof beam
      </T>
      <Hatch x={20} y={54} w={220} h={10} fill={TIMBER} />
      <T x={210} y={62} anchor="middle">
        top plate
      </T>
      <Hatch x={122} y={64} w={14} h={78} fill={TIMBER} />
      <T x={146} y={120}>
        stud
      </T>
      <Polyline points="116,98 116,26 142,26 142,98" fill="none" stroke={INK} strokeWidth={1.6} />
      {[34, 70, 84].map((y) => (
        <G key={y}>
          <Circle cx={116} cy={y} r={0.9} fill={INK} />
          <Circle cx={142} cy={y} r={0.9} fill={INK} />
        </G>
      ))}
      <Leader from={[168, 18]} to={[141, 27]} />
      <T x={170} y={12}>
        strap or bolted tie-down,
      </T>
      <T x={170} y={19}>
        rated per schedule
      </T>
      <T x={20} y={140}>
        continue the load path down to the foundation
      </T>
    </G>
  );
}

function Pad() {
  return (
    <G>
      <Ground y={92} />
      <Hatch x={114} y={20} w={32} h={72} fill={TIMBER} />
      <T x={150} y={40}>
        post or pier
      </T>
      <Hatch x={50} y={92} w={160} h={44} fill={CONC} />
      <Line x1={60} y1={126} x2={200} y2={126} stroke={INK} strokeWidth={1.2} />
      {[66, 88, 110, 132, 154, 176, 196].map((x) => (
        <Circle key={x} cx={x} cy={122} r={1.6} fill={INK} />
      ))}
      <Line x1={50} y1={144} x2={210} y2={144} stroke={INK} strokeWidth={0.5} />
      <T x={130} y={150} anchor="middle">
        B per footing schedule
      </T>
      <Line x1={220} y1={92} x2={220} y2={136} stroke={INK} strokeWidth={0.5} />
      <T x={224} y={116}>
        D
      </T>
      <Leader from={[20, 112]} to={[64, 124]} />
      <T x={4} y={110}>
        bars each way
      </T>
      <T x={4} y={117}>
        per schedule, 75 cover
      </T>
      <T x={150} y={84}>
        founded on verified ground
      </T>
    </G>
  );
}

function Strip() {
  return (
    <G>
      <Ground y={88} />
      <Hatch x={116} y={10} w={28} h={78} fill={CONC} />
      <T x={150} y={30}>
        loadbearing wall
      </T>
      <Hatch x={76} y={88} w={108} h={44} fill={CONC} />
      <Polyline points="126,40 126,124 150,124" fill="none" stroke={INK} strokeWidth={1.2} />
      <Polyline points="134,40 134,120" fill="none" stroke={INK} strokeWidth={1.2} />
      {[88, 104, 156, 172].map((x) => (
        <Circle key={x} cx={x} cy={124} r={1.6} fill={INK} />
      ))}
      <Line x1={76} y1={140} x2={184} y2={140} stroke={INK} strokeWidth={0.5} />
      <T x={130} y={148} anchor="middle">
        width per footing schedule
      </T>
      <Leader from={[20, 112]} to={[88, 122]} />
      <T x={4} y={110}>
        longitudinal bars and starters
      </T>
      <T x={4} y={117}>
        per schedule, 75 cover
      </T>
    </G>
  );
}

const DETAILS: Record<DetailKey, { title: string; draw: () => ReactNode; notes: string[] }> = {
  cleat: { title: "Steel beam end: web cleat", draw: () => <Cleat />, notes: ["Bolts, cleat thickness and length per the connection schedule.", "Grade 300 plate; bolts 8.8/S snug-tight in bearing."] },
  base: { title: "Steel post base", draw: () => <Base />, notes: ["Plate thickness and hold-downs per the connection schedule.", "Hot-dip galvanise where buried or in contact with concrete."] },
  portalBase: { title: "Portal frame base (fixed)", draw: () => <Base fixed />, notes: ["Hold-downs designed for the base moment and uplift in the schedule.", "Set bolts with a template; level on nuts and grout."] },
  hanger: { title: "Joist to beam: hanger", draw: () => <Hanger />, notes: ["Hanger rated for at least the force in the connection schedule.", "Use the maker's nails in every hole."] },
  postCap: { title: "Beam on post", draw: () => <PostCap />, notes: ["Bracket or plates rated for the reaction in the schedule.", "Full bearing of the beam on the post."] },
  tieDown: { title: "Wind uplift tie-down", draw: () => <TieDown />, notes: ["Rated for the uplift in the connection schedule.", "Carry the uplift down every storey to the foundation."] },
  pad: { title: "Pad footing", draw: () => <Pad />, notes: ["Size, depth and bars per the footing calculations.", "Confirm the ground bearing before pouring."] },
  strip: { title: "Strip footing under a loadbearing wall", draw: () => <Strip />, notes: ["Width and depth per the footing calculations.", "Starters to suit the wall; 75 cover cast against ground."] },
};

export function detailsFor(calcs: Calcs): DetailKey[] {
  const kinds = new Set(calcs.connections.map((c) => c.kind));
  const res = [...calcs.results.values()];
  const out: DetailKey[] = [];
  if (kinds.has("Steel beam end")) out.push("cleat");
  if (calcs.connections.some((c) => c.kind === "Base plate" && !c.at.endsWith("legs"))) out.push("base");
  if (calcs.connections.some((c) => c.kind === "Base plate" && c.at.endsWith("legs"))) out.push("portalBase");
  if (kinds.has("Joist hangers")) out.push("hanger");
  if (kinds.has("Timber bearing") || kinds.has("Beam to post")) out.push("postCap");
  if (kinds.has("Wind uplift tie-down")) out.push("tieDown");
  if (res.some((r) => / pad\b/.test(r.summary))) out.push("pad");
  if (res.some((r) => r.summary.includes(" strip "))) out.push("strip");
  return out;
}

export function DetailSheet({ keys }: { keys: DetailKey[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {keys.map((k, n) => (
        <View key={k} style={{ width: "48.5%", borderWidth: 0.6, borderColor: "#d5dbe0", padding: 6 }} wrap={false}>
          <Svg viewBox="0 0 260 155" style={{ width: "100%", height: 150 }}>
            {DETAILS[k].draw()}
          </Svg>
          <View style={{ borderTopWidth: 0.5, borderTopColor: "#d5dbe0", marginTop: 3, paddingTop: 3 }}>
            <PdfText style={{ fontSize: 8.5, fontWeight: 700 }}>
              TD{n + 1} {DETAILS[k].title}
            </PdfText>
            {DETAILS[k].notes.map((t, i) => (
              <PdfText key={i} style={{ fontSize: 7.5, color: "#5b6773", marginTop: 1 }}>
                • {t}
              </PdfText>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
