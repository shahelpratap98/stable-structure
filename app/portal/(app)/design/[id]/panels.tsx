"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DRAFT_NOTE, SG8_DEPTHS, STATUS_COLOUR, STATUS_LABEL, type Result } from "@/lib/design/calc";
import {
  byLabel,
  describeMember,
  formatLength,
  MEMBER_INFO,
  memberLength,
  type DesignModel,
  type Level,
  type Material,
  type Member,
  type MemberType,
  type TimberGrade,
} from "@/lib/design/model";
import { listRevisions } from "../actions";

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

export function NumberField({ label, value, onCommit, unit, step = "any", min }: { label: string; value: number | undefined; onCommit: (v: number | undefined) => void; unit?: string; step?: string; min?: number }) {
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
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex flex-col gap-1">
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

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
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

const SECTION_SUGGESTIONS = [
  ...SG8_DEPTHS.flatMap((d) => [`${d}x45`, `2/${d}x45`, `3/${d}x45`]),
  "90x90",
  "125x125",
  "140x140",
  "150PFC",
  "180PFC",
  "200PFC",
  "150UB14",
  "180UB16",
  "200UB25",
  "250UB31",
  "310UB40",
  "89x89x5SHS",
  "100x100x6SHS",
];

const LINE_TYPES = (Object.keys(MEMBER_INFO) as MemberType[]).filter((t) => MEMBER_INFO[t].line);
const POINT_TYPES = (Object.keys(MEMBER_INFO) as MemberType[]).filter((t) => !MEMBER_INFO[t].line);
const BEAM_LIKE: MemberType[] = ["beam", "lintel", "joist", "rafter"];

// ---------------------------------------------------------------- member

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
  const structural = beamLike || m.type === "post";
  const set = (patch: Partial<Member>, what: string) => onChange(patch, `${m.label}: ${what}`);

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
          <TextField label="Label" value={m.label} onCommit={(v) => v && set({ label: v }, `renamed to ${v}`)} />
          <Select
            label="Type"
            value={m.type}
            options={(MEMBER_INFO[m.type].line ? LINE_TYPES : POINT_TYPES).map((t) => ({ value: t, label: MEMBER_INFO[t].label }))}
            onChange={(t) => set({ type: t }, `changed to ${MEMBER_INFO[t].label.toLowerCase()}`)}
          />
          <Select label="Level" value={m.levelId} options={model.levels.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => set({ levelId: v }, "moved level")} />
          {structural ? (
            <Select<Material>
              label="Material"
              value={m.material}
              options={[
                { value: "timber", label: "Timber" },
                { value: "steel", label: "Steel" },
              ]}
              onChange={(v) => set({ material: v, ...(v === "steel" ? { section: m.type === "post" ? "89x89x5SHS" : "200UB25" } : { section: m.type === "post" ? "90x90" : "190x45", grade: "SG8" }) }, `material ${v}`)}
            />
          ) : (
            <div />
          )}
          {structural && m.material === "timber" ? (
            <Select<TimberGrade>
              label="Grade"
              value={m.grade ?? "SG8"}
              options={[
                { value: "SG8", label: "SG8 sawn" },
                { value: "hySPAN", label: "hySPAN LVL" },
                { value: "hy90", label: "hy90 LVL" },
              ]}
              onChange={(v) => set({ grade: v }, `grade ${v}`)}
            />
          ) : null}
          <TextField
            label={m.type === "bracing" ? "Wall length (mm)" : m.type === "footing" ? "Size W x L x D (mm)" : m.type === "pile" ? "Pile diameter (mm)" : "Section"}
            value={m.section}
            list="design-sections"
            onCommit={(v) => v && set({ section: v }, `section ${v}`)}
          />
          {m.type === "joist" || m.type === "rafter" ? (
            <NumberField label="Spacing" unit="mm" value={m.spacing} min={100} onCommit={(v) => set({ spacing: v }, `spacing ${v ?? "default"}`)} />
          ) : null}
          {m.type === "beam" || m.type === "lintel" ? (
            <NumberField label="Loaded width" unit="m" value={m.tribWidth} min={0} onCommit={(v) => set({ tribWidth: v }, `loaded width ${v ?? "default"}`)} />
          ) : null}
          {beamLike ? (
            <>
              <NumberField label="Extra G line load" unit="kN/m" value={m.extraG} min={0} onCommit={(v) => set({ extraG: v }, "extra G load")} />
              <NumberField label="Extra Q line load" unit="kN/m" value={m.extraQ} min={0} onCommit={(v) => set({ extraQ: v }, "extra Q load")} />
            </>
          ) : null}
          <TextField label="Notes" value={m.notes ?? ""} wide onCommit={(v) => set({ notes: v || undefined }, "notes")} />
        </fieldset>
        <datalist id="design-sections">
          {SECTION_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="mt-2.5 text-xs text-muted tabular-nums">
          {m.b ? `Length ${formatLength(memberLength(m))} · ` : ""}
          {m.b ? `(${m.a.x.toFixed(2)}, ${m.a.y.toFixed(2)}) → (${m.b.x.toFixed(2)}, ${m.b.y.toFixed(2)}) m` : `At (${m.a.x.toFixed(2)}, ${m.a.y.toFixed(2)}) m`}
        </p>
      </Section>
      {result ? <CalcSheet result={result} onApply={locked ? undefined : (s) => set({ section: s }, `section ${s} (suggested)`)} /> : null}
    </div>
  );
}

export function CalcSheet({ result, onApply }: { result: Result; onApply?: (section: string) => void }) {
  const has = result.checks.length > 0;
  return (
    <Section title="Calculation" aside={<span className="chip bg-warn-bg text-warn">Draft</span>}>
      <div className="flex items-center gap-2">
        <StatusDot status={result.status} />
        <p className="text-sm font-semibold" style={{ color: result.status === "none" ? undefined : STATUS_COLOUR[result.status] }}>
          {STATUS_LABEL[result.status]}
        </p>
      </div>
      <p className="mt-1 text-sm text-text">{result.summary}</p>
      {result.suggestion && onApply ? (
        <button type="button" className="btn btn-accent mt-2.5 px-3 py-1.5 text-xs" onClick={() => onApply(result.suggestion!)}>
          Use {result.suggestion} (passes)
        </button>
      ) : null}

      {[...result.inputs, ...result.loads].length ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {[...result.inputs, ...result.loads].map((l) => (
            <div key={l.label} className="contents">
              <dt className="text-muted">{l.label}</dt>
              <dd className="tabular-nums">
                {l.value}
                {l.note ? <span className="text-muted"> · {l.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {has ? (
        <table className="mt-3 w-full text-xs tabular-nums">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-semibold">Check</th>
              <th className="py-1 text-right font-semibold">Demand</th>
              <th className="py-1 text-right font-semibold">Capacity</th>
              <th className="py-1 text-right font-semibold">Use</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.checks.map((c) => (
              <tr key={c.name}>
                <td className="py-1 pr-2">{c.name}</td>
                <td className="py-1 text-right">
                  {c.demand.toFixed(2)} {c.unit}
                </td>
                <td className="py-1 text-right">{c.capacity.toFixed(2)}</td>
                <td className="py-1 text-right font-semibold" style={{ color: c.ratio > 1 ? STATUS_COLOUR.fail : c.ratio > 0.9 ? STATUS_COLOUR.close : undefined }}>
                  {Math.round(c.ratio * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {result.notes.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 rounded-lg bg-warn-bg px-2.5 py-2 text-xs font-semibold text-warn">{DRAFT_NOTE}</p>
    </Section>
  );
}

// ---------------------------------------------------------------- overview

export function Overview({ model, results, onPick }: { model: DesignModel; results: Map<string, Result>; onPick: (id: string) => void }) {
  const counts = (Object.keys(MEMBER_INFO) as MemberType[]).map((t) => [t, model.members.filter((m) => m.type === t).length] as const).filter(([, n]) => n);
  const failing = model.members.filter((m) => results.get(m.id)?.status === "fail").sort(byLabel);
  const close = model.members.filter((m) => results.get(m.id)?.status === "close").sort(byLabel);
  return (
    <div>
      <Section title="This structure">
        {counts.length ? (
          <ul className="grid grid-cols-2 gap-1.5 text-sm">
            {counts.map(([t, n]) => (
              <li key={t} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MEMBER_INFO[t].colour }} />
                {n} {MEMBER_INFO[t].label.toLowerCase()}
                {n === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing placed yet. Pick a member type on the left and click on the plan.</p>
        )}
      </Section>
      {failing.length || close.length ? (
        <Section title="Needs attention">
          <ul className="flex flex-col gap-1 text-sm">
            {[...failing, ...close].map((m) => (
              <li key={m.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2" onClick={() => onPick(m.id)}>
                  <StatusDot status={results.get(m.id)!.status} />
                  <span className="font-semibold">{m.label}</span>
                  <span className="truncate text-muted">{results.get(m.id)!.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title="Getting started">
        <ol className="list-decimal space-y-1.5 pl-4 text-sm text-text">
          <li>Under <b>Levels &amp; plans</b>, upload the architect&apos;s PDF and pick the page for each level.</li>
          <li>Choose <b>Scale</b> and click both ends of a dimension you know, then type it in.</li>
          <li>Choose <b>Origin</b> and click the same corner on every level so the levels line up.</li>
          <li>Pick a member type and click on the plan: two clicks for beams and walls, one for posts and footings.</li>
          <li>Each level holds that storey&apos;s posts and walls and the framing at its top. Ground floor joists and bearers go on <b>Foundation</b>.</li>
        </ol>
      </Section>
      <Section title="Shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {[
            ["V", "Select and move"],
            ["H / Space", "Pan (or drag empty space)"],
            ...(Object.keys(MEMBER_INFO) as MemberType[]).map((t) => [MEMBER_INFO[t].key.toUpperCase(), MEMBER_INFO[t].label]),
            ["S / O", "Scale / origin"],
            ["Shift", "15° steps while drawing"],
            ["Del", "Delete selected"],
            ["Ctrl+D", "Duplicate"],
            ["Ctrl+C / V", "Copy / paste"],
            ["Ctrl+Z / Y", "Undo / redo"],
            ["Wheel", "Zoom"],
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

// ---------------------------------------------------------------- schedule

export function SchedulePanel({ model, results, selectedId, onPick }: { model: DesignModel; results: Map<string, Result>; selectedId: string | null; onPick: (id: string) => void }) {
  const levelName = (id: string) => model.levels.find((l) => l.id === id)?.name ?? "";
  const rows = [...model.members].sort(byLabel);

  const download = () => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [
      ["Label", "Type", "Level", "Member", "Length (mm)", "Status", "Utilisation", "Notes"].join(","),
      ...rows.map((m) => {
        const r = results.get(m.id);
        return [m.label, MEMBER_INFO[m.type].label, levelName(m.levelId), describeMember(m), m.b ? Math.round(memberLength(m) * 1000) : "", r ? STATUS_LABEL[r.status] : "", r?.ratio != null ? `${Math.round(r.ratio * 100)}%` : "", m.notes ?? ""]
          .map((v) => esc(String(v)))
          .join(",");
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "member-schedule.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Section
      title={`Member schedule · ${rows.length}`}
      aside={
        rows.length ? (
          <button type="button" className="btn btn-quiet px-2 py-1 text-xs" onClick={download}>
            CSV
          </button>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No members yet.</p>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-semibold">Mark</th>
              <th className="py-1 font-semibold">Member</th>
              <th className="py-1 text-right font-semibold">Length</th>
              <th className="py-1 text-right font-semibold">Use</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((m) => {
              const r = results.get(m.id);
              return (
                <tr key={m.id} className={`cursor-pointer hover:bg-surface-2 ${m.id === selectedId ? "bg-accent-100" : ""}`} onClick={() => onPick(m.id)}>
                  <td className="py-1.5 pr-2 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <StatusDot status={r?.status ?? "none"} />
                      {m.label}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    {describeMember(m)}
                    <span className="block text-muted">{levelName(m.levelId)}</span>
                  </td>
                  <td className="py-1.5 text-right">{m.b ? Math.round(memberLength(m) * 1000) : "–"}</td>
                  <td className="py-1.5 text-right">{r?.ratio != null ? `${Math.round(r.ratio * 100)}%` : "–"}</td>
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
  onLoads,
}: {
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
  onLoads: (kind: "floor" | "roof", key: "G" | "Q", v: number) => void;
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
                  <NumberField label="Height" unit="m" value={l.height} min={0} onCommit={(v) => v !== undefined && onUpdateLevel(l.id, { height: v }, `${l.name} height ${v} m`)} />
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

      <Section title="Area loads">
        <fieldset disabled={locked} className="grid grid-cols-2 gap-2">
          <NumberField label="Floor G" unit="kPa" value={model.loads.floor.G} min={0} onCommit={(v) => v !== undefined && onLoads("floor", "G", v)} />
          <NumberField label="Floor Q" unit="kPa" value={model.loads.floor.Q} min={0} onCommit={(v) => v !== undefined && onLoads("floor", "Q", v)} />
          <NumberField label="Roof G" unit="kPa" value={model.loads.roof.G} min={0} onCommit={(v) => v !== undefined && onLoads("roof", "G", v)} />
          <NumberField label="Roof Q" unit="kPa" value={model.loads.roof.Q} min={0} onCommit={(v) => v !== undefined && onLoads("roof", "Q", v)} />
        </fieldset>
        <p className="mt-2 text-xs text-muted">Floors default to AS/NZS 1170.1 domestic (1.5 kPa); roofs to a light roof with 0.25 kPa imposed.</p>
      </Section>
    </div>
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
