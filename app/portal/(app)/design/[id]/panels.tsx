"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { Spinner } from "@/components/spinner";
import { BRACE_SYSTEMS, RATINGS } from "@/lib/design/bracing";
import { autoTrib, DRAFT_NOTE, STATUS_COLOUR, STATUS_LABEL, tribText, type Calcs, type Result, type VirtualLintel } from "@/lib/design/calc";
import { DEFAULT_SITE, demandFromSite, quakeBasis, TOWNS, WIND_NOTE, windBasis, type SiteData } from "@/lib/design/site";
import { ALL_FAMILIES, DEFAULT_FAMILIES, FAMILY_COLOUR, FAMILY_LABEL, MORE_FAMILIES, SG8_DEPTHS, STEEL } from "@/lib/design/materials";
import {
  BRACE_NAME,
  byLabel,
  DEFAULT_PARAMS,
  describeMember,
  formatLength,
  MEMBER_INFO,
  memberLength,
  type BraceSystem,
  type DesignModel,
  type DesignParams,
  type Family,
  type Level,
  type Material,
  type Member,
  type MemberType,
  type Opening,
  type Sizing,
  type TimberGrade,
  type Trib,
  type WallSpec,
  type ZoneSpec,
} from "@/lib/design/model";
import { deleteDesignJob, listRevisions, updateJobDetails } from "../actions";

export type PlanFile = { id: string; fileName: string; pageCount: number; url: string };

// ---------------------------------------------------------------- fields

// Text and number inputs commit on blur or Enter, so typing a value is one
// undo step and one save, not one per keystroke.
function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // the model changed underneath (undo, another member selected)
    setSeen(value);
    setDraft(value);
  }
  return [draft, setDraft] as const;
}

export function TextField({ label, value, onCommit, list, placeholder, wide }: { label: string; value: string; onCommit: (v: string) => void; list?: string; placeholder?: string; wide?: boolean }) {
  const [draft, setDraft] = useDraft(value);
  const commit = () => draft.trim() !== value && onCommit(draft.trim());
  return (
    <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      <input
        className="field py-1.5 text-sm"
        value={draft}
        list={list}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
    </label>
  );
}

export function NumberField({ label, value, onCommit, unit, min, placeholder }: { label: string; value: number | undefined; onCommit: (v: number | undefined) => void; unit?: string; min?: number; placeholder?: string }) {
  const [draft, setDraft] = useDraft(value === undefined ? "" : String(value));
  const commit = () => {
    if (draft.trim() === "") return value !== undefined && onCommit(undefined);
    const n = Number(draft);
    if (!Number.isFinite(n) || (min !== undefined && n < min)) return setDraft(value === undefined ? "" : String(value));
    if (n !== value) onCommit(n);
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">
        {label}
        {unit ? <span className="font-normal"> ({unit})</span> : null}
      </span>
      <input
        className="field py-1.5 text-sm tabular-nums"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange, wide }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      <select className="field py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide text-muted uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StatusDot({ status }: { status: Result["status"] }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOUR[status] }} aria-hidden />;
}

export const utilTone = (u: number) => (u > 1 ? STATUS_COLOUR.fail : u > 0.9 ? STATUS_COLOUR.close : STATUS_COLOUR.pass);

export function UtilPill({ u }: { u: number | null }) {
  if (u === null) return <span className="text-muted">–</span>;
  const tone = u > 1 ? "bg-bad-bg text-bad" : u > 0.9 ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok";
  return <span className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] ${tone}`}>{u.toFixed(2)}</span>;
}

export function FamilyTag({ fam }: { fam?: string }) {
  if (!fam || !(fam in FAMILY_LABEL)) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-muted uppercase">
      <i className="inline-block h-2.5 w-2.5" style={{ background: FAMILY_COLOUR[fam as keyof typeof FAMILY_COLOUR] }} />
      {FAMILY_LABEL[fam as keyof typeof FAMILY_LABEL]}
    </span>
  );
}

const SECTION_SUGGESTIONS = [...SG8_DEPTHS.flatMap((d) => [`${d}x45`, `2/${d}x45`, `3/${d}x45`]), "90x90", "125x125", ...STEEL.map((s) => s.name)];

const LINE_TYPES = (Object.keys(MEMBER_INFO) as MemberType[]).filter((t) => MEMBER_INFO[t].line && !MEMBER_INFO[t].area && t !== "wall" && t !== "retaining" && t !== "bracing");
const POINT_TYPES = (Object.keys(MEMBER_INFO) as MemberType[]).filter((t) => !MEMBER_INFO[t].line);

// ---------------------------------------------------------------- loads and sizing editors

function TribEditor({ trib, onChange, locked }: { trib: Trib | undefined; onChange: (t: Trib) => void; locked: boolean }) {
  const t = trib ?? {};
  const set = (k: keyof Trib, v: number | undefined) => onChange({ ...t, [k]: v });
  return (
    <fieldset disabled={locked} className="grid grid-cols-2 gap-2.5">
      <NumberField label="Floor width" unit="m" value={t.floor} min={0} onCommit={(v) => set("floor", v)} />
      <NumberField label="Wet area width" unit="m" value={t.wet} min={0} onCommit={(v) => set("wet", v)} />
      <NumberField label="Roof width (plan)" unit="m" value={t.roof} min={0} onCommit={(v) => set("roof", v)} />
      <span />
      <NumberField label="Ext. walls above" unit="no." value={t.wallExt} min={0} onCommit={(v) => set("wallExt", v)} />
      <NumberField label="Int. walls above" unit="no." value={t.wallInt} min={0} onCommit={(v) => set("wallInt", v)} />
      <NumberField label="Block walls above" unit="no." value={t.wallBlock} min={0} onCommit={(v) => set("wallBlock", v)} />
    </fieldset>
  );
}

function SizingEditor({ sizing, onChange, locked, fixedSection }: { sizing: Sizing; onChange: (s: Sizing) => void; locked: boolean; fixedSection?: ReactNode }) {
  const fams = sizing.families?.length ? sizing.families : DEFAULT_FAMILIES;
  const toggle = (f: Family, on: boolean) => {
    const next = ALL_FAMILIES.filter((x) => (x === f ? on : fams.includes(x)));
    onChange({ ...sizing, families: next.length ? next : fams });
  };
  return (
    <fieldset disabled={locked} className="flex flex-col gap-2.5">
      <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
        {(["auto", "fixed"] as const).map((m) => (
          <button key={m} type="button" onClick={() => onChange({ ...sizing, mode: m })} className={`flex-1 rounded-md px-2 py-1 ${sizing.mode === m ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>
            {m === "auto" ? "Pick the section" : "Fixed section"}
          </button>
        ))}
      </div>
      {sizing.mode === "auto" ? (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {DEFAULT_FAMILIES.map((f) => (
              <Check key={f} label={FAMILY_LABEL[f]} checked={fams.includes(f)} onChange={(v) => toggle(f, v)} />
            ))}
          </div>
          <details className="text-xs" open={MORE_FAMILIES.some((f) => fams.includes(f))}>
            <summary className="cursor-pointer font-semibold text-muted">More materials</summary>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {MORE_FAMILIES.map((f) => (
                <Check key={f} label={FAMILY_LABEL[f]} checked={fams.includes(f)} onChange={(v) => toggle(f, v)} />
              ))}
            </div>
          </details>
          <div className="grid grid-cols-2 gap-2.5">
            <NumberField label="Min depth" unit="mm" value={sizing.minD} min={0} onCommit={(v) => onChange({ ...sizing, minD: v })} />
            <NumberField label="Max depth" unit="mm" value={sizing.maxD} min={0} onCommit={(v) => onChange({ ...sizing, maxD: v })} />
            <NumberField label="Max width" unit="mm" value={sizing.maxB} min={0} onCommit={(v) => onChange({ ...sizing, maxB: v })} />
            <NumberField label="Deflection cap" unit="mm" value={sizing.dlim} min={0} placeholder="job default" onCommit={(v) => onChange({ ...sizing, dlim: v })} />
          </div>
          <p className="text-xs text-muted">Tries each family in order and uses the first section that passes, like the SG8 → hySPAN → PFC order in the Lot 6 model.</p>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {fixedSection}
          <NumberField label="Deflection cap" unit="mm" value={sizing.dlim} min={0} placeholder="job default" onCommit={(v) => onChange({ ...sizing, dlim: v })} />
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------- member

const BEAM_LIKE: MemberType[] = ["beam", "lintel", "joist", "rafter"];

export function MemberPanel({
  model,
  member,
  result,
  locked,
  onChange,
  onDuplicate,
  onDelete,
}: {
  model: DesignModel;
  member: Member;
  result: Result | undefined;
  locked: boolean;
  onChange: (patch: Partial<Member>, summary: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const m = member;
  const beamLike = BEAM_LIKE.includes(m.type);
  const single = m.type === "joist" || m.type === "rafter";
  const set = (patch: Partial<Member>, what: string) => onChange(patch, `${m.label}: ${what}`);
  const sizing: Sizing = m.sizing ?? { mode: single ? "fixed" : "auto" };

  const sectionField = (
    <TextField
      label={m.type === "footing" ? "Size W x L x D (mm)" : m.type === "pile" ? "Pile diameter (mm)" : "Section"}
      value={m.section}
      list="design-sections"
      onCommit={(v) => v && set({ section: v }, `section ${v}`)}
    />
  );
  const materialFields = (
    <>
      <Select<Material>
        label="Material"
        value={m.material}
        options={[
          { value: "timber", label: "Timber" },
          { value: "steel", label: "Steel" },
        ]}
        onChange={(v) => set({ material: v, ...(v === "steel" ? { section: "250PFC" } : { section: "2/240x45", grade: "SG8" }) }, `material ${v}`)}
      />
      {m.material === "timber" ? (
        <Select<TimberGrade>
          label="Grade"
          value={m.grade ?? "SG8"}
          options={[
            { value: "SG8", label: "SG8 sawn" },
            { value: "SG10", label: "SG10 sawn" },
            { value: "GL8", label: "GL8 glulam" },
            { value: "GL10", label: "GL10 glulam" },
            { value: "GL12", label: "GL12 glulam" },
            { value: "hySPAN", label: "hySPAN LVL" },
            { value: "hyONE", label: "hyONE LVL" },
            { value: "hy90", label: "hy90 LVL" },
            { value: "LVL11", label: "NelsonPine LVL11" },
          ]}
          onChange={(v) => set({ grade: v }, `grade ${v}`)}
        />
      ) : (
        <span />
      )}
    </>
  );

  return (
    <div>
      <Section
        title={MEMBER_INFO[m.type].label}
        aside={
          <div className="flex gap-1.5">
            <button type="button" className="btn btn-quiet px-2 py-1 text-xs" onClick={onDuplicate} disabled={locked} title="Duplicate (Ctrl+D)">
              Duplicate
            </button>
            <button type="button" className="btn btn-quiet px-2 py-1 text-xs text-bad" onClick={onDelete} disabled={locked} title="Delete (Del)">
              Delete
            </button>
          </div>
        }
      >
        <fieldset disabled={locked} className="grid grid-cols-2 gap-2.5">
          <TextField label="Mark" value={m.label} onCommit={(v) => v && set({ label: v }, `renamed to ${v}`)} />
          {MEMBER_INFO[m.type].line && LINE_TYPES.includes(m.type) ? (
            <Select label="Type" value={m.type} options={LINE_TYPES.map((t) => ({ value: t, label: MEMBER_INFO[t].label }))} onChange={(t) => set({ type: t }, `changed to ${MEMBER_INFO[t].label.toLowerCase()}`)} />
          ) : !MEMBER_INFO[m.type].line ? (
            <Select label="Type" value={m.type} options={POINT_TYPES.map((t) => ({ value: t, label: MEMBER_INFO[t].label }))} onChange={(t) => set({ type: t }, `changed to ${MEMBER_INFO[t].label.toLowerCase()}`)} />
          ) : (
            <span />
          )}
          <Select label="Level" value={m.levelId} options={model.levels.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => set({ levelId: v }, "moved level")} />
          {beamLike || m.type === "post" ? <TextField label="Role" value={m.role ?? ""} placeholder="e.g. Flush floor beam" onCommit={(v) => set({ role: v || undefined }, "role")} /> : <span />}
          {m.type === "beam" || m.type === "joist" || m.type === "rafter" ? (
            <Select
              label="Supports"
              value={m.free ?? "both"}
              options={[
                { value: "both", label: "Both ends (+ any posts under it)" },
                { value: "b", label: "End 2 free (cantilever)" },
                { value: "a", label: "End 1 free (cantilever)" },
              ]}
              onChange={(v) => set({ free: v === "both" ? undefined : v }, v === "both" ? "supported both ends" : `end ${v === "a" ? 1 : 2} free`)}
            />
          ) : null}
          {m.type === "beam" || m.type === "lintel" ? (
            <Select
              label="Steel: lateral restraint"
              value={m.restraint ?? "full"}
              options={[
                { value: "full", label: "Top flange held by joists" },
                { value: "ends", label: "At supports only" },
              ]}
              onChange={(v) => set({ restraint: v === "full" ? undefined : v }, v === "full" ? "fully restrained" : "restrained at supports")}
            />
          ) : null}
          {(m.type === "beam" || m.type === "lintel") && m.restraint === "ends" ? (
            <NumberField label="Restraints at" unit="m" value={m.segment} min={0.3} placeholder="supports only" onCommit={(v) => set({ segment: v }, `restraint spacing ${v ?? "supports"}`)} />
          ) : null}
          {m.type === "joist" || m.type === "rafter" ? <NumberField label="Spacing" unit="mm" value={m.spacing} min={100} onCommit={(v) => set({ spacing: v }, `spacing ${v ?? "default"}`)} /> : null}
          {m.type === "post" ? <NumberField label="Height" unit="m" value={m.height} min={0.1} placeholder="storey height" onCommit={(v) => set({ height: v }, "height")} /> : null}
          {m.type === "post" ? <NumberField label="Lateral at top (ULS)" unit="kN" value={m.lateral} min={0} placeholder="none" onCommit={(v) => set({ lateral: v || undefined }, v ? `cantilever post, ${v} kN at the top` : "no lateral load")} /> : null}
          {m.type !== "joistzone" ? <NumberField label="Height offset" unit="m" value={m.dz} placeholder="on the level" onCommit={(v) => set({ dz: v || undefined }, `height offset ${v ?? 0} m`)} /> : null}
          {m.type === "footing" || m.type === "pile" ? sectionField : null}
        </fieldset>
        <datalist id="design-sections">
          {SECTION_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="mt-2.5 text-xs text-muted tabular-nums">
          {m.b && m.type !== "joistzone" ? `Length ${formatLength(memberLength(m))} · ` : ""}
          {m.b ? `(${m.a.x.toFixed(2)}, ${m.a.y.toFixed(2)}) → (${m.b.x.toFixed(2)}, ${m.b.y.toFixed(2)}) m` : `At (${m.a.x.toFixed(2)}, ${m.a.y.toFixed(2)}) m`}
        </p>
      </Section>

      {beamLike ? (
        <>
          <Section title="Section">
            <SizingEditor
              sizing={sizing}
              locked={locked}
              onChange={(s) => set({ sizing: s }, s.mode === "auto" ? "automatic sizing" : "fixed section")}
              fixedSection={
                <>
                  {materialFields}
                  {sectionField}
                </>
              }
            />
          </Section>
          <Section title="What it carries">
            {single ? (
              <p className="mb-2 text-xs text-muted">Leave blank to use the member spacing on the {loadSurface(model, m)}.</p>
            ) : (
              <AutoTribHint model={model} m={m} surface={loadSurface(model, m)} />
            )}
            <TribEditor trib={m.trib} locked={locked} onChange={(t) => set({ trib: t }, `loads ${tribText(t) || "default"}`)} />
            <fieldset disabled={locked} className="mt-2.5 grid grid-cols-2 gap-2.5">
              <NumberField label="Extra G" unit="kN/m" value={m.extraG} min={0} onCommit={(v) => set({ extraG: v }, "extra G load")} />
              <NumberField label="Extra Q" unit="kN/m" value={m.extraQ} min={0} onCommit={(v) => set({ extraQ: v }, "extra Q load")} />
            </fieldset>
          </Section>
        </>
      ) : null}

      {m.type === "post" ? (
        <Section title="Section">
          <SizingEditor
            sizing={m.sizing ?? { mode: "auto" }}
            locked={locked}
            onChange={(s) => set({ sizing: s }, s.mode === "auto" ? "automatic sizing" : "fixed section")}
            fixedSection={
              <>
                {materialFields}
                {sectionField}
              </>
            }
          />
          <p className="mt-2 text-xs text-muted">Automatic tries 2, 3 and 4 × 90×45 SG8 stud packs, then 89×89×5 SHS.</p>
        </Section>
      ) : null}

      {m.type === "joistzone" && m.zone ? <ZoneEditor m={m} locked={locked} set={set} materialFields={materialFields} sectionField={sectionField} /> : null}
      {m.type === "wall" && m.wall ? <WallEditor m={m} locked={locked} set={set} /> : null}
      {m.type === "bracing" ? (
        <Section title="Bracing element">
          <fieldset disabled={locked} className="grid grid-cols-2 gap-2.5">
            <Select<BraceSystem> label="GIB system" value={m.brace?.system ?? "GS2N"} options={BRACE_SYSTEMS.map((s) => ({ value: s, label: BRACE_NAME[s] }))} onChange={(v) => set({ brace: { ...m.brace, system: v } }, `bracing ${BRACE_NAME[v]}`)} />
            <TextField label="Line" value={m.brace?.line ?? ""} placeholder="auto" onCommit={(v) => set({ brace: { ...m.brace, system: m.brace?.system ?? "GS2N", line: v || undefined } }, `bracing line ${v || "auto"}`)} />
            {RATINGS[m.brace?.system ?? "GS2N"].sed ? (
              <NumberField
                label="Rated at"
                unit="BU"
                value={m.brace?.bu}
                min={0}
                placeholder={String(RATINGS[m.brace?.system ?? "GS2N"].fixed ?? 150)}
                onCommit={(v) => set({ brace: { ...m.brace, system: m.brace?.system ?? "GS2N", bu: v } }, `bracing rated ${v ?? "default"} BU`)}
              />
            ) : null}
            {m.brace?.system === "PORTAL" ? (
              <Select
                label="Portal bases"
                value={m.brace?.base ?? "fixed"}
                options={[
                  { value: "fixed", label: "Fixed (moment base plates)" },
                  { value: "pinned", label: "Pinned" },
                ]}
                onChange={(v) => set({ brace: { ...m.brace, system: "PORTAL", base: v } }, `portal ${v} bases`)}
              />
            ) : null}
          </fieldset>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted">
            <i className="inline-block h-2.5 w-4" style={{ background: RATINGS[m.brace?.system ?? "GS2N"].colour }} />
            Elements in a line within 0.6 m share a line unless you name one.
          </p>
        </Section>
      ) : null}
      {m.type === "retaining" && m.rw ? (
        <Section title="Retaining wall">
          <fieldset disabled={locked} className="grid grid-cols-2 gap-2.5">
            <Select
              label="Construction"
              value={m.rw.kind}
              wide
              options={[
                { value: "pole", label: "Timber poles (H5) with H4 rails" },
                { value: "block", label: "20 series block, reinforced" },
              ]}
              onChange={(v) => set({ rw: { ...m.rw!, kind: v } }, `retaining ${v}`)}
            />
            <NumberField label="Retained height, start" unit="m" value={m.rw.h0} min={0} onCommit={(v) => v !== undefined && set({ rw: { ...m.rw!, h0: v } }, "retained height")} />
            <NumberField label="Retained height, end" unit="m" value={m.rw.h1} min={0} onCommit={(v) => v !== undefined && set({ rw: { ...m.rw!, h1: v } }, "retained height")} />
          </fieldset>
        </Section>
      ) : null}

      <Section title="Notes">
        <fieldset disabled={locked}>
          <TextField label="" value={m.notes ?? ""} onCommit={(v) => set({ notes: v || undefined }, "notes")} />
        </fieldset>
      </Section>

      {result ? <CalcSheet result={result} /> : null}
    </div>
  );
}

// What the beam will carry if nothing is typed in: read off the drawing.
function AutoTribHint({ model, m, surface }: { model: DesignModel; m: Member; surface: string }) {
  const typed = m.trib && Object.values(m.trib).some((v) => v);
  const a = typed ? null : autoTrib(model, m);
  return (
    <p className="mb-2 text-xs text-muted">
      Loaded widths each side added together.{" "}
      {typed ? (
        "Clear them to read the loads off the drawing instead."
      ) : a ? (
        <>
          Blank, so taken from the drawing: <span className="font-semibold text-ink">{tribText(a.trib)}</span> ({a.from.join(", ")}){a.partial ? ", part-length loads averaged" : ""}.
        </>
      ) : (
        <>Blank, and no joist zones or walls above found on it, so 1 m of {surface} is assumed.</>
      )}
    </p>
  );
}

function loadSurface(model: DesignModel, m: Member) {
  const level = model.levels.find((l) => l.id === m.levelId);
  if (!level) return "floor";
  const above = [...model.levels].filter((l) => l.elevation > level.elevation + 1e-6).sort((a, b) => a.elevation - b.elevation)[0];
  return level.kind === "roof" || above?.kind === "roof" ? "roof" : "floor";
}

function ZoneEditor({ m, locked, set, materialFields, sectionField }: { m: Member; locked: boolean; set: (p: Partial<Member>, w: string) => void; materialFields: ReactNode; sectionField: ReactNode }) {
  const z = m.zone!;
  const upd = (p: Partial<ZoneSpec>, w: string) => set({ zone: { ...z, ...p } }, w);
  const [dbl, setDbl] = useState(z.doubled.map((d) => d.toFixed(3)).join(", "));
  return (
    <Section title="Joists">
      <fieldset disabled={locked} className="grid grid-cols-2 gap-2.5">
        {materialFields}
        {sectionField}
        <NumberField label="Spacing" unit="mm" value={z.spacing} min={100} onCommit={(v) => v && upd({ spacing: v }, `spacing ${v}`)} />
        <Select
          label="Joists span"
          value={z.dir}
          options={[
            { value: "y", label: "North–south (↕)" },
            { value: "x", label: "East–west (↔)" },
          ]}
          onChange={(v) => upd({ dir: v }, `span ${v === "x" ? "E–W" : "N–S"}`)}
        />
        <NumberField label="NZS 3604 table span" unit="m" value={z.tableSpan} min={0} placeholder="none" onCommit={(v) => upd({ tableSpan: v }, "table span")} />
        <div className="col-span-2">
          <Check label="Wet area (tiled floor load)" checked={z.wet} onChange={(v) => upd({ wet: v }, v ? "wet area" : "not wet")} />
        </div>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Doubled joists under walls (plan {z.dir === "y" ? "x" : "y"}, m)</span>
          <input
            className="field py-1.5 text-sm tabular-nums"
            value={dbl}
            placeholder="e.g. 3.335, 4.025"
            onChange={(e) => setDbl(e.target.value)}
            onBlur={() => {
              const vals = dbl
                .split(/[,\s]+/)
                .map(Number)
                .filter((n) => Number.isFinite(n));
              upd({ doubled: vals }, "doubled joists");
            }}
          />
        </label>
      </fieldset>
    </Section>
  );
}

function WallEditor({ m, locked, set }: { m: Member; locked: boolean; set: (p: Partial<Member>, w: string) => void }) {
  const w = m.wall!;
  const upd = (p: Partial<WallSpec>, what: string) => set({ wall: { ...w, ...p } }, what);
  return (
    <Section title="Wall">
      <fieldset disabled={locked} className="grid grid-cols-2 gap-2.5">
        <Select
          label="Kind"
          value={w.kind}
          options={[
            { value: "ext", label: "External, framed" },
            { value: "int", label: "Internal, framed" },
            { value: "block", label: "Block (20 series)" },
          ]}
          onChange={(v) => upd({ kind: v, ...(v === "block" ? { thickness: 190 } : {}) }, `wall ${v}`)}
        />
        <Select
          label="Thickness"
          value={String(w.thickness) as "90" | "140" | "190"}
          options={[
            { value: "90", label: "90 mm" },
            { value: "140", label: "140 mm" },
            { value: "190", label: "190 mm" },
          ]}
          onChange={(v) => upd({ thickness: Number(v) }, `wall ${v} thick`)}
        />
        <Select
          label="Cladding"
          value={w.cladding}
          options={[
            { value: "light", label: "Lightweight" },
            { value: "brick", label: "Brick veneer" },
          ]}
          onChange={(v) => upd({ cladding: v }, `cladding ${v}`)}
        />
        <NumberField label="Stud spacing" unit="mm" value={w.studSpacing} min={200} onCommit={(v) => v && upd({ studSpacing: v }, `studs @ ${v}`)} />
        <div className="col-span-2">
          <Check label="Load-bearing" checked={w.loadbearing} onChange={(v) => upd({ loadbearing: v }, v ? "load-bearing" : "non-load-bearing")} />
        </div>
      </fieldset>
      <h4 className="mt-3 mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Openings</h4>
      {w.openings.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {[...w.openings]
            .sort((a, b) => a.offset - b.offset)
            .map((o) => (
              <li key={o.id} className="flex justify-between gap-2 tabular-nums">
                <span className="font-semibold">{o.label}</span>
                <span className="text-muted">
                  {o.sill > 0.05 ? "window" : "door"} {Math.round(o.width * 1000)} at {o.offset.toFixed(2)} m
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">None yet. Use the Opening tool (N) and click both sides of a door or window on this wall; each opening makes its own lintel.</p>
      )}
    </Section>
  );
}

// An opening and the lintel over it.
export function OpeningPanel({
  lintel,
  result,
  locked,
  onChange,
  onDelete,
  onSelectWall,
}: {
  lintel: VirtualLintel;
  result: Result | undefined;
  locked: boolean;
  onChange: (patch: Partial<Opening>, summary: string) => void;
  onDelete: () => void;
  onSelectWall: () => void;
}) {
  const o = lintel.opening;
  const set = (p: Partial<Opening>, w: string) => onChange(p, `${o.label}: ${w}`);
  const wallLen = memberLength(lintel.wall);
  return (
    <div>
      <Section
        title={`Opening in ${lintel.wall.label}`}
        aside={
          <div className="flex gap-1.5">
            <button type="button" className="btn btn-quiet px-2 py-1 text-xs" onClick={onSelectWall}>
              Wall
            </button>
            <button type="button" className="btn btn-quiet px-2 py-1 text-xs text-bad" onClick={onDelete} disabled={locked}>
              Delete
            </button>
          </div>
        }
      >
        <fieldset disabled={locked} className="grid grid-cols-2 gap-2.5">
          <TextField label="Lintel mark" value={o.label} onCommit={(v) => v && set({ label: v }, `renamed to ${v}`)} />
          <NumberField label="Clear width" unit="m" value={o.width} min={0.1} onCommit={(v) => v && set({ width: Math.min(v, wallLen - o.offset) }, `width ${v} m`)} />
          <NumberField label="From wall start" unit="m" value={o.offset} min={0} onCommit={(v) => v !== undefined && set({ offset: Math.min(v, Math.max(0, wallLen - o.width)) }, `moved to ${v} m`)} />
          <NumberField label="Sill height (0 = door)" unit="m" value={o.sill} min={0} onCommit={(v) => v !== undefined && set({ sill: v }, v > 0.05 ? "window" : "door")} />
          <TextField label="Note" value={o.note ?? ""} wide onCommit={(v) => set({ note: v || undefined }, "note")} />
        </fieldset>
        <p className="mt-2 text-xs text-muted">Design span is the clear width plus 90 mm bearing.</p>
      </Section>
      <Section title="Lintel section">
        <SizingEditor
          sizing={{ mode: "auto", maxB: lintel.wall.wall?.thickness, ...(o.sizing ?? {}) }}
          locked={locked}
          onChange={(s) => set({ sizing: s }, "lintel sizing")}
          fixedSection={<p className="col-span-2 text-xs text-muted">Fixed sections for opening lintels: use the depth limits instead, or draw a separate lintel member.</p>}
        />
      </Section>
      <Section title="What it carries">
        <p className="mb-2 text-xs text-muted">Blank uses 1 m of the surface above.</p>
        <TribEditor trib={o.trib} locked={locked} onChange={(t) => set({ trib: t }, `loads ${tribText(t) || "default"}`)} />
      </Section>
      {result ? <CalcSheet result={result} /> : null}
    </div>
  );
}

// The member inspector, laid out like the Lot 6 model's.
export function CalcSheet({ result }: { result: Result }) {
  return (
    <Section title="Design" aside={<span className="chip bg-warn-bg text-warn">Preliminary</span>}>
      {result.sec ? (
        <div className="flex flex-col gap-0.5 border border-line bg-surface-2 px-3 py-2.5">
          <FamilyTag fam={result.sec.fam} />
          <strong className="text-lg leading-tight font-bold">{result.sec.name}</strong>
          <span className="text-xs text-muted">{result.summary}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <StatusDot status={result.status} />
          <p className="text-sm">{result.summary || STATUS_LABEL[result.status]}</p>
        </div>
      )}
      {result.utils.length ? (
        <div className="mt-3 flex flex-col gap-1.5">
          {result.utils.map((u) => (
            <div key={u.label} className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-xs">
              <span>{u.label}</span>
              <span className="relative h-2 overflow-hidden border border-line bg-surface-2">
                <span className="absolute inset-y-0 left-0" style={{ width: `${Math.min(u.u, 1) * 100}%`, background: utilTone(u.u) }} />
              </span>
              <span className="text-right font-mono tabular-nums">{u.u.toFixed(2)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {result.kv.length ? (
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
          {result.kv.map((l) => (
            <div key={l.label} className="contents">
              <dt className="text-muted">{l.label}</dt>
              <dd className="text-right font-mono tabular-nums">{l.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {result.seq?.length ? (
        <>
          <h4 className="mt-3 mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Selection order</h4>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-line">
              {result.seq.map((s) => (
                <tr key={s.family} className={s.chosen ? "bg-accent-100" : ""}>
                  <td className="py-1 pr-2">{s.family}</td>
                  <td className="py-1 pr-2 font-mono">{s.text}</td>
                  <td className={`py-1 text-right font-mono font-semibold ${s.pass ? "text-ok" : "text-bad"}`}>
                    {s.util !== null ? s.util.toFixed(2) : "–"} {s.pass ? "✓" : "✕"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {result.loads.length ? (
        <>
          <h4 className="mt-3 mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Loads</h4>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            {result.loads.map((l) => (
              <div key={l.label} className="contents">
                <dt className="text-muted">{l.label}</dt>
                <dd className="text-right font-mono tabular-nums">
                  {l.value}
                  {l.note ? <span className="block font-sans text-[11px] text-muted">{l.note}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      {result.notes.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 border-l-[3px] border-warn bg-warn-bg px-2.5 py-2 text-xs text-warn">{DRAFT_NOTE}</p>
    </Section>
  );
}

// ---------------------------------------------------------------- overview

export function SummaryStrip({ model, calcs }: { model: DesignModel; calcs: Calcs }) {
  const designed = [...calcs.results.values()].filter((r) => r.sec && r.ratio !== null);
  const counts = new Map<string, number>();
  for (const r of designed) counts.set(r.sec!.fam, (counts.get(r.sec!.fam) ?? 0) + 1);
  const fails = [...calcs.results.values()].filter((r) => r.status === "fail").length;
  const top = designed.reduce<Result | null>((a, r) => (!a || (r.ratio ?? 0) > (a.ratio ?? 0) ? r : a), null);
  void model;
  return (
    <div className="flex flex-wrap gap-1.5">
      {[...counts.entries()].map(([f, n]) => (
        <span key={f} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[11px]">
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: FAMILY_COLOUR[f as keyof typeof FAMILY_COLOUR] ?? "#8a5a2b" }} />
          {n} {FAMILY_LABEL[f as keyof typeof FAMILY_LABEL] ?? f}
        </span>
      ))}
      {top ? <span className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[11px]">Highest {top.mark} {top.ratio!.toFixed(2)}</span> : null}
      <span className={`rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[11px] ${fails ? "text-bad" : "text-ok"}`}>{fails ? `${fails} need specific design` : "All checks pass"}</span>
    </div>
  );
}

export function Overview({ model, calcs, onPick }: { model: DesignModel; calcs: Calcs; onPick: (id: string) => void }) {
  const counts = (Object.keys(MEMBER_INFO) as MemberType[]).map((t) => [t, model.members.filter((m) => m.type === t).length] as const).filter(([, n]) => n);
  const attention = [...calcs.results.values()].filter((r) => r.status === "fail" || r.status === "close").sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  return (
    <div>
      <Section title="This structure">
        {counts.length ? (
          <>
            <ul className="grid grid-cols-2 gap-1.5 text-sm">
              {counts.map(([t, n]) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MEMBER_INFO[t].colour }} />
                  {n} {MEMBER_INFO[t].label.toLowerCase()}
                  {n === 1 ? "" : "s"}
                </li>
              ))}
              {calcs.lintels.length ? (
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MEMBER_INFO.lintel.colour }} />
                  {calcs.lintels.length} opening lintel{calcs.lintels.length === 1 ? "" : "s"}
                </li>
              ) : null}
            </ul>
            <div className="mt-3">
              <SummaryStrip model={model} calcs={calcs} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Nothing placed yet. Pick a tool on the left and click on the plan.</p>
        )}
      </Section>
      {attention.length ? (
        <Section title="Needs attention">
          <ul className="flex flex-col gap-1 text-sm">
            {attention.map((r) => (
              <li key={r.memberId}>
                <button type="button" className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2" onClick={() => onPick(r.memberId)}>
                  <StatusDot status={r.status} />
                  <span className="font-semibold">{r.mark}</span>
                  <span className="truncate text-muted">{r.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title="Getting started">
        <ol className="list-decimal space-y-1.5 pl-4 text-sm text-text">
          <li>On the <b>Levels</b> tab, upload the architect&apos;s PDF and pick the page for each level.</li>
          <li>Choose <b>Scale</b> and click both ends of a dimension you know, then <b>Origin</b> on the same corner on every level.</li>
          <li>Draw <b>Walls</b>, then use <b>Opening</b> on each door and window: every opening gets its own lintel, sized automatically.</li>
          <li>Add beams, posts and <b>Joist zones</b>; set what each beam carries. Sections are picked SG8 → hySPAN → steel.</li>
          <li>Set the job&apos;s loads on the <b>Loads</b> tab, and bracing demand per level there too.</li>
          <li>Each level holds that storey&apos;s posts and walls and the framing at its top. Ground floor joists and bearers go on <b>Foundation</b>.</li>
          <li>When everything passes, submit it on the <b>Sign-off</b> tab for a CPEng to check, and download the council report there.</li>
        </ol>
        <p className="mt-2 text-xs">
          <a href="/portal/design/guide" target="_blank" rel="noreferrer" className="font-semibold text-accent-600 hover:underline">
            Full guide to the design app
          </a>
        </p>
      </Section>
      <Section title="Shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {[
            ["V", "Select and move"],
            ["H / Space", "Pan (or drag empty space)"],
            ...(Object.keys(MEMBER_INFO) as MemberType[]).map((t) => [MEMBER_INFO[t].key.toUpperCase(), MEMBER_INFO[t].label]),
            ["N", "Opening (door or window) on a wall"],
            ["S / O", "Scale / origin"],
            ["Shift", "15° steps while drawing"],
            ["Del", "Delete selected"],
            ["Ctrl+D", "Duplicate"],
            ["Ctrl+C / V", "Copy / paste"],
            ["Ctrl+Z / Y", "Undo / redo"],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
              </dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- schedule (side panel)

export function SchedulePanel({ model, calcs, selectedId, onPick }: { model: DesignModel; calcs: Calcs; selectedId: string | null; onPick: (id: string) => void }) {
  const levelName = (id: string) => model.levels.find((l) => l.id === id)?.name ?? "";
  const rows = [
    ...model.members.map((m) => ({ id: m.id, label: m.label, desc: describeMember(m), level: m.levelId, len: m.b && m.type !== "joistzone" ? memberLength(m) : 0 })),
    ...calcs.lintels.map((l) => ({ id: l.id, label: l.opening.label, desc: `Lintel in ${l.wall.label}`, level: l.wall.levelId, len: memberLength(l.member) })),
  ].sort(byLabel);
  return (
    <Section title={`Members · ${rows.length}`}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No members yet.</p>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-semibold">Mark</th>
              <th className="py-1 font-semibold">Section</th>
              <th className="py-1 text-right font-semibold">Use</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((m) => {
              const r = calcs.results.get(m.id);
              return (
                <tr key={m.id} className={`cursor-pointer hover:bg-surface-2 ${m.id === selectedId ? "bg-accent-100" : ""}`} onClick={() => onPick(m.id)}>
                  <td className="py-1.5 pr-2 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <StatusDot status={r?.status ?? "none"} />
                      {m.label}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    {r?.sec?.name ?? m.desc}
                    <span className="block text-muted">
                      {levelName(m.level)}
                      {m.len ? ` · ${Math.round(m.len * 1000)}` : ""}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    <UtilPill u={r?.ratio ?? null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- levels and plans

// Most framing plans are drawn to a stated scale: 1:100 on A3 and so on. One
// PDF point is 1/72 inch, so 1:N is N × 0.3528 mm of real length per point.
const MM_PER_PT = 25.4 / 72;
function SheetScale({ scale, locked, onApply }: { scale: number | null; locked: boolean; onApply: (ratio: number) => void }) {
  const [v, setV] = useState(scale ? String(Math.round(scale / (MM_PER_PT / 1000))) : "");
  const n = Number(v);
  return (
    <form
      className="mt-2 flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (n >= 1 && n <= 5000) onApply(n);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Sheet scale</span>
        <span className="flex items-center gap-1 text-sm">
          1:
          <input className="field w-20 py-1 text-sm tabular-nums" inputMode="numeric" value={v} disabled={locked} onChange={(e) => setV(e.target.value)} placeholder="100" aria-label="Sheet scale ratio" />
        </span>
      </label>
      <button type="submit" className="btn btn-quiet px-2.5 py-1 text-xs" disabled={locked || !(n >= 1 && n <= 5000)}>
        Set
      </button>
      <span className="pb-1.5 text-xs text-muted">as printed on the plan, for sheets at their true size</span>
    </form>
  );
}

export function LevelsPanel({
  model,
  plans,
  activeLevelId,
  locked,
  uploading,
  onActivate,
  onUpdateLevel,
  onAddLevel,
  onDeleteLevel,
  onUpload,
  onSheetScale,
}: {
  onSheetScale: (levelId: string, ratio: number) => void;
  model: DesignModel;
  plans: PlanFile[];
  activeLevelId: string;
  locked: boolean;
  uploading: string | null;
  onActivate: (id: string) => void;
  onUpdateLevel: (id: string, patch: Partial<Level>, summary: string) => void;
  onAddLevel: () => void;
  onDeleteLevel: (id: string) => void;
  onUpload: (file: File) => void;
}) {
  const levels = [...model.levels].sort((a, b) => b.elevation - a.elevation);
  return (
    <div>
      <Section title="Plans">
        {plans.length ? (
          <ul className="mb-2.5 flex flex-col gap-1 text-sm">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{p.fileName}</span>
                <span className="shrink-0 text-xs text-muted">
                  {p.pageCount} {p.pageCount === 1 ? "page" : "pages"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-2.5 text-sm text-muted">No plans uploaded yet.</p>
        )}
        <label className={`btn btn-quiet w-full justify-center text-sm ${locked || uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          {uploading ? `Uploading ${uploading}…` : "Upload PDF plans"}
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={locked || !!uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      </Section>

      <Section
        title="Levels"
        aside={
          <button type="button" className="btn btn-quiet px-2 py-1 text-xs" onClick={onAddLevel} disabled={locked}>
            + Level
          </button>
        }
      >
        <ul className="flex flex-col gap-2.5">
          {levels.map((l) => {
            const count = model.members.filter((m) => m.levelId === l.id).length;
            const plan = plans.find((p) => p.id === l.plan?.planId);
            return (
              <li key={l.id} className={`rounded-lg border p-2.5 ${l.id === activeLevelId ? "border-accent bg-accent-100/40" : "border-line"}`}>
                <fieldset disabled={locked} className="grid grid-cols-2 gap-2">
                  <TextField label="Name" value={l.name} onCommit={(v) => v && onUpdateLevel(l.id, { name: v }, `level renamed to ${v}`)} />
                  <Select<Level["kind"]>
                    label="Kind"
                    value={l.kind}
                    options={[
                      { value: "foundation", label: "Foundation" },
                      { value: "floor", label: "Floor" },
                      { value: "roof", label: "Roof" },
                    ]}
                    onChange={(v) => onUpdateLevel(l.id, { kind: v }, `${l.name} is a ${v}`)}
                  />
                  <NumberField label="Level" unit="m" value={l.elevation} onCommit={(v) => v !== undefined && onUpdateLevel(l.id, { elevation: v }, `${l.name} level ${v} m`)} />
                  <NumberField label="Stud height" unit="m" value={l.height} min={0} onCommit={(v) => v !== undefined && onUpdateLevel(l.id, { height: v }, `${l.name} height ${v} m`)} />
                  <Select<Level["floor"]>
                    label="Walls stand on"
                    value={l.floor}
                    wide
                    options={[
                      { value: "slab", label: "Concrete slab (bracing cap 150 BU/m)" },
                      { value: "timber", label: "Timber floor (bracing cap 120 BU/m)" },
                    ]}
                    onChange={(v) => onUpdateLevel(l.id, { floor: v }, `${l.name} on ${v}`)}
                  />
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-xs font-semibold text-muted">Plan</span>
                    <select
                      className="field py-1.5 text-sm"
                      value={l.plan ? `${l.plan.planId}|${l.plan.page}` : ""}
                      onChange={(e) => {
                        const [planId, page] = e.target.value.split("|");
                        onUpdateLevel(
                          l.id,
                          { plan: planId ? { planId, page: Number(page), scale: l.plan?.planId === planId ? l.plan.scale : null, origin: l.plan?.origin ?? { x: 0, y: 0 } } : null },
                          planId ? `${l.name} plan set` : `${l.name} plan removed`,
                        );
                      }}
                    >
                      <option value="">No plan (grid)</option>
                      {plans.flatMap((p) =>
                        Array.from({ length: p.pageCount }, (_, i) => (
                          <option key={`${p.id}|${i + 1}`} value={`${p.id}|${i + 1}`}>
                            {p.fileName} · page {i + 1}
                          </option>
                        )),
                      )}
                    </select>
                  </label>
                </fieldset>
                {plan && l.plan ? <SheetScale key={`${l.id}:${l.plan.scale ?? 0}`} scale={l.plan.scale} locked={locked} onApply={(n) => onSheetScale(l.id, n)} /> : null}
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {count} {count === 1 ? "member" : "members"}
                    {plan && l.plan ? (l.plan.scale ? ` · scale set (1:${Math.round(l.plan.scale / 0.000352778)} on paper)` : " · scale not set") : ""}
                  </span>
                  <span className="flex gap-1.5">
                    {l.id !== activeLevelId ? (
                      <button type="button" className="font-semibold text-accent-600 hover:underline" onClick={() => onActivate(l.id)}>
                        Open
                      </button>
                    ) : null}
                    {model.levels.length > 1 && !locked ? (
                      <button type="button" className="font-semibold text-bad hover:underline" onClick={() => onDeleteLevel(l.id)}>
                        Remove
                      </button>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- design loads

export const PARAM_META: [keyof DesignParams, string, string, string][] = [
  ["Gf", "Floor dead G", "kPa", "incl. joists, flooring, ceiling, services, light partitions"],
  ["Gwet", "Tiled wet-area G", "kPa", "bathroom and ensuite"],
  ["Qf", "Floor live Q", "kPa", "residential, AS/NZS 1170.1 Table 3.1"],
  ["Groof", "Roof dead G (plan)", "kPa", "cladding, framing, insulation, ceiling"],
  ["Qroof", "Roof live Q", "kPa", "non-trafficable roof"],
  ["Su", "Roof snow Su", "kPa", "0 where the site has no snow"],
  ["gWallExt", "External wall", "kPa", "cladding, framing, lining"],
  ["gWallInt", "Internal wall", "kPa", "framing and linings"],
  ["gWallBlock", "Block wall", "kPa", "15 series fully grouted ≈ 0.14 m × 22 kN/m³; less if partly filled"],
  ["wallHeight", "Height of walls above", "m", "for the weight of walls carried"],
  ["Ppt", "Point load at midspan", "kN", "imposed, every beam and lintel; 0 = off"],
  ["dPlim", "Deflection under that point load", "mm", "PL³/48EI"],
  ["dAbs", "Long-term deflection cap", "mm", "applies with span/300"],
  ["beamMaxD", "Max depth, auto floor beams", "mm", "250 keeps them near flush with 240 joists; 0 = no limit"],
  ["k1Roof", "k1 for roof live combinations", "", "0.97 in the 26121 basis, 1.0 in Lot 6"],
];

export function ParamsPanel({
  model,
  locked,
  onParam,
  onDemand,
  onNotes,
}: {
  model: DesignModel;
  locked: boolean;
  onParam: (k: keyof DesignParams, v: number) => void;
  onDemand: (levelId: string, k: "windAlong" | "windAcross" | "eq", v: number) => void;
  onNotes: (notes: string[]) => void;
}) {
  const [notes, setNotes] = useState(model.notes.join("\n"));
  const levels = [...model.levels].sort((a, b) => b.elevation - a.elevation).filter((l) => model.members.some((m) => m.type === "bracing" && m.levelId === l.id) || model.bracing[l.id]);
  return (
    <div>
      <Section title="Design loads" aside={<span className="text-[11px] text-muted">AS/NZS 1170</span>}>
        <fieldset disabled={locked} className="grid grid-cols-2 gap-2.5">
          {PARAM_META.map(([k, label, unit, help]) => (
            <div key={k} title={help}>
              <NumberField label={label} unit={unit || undefined} value={model.params[k]} min={0} placeholder={String(DEFAULT_PARAMS[k])} onCommit={(v) => onParam(k, v ?? DEFAULT_PARAMS[k])} />
            </div>
          ))}
        </fieldset>
        <p className="mt-2 text-xs text-muted">Combinations 1.35G; 1.2G+1.5Q (k1 0.8); 1.2G+1.5Qr+0.4Q; 1.2G+Su+0.4Q. Long-term δ = k2(G+0.4Q), k2 2.0 timber, 1.0 steel; short-term 0.7Q ≤ span/360.</p>
      </Section>
      <Section title="Bracing demand (BU)">
        {levels.length ? (
          <fieldset disabled={locked} className="flex flex-col gap-3">
            {levels.map((l) => {
              const d = model.bracing[l.id] ?? { windAlong: 0, windAcross: 0, eq: 0 };
              return (
                <div key={l.id}>
                  <p className="mb-1 text-sm font-semibold">{l.name}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <NumberField label="Wind along" value={d.windAlong} min={0} onCommit={(v) => onDemand(l.id, "windAlong", v ?? 0)} />
                    <NumberField label="Wind across" value={d.windAcross} min={0} onCommit={(v) => onDemand(l.id, "windAcross", v ?? 0)} />
                    <NumberField label="Earthquake" value={d.eq} min={0} onCommit={(v) => onDemand(l.id, "eq", v ?? 0)} />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted">From NZS 3604:2011 Tables 5.6–5.10 or a GIB EzyBrace® demand sheet. Along = east–west lines, across = north–south. Leave at 0 to use the demand worked out from the site data.</p>
          </fieldset>
        ) : (
          <p className="text-sm text-muted">Add bracing elements (G) to a level to enter its demand.</p>
        )}
      </Section>
      <Section title="Assumptions to confirm">
        <textarea
          disabled={locked}
          className="field min-h-28 w-full py-1.5 text-sm"
          value={notes}
          placeholder="One per line, e.g. Garage door scaled at 2.8 m: confirm with the architect."
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onNotes(notes.split("\n").map((n) => n.trim()).filter(Boolean))}
        />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- site

export function SitePanel({ model, locked, onSite }: { model: DesignModel; locked: boolean; onSite: (s: SiteData | undefined, summary: string) => void }) {
  const site = model.site;
  if (!site)
    return (
      <Section title="Site">
        <p className="text-sm text-muted">Add the site to work out wind and earthquake bracing demand (specific design to NZS 1170.5 and AS/NZS 1170.2), footing sizes and durability notes.</p>
        <button type="button" className="btn btn-quiet mt-2 px-2.5 py-1 text-xs" disabled={locked} onClick={() => onSite({ ...DEFAULT_SITE }, "site added")}>
          Add site data
        </button>
      </Section>
    );
  const set = (patch: Partial<SiteData>, what: string) => onSite({ ...site, ...patch }, what);
  const q = quakeBasis(site);
  const top = Math.max(...model.levels.map((l) => l.elevation + l.height)) - Math.min(...model.levels.map((l) => l.elevation));
  const w = windBasis(site, top);
  const demand = demandFromSite(model, site);
  return (
    <Section title="Site" aside={<span className="text-[11px] text-muted">NZS 1170.5 · AS/NZS 1170.2</span>}>
      <fieldset disabled={locked} className="grid grid-cols-2 gap-2.5">
        <Select
          label="Town (hazard factor Z)"
          value={site.town}
          options={[...Object.keys(TOWNS).map((t) => ({ value: t, label: `${t} (Z ${TOWNS[t].Z})` })), { value: "custom", label: "Other: enter Z" }]}
          onChange={(v) => set({ town: v, ...(v !== "custom" ? { windRegion: TOWNS[v].region } : {}) }, `site ${v}`)}
        />
        {site.town === "custom" ? <NumberField label="Z" value={site.Z} min={0.13} onCommit={(v) => set({ Z: v }, `Z ${v}`)} /> : <span />}
        <Select label="Soil class" value={site.soil} options={(["A", "B", "C", "D", "E"] as const).map((s) => ({ value: s, label: `Class ${s}` }))} onChange={(v) => set({ soil: v }, `soil class ${v}`)} />
        <Select
          label="Importance level"
          value={String(site.importance) as "1" | "2" | "3"}
          options={[
            { value: "1", label: "IL1" },
            { value: "2", label: "IL2 (houses)" },
            { value: "3", label: "IL3" },
          ]}
          onChange={(v) => set({ importance: Number(v) as 1 | 2 | 3 }, `IL${v}`)}
        />
        <NumberField label="Ductility μ" value={site.mu} min={1} onCommit={(v) => set({ mu: v ?? 3.5 }, `ductility ${v}`)} />
        <Select label="Wind region" value={site.windRegion} options={(["A6", "A7", "W"] as const).map((r) => ({ value: r, label: r }))} onChange={(v) => set({ windRegion: v }, `wind region ${v}`)} />
        <Select
          label="Terrain category"
          value={String(site.terrain) as "1" | "2" | "2.5" | "3" | "4"}
          options={[
            { value: "1", label: "TC1 open water / flat" },
            { value: "2", label: "TC2 open, few obstructions" },
            { value: "2.5", label: "TC2.5 developing" },
            { value: "3", label: "TC3 suburban" },
            { value: "4", label: "TC4 city centre" },
          ]}
          onChange={(v) => set({ terrain: Number(v) as 1 | 2 | 2.5 | 3 | 4 }, `terrain ${v}`)}
        />
        <NumberField label="Shielding Ms" value={site.Ms} min={0.7} onCommit={(v) => set({ Ms: v ?? 1 }, `Ms ${v}`)} />
        <NumberField label="Topography Mt" value={site.Mt} min={1} onCommit={(v) => set({ Mt: v ?? 1 }, `Mt ${v}`)} />
        <Check label="In a lee zone (×1.35)" checked={site.lee} onChange={(v) => set({ lee: v }, v ? "lee zone" : "not a lee zone")} />
        <Select
          label="Exposure zone"
          value={site.exposure}
          options={[
            { value: "B", label: "B low" },
            { value: "C", label: "C medium" },
            { value: "D", label: "D high (within 500 m of the sea)" },
            { value: "E", label: "E beachfront" },
            { value: "SED", label: "SED microclimate" },
          ]}
          onChange={(v) => set({ exposure: v }, `exposure zone ${v}`)}
        />
        <NumberField label="Ultimate bearing" unit="kPa" value={site.bearing} min={50} onCommit={(v) => set({ bearing: v ?? 300 }, `bearing ${v} kPa`)} />
        <NumberField label="φ bearing" value={site.phiBearing} min={0.3} onCommit={(v) => set({ phiBearing: v ?? 0.5 }, `bearing φ ${v}`)} />
        <Select
          label="Expansive soil"
          value={site.expansive}
          options={[
            { value: "none", label: "No (good ground)" },
            { value: "moderate", label: "Moderate (class M / TC2)" },
            { value: "high", label: "High (class H, E / TC3)" },
          ]}
          onChange={(v) => set({ expansive: v }, `expansive ${v}`)}
        />
      </fieldset>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Earthquake Cd(T1)</dt>
        <dd className="text-right font-mono tabular-nums">
          {q.Cd.toFixed(3)} = {q.Ch.toFixed(2)}·{q.Z}·{q.R}·{q.Sp}/{q.kmu.toFixed(2)}
        </dd>
        <dt className="text-muted">Wind Vdes, q</dt>
        <dd className="text-right font-mono tabular-nums">
          {w.Vdes.toFixed(1)} m/s, {(w.q / 1000).toFixed(2)} kPa
        </dd>
        <dt className="text-muted">NZS 3604 wind zone</dt>
        <dd className="text-right font-mono">{w.zone}</dd>
      </dl>
      {demand.length ? (
        <table className="mt-3 w-full text-xs tabular-nums">
          <thead className="text-[11px] text-muted">
            <tr>
              <th className="text-left font-semibold">Storey</th>
              <th className="text-right font-semibold">Wind along</th>
              <th className="text-right font-semibold">Across</th>
              <th className="text-right font-semibold">EQ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {demand.map((d) => (
              <tr key={d.level.id}>
                <td className="py-1">{d.level.name}</td>
                <td className="py-1 text-right">{d.windAlong}</td>
                <td className="py-1 text-right">{d.windAcross}</td>
                <td className="py-1 text-right" title={`seismic weight ${d.weight.toFixed(0)} kN, storey shear ${d.eqShear.toFixed(1)} kN`}>
                  {d.eqBU}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="mt-2 text-xs text-muted">
        Bracing units (20 BU = 1 kN), used wherever no demand is typed in below. Earthquake: equivalent static, T1 0.4 s, weight from joist-zone areas and walls. {WIND_NOTE}
      </p>
      <button type="button" className="mt-2 text-xs font-semibold text-bad hover:underline" disabled={locked} onClick={() => onSite(undefined, "site removed")}>
        Remove site data
      </button>
    </Section>
  );
}

// ---------------------------------------------------------------- history

type Rev = Awaited<ReturnType<typeof listRevisions>>[number];

export function HistoryPanel({ jobId, revision, locked, onRestore }: { jobId: string; revision: number; locked: boolean; onRestore: (rev: number) => void }) {
  const [revs, setRevs] = useState<Rev[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    listRevisions(jobId)
      .then((r) => live && (setRevs(r), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [jobId, revision]);

  const when = (iso: string) => new Date(iso).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <Section title="Change history">
      {failed && revs === null ? (
        <p className="text-sm text-bad">Couldn&apos;t load the history. Check your connection and reopen this tab.</p>
      ) : revs === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : revs.length === 0 ? (
        <p className="text-sm text-muted">Every save is recorded here.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {revs.map((r) => (
            <li key={r.revision} className="py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span className="tabular-nums">
                  Rev {r.revision} · {when(r.savedAt)}
                  {r.by ? ` · ${r.by}` : ""}
                </span>
                {r.revision !== revision && !locked ? (
                  <button type="button" className="font-semibold text-accent-600 hover:underline" onClick={() => onRestore(r.revision)}>
                    Restore
                  </button>
                ) : r.revision === revision ? (
                  <span className="font-semibold text-ok">Current</span>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm">{r.summary || "Saved"}</p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- job details

export function JobSection({ job, locked, canDelete }: { job: { id: string; title: string; jobNo: string; address: string }; locked: boolean; canDelete: boolean }) {
  return (
    <Section title="Job">
      <ActionForm action={updateJobDetails} submitLabel="Save details" quiet className="grid grid-cols-2 gap-2">
        <input type="hidden" name="id" value={job.id} />
        <fieldset disabled={locked} className="contents">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Name</span>
            <input name="title" defaultValue={job.title} required maxLength={200} className="field py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Job number</span>
            <input name="job_no" defaultValue={job.jobNo} maxLength={40} className="field py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Site address</span>
            <input name="address" defaultValue={job.address} maxLength={300} className="field py-1.5 text-sm" />
          </label>
        </fieldset>
      </ActionForm>
      {canDelete ? <DeleteJob id={job.id} title={job.title} /> : null}
    </Section>
  );
}

function DeleteJob({ id, title }: { id: string; title: string }) {
  const [state, action, pending] = useActionState(deleteDesignJob, undefined);
  return (
    <form
      action={action}
      className="mt-3 border-t border-line pt-3"
      onSubmit={(e) => {
        if (!window.confirm(`Delete "${title}" with its plans and history? This can't be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="btn btn-quiet px-2.5 py-1 text-xs text-bad">
        {pending ? (
          <>
            <Spinner /> Deleting…
          </>
        ) : (
          "Delete this job"
        )}
      </button>
      {state && !state.ok ? <p className="mt-2 text-xs font-semibold text-bad">{state.message}</p> : null}
    </form>
  );
}
