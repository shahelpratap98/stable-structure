import type { Metadata } from "next";
import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { requireApprover } from "@/lib/auth";
import { formatDay, formatHours } from "@/lib/dates";
import { ENTRY_STATUSES, entryFilterQuery, fetchEntryRows, parseEntryFilters } from "@/lib/entry-filters";
import { createClient } from "@/lib/supabase/server";
import { DownloadButton, FilterSubmit } from "@/components/pending-buttons";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "All entries" };

const STATUSES = ENTRY_STATUSES;
const MAX_ROWS = 1000;
const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

// The workbook's Timesheet tab: every entry, with the same columns.
export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireApprover();
  const params = await searchParams;
  const f = parseEntryFilters((name) => (typeof params[name] === "string" ? (params[name] as string) : null));
  const { from, to, userId, projectId, status, chargeable } = f;

  const supabase = await createClient();
  const [entriesRes, staffRes, projectsRes] = await Promise.all([
    fetchEntryRows(supabase, f, MAX_ROWS),
    supabase.from("profiles").select("user_id, display_name").order("display_name"),
    supabase.from("projects").select("id, project_no, name").order("project_no", { ascending: false }),
  ]);

  const rows = entriesRes.rows;
  const totalHours = rows.reduce((s, r) => s + Number(r.hours ?? 0), 0);
  const totalValue = rows.reduce((s, r) => s + Number(r.value ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">All entries</h1>
          <p className="mt-1 text-muted">Every timesheet line. Open one to correct it or set a rate override.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2 print:hidden">
          {rows.length > 0 ? <DownloadButton href={`/portal/entries/export?${entryFilterQuery(f)}`} busyLabel="Building the file…">Export to Excel</DownloadButton> : null}
          {rows.length > 0 ? <PrintButton /> : null}
          <Link href="/portal/entries/new" className="btn btn-primary">+ Add an entry for someone</Link>
        </div>
      </div>

      <form action={"/portal/entries"} className="grid grid-cols-2 gap-3 print:hidden rounded-xl border border-line bg-surface p-4 sm:grid-cols-3 lg:grid-cols-[repeat(6,minmax(0,1fr))_auto] [&>div:nth-child(n+3)]:col-span-2 sm:[&>div:nth-child(n+3)]:col-span-1">
        <div>
          <label htmlFor="f-from" className="field-label">From</label>
          <input id="f-from" name="from" type="date" defaultValue={from} className="field" />
        </div>
        <div>
          <label htmlFor="f-to" className="field-label">To</label>
          <input id="f-to" name="to" type="date" defaultValue={to} className="field" />
        </div>
        <div>
          <label htmlFor="f-user" className="field-label">Employee</label>
          <select id="f-user" name="user" defaultValue={userId} className="field">
            <option value="">Everyone</option>
            {(staffRes.data ?? []).map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-project" className="field-label">Project</label>
          <select id="f-project" name="project" defaultValue={projectId} className="field">
            <option value="">All projects</option>
            {(projectsRes.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.project_no} · {p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="field-label">Status</label>
          <select id="f-status" name="status" defaultValue={status} className="field capitalize">
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-charge" className="field-label">Chargeable</label>
          <select id="f-charge" name="chargeable" defaultValue={chargeable} className="field">
            <option value="">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <FilterSubmit>Filter</FilterSubmit>
          <Link href="/portal/entries" className="btn btn-quiet">Reset</Link>
        </div>
      </form>

      <p className="text-sm text-muted tabular-nums" aria-live="polite">
        <span className="font-semibold text-ink">{rows.length}</span> {rows.length === 1 ? "entry" : "entries"} ·{" "}
        <span className="font-semibold text-ink">{formatHours(totalHours)} h</span> ·{" "}
        <span className="font-semibold text-ink">{money.format(totalValue)}</span>
        {rows.length === MAX_ROWS ? ` · showing the first ${MAX_ROWS}; narrow the dates to see the rest` : ""}
      </p>

      {entriesRes.error ? (
        <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">Couldn&apos;t load entries: {entriesRes.error}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-5 py-8 text-center text-muted">No entries match those filters.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">Employee</th>
                <th className="px-3 py-2.5 font-semibold">Project</th>
                <th className="px-3 py-2.5 font-semibold">Work type</th>
                <th className="px-3 py-2.5 font-semibold">Task</th>
                <th className="px-3 py-2.5 text-right font-semibold">Hours</th>
                <th className="px-3 py-2.5 text-right font-semibold">Rate</th>
                <th className="px-3 py-2.5 text-right font-semibold">Value</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Approved by</th>
                <th className="px-3 py-2.5 font-semibold">Invoice</th>
                <th className="px-3 py-2.5"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDay(r.entry_date, { day: "2-digit", month: "short", year: "2-digit" })}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.employee}</td>
                  <td className="px-3 py-2 font-semibold text-ink">{r.project_no ? `${r.project_no} · ${r.project}` : <span className="chip bg-warn-bg text-warn">No project</span>}</td>
                  <td className="px-3 py-2">{r.work_type ?? "—"}</td>
                  <td className="max-w-[18rem] px-3 py-2 text-muted">{r.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(Number(r.hours ?? 0))}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {!r.chargeable ? "—" : r.rate === null ? <span className="chip bg-warn-bg text-warn">No rate</span> : (
                      <>{money.format(r.rate)}{r.rate_override !== null ? <span title="Rate override" className="ml-1 text-accent-600">*</span> : null}</>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{r.chargeable ? money.format(Number(r.value ?? 0)) : <span className="text-muted">Non-chg</span>}</td>
                  <td className="px-3 py-2"><StatusChip status={r.status} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.approved_by_name ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.invoice_no ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/portal/entries/${r.id}`} className="font-semibold text-accent-600 hover:underline">
                      {r.status === "invoiced" ? "View" : "Edit"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">* rate override on this entry instead of the project rate.</p>
    </div>
  );
}
