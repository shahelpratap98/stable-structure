import type { Metadata } from "next";
import { requireApprover } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EntryView } from "@/lib/types";
import { ApprovalQueue } from "./approval-queue";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  await requireApprover();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_entries")
    .select("id, entry_date, user_id, employee, project_no, project, work_type, chargeable, hours, description, status, rate, value")
    .eq("status", "submitted")
    .order("employee")
    .order("entry_date")
    .order("created_at");

  const entries = (data ?? []) as EntryView[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Approvals</h1>
        <p className="mt-1 text-muted">
          Submitted time waiting for sign-off. Approving freezes the charge-out rate on each entry so it can be invoiced.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">Couldn&apos;t load the queue: {error.message}</p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-5 py-8 text-center text-muted">
          Nothing waiting. Submitted days will show up here.
        </p>
      ) : (
        <ApprovalQueue key={entries.map((e) => e.id).join(",")} entries={entries} />
      )}
    </div>
  );
}
