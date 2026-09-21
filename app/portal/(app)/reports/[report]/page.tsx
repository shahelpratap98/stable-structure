import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportTableView } from "@/components/report-table";
import { isApprover, requireProfile } from "@/lib/auth";
import { findReport, parseReportParams, reportQuery } from "@/lib/report-params";
import { buildReport, REPORTS, type Report } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

// Which filters each report uses.
const USES_EMPLOYEE = new Set(["hours-check", "employee"]);
const USES_PROJECT = new Set(["project", "statement"]);
const USES_CHARGEABLE = new Set(["project"]);

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await requireProfile();
  const approver = isApprover(profile.role);
  const { report: slug } = await params;
  const def = findReport(slug);
  if (!def) notFound();
  if (def.approverOnly && !approver) redirect("/portal/reports/hours-check");

  const query = await searchParams;
  const p = parseReportParams(def.slug, (name) => (typeof query[name] === "string" ? (query[name] as string) : null), profile);

  const supabase = await createClient();
  const [staffRes, projectsRes] = await Promise.all([
    approver && USES_EMPLOYEE.has(def.slug)
      ? supabase.from("profiles").select("user_id, display_name").order("display_name")
      : Promise.resolve({ data: [] as { user_id: string; display_name: string }[] }),
    USES_PROJECT.has(def.slug)
      ? supabase.from("projects").select("id, project_no, name").order("project_no", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; project_no: string; name: string }[] }),
  ]);

  let report: Report | null = null;
  let failure = "";
  try {
    report = await buildReport(def.slug, supabase, p);
  } catch (e) {
    failure = e instanceof Error ? e.message : "Something went wrong building this report.";
  }

  const tabs = REPORTS.filter((r) => approver || !r.approverOnly);
  const hasRows = report?.tables.some((t) => t.rows.length > 0) ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">{report?.title ?? def.label}</h1>
        {report ? <p className="mt-1 text-muted">{report.subtitle}</p> : null}
      </div>

      <nav aria-label="Reports" className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.slug}
            href={`/portal/reports/${t.slug}?from=${p.from}&to=${p.to}`}
            aria-current={t.slug === def.slug ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap ${
              t.slug === def.slug ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {approver || t.slug !== "employee" ? t.label : "My time"}
          </Link>
        ))}
      </nav>

      <form action={`/portal/reports/${def.slug}`} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <div>
          <label htmlFor="r-from" className="field-label">From</label>
          <input id="r-from" name="from" type="date" defaultValue={p.from} className="field" />
        </div>
        <div>
          <label htmlFor="r-to" className="field-label">To</label>
          <input id="r-to" name="to" type="date" defaultValue={p.to} className="field" />
        </div>
        {approver && USES_EMPLOYEE.has(def.slug) ? (
          <div className="min-w-44">
            <label htmlFor="r-user" className="field-label">Employee</label>
            <select id="r-user" name="user" defaultValue={p.userId} className="field">
              {def.slug === "hours-check" ? <option value="">Everyone</option> : null}
              {(staffRes.data ?? []).map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
            </select>
          </div>
        ) : null}
        {USES_PROJECT.has(def.slug) ? (
          <div className="min-w-56">
            <label htmlFor="r-project" className="field-label">Project</label>
            <select id="r-project" name="project" defaultValue={p.projectId} className="field">
              <option value="">{def.slug === "statement" ? "Choose a project…" : "(All projects)"}</option>
              {(projectsRes.data ?? []).map((pr) => <option key={pr.id} value={pr.id}>{pr.project_no} · {pr.name}</option>)}
            </select>
          </div>
        ) : null}
        {USES_CHARGEABLE.has(def.slug) ? (
          <div>
            <label htmlFor="r-charge" className="field-label">Chargeable</label>
            <select id="r-charge" name="chargeable" defaultValue={p.chargeable} className="field">
              <option value="">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        ) : null}
        <button type="submit" className="btn btn-primary">Update</button>
        <span className="flex-1" />
        {hasRows ? (
          // Plain <a>: this is a file download, not a page navigation.
          <a href={`/portal/reports/${def.slug}/export?${reportQuery(p)}`} className="btn btn-quiet">Export to Excel</a>
        ) : null}
      </form>

      {failure ? <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">Couldn&apos;t build this report: {failure}</p> : null}
      {report?.notice ? <p className="rounded-xl border border-line bg-surface px-5 py-8 text-center text-muted">{report.notice}</p> : null}
      {report?.tables.map((t) => <ReportTableView key={t.name} table={t} />)}
    </div>
  );
}
