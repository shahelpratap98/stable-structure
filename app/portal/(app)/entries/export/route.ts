import { NextResponse, type NextRequest } from "next/server";
import { isApprover } from "@/lib/auth";
import { entryFilterQuery, fetchEntryRows, parseEntryFilters } from "@/lib/entry-filters";
import { reportToXlsx, xlsxResponse } from "@/lib/excel";
import { rateLimit } from "@/lib/rate-limit";
import type { Report } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

const MAX_EXPORT_ROWS = 20_000;
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The All entries grid as a spreadsheet, in the workbook's Timesheet column
// order (plus Status, which the workbook didn't have).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in first.", { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("user_id", user.id).maybeSingle();
  if (!profile?.is_active || !isApprover(profile.role)) return new NextResponse("Not allowed.", { status: 403 });

  const limit = await rateLimit("downloads", user.id);
  if (!limit.ok) {
    return new NextResponse("Too many downloads. Wait a few minutes and try again.", { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const f = parseEntryFilters((name) => request.nextUrl.searchParams.get(name));
  const { rows, error } = await fetchEntryRows(supabase, f, MAX_EXPORT_ROWS);
  if (error) return new NextResponse("Couldn't load entries: " + error, { status: 500 });

  const hours = rows.reduce((s, r) => s + Number(r.hours ?? 0), 0);
  const value = rows.reduce((s, r) => s + Number(r.value ?? 0), 0);
  const filters = entryFilterQuery(f).replace(/&/g, " · ").replace(/=/g, ": ");

  const report: Report = {
    title: "All entries",
    subtitle: `${f.from} to ${f.to} · ${rows.length} entries${rows.length === MAX_EXPORT_ROWS ? " (row limit reached, narrow the dates)" : ""} · filters: ${filters}`,
    tables: [
      {
        name: "Timesheet",
        empty: "No entries match those filters.",
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "employee", label: "Employee", type: "text" },
          { key: "project", label: "Project", type: "text" },
          { key: "project_no", label: "Project No", type: "text" },
          { key: "work_type", label: "Work Type", type: "text" },
          { key: "chargeable", label: "Chargeable", type: "text" },
          { key: "hours", label: "Hours", type: "hours" },
          { key: "description", label: "Task Description", type: "text" },
          { key: "rate_override", label: "Rate Override", type: "money" },
          { key: "rate", label: "Rate ($/hr)", type: "money" },
          { key: "value", label: "Value ($)", type: "money" },
          { key: "approved_by", label: "Approved By", type: "text" },
          { key: "invoiced", label: "Invoiced?", type: "text" },
          { key: "invoice_no", label: "Invoice No", type: "text" },
          { key: "status", label: "Status", type: "text" },
        ],
        rows: rows.map((r) => ({
          date: r.entry_date,
          employee: r.employee,
          project: r.project,
          project_no: r.project_no,
          work_type: r.work_type,
          chargeable: r.chargeable ? "Yes" : "No",
          hours: Number(r.hours ?? 0),
          description: r.description,
          rate_override: r.rate_override,
          rate: r.chargeable ? r.rate : null,
          value: r.value,
          approved_by: r.approved_by_name,
          invoiced: r.status === "invoiced" ? "Yes" : "No",
          invoice_no: r.invoice_no,
          status: title(r.status),
        })),
        totals: { date: "TOTAL", hours: Math.round(hours * 100) / 100, value: Math.round(value * 100) / 100 },
      },
    ],
  };

  return xlsxResponse(await reportToXlsx(report), `stable-structure-entries-${f.from}-to-${f.to}.xlsx`);
}
