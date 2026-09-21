import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { StatusChip } from "@/components/status-chip";
import { requireApprover } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { deleteEntry } from "../actions";
import { EntryForm } from "../entry-form";

export const metadata: Metadata = { title: "Edit entry" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireApprover();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: e } = await supabase
    .from("v_entries")
    .select("id, entry_date, employee, project_id, work_type_id, chargeable, hours, description, status, rate_override, approved_by_name, invoice_no, return_note")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  const locked = e.status === "invoiced";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/portal/entries" className="text-sm font-semibold text-accent-600 hover:underline">← All entries</Link>
        <h1 className="mt-2 text-3xl font-semibold">{e.employee}, {formatDay(e.entry_date, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <StatusChip status={e.status} />
          {e.approved_by_name ? <span>Approved by {e.approved_by_name}</span> : null}
          {e.invoice_no ? <span>· Invoice {e.invoice_no}</span> : null}
          {e.status === "returned" && e.return_note ? <span>· Returned: {e.return_note}</span> : null}
        </p>
      </div>

      {locked ? (
        <p className="rounded-xl border border-line bg-steel-100 px-4 py-3 text-sm text-steel">
          This entry is on invoice {e.invoice_no}, so it&apos;s locked. Void the invoice to change it.
        </p>
      ) : null}

      <section className="rounded-xl border border-line bg-surface p-5">
        <EntryForm entry={e} locked={locked} />
      </section>

      {!locked ? (
        <section aria-labelledby="delete-heading" className="rounded-xl border border-bad/30 bg-surface p-5">
          <h2 id="delete-heading" className="text-lg font-semibold">Delete this entry</h2>
          <p className="mt-1 text-sm text-muted">Removes it for good. The deletion is recorded in the audit log.</p>
          <ActionForm action={deleteEntry} submitLabel="Delete entry" pendingLabel="Deleting…" quiet className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="id" value={e.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" className="size-4 accent-ink" />
              Yes, delete this entry
            </label>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
