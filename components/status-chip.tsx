import type { EntryStatus } from "@/lib/types";

const STYLES: Record<EntryStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-surface-2 text-muted" },
  submitted: { label: "Submitted", className: "bg-accent-100 text-accent-600" },
  returned: { label: "Returned", className: "bg-bad-bg text-bad" },
  approved: { label: "Approved", className: "bg-ok-bg text-ok" },
  invoiced: { label: "Invoiced", className: "bg-steel-100 text-steel" },
};

export function StatusChip({ status }: { status: EntryStatus }) {
  const s = STYLES[status];
  return <span className={`chip ${s.className}`}>{s.label}</span>;
}
