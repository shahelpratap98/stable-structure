import { isApprover } from "@/lib/auth";
import { addDays, isIsoDate, todayNZ, weekStart } from "@/lib/dates";
import { REPORTS, type ReportParams, type ReportSlug } from "@/lib/reports";
import type { Profile } from "@/lib/types";

type Raw = (name: string) => string | null | undefined;

export function findReport(slug: string) {
  return REPORTS.find((r) => r.slug === slug);
}

// Same parsing for the page (searchParams) and the Excel route (URL query).
// Employees are always pinned to themselves, whatever the URL says; the
// database enforces the same thing.
export function parseReportParams(slug: ReportSlug, get: Raw, profile: Profile): ReportParams {
  const today = todayNZ();
  const approver = isApprover(profile.role);
  const defaultFrom = slug === "hours-check" ? addDays(weekStart(today), -7) : today.slice(0, 8) + "01";

  const from = get("from");
  const to = get("to");
  const chargeable = get("chargeable");
  const safeFrom = isIsoDate(from) ? from : defaultFrom;
  const safeTo = isIsoDate(to) && to >= safeFrom ? to : today >= safeFrom ? today : safeFrom;

  let userId = get("user") ?? "";
  if (!approver) userId = profile.user_id;
  else if (slug === "employee" && !userId) userId = profile.user_id;

  return {
    from: safeFrom,
    to: safeTo,
    userId,
    projectId: get("project") ?? "",
    chargeable: chargeable === "yes" || chargeable === "no" ? chargeable : "",
    showMoney: approver,
    selfId: profile.user_id,
  };
}

export function reportQuery(p: ReportParams): string {
  const q = new URLSearchParams({ from: p.from, to: p.to });
  if (p.userId) q.set("user", p.userId);
  if (p.projectId) q.set("project", p.projectId);
  if (p.chargeable) q.set("chargeable", p.chargeable);
  return q.toString();
}
