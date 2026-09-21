"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatHours } from "@/lib/dates";
import type { ProjectOption, TimeEntry, WorkTypeOption } from "@/lib/types";
import { saveDay, type RowInput, type SaveDayResult } from "./actions";

type Row = {
  key: string;
  id: string | null;
  project_id: string;
  work_type_id: string;
  chargeable: boolean;
  hours: string;
  description: string;
  return_note: string | null;
};

// Keys must match between server render and hydration, so the first blank
// row gets a fixed key; rows added later (client only) get random ones.
const newRow = (key: string): Row => ({
  key,
  id: null,
  project_id: "",
  work_type_id: "",
  chargeable: true,
  hours: "",
  description: "",
  return_note: null,
});

const fromEntry = (e: TimeEntry): Row => ({
  key: e.id,
  id: e.id,
  project_id: e.project_id ?? "",
  work_type_id: e.work_type_id ?? "",
  chargeable: e.chargeable,
  hours: e.hours === null ? "" : String(e.hours),
  description: e.description,
  return_note: e.status === "returned" ? e.return_note : null,
});

export function DayEditor({
  date,
  projects,
  workTypes,
  initial,
  lockedHours,
  standard,
}: {
  date: string;
  projects: ProjectOption[];
  workTypes: WorkTypeOption[];
  initial: TimeEntry[];
  lockedHours: number;
  standard: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial.map(fromEntry) : [newRow("blank")]));
  const [removed, setRemoved] = useState<string[]>([]);
  const [result, setResult] = useState<SaveDayResult | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: string, patch: Partial<Row>) => {
    setResult(null);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const pickProject = (key: string, projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    update(key, { project_id: projectId, ...(project ? { chargeable: project.default_chargeable } : {}) });
  };

  const remove = (row: Row) => {
    setResult(null);
    if (row.id) setRemoved((ids) => [...ids, row.id!]);
    setRows((rs) => rs.filter((r) => r.key !== row.key));
  };

  const draftHours = rows.reduce((sum, r) => sum + (Number.parseFloat(r.hours) || 0), 0);
  const total = lockedHours + draftHours;
  const gap = standard - total;

  const save = (submit: boolean) => {
    const payload: RowInput[] = rows.map((r) => ({
      key: r.key,
      id: r.id,
      project_id: r.project_id || null,
      work_type_id: r.work_type_id || null,
      chargeable: r.chargeable,
      hours: r.hours.trim() === "" ? null : Number.parseFloat(r.hours),
      description: r.description,
    }));
    startTransition(async () => {
      const res = await saveDay(date, payload, removed, submit);
      setResult(res);
      if (res.ok) {
        setRemoved([]);
        // Submitted rows now live in the read-only list below; start a clean row.
        if (submit) setRows([newRow(crypto.randomUUID())]);
        router.refresh();
      }
    });
  };

  const rowErrors = result && !result.ok ? result.rowErrors ?? {} : {};

  return (
    <section aria-labelledby="entries-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="entries-heading" className="text-xl font-semibold">Time entries</h2>
        <p className="text-sm text-muted tabular-nums" aria-live="polite">
          <span className="font-semibold text-ink">{formatHours(total)} h</span> of {formatHours(standard)} h
          {gap > 0 ? ` · ${formatHours(gap)} h to go` : gap < 0 ? ` · ${formatHours(-gap)} h over` : " · full day"}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const error = rowErrors[row.key];
          const n = index + 1;
          return (
            <li
              key={row.key}
              className={`rounded-xl border bg-surface p-4 ${error ? "border-bad" : row.return_note ? "border-bad/40" : "border-line"}`}
            >
              {row.return_note ? (
                <p className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">
                  <span className="font-semibold">Returned:</span> {row.return_note}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_7rem_6rem]">
                <div>
                  <label htmlFor={`project-${row.key}`} className="field-label">Project</label>
                  <select id={`project-${row.key}`} className="field" value={row.project_id} onChange={(e) => pickProject(row.key, e.target.value)}>
                    <option value="">Choose a project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.project_no} · {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`type-${row.key}`} className="field-label">Work type</label>
                  <select id={`type-${row.key}`} className="field" value={row.work_type_id} onChange={(e) => update(row.key, { work_type_id: e.target.value })}>
                    <option value="">Choose…</option>
                    {workTypes.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`charge-${row.key}`} className="field-label">Chargeable</label>
                  <select id={`charge-${row.key}`} className="field" value={row.chargeable ? "yes" : "no"} onChange={(e) => update(row.key, { chargeable: e.target.value === "yes" })}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`hours-${row.key}`} className="field-label">Hours</label>
                  <input
                    id={`hours-${row.key}`}
                    className="field tabular-nums"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={24}
                    step={0.25}
                    placeholder="0"
                    value={row.hours}
                    onChange={(e) => update(row.key, { hours: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 basis-64">
                  <label htmlFor={`task-${row.key}`} className="field-label">Task description</label>
                  <input
                    id={`task-${row.key}`}
                    className="field"
                    type="text"
                    maxLength={500}
                    placeholder="What did you work on?"
                    value={row.description}
                    onChange={(e) => update(row.key, { description: e.target.value })}
                  />
                </div>
                <button type="button" onClick={() => remove(row)} className="btn btn-quiet text-bad" aria-label={`Remove entry ${n}`}>
                  Remove
                </button>
              </div>
              {error ? <p role="alert" className="mt-3 text-sm font-semibold text-bad">{error}</p> : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows((rs) => [...rs, newRow(crypto.randomUUID())])} className="btn btn-quiet">
          + Add another entry
        </button>
        <span className="flex-1" />
        <button type="button" disabled={pending} onClick={() => save(false)} className="btn btn-quiet">
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button type="button" disabled={pending} onClick={() => save(true)} className="btn btn-accent">
          Submit day for approval
        </button>
      </div>

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${result.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}
        >
          {result.message}
        </p>
      ) : null}
    </section>
  );
}
