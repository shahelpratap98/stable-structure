import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { InvoiceLines } from "@/components/invoice-lines";
import { requireAdmin } from "@/lib/auth";
import { isIsoDate, todayNZ } from "@/lib/dates";
import { previewInvoice } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/server";
import { createInvoice } from "../actions";

export const metadata: Metadata = { title: "New invoice" };

const round2 = (n: number) => Math.round(n * 100) / 100;

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const today = todayNZ();
  const projectId = typeof params.project === "string" ? params.project : "";
  const from = isIsoDate(params.from) ? params.from : today.slice(0, 8) + "01";
  const to = isIsoDate(params.to) && params.to >= from ? params.to : today;

  const supabase = await createClient();
  const [projectsRes, settingsRes] = await Promise.all([
    supabase.from("v_projects").select("id, project_no, name, client, is_internal").eq("is_internal", false).order("project_no", { ascending: false }),
    supabase.from("settings").select("gst_rate, invoice_prefix, next_invoice_no, payment_terms_days").maybeSingle(),
  ]);
  const projects = projectsRes.data ?? [];
  const settings = settingsRes.data;
  const project = projects.find((p) => p.id === projectId);

  let preview: Awaited<ReturnType<typeof previewInvoice>> | null = null;
  let failure = "";
  if (project) {
    try {
      preview = await previewInvoice(supabase, project.id, from, to);
    } catch (e) {
      failure = e instanceof Error ? e.message : "Couldn't load the preview.";
    }
  }

  const gstRate = Number(settings?.gst_rate ?? 0.15);
  const gst = preview ? round2(preview.subtotal * gstRate) : 0;
  const nextNo = settings ? `${settings.invoice_prefix}${String(settings.next_invoice_no).padStart(4, "0")}` : "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/portal/invoices" className="text-sm font-semibold text-accent-600 hover:underline">← Invoices</Link>
        <h1 className="mt-2 text-3xl font-semibold">New invoice</h1>
        <p className="mt-1 text-muted">Pick a project and period. Only approved, chargeable time that hasn&apos;t been billed is included.</p>
      </div>

      <form action={"/portal/invoices/new"} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="min-w-64 flex-1">
          <label htmlFor="i-project" className="field-label">Project</label>
          <select id="i-project" name="project" defaultValue={projectId} required className="field">
            <option value="" disabled>Choose a project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.project_no} · {p.name}{p.client ? ` (${p.client})` : ""}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="i-from" className="field-label">Period from</label>
          <input id="i-from" name="from" type="date" defaultValue={from} required className="field" />
        </div>
        <div>
          <label htmlFor="i-to" className="field-label">Period to</label>
          <input id="i-to" name="to" type="date" defaultValue={to} required className="field" />
        </div>
        <button type="submit" className="btn btn-quiet">Preview</button>
      </form>

      {failure ? <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{failure}</p> : null}

      {project && preview ? (
        preview.count === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-5 py-8 text-center text-muted">
            No approved, unbilled chargeable time in this period. Check the dates, or approve the time first.
          </p>
        ) : (
          <section aria-labelledby="preview-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="preview-heading" className="text-xl font-semibold">Preview · {nextNo}</h2>
              <p className="text-sm text-muted">Bill to: <span className="font-semibold text-ink">{project.client ?? "no client set"}</span> · {preview.count} time {preview.count === 1 ? "entry" : "entries"}</p>
            </div>
            <InvoiceLines lines={preview.lines} subtotal={preview.subtotal} gstRate={gstRate} gst={gst} total={round2(preview.subtotal + gst)} hours={preview.hours} />

            {preview.missingRate ? (
              <p className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
                <span className="font-semibold">Some of this time has no charge-out rate</span>, so the invoice can&apos;t be created yet. Set a rate on the project under{" "}
                <Link href="/portal/admin/projects" className="font-semibold underline">Setup → Projects &amp; rates</Link>, or a rate override on the entries.
              </p>
            ) : (
              <ActionForm action={createInvoice} submitLabel={`Create invoice ${nextNo}`} pendingLabel="Creating…" className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
                <input type="hidden" name="project_id" value={project.id} />
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <div>
                  <label htmlFor="i-issued" className="field-label">Invoice date</label>
                  <input id="i-issued" name="issued_on" type="date" defaultValue={today} required className="field" />
                </div>
                <p className="min-w-0 flex-1 basis-64 pb-2 text-sm text-muted">
                  Creating it locks these time entries to the invoice. Due {settings?.payment_terms_days ?? 14} days from the invoice date. You can void it later to release them.
                </p>
              </ActionForm>
            )}
          </section>
        )
      ) : null}
    </div>
  );
}
