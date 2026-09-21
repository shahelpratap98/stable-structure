import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { InvoiceLines } from "@/components/invoice-lines";
import { InvoiceStatusChip } from "@/components/invoice-status-chip";
import { isAdmin, requireApprover } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { emailEnabled } from "@/lib/email";
import { loadInvoice } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/server";
import { emailInvoice, setInvoiceStatus, voidInvoice } from "../actions";
import { DownloadButton } from "@/components/pending-buttons";

export const metadata: Metadata = { title: "Invoice" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const longDate = (iso: string) => formatDay(iso, { day: "numeric", month: "long", year: "numeric" });

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireApprover();
  const admin = isAdmin(profile.role);
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const loaded = await loadInvoice(supabase, id);
  if (!loaded) notFound();
  const { invoice, lines, settings } = loaded;
  const isVoid = invoice.status === "void";
  const external = Boolean(invoice.is_external);
  const incomplete = !settings.gst_number || !settings.bank_details;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/portal/invoices" className="text-sm font-semibold text-accent-600 hover:underline">← Invoices</Link>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-semibold">
            {external ? "Invoice" : "Tax invoice"} {invoice.invoice_no}
            <InvoiceStatusChip status={invoice.status} dueOn={invoice.due_on} />
          </h1>
        </div>
        {external ? null : <DownloadButton href={`/portal/invoices/${invoice.id}/pdf`} busyLabel="Creating PDF…" className="btn btn-primary">Download PDF</DownloadButton>}
      </div>

      {external ? (
        <p className="rounded-xl border border-line bg-steel-100 px-4 py-3 text-sm text-steel">
          <span className="font-semibold">Billed outside the portal.</span> This records that the time below was invoiced from another system as {invoice.invoice_no}, so it
          no longer shows as ready to invoice. The amounts are the portal&apos;s own calculation and may differ from the real invoice. There is no PDF.
        </p>
      ) : null}

      {incomplete && !isVoid && !external ? (
        <p className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          The invoice header is missing your {[!settings.gst_number && "GST number", !settings.bank_details && "bank details"].filter(Boolean).join(" and ")}.
          {admin ? <> Add them under <Link href="/portal/admin/settings" className="font-semibold underline">Setup → Company &amp; GST</Link> before sending.</> : null}
        </p>
      ) : null}

      <section aria-label="Invoice details" className="grid gap-6 rounded-xl border border-line bg-surface p-5 sm:grid-cols-3">
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">From</h2>
          <p className="mt-1 font-semibold text-ink">{settings.company_name}</p>
          <p className="text-sm whitespace-pre-line text-muted">{[settings.address, settings.contact_line, settings.gst_number ? `GST No: ${settings.gst_number}` : null].filter(Boolean).join("\n")}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Bill to</h2>
          <p className="mt-1 font-semibold text-ink">{invoice.client?.name ?? "No client set"}</p>
          <p className="text-sm whitespace-pre-line text-muted">{[invoice.client?.address, invoice.client?.billing_email].filter(Boolean).join("\n")}</p>
          <h2 className="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Project</h2>
          <p className="mt-1 text-sm"><span className="font-semibold text-ink">{invoice.project?.project_no}</span> · {invoice.project?.name}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 self-start text-sm">
          <dt className="text-muted">Invoice date</dt><dd className="text-right">{longDate(invoice.issued_on)}</dd>
          <dt className="text-muted">Due</dt><dd className="text-right font-semibold text-ink">{longDate(invoice.due_on)}</dd>
          <dt className="text-muted">Period</dt><dd className="text-right">{formatDay(invoice.period_from, { day: "numeric", month: "short" })} – {formatDay(invoice.period_to, { day: "numeric", month: "short", year: "numeric" })}</dd>
        </dl>
      </section>

      {isVoid ? (
        <p className="rounded-xl border border-bad/30 bg-bad-bg px-4 py-3 text-sm text-bad">
          This invoice is void. Its time entries were released and can be invoiced again; the totals below are kept for the record.
        </p>
      ) : null}

      {lines.length > 0 ? (
        <InvoiceLines lines={lines} subtotal={Number(invoice.subtotal)} gstRate={Number(invoice.gst_rate)} gst={Number(invoice.gst)} total={Number(invoice.total)} hours={Number(invoice.total_hours)} />
      ) : (
        <dl className="grid max-w-sm grid-cols-2 gap-y-1 rounded-xl border border-line bg-surface p-5 text-sm tabular-nums">
          <dt className="text-muted">Subtotal (excl. GST)</dt><dd className="text-right">${Number(invoice.subtotal).toFixed(2)}</dd>
          <dt className="text-muted">GST</dt><dd className="text-right">${Number(invoice.gst).toFixed(2)}</dd>
          <dt className="font-semibold text-ink">Total</dt><dd className="text-right font-semibold text-ink">${Number(invoice.total).toFixed(2)}</dd>
        </dl>
      )}

      <p className="text-sm text-muted">
        Payment terms: {settings.payment_terms_days} days from invoice date. {settings.bank_details ? settings.bank_details : ""}
      </p>

      {admin && !isVoid ? (
        <section aria-labelledby="actions-heading" className="grid gap-4 lg:grid-cols-2">
          <h2 id="actions-heading" className="sr-only">Invoice actions</h2>
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
            <h3 className="text-lg font-semibold">Status</h3>
            <div className="flex flex-wrap gap-3">
              {invoice.status !== "sent" ? (
                <ActionForm action={setInvoiceStatus} submitLabel="Mark as sent" quiet>
                  <input type="hidden" name="id" value={invoice.id} /><input type="hidden" name="status" value="sent" />
                </ActionForm>
              ) : null}
              {invoice.status !== "paid" ? (
                <ActionForm action={setInvoiceStatus} submitLabel="Mark as paid" quiet>
                  <input type="hidden" name="id" value={invoice.id} /><input type="hidden" name="status" value="paid" />
                </ActionForm>
              ) : null}
              {invoice.status !== "draft" ? (
                <ActionForm action={setInvoiceStatus} submitLabel="Back to draft" quiet>
                  <input type="hidden" name="id" value={invoice.id} /><input type="hidden" name="status" value="draft" />
                </ActionForm>
              ) : null}
            </div>
            {external ? null : emailEnabled() ? (
              <ActionForm action={emailInvoice} submitLabel={`Email PDF to ${invoice.client?.billing_email ?? "client"}`} pendingLabel="Sending…" className="border-t border-line pt-4">
                <input type="hidden" name="id" value={invoice.id} />
              </ActionForm>
            ) : (
              <p className="border-t border-line pt-4 text-sm text-muted">Emailing invoices from the portal isn&apos;t switched on yet. Download the PDF and send it from your own email.</p>
            )}
          </div>
          <div className="rounded-xl border border-bad/30 bg-surface p-5">
            <h3 className="text-lg font-semibold">Void this invoice</h3>
            <p className="mt-1 text-sm text-muted">Releases its time entries back to Approved so they can be corrected and billed again. The number {invoice.invoice_no} is never reused.</p>
            <ActionForm action={voidInvoice} submitLabel="Void invoice" pendingLabel="Voiding…" quiet className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="id" value={invoice.id} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm" className="size-4 accent-ink" />
                Yes, void {invoice.invoice_no}
              </label>
            </ActionForm>
          </div>
        </section>
      ) : null}
    </div>
  );
}
