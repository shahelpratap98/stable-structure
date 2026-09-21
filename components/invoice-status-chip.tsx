import { todayNZ } from "@/lib/dates";

const STYLES = {
  draft: { label: "Draft", className: "bg-surface-2 text-muted" },
  sent: { label: "Sent", className: "bg-accent-100 text-accent-600" },
  paid: { label: "Paid", className: "bg-ok-bg text-ok" },
  void: { label: "Void", className: "bg-bad-bg text-bad" },
} as const;

export function InvoiceStatusChip({ status, dueOn }: { status: keyof typeof STYLES; dueOn?: string }) {
  if (status === "sent" && dueOn && dueOn < todayNZ()) {
    return <span className="chip bg-warn-bg text-warn">Overdue</span>;
  }
  const s = STYLES[status];
  return <span className={`chip ${s.className}`}>{s.label}</span>;
}
