import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceStatusChip } from "@/components/invoice-status-chip";
import { isAdmin, requireApprover } from "@/lib/auth";
import { formatDay, formatHours } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invoices" };

const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

type Uninvoiced = { project_id: string; project_no: string; project: string; client: string | null; hours: number; amount: number | null; entries: number; first_date: string; last_date: string };
type InvoiceRow = { id: string; invoice_no: string; issued_on: string; due_on: string; total: number; total_hours: number; status: "draft" | "sent" | "paid" | "void"; is_external?: boolean; project: { project_no: string; name: string } | null; client: { name: string } | null };

export default async function InvoicesPage() {
  const profile = await requireApprover();
  const admin = isAdmin(profile.role);
  const supabase = await createClient();

  const [uninvoicedRes, invoicesRes] = await Promise.all([
    supabase.from("v_uninvoiced").select("*").order("amount", { ascending: false, nullsFirst: false }),
    supabase
      .from("invoices")
      .select("*, project:projects(project_no, name), client:clients(name)")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const uninvoiced = (uninvoicedRes.data ?? []) as Uninvoiced[];
  const invoices = (invoicesRes.data ?? []) as unknown as InvoiceRow[];

  const readyHours = uninvoiced.reduce((s, u) => s + Number(u.hours), 0);
  const readyAmount = uninvoiced.reduce((s, u) => s + Number(u.amount ?? 0), 0);
  const outstanding = invoices.filter((i) => i.status === "sent" && !i.is_external).reduce((s, i) => s + Number(i.total), 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Invoices</h1>
          <p className="mt-1 text-muted">Approved, chargeable time that hasn&apos;t been billed yet, and every invoice raised.</p>
        </div>
        {admin ? <Link href="/portal/invoices/new" className="btn btn-primary">+ New invoice</Link> : null}
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-sm text-muted">Ready to invoice</dt>
          <dd className="font-display text-2xl font-semibold text-ink tabular-nums">{money.format(readyAmount)}</dd>
          <dd className="text-sm text-muted tabular-nums">{formatHours(readyHours)} h across {uninvoiced.length} {uninvoiced.length === 1 ? "project" : "projects"}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-sm text-muted">Sent, awaiting payment</dt>
          <dd className="font-display text-2xl font-semibold text-ink tabular-nums">{money.format(outstanding)}</dd>
          <dd className="text-sm text-muted">{invoices.filter((i) => i.status === "sent" && !i.is_external).length} portal invoices (incl. GST)</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-sm text-muted">Drafts not yet sent</dt>
          <dd className="font-display text-2xl font-semibold text-ink tabular-nums">{invoices.filter((i) => i.status === "draft").length}</dd>
          <dd className="text-sm text-muted">Review, then mark as sent</dd>
        </div>
      </dl>

      <section aria-labelledby="uninvoiced-heading">
        <h2 id="uninvoiced-heading" className="text-xl font-semibold">Ready to invoice</h2>
        {uninvoiced.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-surface px-5 py-6 text-center text-muted">Nothing waiting. Time shows here once it&apos;s approved and chargeable.</p>
        ) : (
          <div className="mt-3 relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Project</th>
                  <th className="px-4 py-2.5 font-semibold">Client</th>
                  <th className="px-4 py-2.5 font-semibold">Dates</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Hours</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount (excl. GST)</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {uninvoiced.map((u) => (
                  <tr key={u.project_id}>
                    <td className="px-4 py-2.5 font-semibold text-ink">{u.project_no} · {u.project}</td>
                    <td className="px-4 py-2.5">{u.client ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDay(u.first_date, { day: "numeric", month: "short" })} – {formatDay(u.last_date, { day: "numeric", month: "short", year: "2-digit" })}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatHours(Number(u.hours))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{u.amount === null ? <span className="chip bg-warn-bg text-warn">No rate set</span> : money.format(Number(u.amount))}</td>
                    <td className="px-4 py-2.5 text-right">
                      {admin ? (
                        <Link href={`/portal/invoices/new?project=${u.project_id}&from=${u.first_date}&to=${u.last_date}`} className="font-semibold text-accent-600 hover:underline">Invoice this</Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="invoices-heading">
        <h2 id="invoices-heading" className="text-xl font-semibold">All invoices</h2>
        {invoices.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-surface px-5 py-6 text-center text-muted">No invoices yet.</p>
        ) : (
          <div className="mt-3 relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Invoice</th>
                  <th className="px-4 py-2.5 font-semibold">Project</th>
                  <th className="px-4 py-2.5 font-semibold">Bill to</th>
                  <th className="px-4 py-2.5 font-semibold">Issued</th>
                  <th className="px-4 py-2.5 font-semibold">Due</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total (incl. GST)</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5"><Link href={`/portal/invoices/${i.id}`} className="font-semibold text-accent-600 tabular-nums hover:underline">{i.invoice_no}</Link>{i.is_external ? <span className="chip ml-2 bg-steel-100 text-steel">Billed elsewhere</span> : null}</td>
                    <td className="px-4 py-2.5">{i.project?.project_no} · {i.project?.name}</td>
                    <td className="px-4 py-2.5">{i.client?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDay(i.issued_on, { day: "2-digit", month: "short", year: "2-digit" })}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDay(i.due_on, { day: "2-digit", month: "short", year: "2-digit" })}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money.format(Number(i.total))}</td>
                    <td className="px-4 py-2.5"><InvoiceStatusChip status={i.status} dueOn={i.due_on} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
