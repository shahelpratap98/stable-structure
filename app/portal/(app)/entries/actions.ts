"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireApprover } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

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
