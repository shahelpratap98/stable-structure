import "server-only";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import type { Column, Report } from "@/lib/reports";

const NUM_FMT: Partial<Record<Column["type"], string>> = {
  hours: "0.00",
  money: '"$"#,##0.00',
  int: "0",
  date: "dd/mm/yyyy",
};

const toCell = (value: unknown, col: Column) => {
  if (value === null || value === undefined || value === "") return null;
  if (col.type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value + "T00:00:00Z");
  return value;
};

// One worksheet per table, same columns as the screen. Shared by the report
// exports and the All entries export.
export async function reportToXlsx(report: Report): Promise<ArrayBuffer> {
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

    for (const row of table.rows) {
      sheet.addRow(table.columns.map((c) => toCell(row[c.key], c))).font = { name: "Arial" };
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
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }

  if (report.tables.length === 0) workbook.addWorksheet("Report").addRow([report.notice ?? "Nothing to export."]);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export function xlsxResponse(buffer: ArrayBuffer, filename: string) {
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
