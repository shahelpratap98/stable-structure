import type { SupabaseClient } from "@supabase/supabase-js";
import { formatHours } from "@/lib/dates";

// One definition per report, used by both the on-screen page and the Excel
// export so the two can never disagree.

export type ColumnType = "text" | "date" | "hours" | "money" | "int";
export type Column = { key: string; label: string; type: ColumnType };
export type Cell = string | number | null;
export type ReportTable = {
  name: string; // also the worksheet name (max 31 chars)
  columns: Column[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  empty: string;
};
export type Report = { title: string; subtitle: string; tables: ReportTable[]; notice?: string };

export const REPORTS = [
  { slug: "hours-check", label: "Hours check", approverOnly: false },
  { slug: "employee", label: "Employee detail", approverOnly: false },
  { slug: "project", label: "Project detail", approverOnly: true },
  { slug: "summary", label: "Period summary", approverOnly: true },
  { slug: "statement", label: "Client statement", approverOnly: true },
  { slug: "matrix", label: "Project × employee", approverOnly: true },
] as const;
export type ReportSlug = (typeof REPORTS)[number]["slug"];

export type ReportParams = {
  from: string;
  to: string;
  userId: string; // "" = everyone
  projectId: string; // "" = all projects
  chargeable: "" | "yes" | "no";
  showMoney: boolean; // approvers only
  selfId: string; // employees are pinned to themselves
};

type Entry = {
  id: string;
  entry_date: string;
  user_id: string;
  employee: string;
  project_id: string | null;
  project_no: string | null;
  project: string | null;
  client: string | null;
  work_type: string | null;
  chargeable: boolean;
  hours: number | null;
  description: string;
  status: string;
  rate: number | null;
  value: number | null;
  approved_by_name: string | null;
  invoice_no: string | null;
};

const ENTRY_COLUMNS =
  "id, entry_date, user_id, employee, project_id, project_no, project, client, work_type, chargeable, hours, description, status, rate, value, approved_by_name, invoice_no";

const num = (v: unknown) => Number(v ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000) + 1;
const period = (p: ReportParams) => `${p.from} to ${p.to}`;

// PostgREST returns at most 1000 rows per request; page through the rest.
async function fetchEntries(supabase: SupabaseClient, p: ReportParams): Promise<Entry[]> {
  const all: Entry[] = [];
  for (let page = 0; page < 20; page++) {
    let q = supabase
      .from("v_entries")
      .select(ENTRY_COLUMNS)
      .neq("status", "draft") // drafts haven't been "sent"
      .gte("entry_date", p.from)
      .lte("entry_date", p.to)
      .order("entry_date")
      .order("employee")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (p.userId) q = q.eq("user_id", p.userId);
    if (p.projectId) q = q.eq("project_id", p.projectId);
    if (p.chargeable) q = q.eq("chargeable", p.chargeable === "yes");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as Entry[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

const detailColumns = (showMoney: boolean, withEmployee: boolean): Column[] => [
  { key: "date", label: "Date", type: "date" },
  ...(withEmployee ? [{ key: "employee", label: "Employee", type: "text" } as Column] : []),
  { key: "project_no", label: "Project No", type: "text" },
  { key: "project", label: "Project", type: "text" },
  { key: "work_type", label: "Work Type", type: "text" },
  { key: "chargeable", label: "Chargeable", type: "text" },
  { key: "hours", label: "Hours", type: "hours" },
  { key: "description", label: "Task Description", type: "text" },
  ...(showMoney
    ? ([
        { key: "rate", label: "Rate ($/hr)", type: "money" },
        { key: "value", label: "Value ($)", type: "money" },
      ] as Column[])
    : []),
  { key: "status", label: "Status", type: "text" },
  ...(showMoney ? [{ key: "invoice_no", label: "Invoice No", type: "text" } as Column] : []),
];

const detailRow = (e: Entry): Record<string, Cell> => ({
  date: e.entry_date,
  employee: e.employee,
  project_no: e.project_no,
  project: e.project,
  work_type: e.work_type,
  chargeable: e.chargeable ? "Yes" : "No",
  hours: num(e.hours),
  description: e.description,
  rate: e.chargeable ? e.rate : null,
  value: e.value,
  status: e.status.charAt(0).toUpperCase() + e.status.slice(1),
  invoice_no: e.invoice_no,
});

const sum = (rows: Entry[], f: (e: Entry) => number) => round2(rows.reduce((s, e) => s + f(e), 0));

// ------------------------------------------------------------------ hours check

async function hoursCheck(supabase: SupabaseClient, p: ReportParams): Promise<Report> {
  const title = "Hours check";
  const subtitle = `${period(p)} · short, over and full days against the standard day`;
  if (!p.userId && daysBetween(p.from, p.to) > 62) {
    return { title, subtitle, tables: [], notice: "For everyone at once, keep the range to two months or less. Pick one employee to look further back." };
  }

  type Day = { user_id: string; employee: string; day: string; is_weekend: boolean; holiday: string | null; hours: number; standard: number; overtime: number; status: string };
  let days: Day[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await supabase
      .rpc("hours_check", { p_from: p.from, p_to: p.to })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    days.push(...((data ?? []) as Day[]));
    if (!data || data.length < 1000) break;
  }
  if (p.userId) days = days.filter((d) => d.user_id === p.userId);

  const people = new Map<string, { employee: string; short: number; over: number; full: number; overtime: number; total: number }>();
  for (const d of days) {
    const s = people.get(d.user_id) ?? { employee: d.employee, short: 0, over: 0, full: 0, overtime: 0, total: 0 };
    if (d.status.startsWith("SHORT")) s.short++;
    else if (d.status.startsWith("Over")) s.over++;
    else if (d.status.startsWith("OK")) s.full++;
    s.overtime += num(d.overtime); // includes any weekend / public-holiday hours
    s.total += num(d.hours);
    people.set(d.user_id, s);
  }

  return {
    title,
    subtitle,
    tables: [
      {
        name: "By employee",
        empty: "No active staff.",
        columns: [
          { key: "employee", label: "Employee", type: "text" },
          { key: "short", label: "Short days", type: "int" },
          { key: "over", label: "Over days", type: "int" },
          { key: "full", label: "Full days", type: "int" },
          { key: "overtime", label: "Overtime hrs", type: "hours" },
          { key: "total", label: "Total hrs", type: "hours" },
        ],
        rows: [...people.values()].map((s) => ({ ...s, overtime: round2(s.overtime), total: round2(s.total) })),
      },
      {
        name: "Daily",
        empty: "No days in this range.",
        columns: [
          { key: "employee", label: "Employee", type: "text" },
          { key: "day", label: "Date", type: "date" },
          { key: "hours", label: "Hours", type: "hours" },
          { key: "standard", label: "Standard", type: "hours" },
          { key: "status", label: "Status", type: "text" },
        ],
        // Empty weekends are noise; public holidays always show so the gap is explained.
        rows: days
          .filter((d) => !d.is_weekend || d.holiday !== null || num(d.hours) > 0)
          .map((d) => ({ employee: d.employee, day: d.day, hours: num(d.hours), standard: num(d.standard), status: d.status })),
      },
    ],
  };
}

// ------------------------------------------------------------------ employee detail

async function employeeDetail(supabase: SupabaseClient, p: ReportParams): Promise<Report> {
  const title = "Employee detail";
  if (!p.userId) return { title, subtitle: period(p), tables: [], notice: "Pick an employee to see their time." };
  const entries = await fetchEntries(supabase, p);
  const name = entries[0]?.employee ?? "";

  return {
    title,
    subtitle: `${name ? name + " · " : ""}${period(p)} · ${formatHours(sum(entries, (e) => num(e.hours)))} hours across ${entries.length} entries`,
    tables: [
      {
        name: "Daily detail",
        empty: "No submitted time in this period.",
        columns: detailColumns(p.showMoney, false),
        rows: entries.map(detailRow),
        totals: { date: "TOTAL", hours: sum(entries, (e) => num(e.hours)), value: sum(entries, (e) => num(e.value)) },
      },
    ],
  };
}

// ------------------------------------------------------------------ project detail

async function projectDetail(supabase: SupabaseClient, p: ReportParams): Promise<Report> {
  const entries = await fetchEntries(supabase, p);
  const byPerson = new Map<string, { employee: string; hours: number; entries: number; amount: number }>();
  for (const e of entries) {
    const s = byPerson.get(e.user_id) ?? { employee: e.employee, hours: 0, entries: 0, amount: 0 };
    s.hours += num(e.hours);
    s.entries++;
    s.amount += num(e.value);
    byPerson.set(e.user_id, s);
  }
  const projectName = p.projectId && entries[0] ? `${entries[0].project_no} · ${entries[0].project}` : "All projects";

  return {
    title: "Project detail",
    subtitle: `${projectName} · ${period(p)}${p.chargeable ? ` · chargeable: ${p.chargeable}` : ""}`,
    tables: [
      {
        name: "Summary by employee",
        empty: "No submitted time in this period.",
        columns: [
          { key: "employee", label: "Employee", type: "text" },
          { key: "hours", label: "Hours", type: "hours" },
          { key: "entries", label: "Entries", type: "int" },
          { key: "amount", label: "Amount ($)", type: "money" },
        ],
        rows: [...byPerson.values()].map((s) => ({ ...s, hours: round2(s.hours), amount: round2(s.amount) })),
        totals: { employee: "TOTAL", hours: sum(entries, (e) => num(e.hours)), entries: entries.length, amount: sum(entries, (e) => num(e.value)) },
      },
      {
        name: "Daily detail",
        empty: "No submitted time in this period.",
        columns: detailColumns(true, true),
        rows: entries.map(detailRow),
      },
    ],
  };
}

// ------------------------------------------------------------------ period summary

async function periodSummary(supabase: SupabaseClient, p: ReportParams): Promise<Report> {
  const [{ data, error }, { data: types }] = await Promise.all([
    supabase.rpc("project_summary", { p_from: p.from, p_to: p.to }),
    supabase.from("work_types").select("name").order("sort_order"),
  ]);
  if (error) throw new Error(error.message);
  type Row = {
    project_no: string; project: string; client: string | null; rate: number | null; total_hours: number; amount: number | null; entries: number;
    hours_by_work_type: Record<string, number>; untagged_hours: number; non_chargeable_hours: number; work_performed: string | null;
    uninvoiced_hours: number; uninvoiced_amount: number | null;
  };
  const rows = (data ?? []) as Row[];
  // Only work types that were actually used, in their configured order.
  const used = (types ?? []).map((t) => t.name as string).filter((name) => rows.some((r) => num(r.hours_by_work_type?.[name]) > 0));

  const columns: Column[] = [
    { key: "project_no", label: "Project No", type: "text" },
    { key: "project", label: "Project", type: "text" },
    { key: "client", label: "Client", type: "text" },
    { key: "rate", label: "Rate", type: "money" },
    { key: "total_hours", label: "Total Hours", type: "hours" },
    { key: "amount", label: "Amount ($)", type: "money" },
    { key: "entries", label: "Entries", type: "int" },
    ...used.map((name) => ({ key: "wt:" + name, label: name, type: "hours" }) as Column),
    { key: "untagged", label: "Untagged", type: "hours" },
    { key: "non_chargeable", label: "Non-chargeable", type: "hours" },
    { key: "uninvoiced_hours", label: "Uninvoiced Hours", type: "hours" },
    { key: "uninvoiced_amount", label: "Uninvoiced Amount ($)", type: "money" },
    { key: "work_performed", label: "Work Performed", type: "text" },
  ];

  const tableRows = rows.map((r) => ({
    project_no: r.project_no, project: r.project, client: r.client, rate: r.rate,
    total_hours: num(r.total_hours), amount: num(r.amount), entries: num(r.entries),
    ...Object.fromEntries(used.map((name) => ["wt:" + name, num(r.hours_by_work_type?.[name])])),
    untagged: num(r.untagged_hours), non_chargeable: num(r.non_chargeable_hours),
    uninvoiced_hours: num(r.uninvoiced_hours), uninvoiced_amount: num(r.uninvoiced_amount),
    work_performed: r.work_performed,
  }));
  const total = (key: string) => round2(tableRows.reduce((s, r) => s + num((r as Record<string, Cell>)[key]), 0));

  return {
    title: "Period summary",
    subtitle: `${period(p)} · ${formatHours(total("total_hours"))} hours · ${rows.length} projects`,
    tables: [
      {
        name: "Summary",
        empty: "No submitted time in this period.",
        columns,
        rows: tableRows,
        totals: {
          project_no: "PERIOD TOTALS", total_hours: total("total_hours"), amount: total("amount"), entries: total("entries"),
          ...Object.fromEntries(used.map((name) => ["wt:" + name, total("wt:" + name)])),
          untagged: total("untagged"), non_chargeable: total("non_chargeable"),
          uninvoiced_hours: total("uninvoiced_hours"), uninvoiced_amount: total("uninvoiced_amount"),
        },
      },
    ],
  };
}

// ------------------------------------------------------------------ client statement

async function clientStatement(supabase: SupabaseClient, p: ReportParams): Promise<Report> {
  const title = "Client statement";
  if (!p.projectId) return { title, subtitle: period(p), tables: [], notice: "Pick a project to build its statement." };
  const entries = await fetchEntries(supabase, p);
  const types = [...new Set(entries.map((e) => e.work_type).filter((t): t is string => Boolean(t)))];

  const people = new Map<string, { employee: string; rows: Entry[] }>();
  for (const e of entries) {
    const s = people.get(e.user_id) ?? { employee: e.employee, rows: [] };
    s.rows.push(e);
    people.set(e.user_id, s);
  }

  const rows = [...people.values()].map(({ employee, rows: r }) => {
    const hours = sum(r, (e) => num(e.hours));
    const amount = sum(r, (e) => num(e.value));
    const chargeableHours = sum(r.filter((e) => e.chargeable), (e) => num(e.hours));
    return {
      employee, hours,
      rate: chargeableHours > 0 ? round2(amount / chargeableHours) : null, // effective rate
      amount,
      days: new Set(r.map((e) => e.entry_date)).size,
      entries: r.length,
      ...Object.fromEntries(types.map((t) => ["wt:" + t, sum(r.filter((e) => e.work_type === t), (e) => num(e.hours))])),
      work_performed: [...new Set(r.map((e) => e.description.trim()).filter(Boolean))].join("; "),
    } as Record<string, Cell>;
  });

  const first = entries[0];
  return {
    title,
    subtitle: `${first ? `${first.project_no} · ${first.project} · ${first.client ?? "no client"} · ` : ""}${period(p)}`,
    tables: [
      {
        name: "Statement",
        empty: "No submitted time on this project in this period.",
        columns: [
          { key: "employee", label: "Employee", type: "text" },
          { key: "hours", label: "Hours", type: "hours" },
          { key: "rate", label: "Rate ($/hr)", type: "money" },
          { key: "amount", label: "Amount ($)", type: "money" },
          { key: "days", label: "Days Worked", type: "int" },
          { key: "entries", label: "Entries", type: "int" },
          ...types.map((t) => ({ key: "wt:" + t, label: t, type: "hours" }) as Column),
          { key: "work_performed", label: "Work Performed", type: "text" },
        ],
        rows,
        totals: { employee: "TOTAL", hours: sum(entries, (e) => num(e.hours)), amount: sum(entries, (e) => num(e.value)), entries: entries.length },
      },
    ],
  };
}

// ------------------------------------------------------------------ project x employee

async function matrix(supabase: SupabaseClient, p: ReportParams): Promise<Report> {
  const entries = await fetchEntries(supabase, { ...p, userId: "", projectId: "" });
  const staff = [...new Map(entries.map((e) => [e.user_id, e.employee])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const projects = new Map<string, { project_no: string; project: string; rows: Entry[] }>();
  for (const e of entries) {
    if (!e.project_id) continue;
    const s = projects.get(e.project_id) ?? { project_no: e.project_no ?? "", project: e.project ?? "", rows: [] };
    s.rows.push(e);
    projects.set(e.project_id, s);
  }

  const rows = [...projects.values()]
    .sort((a, b) => a.project_no.localeCompare(b.project_no))
    .map(({ project_no, project, rows: r }) => ({
      project_no, project,
      ...Object.fromEntries(staff.map(([id]) => ["u:" + id, sum(r.filter((e) => e.user_id === id), (e) => num(e.hours))])),
      total_hours: sum(r, (e) => num(e.hours)),
      total_amount: sum(r, (e) => num(e.value)),
    }) as Record<string, Cell>);

  return {
    title: "Hours by project and employee",
    subtitle: period(p),
    tables: [
      {
        name: "Project x Employee",
        empty: "No submitted time in this period.",
        columns: [
          { key: "project_no", label: "Project No", type: "text" },
          { key: "project", label: "Project", type: "text" },
          ...staff.map(([id, name]) => ({ key: "u:" + id, label: name, type: "hours" }) as Column),
          { key: "total_hours", label: "Total Hours", type: "hours" },
          { key: "total_amount", label: "Total Amount ($)", type: "money" },
        ],
        rows,
        totals: {
          project_no: "PERIOD TOTALS",
          ...Object.fromEntries(staff.map(([id]) => ["u:" + id, sum(entries.filter((e) => e.user_id === id), (e) => num(e.hours))])),
          total_hours: sum(entries, (e) => num(e.hours)),
          total_amount: sum(entries, (e) => num(e.value)),
        },
      },
    ],
  };
}

const BUILDERS: Record<ReportSlug, (s: SupabaseClient, p: ReportParams) => Promise<Report>> = {
  "hours-check": hoursCheck,
  employee: employeeDetail,
  project: projectDetail,
  summary: periodSummary,
  statement: clientStatement,
  matrix,
};

export function buildReport(slug: ReportSlug, supabase: SupabaseClient, params: ReportParams): Promise<Report> {
  return BUILDERS[slug](supabase, params);
}
