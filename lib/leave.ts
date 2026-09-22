import { addDays, isWeekend } from "@/lib/dates";

export type LeaveType = "annual" | "sick";
export type LeaveStatus = "requested" | "approved" | "declined" | "cancelled";

export const LEAVE_LABEL: Record<LeaveType, string> = { annual: "Annual leave", sick: "Sick leave" };

// Tone per type, used by the calendar and the chips. "leave" is what staff see
// for other people's time off, where the type is not shown.
export const LEAVE_TONE: Record<LeaveType | "leave", { chip: string; block: string }> = {
  annual: { chip: "bg-accent-100 text-accent-600", block: "bg-accent-100 text-accent-600 border-accent/30" },
  sick: { chip: "bg-warn-bg text-warn", block: "bg-warn-bg text-warn border-warn/30" },
  leave: { chip: "bg-steel-100 text-steel", block: "bg-steel-100 text-steel border-line-2" },
};

export type LeaveRequest = {
  id: string;
  user_id: string;
  employee: string;
  leave_type: LeaveType | null; // null when the reader may not see it
  start_date: string;
  end_date: string;
  days: number;
  status: LeaveStatus;
  note?: string;
  decision_note?: string | null;
  decided_by_name?: string | null;
  is_mine?: boolean;
};

export type LeaveBalance = {
  user_id: string;
  employee: string;
  leave_year_start: string;
  leave_year_end: string;
  annual_entitlement: number;
  annual_taken: number;
  annual_pending: number;
  sick_entitlement: number;
  sick_taken: number;
  sick_pending: number;
};

// Same rule as public.working_days(): weekdays that are not public holidays.
export function workingDays(from: string, to: string, holidays: Set<string>): number {
  if (to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isWeekend(d) && !holidays.has(d)) n++;
  }
  return n;
}

export const monthStart = (iso: string) => iso.slice(0, 8) + "01";
export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}
