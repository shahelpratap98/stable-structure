"use client";

import type { ReactNode } from "react";
import { RATINGS } from "@/lib/design/bracing";
import { DRAFT_NOTE, rStar, tribText, type Calcs, type Result } from "@/lib/design/calc";
import { BRACE_NAME, byLabel, describeMember, MEMBER_INFO, memberLength, type DesignModel } from "@/lib/design/model";
import { poleTotals } from "@/lib/design/retaining";
import { FamilyTag, SummaryStrip, UtilPill } from "./panels";

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "–");

function Sheet({ id, title, lede, children }: { id: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3 border border-line bg-surface p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      {lede ? <p className="-mt-1 max-w-[80ch] text-sm text-muted">{lede}</p> : null}
      {children}
    </section>
  );
}

function Table({ head, children, min = 760 }: { head: string[]; children: ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]" style={{ minWidth: min }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border-b-[1.5px] border-ink px-2 py-1.5 font-mono text-[10.5px] font-medium tracking-wide whitespace-nowrap text-muted uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const td = "border-b border-line px-2 py-1.5 align-top";
const num = `${td} text-right font-mono tabular-nums whitespace-nowrap`;

function endR(r: Result | undefined) {
  const e = r?.ends;
  if (!e) return "–";
  const a = rStar(e.a).toFixed(1),
    b = rStar(e.b).toFixed(1);
  return a === b ? `${a} kN` : `${a} / ${b} kN`;
}

export function Sheets({ model, calcs, job, onPick }: { model: DesignModel; calcs: Calcs; job: { title: string; jobNo: string; address: string }; onPick: (id: string) => void }) {
  const levelName = (id: string) => model.levels.find((l) => l.id === id)?.name ?? "";
  const R = (id: string) => calcs.results.get(id);
  const row = (id: string) => ({ onClick: () => onPick(id), className: "cursor-pointer hover:bg-surface-2" });

  const beams = [...model.members.filter((m) => m.type === "beam" || m.type === "lintel" || m.type === "joist" || m.type === "rafter"), ...calcs.lintels.map((l) => l.member)].sort(byLabel);
  const posts = model.members.filter((m) => m.type === "post").sort(byLabel);
  const zones = model.members.filter((m) => m.type === "joistzone").sort(byLabel);
  const walls = model.members.filter((m) => m.type === "wall").sort(byLabel);
  const rws = model.members.filter((m) => m.type === "retaining").sort(byLabel);
  const supports = model.members.filter((m) => m.type === "pile" || m.type === "footing").sort(byLabel);
  const p = model.params;

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
          <div>
            <p className="font-mono text-[11px] tracking-wider text-muted uppercase">{job.address || "Structural framing"}</p>
            <h1 className="text-3xl font-bold">
              {job.jobNo ? `${job.jobNo} · ` : ""}
              {job.title}
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-x-5 font-mono text-[11.5px] text-muted">
            <span>
              Basis<b className="block font-medium text-ink">NZS 3604 / 3603 / AS/NZS 1170</b>
            </span>
            <span>
              Beam order<b className="block font-medium text-ink">SG8 → hySPAN → steel</b>
            </span>
            <span>
              Status<b className="block font-medium text-ink">Preliminary</b>
            </span>
          </div>
        </header>
        <SummaryStrip model={model} calcs={calcs} />
        <nav className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs" aria-label="Sheets">
          {[
            ["s-members", "Member schedule"],
            ["s-joists", "Floor joists"],
            ["s-lintels", "Lintels"],
            ["s-posts", "Posts & foundations"],
            ["s-walls", "Walls"],
            ["s-bracing", "Bracing"],
            ["s-rw", "Retaining walls"],
            ["s-basis", "Basis & assumptions"],
          ].map(([id, l]) => (
            <a key={id} href={`#${id}`} className="text-accent-600 hover:underline">
              {l}
            </a>
          ))}
        </nav>

        <Sheet id="s-members" title="Member schedule" lede="Every beam, lintel, joist and rafter. Click a row to find it on the plan. Automatic sections are the first that pass in the order SG8, hySPAN, then steel.">
          {beams.length ? (
            <Table head={["Mark", "Member", "Location", "Span", "Section", "Gov. check", "Util.", "R* end"]}>
              {beams.map((m) => {
                const r = R(m.id);
                const vl = calcs.lintels.find((l) => l.id === m.id);
                return (
                  <tr key={m.id} {...row(m.id)}>
                    <td className={`${td} font-mono font-bold`}>{m.label}</td>
                    <td className={td}>{m.role || (m.sizing?.mode === "fixed" || m.type === "joist" || m.type === "rafter" ? describeMember(m) : MEMBER_INFO[m.type].label)}</td>
                    <td className={td}>
                      {levelName(m.levelId)}
                      {vl ? ` · ${vl.wall.label}` : ""}
                      {m.trib ? <span className="block text-xs text-muted">{tribText(m.trib)}</span> : null}
                    </td>
                    <td className={num}>{f2(memberLength(m))} m</td>
                    <td className={td}>
                      <FamilyTag fam={r?.sec?.fam} />
                      <span className="block font-mono text-xs">{r?.sec?.name ?? m.section}</span>
                    </td>
                    <td className={td}>{r?.govName ?? "–"}</td>
                    <td className={num}>
                      <UtilPill u={r?.ratio ?? null} />
                    </td>
                    <td className={num}>{endR(r)}</td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <p className="text-sm text-muted">No beams yet.</p>
          )}
        </Sheet>

        <Sheet id="s-joists" title="Floor joists" lede="Joist zones: joists hang off beams on hangers or sit on top plates. Doubled joists go under walls running parallel to them.">
          {zones.length ? (
            <Table head={["Zone", "Level", "Direction", "Span", "Crs", "Section", "Floor G", "Long-term δ", "NZS 3604", "Hanger R*", "Status"]}>
              {zones.map((z) => {
                const r = R(z.id);
                const span = z.b ? (z.zone?.dir === "x" ? Math.abs(z.b.x - z.a.x) : Math.abs(z.b.y - z.a.y)) : 0;
                const dl = r?.kv.find((k) => k.label === "δ long-term")?.value ?? "–";
                const hanger = r?.kv.find((k) => k.label.startsWith("Hanger"))?.value ?? "–";
                return (
                  <tr key={z.id} {...row(z.id)}>
                    <td className={`${td} font-mono font-bold`}>{z.label}</td>
                    <td className={td}>{levelName(z.levelId)}</td>
                    <td className={td}>{z.zone?.dir === "x" ? "E–W" : "N–S"}</td>
                    <td className={num}>{f2(span)} m</td>
                    <td className={num}>{z.zone?.spacing}</td>
                    <td className={`${td} font-mono text-xs`}>
                      {z.section} {z.grade ?? "SG8"}
                    </td>
                    <td className={num}>{z.zone?.wet ? `${p.Gwet} (wet)` : p.Gf} kPa</td>
                    <td className={num}>{dl}</td>
                    <td className={num}>{z.zone?.tableSpan ? `${f2(span)} ≤ ${f2(z.zone.tableSpan)} m` : "–"}</td>
                    <td className={num}>{hanger}</td>
                    <td className={num}>
                      <UtilPill u={r?.ratio ?? null} />
                    </td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <p className="text-sm text-muted">No joist zones yet (tool Z).</p>
          )}
        </Sheet>

        <Sheet id="s-lintels" title="Lintel schedule" lede="Every lintel sits over an opening in a wall; solid walls get no lintel.">
          {calcs.lintels.length || beams.some((b) => b.type === "lintel") ? (
            <Table head={["Mark", "Wall", "Level", "Opening (mm)", "Section", "Util.", "Note"]}>
              {[...calcs.lintels.map((l) => ({ id: l.id, mark: l.opening.label, wall: l.wall.label, level: l.wall.levelId, op: `${Math.round(l.opening.width * 1000)} ${l.opening.sill > 0.05 ? "W" : "D"}`, note: l.opening.note ?? "" })), ...beams.filter((b) => b.type === "lintel" && !b.id.includes("#")).map((b) => ({ id: b.id, mark: b.label, wall: "–", level: b.levelId, op: `${Math.round(memberLength(b) * 1000)}`, note: b.notes ?? "" }))]
                .sort((a, b) => a.mark.localeCompare(b.mark, undefined, { numeric: true }))
                .map((l) => {
                  const r = R(l.id);
                  return (
                    <tr key={l.id} {...row(l.id)}>
                      <td className={`${td} font-mono font-bold`}>{l.mark}</td>
                      <td className={td}>{l.wall}</td>
                      <td className={td}>{levelName(l.level)}</td>
                      <td className={num}>{l.op}</td>
                      <td className={`${td} font-mono text-xs`}>{r?.sec?.name ?? "–"}</td>
                      <td className={num}>
                        <UtilPill u={r?.ratio ?? null} />
                      </td>
                      <td className={td}>{l.note}</td>
                    </tr>
                  );
                })}
            </Table>
          ) : (
            <p className="text-sm text-muted">No lintels yet. Add openings to walls (tool N).</p>
          )}
        </Sheet>

        <Sheet id="s-posts" title="Posts and foundations" lede="Posts sit within walls, so linings and nogs restrain them in the plane of the wall; buckling is about the 90 mm wall depth.">
          {posts.length || supports.length ? (
            <Table head={["Mark", "Level", "Section", "Supports", "Height", "N*", "Util."]}>
              {[...posts, ...supports].map((m) => {
                const r = R(m.id);
                return (
                  <tr key={m.id} {...row(m.id)}>
                    <td className={`${td} font-mono font-bold`}>{m.label}</td>
                    <td className={td}>{levelName(m.levelId)}</td>
                    <td className={`${td} font-mono text-xs`}>{r?.sec?.name ?? describeMember(m)}</td>
                    <td className={td}>{r?.loads.find((l) => l.label === "Carries")?.value ?? "–"}</td>
                    <td className={num}>{r?.kv.find((k) => k.label === "Height")?.value ?? "–"}</td>
                    <td className={num}>{r?.kv.find((k) => k.label.startsWith("N*"))?.value ?? "–"}</td>
                    <td className={num}>
                      <UtilPill u={r?.ratio ?? null} />
                    </td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <p className="text-sm text-muted">No posts yet.</p>
          )}
        </Sheet>

        <Sheet id="s-walls" title="Wall schedule">
          {walls.length ? (
            <Table head={["Mark", "Level", "Type", "Framing", "Length", "Openings"]}>
              {walls.map((w) => (
                <tr key={w.id} {...row(w.id)}>
                  <td className={`${td} font-mono font-bold`}>{w.label}</td>
                  <td className={td}>{levelName(w.levelId)}</td>
                  <td className={td}>
                    {describeMember(w)}
                    {w.wall?.cladding === "brick" ? " · brick veneer" : ""}
                    {w.wall && !w.wall.loadbearing ? " · non-load-bearing" : ""}
                  </td>
                  <td className={td}>{w.wall?.kind === "block" ? "20 series blockwork (specific design)" : `${w.wall?.thickness ?? 90}×45 SG8 studs @ ${w.wall?.studSpacing ?? 600}, nogs @ 800`}</td>
                  <td className={num}>{f2(memberLength(w))} m</td>
                  <td className={`${td} font-mono text-xs`}>
                    {w.wall?.openings.length
                      ? [...w.wall.openings]
                          .sort((a, b) => a.offset - b.offset)
                          .map((o) => `${o.label} ${Math.round(o.width * 1000)}${o.sill > 0.05 ? "W" : "D"}`)
                          .join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-sm text-muted">No walls yet (tool W).</p>
          )}
        </Sheet>

        <Sheet
          id="s-bracing"
          title="Bracing design — NZS 3604:2011 Section 5 with GIB EzyBrace® 2016"
          lede="Ratings from the GIB EzyBrace® Systems 2016 BU/m table, interpolated between the 0.4 m and 1.2 m values and multiplied by 2.4 / stud height; capped at 120 BU/m on timber floors and 150 BU/m on slab. Line minimum = greater of 100 BU, 50% of demand ÷ number of lines and 15 BU/m of external wall."
        >
          {calcs.bracing.length ? (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {calcs.bracing.map((s) => {
                  const pW = s.demandW ? Math.round((s.totW / s.demandW) * 100) : null;
                  const pE = s.demandE ? Math.round((s.totE / s.demandE) * 100) : null;
                  const linesOk = s.lines.every((l) => l.okW && l.okE);
                  const pct = pW === null && pE === null ? null : Math.min(pW ?? Infinity, pE ?? Infinity);
                  return (
                    <div key={`${s.level.id}${s.dir}`} className="border border-line px-3 py-2">
                      <p className="font-mono text-[11px] font-semibold tracking-wide text-muted uppercase">
                        {s.level.name} · {s.dir}
                      </p>
                      <p className={`font-mono text-2xl font-semibold ${s.okTotal && linesOk ? "text-ok" : "text-bad"}`}>{pct === null ? "no demand" : `${pct}%`}</p>
                      <p className="font-mono text-[11px] text-muted">
                        W {s.totW}/{s.demandW} · EQ {s.totE}/{s.demandE} · {linesOk ? "all lines OK" : "line check fails"} · demand {s.source === "site" ? "from site data" : s.source === "entered" ? "entered" : "not set"}
                      </p>
                      {s.notes.map((n) => (
                        <p key={n} className="mt-1 text-[11px] text-warn">
                          {n}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
              {calcs.bracing.map((s) => (
                <div key={`${s.level.id}-${s.dir}`}>
                  <h3 className="mt-2 mb-1 text-sm font-bold tracking-wide text-muted uppercase">
                    {s.level.name} — {s.dir === "along" ? "Along (E–W lines)" : "Across (N–S lines)"}
                  </h3>
                  <Table head={["Line", "Element", "Length", "Stud ht", "Type", "Wind BU", "EQ BU"]} min={640}>
                    <tr className="font-semibold">
                      <td className={td} colSpan={5}>
                        Demand → achieved
                      </td>
                      <td className={`${num} ${s.totW >= s.demandW ? "text-ok" : "text-bad"}`}>
                        {s.demandW} → {s.totW}
                      </td>
                      <td className={`${num} ${s.totE >= s.demandE ? "text-ok" : "text-bad"}`}>
                        {s.demandE} → {s.totE}
                      </td>
                    </tr>
                    {s.lines.map((l) => (
                      <LineRows key={l.id} l={l} levelHeight={s.level.height} onPick={onPick} />
                    ))}
                  </Table>
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted">No bracing elements yet (tool G). Enter each level&apos;s demand under Design loads.</p>
          )}
        </Sheet>

        <Sheet id="s-rw" title="Retaining wall schedule" lede="Timber walls: cantilever H5 round poles from stock sizes, in concrete holes, H4 rails on the retained face, drainage behind. Each pole takes the band for its own height. Typical designs on assumed soil (φ' 30°, drained, 2.5–5 kPa surcharge): confirm with a geotech report. Block walls: 20 series reinforced masonry to NZS 4230.">
          {rws.length ? (
            <>
              <p className="font-mono text-xs text-muted">
                Pole totals:{" "}
                {poleTotals(calcs, model.members)
                  .map(([k, n]) => `${n} × ${k}`)
                  .join(" · ") || "—"}
              </p>
              <Table head={["Mark", "Level", "Height", "Length", "Construction", "Util."]}>
                {rws.map((w) => {
                  const r = R(w.id);
                  return (
                    <tr key={w.id} {...row(w.id)}>
                      <td className={`${td} font-mono font-bold`}>{w.label}</td>
                      <td className={td}>{levelName(w.levelId)}</td>
                      <td className={num}>{w.rw ? (w.rw.h0 === w.rw.h1 ? `${f2(w.rw.h0)} m` : `${f2(Math.min(w.rw.h0, w.rw.h1))}–${f2(Math.max(w.rw.h0, w.rw.h1))} m`) : "–"}</td>
                      <td className={num}>{f2(memberLength(w))} m</td>
                      <td className={`${td} text-xs`}>
                        {r?.kv
                          .filter((k) => /^B\d|Construction/.test(k.label))
                          .map((k) => (
                            <span key={k.label} className="block">
                              <b>{k.label}</b> {k.value}
                            </span>
                          ))}
                      </td>
                      <td className={num}>
                        <UtilPill u={r?.ratio ?? null} />
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </>
          ) : (
            <p className="text-sm text-muted">No retaining walls yet (tool T).</p>
          )}
        </Sheet>

        <Sheet
          id="s-connections"
          title="Connection schedule"
          lede="Steel ends and base plates to AS 4100 ch 9 (bolts φ 0.8, ply bearing φ 0.9, SP fillet welds φ 0.8) and NZS 3101 bearing; timber bearing to NZS 3603. Proprietary connectors are listed with the force they must be rated for."
        >
          {calcs.connections.length ? (
            <Table head={["Where", "Connection", "Design force", "Detail", ""]}>
              {calcs.connections.map((c, i) => (
                <tr key={i}>
                  <td className={`${td} font-mono font-semibold`}>{c.at}</td>
                  <td className={td}>{c.kind}</td>
                  <td className={num}>
                    {c.demand.toFixed(1)} {c.unit}
                  </td>
                  <td className={td}>{c.detail}</td>
                  <td className={`${td} font-semibold ${c.ok ? "text-ok" : "text-bad"}`}>{c.ok ? "OK" : "Check"}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-sm text-muted">No connections yet: they come from the beams, posts and joist zones.</p>
          )}
        </Sheet>

        <Sheet id="s-basis" title="Basis and assumptions">
          <p className="max-w-[95ch] border-l-[3px] border-warn bg-warn-bg px-3.5 py-2.5 text-sm">
            <b className="text-warn">Preliminary design.</b> {DRAFT_NOTE.replace(/^Preliminary design\.\s*/, "")}
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <h3 className="mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">Gravity loads</h3>
              <ul className="list-disc space-y-1 pl-4 font-mono text-[12.5px]">
                <li>Floor G {p.Gf} kPa, wet areas {p.Gwet} kPa</li>
                <li>Floor Q {p.Qf} kPa (AS/NZS 1170.1)</li>
                <li>Roof G {p.Groof} kPa on plan, Q {p.Qroof} kPa{p.Su ? `, Su ${p.Su} kPa` : ""}</li>
                <li>
                  Walls above: external {p.gWallExt} kPa, internal {p.gWallInt} kPa × {p.wallHeight} m
                </li>
                {p.Ppt > 0 ? (
                  <li>
                    {p.Ppt} kN imposed point load at midspan of every beam and lintel, δ ≤ {p.dPlim} mm
                  </li>
                ) : null}
              </ul>
            </div>
            <div>
              <h3 className="mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">Materials &amp; limits</h3>
              <ul className="list-disc space-y-1 pl-4 font-mono text-[12.5px]">
                <li>SG8 dry: fb 14, fs 3.8, fc 18, fp 8.9 MPa, E 8.0 GPa, φ 0.8</li>
                <li>hySPAN: fb 48, fs 5.3 MPa, E 13.2 GPa, φ 0.9</li>
                <li>Steel PFC / UB fy 300, φ 0.9, top flange restrained by joists</li>
                <li>
                  Combos 1.35G; 1.2G+1.5Q; 1.2G+1.5Qr+0.4Q (k1 {p.k1Roof}); 1.2G+Su+0.4Q
                </li>
                <li>Long-term k2(G+0.4Q) ≤ span/300 and {p.dAbs} mm; short-term 0.7Q ≤ span/360</li>
                <li>Posts: SG8 stud packs then 89×89×5 SHS, k12 to NZS 3603 with ρc ≈ 1.05</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">Still to do by the engineer</h3>
              <ul className="list-disc space-y-1 pl-4 text-[13px]">
                <li>Joist hangers and beam-to-post connections to the R* shown</li>
                <li>Foundation pads under posts carrying beams</li>
                <li>Bracing demand from NZS 3604 Tables 5.6–5.10, diaphragms and hold-downs</li>
                <li>Retaining walls: specific design with a geotech report</li>
                <li>Point loads from members bearing on other beams (not yet included)</li>
              </ul>
            </div>
          </div>
          <div>
            <h3 className="mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">Assumptions to confirm before issue</h3>
            {model.notes.length ? (
              <div className="grid gap-x-7 gap-y-2.5 md:grid-cols-2">
                {model.notes.map((n, i) => (
                  <p key={i} className="m-0 border-l-[3px] border-warn py-0.5 pl-3 text-sm">
                    {n}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">None recorded. Add them under Design loads → Assumptions to confirm.</p>
            )}
          </div>
        </Sheet>
      </div>
    </div>
  );
}

function LineRows({ l, levelHeight, onPick }: { l: Calcs["bracing"][number]["lines"][number]; levelHeight: number; onPick: (id: string) => void }) {
  return (
    <>
      {l.els.map((e, i) => (
        <tr key={e.memberId} onClick={() => onPick(e.memberId)} className="cursor-pointer hover:bg-surface-2">
          <td className={`${num} text-left`}>{i === 0 ? <b>{l.id}</b> : ""}</td>
          <td className={num}>{e.mark}</td>
          <td className={num}>{e.L.toFixed(2)}</td>
          <td className={num}>{levelHeight.toFixed(2)}</td>
          <td className={td}>
            <span className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white" style={{ background: RATINGS[e.system].colour }}>
              {BRACE_NAME[e.system]}
            </span>
          </td>
          <td className={num}>{e.W}</td>
          <td className={num}>{e.E}</td>
        </tr>
      ))}
      <tr className="font-semibold">
        <td className={td} />
        <td className={`${num} text-left`} colSpan={4}>
          {l.extLen ? `External wall ${l.extLen.toFixed(2)} m · ` : ""}line min W {l.minW} / EQ {l.minE}
        </td>
        <td className={`${num} ${l.okW ? "text-ok" : "text-bad"}`}>
          {l.sumW} {l.okW ? "OK" : "NG"}
        </td>
        <td className={`${num} ${l.okE ? "text-ok" : "text-bad"}`}>
          {l.sumE} {l.okE ? "OK" : "NG"}
        </td>
      </tr>
    </>
  );
}

