import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { isApprover } from "@/lib/auth";
import { findReport, parseReportParams } from "@/lib/report-params";
import { buildReport, type Column } from "@/lib/reports";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

const NUM_FMT: Partial<Record<Column["type"], string>> = {
  hours: "0.00",
  money: '"$"#,##0.00',
  int: "0",
  date: "dd/mm/yyyy",
};

// One worksheet per table, same columns as the screen.
export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in first.", { status: 401 });

  const limit = await rateLimit("downloads", user.id);
  if (!limit.ok) {
    return new NextResponse("Too many downloads. Wait a few minutes and try again.", { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, display_name, email, role, standard_day_hours, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.is_active) return new NextResponse("Account inactive.", { status: 403 });

  const { report: slug } = await params;
  const def = findReport(slug);
  if (!def) return new NextResponse("Unknown report.", { status: 404 });
  if (def.approverOnly && !isApprover(profile.role)) return new NextResponse("Not allowed.", { status: 403 });

  const p = parseReportParams(def.slug, (name) => request.nextUrl.searchParams.get(name), profile as Profile);
  const report = await buildReport(def.slug, supabase, p);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Stable Structure Portal";
  workbook.created = new Date();

  for (const table of report.tables) {
    const sheet = workbook.addWorksheet(table.name.replace(/[\\/*?:[\]]/g, " ").slice(0, 31));
    sheet.addRow([report.title]).font = { name: "Arial", bold: true, size: 14 };
    sheet.addRow([report.subtitle]).font = { name: "Arial", color: { argb: "FF556577" } };
    sheet.addRow([]);

    const header = sheet.addRow(table.columns.map((c) => c.label));
    header.eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C1E33" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });

    const toCell = (value: unknown, col: Column) => {
      if (value === null || value === undefined || value === "") return null;
      if (col.type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value + "T00:00:00Z");
      return value;
    };

    for (const row of table.rows) {
      const added = sheet.addRow(table.columns.map((c) => toCell(row[c.key], c)));
      added.font = { name: "Arial" };
    }
    if (table.totals) {
      const totals = sheet.addRow(table.columns.map((c) => toCell(table.totals?.[c.key], c)));
      totals.font = { name: "Arial", bold: true };
      totals.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { top: { style: "medium" } };
      });
    }

    table.columns.forEach((c, i) => {
      const column = sheet.getColumn(i + 1);
      const fmt = NUM_FMT[c.type];
      if (fmt) column.numFmt = fmt;
      const longest = Math.max(c.label.length, ...table.rows.map((r) => String(r[c.key] ?? "").length));
      column.width = Math.min(Math.max(longest + 2, 10), c.type === "text" ? 60 : 18);
    });
    sheet.views = [{ state: "frozen", ySplit: 4 }];
  }

  if (report.tables.length === 0) workbook.addWorksheet("Report").addRow([report.notice ?? "Nothing to export."]);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `stable-structure-${def.slug}-${p.from}-to-${p.to}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
