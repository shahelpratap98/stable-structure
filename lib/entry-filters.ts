import type { SupabaseClient } from "@supabase/supabase-js";
import { isIsoDate, todayNZ } from "@/lib/dates";
import type { EntryStatus, EntryView } from "@/lib/types";

// Filters for the All entries grid. Parsed once here so the page and its
// Excel export always agree on what "these filters" means.

export const ENTRY_STATUSES: EntryStatus[] = ["draft", "submitted", "returned", "approved", "invoiced"];

export type EntryFilters = { from: string; to: string; userId: string; projectId: string; status: EntryStatus | ""; chargeable: "" | "yes" | "no" };
export type EntryRow = EntryView & { invoice_no: string | null; approved_by_name: string | null; rate_override: number | null };

type Raw = (name: string) => string | null | undefined;

export function parseEntryFilters(get: Raw): EntryFilters {
  const today = todayNZ();
  const from = get("from");
  const to = get("to");
  const status = get("status") ?? "";
  const chargeable = get("chargeable");
  return {
    from: isIsoDate(from) ? from : today.slice(0, 8) + "01",
    to: isIsoDate(to) ? to : today,
    userId: get("user") ?? "",
    projectId: get("project") ?? "",
    status: ENTRY_STATUSES.includes(status as EntryStatus) ? (status as EntryStatus) : "",
    chargeable: chargeable === "yes" || chargeable === "no" ? chargeable : "",
  };
}

export function entryFilterQuery(f: EntryFilters): string {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  if (f.userId) q.set("user", f.userId);
  if (f.projectId) q.set("project", f.projectId);
  if (f.status) q.set("status", f.status);
  if (f.chargeable) q.set("chargeable", f.chargeable);
  return q.toString();
}

const COLUMNS =
  "id, entry_date, user_id, employee, project_no, project, work_type, chargeable, hours, description, status, rate, rate_override, value, approved_by_name, invoice_no";

// `max` rows, newest first. PostgREST caps a single request at 1000 rows, so
// page through it.
export async function fetchEntryRows(supabase: SupabaseClient, f: EntryFilters, max: number): Promise<{ rows: EntryRow[]; error: string | null }> {
  const rows: EntryRow[] = [];
  for (let offset = 0; offset < max; offset += 1000) {
    let q = supabase
      .from("v_entries")
      .select(COLUMNS)
      .gte("entry_date", f.from)
      .lte("entry_date", f.to)
      .order("entry_date", { ascending: false })
      .order("employee")
      .order("id")
      .range(offset, Math.min(offset + 999, max - 1));
    if (f.userId) q = q.eq("user_id", f.userId);
    if (f.projectId) q = q.eq("project_id", f.projectId);
    if (f.status) q = q.eq("status", f.status);
    if (f.chargeable) q = q.eq("chargeable", f.chargeable === "yes");
    const { data, error } = await q;
    if (error) return { rows, error: error.message };
    rows.push(...((data ?? []) as EntryRow[]));
    if (!data || data.length < 1000) break;
  }
  return { rows, error: null };
}
