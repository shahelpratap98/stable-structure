import type { SupabaseClient } from "@supabase/supabase-js";

export type InvoiceLine = { description: string; detail: string; hours: number; rate: number | null; amount: number };

export type InvoiceRecord = {
  id: string;
  invoice_no: string;
  project_id: string;
  period_from: string;
  period_to: string;
  issued_on: string;
  due_on: string;
  total_hours: number;
  subtotal: number;
  gst_rate: number;
  gst: number;
  total: number;
  status: "draft" | "sent" | "paid" | "void";
  is_external?: boolean; // billed outside the portal (column added by migration 0700)
  project: { project_no: string; name: string } | null;
  client: { name: string; billing_email: string | null; address: string | null } | null;
};

export type CompanySettings = {
  company_name: string;
  company_tagline: string;
  gst_number: string | null;
  address: string | null;
  contact_line: string | null;
  bank_details: string | null;
  gst_rate: number;
  payment_terms_days: number;
  invoice_prefix: string;
  next_invoice_no: number;
};

type EntryRow = { work_type: string | null; description: string; hours: number | null; rate: number | null; value: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

// One line per work type and rate (the workbook's "Description of work").
// Amounts are the sum of each entry's own rounded value, exactly how the
// database totals the invoice, so lines always add up to the subtotal.
function toLines(entries: EntryRow[]): InvoiceLine[] {
  const groups = new Map<string, InvoiceLine & { tasks: Set<string> }>();
  for (const e of entries) {
    const key = `${e.work_type ?? "Professional services"}|${e.rate ?? ""}`;
    const g = groups.get(key) ?? { description: e.work_type ?? "Professional services", detail: "", hours: 0, rate: e.rate, amount: 0, tasks: new Set<string>() };
    g.hours += Number(e.hours ?? 0);
    g.amount += Number(e.value ?? 0);
    if (e.description.trim()) g.tasks.add(e.description.trim());
    groups.set(key, g);
  }
  return [...groups.values()].map(({ tasks, ...line }) => ({
    ...line,
    hours: round2(line.hours),
    amount: round2(line.amount),
    detail: [...tasks].join("; "),
  }));
}

const LINE_COLUMNS = "work_type, description, hours, rate, value";

// What an invoice for this project and period WOULD contain: approved,
// chargeable, not yet invoiced. Mirrors the rule inside create_invoice.
export async function previewInvoice(supabase: SupabaseClient, projectId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from("v_entries")
    .select(LINE_COLUMNS)
    .eq("project_id", projectId)
    .eq("status", "approved")
    .eq("chargeable", true)
    .is("invoice_id", null)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date")
    .limit(5000);
  if (error) throw new Error(error.message);
  const entries = (data ?? []) as EntryRow[];
  const lines = toLines(entries);
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, subtotal, hours: round2(lines.reduce((s, l) => s + l.hours, 0)), missingRate: entries.some((e) => e.rate === null), count: entries.length };
}

export async function loadInvoice(supabase: SupabaseClient, id: string) {
  const [{ data: invoice }, { data: entries }, { data: settings }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, project:projects(project_no, name), client:clients(name, billing_email, address)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("v_entries").select(LINE_COLUMNS).eq("invoice_id", id).order("entry_date").limit(5000),
    supabase.from("settings").select("*").maybeSingle(),
  ]);
  if (!invoice || !settings) return null;
  return {
    invoice: invoice as unknown as InvoiceRecord,
    lines: toLines((entries ?? []) as EntryRow[]),
    settings: settings as CompanySettings,
  };
}
