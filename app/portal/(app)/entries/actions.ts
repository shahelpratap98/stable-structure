"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireAdmin, requireApprover } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BULK = 1000;
const CHUNK = 100; // keeps each request URL short

function refresh() {
  revalidatePath("/portal/entries");
  revalidatePath("/portal/approvals");
  revalidatePath("/portal/my/day");
}

// Approver correction of any entry that hasn't been invoiced, or a new entry
// on someone's behalf (the workbook's "someone forgot to send" case). New
// entries go in as "submitted" so they still pass through Approvals.
export async function saveEntry(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireApprover();

  const id = text(fd, "id");
  const userId = text(fd, "user_id");
  const date = text(fd, "entry_date");
  const projectId = text(fd, "project_id");
  const workTypeId = text(fd, "work_type_id");
  const hours = Number(text(fd, "hours"));
  const description = text(fd, "description");
  const overrideRaw = text(fd, "rate_override");
  const override = overrideRaw === "" ? null : Number(overrideRaw);

  if (!id && !userId) return { ok: false, message: "Pick who the entry is for." };
  if (!isIsoDate(date)) return { ok: false, message: "Pick a valid date." };
  if (!projectId) return { ok: false, message: "Pick a project." };
  if (!workTypeId) return { ok: false, message: "Pick a work type." };
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return { ok: false, message: "Hours must be more than 0 and no more than 24." };
  if (!description) return { ok: false, message: "Add a task description." };
  if (override !== null && (!Number.isFinite(override) || override < 0)) return { ok: false, message: "Rate override must be 0 or more, or left blank to use the project rate." };

  const supabase = await createClient();
  const values = {
    entry_date: date,
    project_id: projectId,
    work_type_id: workTypeId,
    chargeable: fd.get("chargeable") === "yes",
    hours,
    description,
  };

  let entryId = id;
  if (id) {
    const { data, error } = await supabase.from("time_entries").update(values).eq("id", id).select("id");
    if (error) return { ok: false, message: error.message };
    if (!data?.length) return { ok: false, message: "This entry is already on an invoice, so it can't be changed. Void the invoice first." };
  } else {
    const { data, error } = await supabase
      .from("time_entries")
      .insert({ ...values, user_id: userId, status: "submitted" })
      .select("id")
      .single();
    if (error) return { ok: false, message: error.message };
    entryId = data.id;
  }

  const { error: billingError } = await supabase
    .from("entry_billing")
    .upsert({ entry_id: entryId, rate_override: override }, { onConflict: "entry_id" });
  if (billingError) return { ok: false, message: "Entry saved, but the rate override wasn't: " + billingError.message };

  refresh();
  if (!id) redirect(`/portal/entries?from=${date}&to=${date}`);
  return { ok: true, message: "Saved." };
}

export async function deleteEntry(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireApprover();
  const id = text(fd, "id");
  if (fd.get("confirm") !== "on") return { ok: false, message: "Tick the box to confirm you want to delete this entry." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("time_entries").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "This entry is on an invoice, so it can't be deleted." };

  refresh();
  redirect("/portal/entries");
}

// Admin bulk delete from All entries. Invoiced entries are never touched
// (the database refuses them too): the invoice has to be voided first.
// Every deleted row is recorded in full in the audit log.
export async function deleteEntries(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();

  const ids = [...new Set(fd.getAll("ids").map((v) => String(v)))].filter((id) => UUID.test(id));
  if (ids.length === 0) return { ok: false, message: "Tick at least one entry to delete." };
  if (ids.length > MAX_BULK) return { ok: false, message: `You can delete up to ${MAX_BULK} entries at a time. Narrow the filter and try again.` };
  if (fd.get("confirm") !== "on") return { ok: false, message: "Tick the box to confirm the deletion." };
  if (Number(text(fd, "expected")) !== ids.length) return { ok: false, message: "The selection changed while you were confirming. Check the ticked entries and try again." };

  const supabase = await createClient();
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("time_entries")
      .delete()
      .in("id", ids.slice(i, i + CHUNK))
      .neq("status", "invoiced")
      .select("id");
    if (error) {
      refresh();
      return { ok: false, message: `Deleted ${deleted} before an error stopped it: ${error.message}` };
    }
    deleted += data?.length ?? 0;
  }

  refresh();
  const skipped = ids.length - deleted;
  const noun = (n: number) => (n === 1 ? "entry" : "entries");
  if (deleted === 0) return { ok: false, message: `Nothing was deleted. ${skipped === 1 ? "That entry is" : "Those entries are"} on an invoice or already gone.` };
  return {
    ok: true,
    message: `Deleted ${deleted} ${noun(deleted)}.${skipped ? ` ${skipped} ${noun(skipped)} couldn't be deleted because ${skipped === 1 ? "it is" : "they are"} on an invoice or already gone.` : ""}`,
  };
}
