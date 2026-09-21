"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireAdmin } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { loadInvoice } from "@/lib/invoices";
import { rateLimit, waitMessage } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

function refresh(id?: string) {
  revalidatePath("/portal/invoices");
  revalidatePath("/portal/entries");
  if (id) revalidatePath(`/portal/invoices/${id}`);
}

// All the rules (which lines qualify, GST, numbering, locking the entries)
// live in the database function so they can't be bypassed.
export async function createInvoice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const limit = await rateLimit("bulkActions", me.user_id);
  if (!limit.ok) return { ok: false, message: "Too many actions in a short time. " + waitMessage(limit.retryAfter) };
  const projectId = text(fd, "project_id");
  const from = text(fd, "from");
  const to = text(fd, "to");
  const issued = text(fd, "issued_on");
  if (!projectId || !isIsoDate(from) || !isIsoDate(to) || !isIsoDate(issued)) return { ok: false, message: "Pick a project, a period and an invoice date." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice", { p_project_id: projectId, p_from: from, p_to: to, p_issued_on: issued });
  if (error) return { ok: false, message: error.message };

  refresh();
  redirect(`/portal/invoices/${data}`);
}

export async function setInvoiceStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(fd, "id");
  const status = text(fd, "status");
  if (!["draft", "sent", "paid"].includes(status)) return { ok: false, message: "Unknown status." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").update({ status }).eq("id", id).neq("status", "void").select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "This invoice is void and can't be changed." };

  refresh(id);
  return { ok: true, message: status === "sent" ? "Marked as sent." : status === "paid" ? "Marked as paid." : "Moved back to draft." };
}

export async function voidInvoice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(fd, "id");
  if (fd.get("confirm") !== "on") return { ok: false, message: "Tick the box to confirm you want to void this invoice." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_invoice", { p_invoice_id: id });
  if (error) return { ok: false, message: error.message };

  refresh(id);
  return { ok: true, message: "Invoice voided. Its time entries are back to Approved and can be invoiced again." };
}

export async function emailInvoice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const limit = await rateLimit("emails", me.user_id);
  if (!limit.ok) return { ok: false, message: "Too many emails sent. " + waitMessage(limit.retryAfter) };
  const id = text(fd, "id");
  const supabase = await createClient();
  const loaded = await loadInvoice(supabase, id);
  if (!loaded) return { ok: false, message: "Invoice not found." };
  const { invoice, settings } = loaded;
  if (invoice.status === "void") return { ok: false, message: "A void invoice can't be sent." };
  const to = invoice.client?.billing_email;
  if (!to) return { ok: false, message: "This client has no billing email. Add one under Setup → Clients." };

  const pdf = await renderInvoicePdf(loaded);
  const total = "$" + Number(invoice.total).toLocaleString("en-NZ", { minimumFractionDigits: 2 });
  const sent = await sendEmail({
    to,
    subject: `Invoice ${invoice.invoice_no} from ${settings.company_name}`,
    paragraphs: [
      `Hello ${invoice.client?.name ?? ""},`.replace(" ,", ","),
      `Please find attached invoice ${invoice.invoice_no} for ${invoice.project?.name} (project ${invoice.project?.project_no}), for ${total} including GST.`,
      `Payment is due by ${invoice.due_on.split("-").reverse().join("/")}. Please quote the invoice number with your payment.`,
      `Thank you, ${settings.company_name}`,
    ],
    attachments: [{ filename: `${invoice.invoice_no}.pdf`, content: pdf }],
  });
  if (!sent.ok) return { ok: false, message: sent.error ?? "The email didn't send." };

  if (invoice.status === "draft") await supabase.from("invoices").update({ status: "sent" }).eq("id", id);
  refresh(id);
  return { ok: true, message: `Emailed to ${to} and marked as sent.` };
}
