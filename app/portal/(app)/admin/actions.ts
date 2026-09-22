"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requireAdmin } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { emailEnabled, sendEmail } from "@/lib/email";
import { rateLimit, waitMessage } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const textOrNull = (fd: FormData, name: string) => text(fd, name) || null;
const checked = (fd: FormData, name: string) => fd.get(name) === "on";

// "" -> null, otherwise a number, or an error string.
function numberOrNull(fd: FormData, name: string, label: string, min: number, max: number): number | null | string {
  const raw = text(fd, name);
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return n;
}

const ROLES: Role[] = ["employee", "approver", "admin"];
const NO_KEY =
  "Sign-in links need SUPABASE_SERVICE_ROLE_KEY set on the server. Add it to portal/.env.local (and to Vercel) and restart.";

function friendly(message: string): string {
  if (/duplicate key|already exists/i.test(message)) return "That name or number is already in use.";
  if (/violates foreign key/i.test(message)) return "That's still used by existing records, so it can't be removed. Deactivate it instead.";
  return message;
}

// ------------------------------------------------------------------ staff

function signInLink(hashedToken: string, type: "invite" | "recovery") {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/portal/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=/portal/set-password`;
}

// Creates the auth user and hands back a one-time link for the admin to pass
// on (text, WhatsApp, email). No email is sent by the portal itself yet.
export async function inviteStaff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const limit = await rateLimit("staffLinks", me.user_id);
  if (!limit.ok) return { ok: false, message: "That's a lot of invites in one go. " + waitMessage(limit.retryAfter) };
  const name = text(fd, "display_name");
  const email = text(fd, "email").toLowerCase();
  const role = text(fd, "role") as Role;
  if (!name) return { ok: false, message: "Enter the person's name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { ok: false, message: "Pick a role." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: NO_KEY };

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { display_name: name } },
  });
  if (error || !data.user || !data.properties?.hashed_token) {
    const msg = error?.message ?? "Couldn't create the account.";
    return { ok: false, message: /already.*registered|exists/i.test(msg) ? "Someone with that email already has an account." : msg };
  }

  // The database trigger has created the profile as an employee; apply the
  // chosen name and role as the signed-in admin (so it's audited under them).
  const supabase = await createClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ display_name: name, role })
    .eq("user_id", data.user.id);
  if (profileError) return { ok: false, message: "Account created, but the role couldn't be set: " + profileError.message };

  revalidatePath("/portal/admin/staff");
  const link = signInLink(data.properties.hashed_token, "invite");

  let emailed = false;
  if (emailEnabled()) {
    const sent = await sendEmail({
      to: email,
      subject: "Your Stable Structure timesheet login",
      paragraphs: [
        `Hello ${name},`,
        "You have been set up on the Stable Structure staff portal, where you will enter your timesheets from now on.",
        "Use the button below to choose your password. The link works once and expires in 24 hours.",
      ],
      button: { label: "Choose my password", url: link },
    });
    emailed = sent.ok;
  }

  return {
    ok: true,
    message: emailed
      ? `${name} is set up and the invite has been emailed to ${email}. The same link is below in case it doesn't arrive.`
      : `${name} is set up. Send them this link to choose a password. It works once and expires in 24 hours.`,
    link,
  };
}

// A fresh one-time link for someone who lost their invite or password.
export async function staffSignInLink(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const limit = await rateLimit("staffLinks", me.user_id);
  if (!limit.ok) return { ok: false, message: "Too many sign-in links requested. " + waitMessage(limit.retryAfter) };
  const email = text(fd, "email");
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: NO_KEY };

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data.properties?.hashed_token) return { ok: false, message: error?.message ?? "Couldn't create a link." };

  return {
    ok: true,
    message: "Send them this link to choose a new password. It works once and expires in 24 hours.",
    link: signInLink(data.properties.hashed_token, "recovery"),
  };
}

export async function updateStaff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const userId = text(fd, "user_id");
  const name = text(fd, "display_name");
  const role = text(fd, "role") as Role;
  const active = checked(fd, "is_active");
  const standard = numberOrNull(fd, "standard_day_hours", "Standard day", 0.25, 24);
  const annual = numberOrNull(fd, "annual_leave_days", "Annual leave", 0, 365);
  const sick = numberOrNull(fd, "sick_leave_days", "Sick leave", 0, 365);
  const startDate = text(fd, "start_date");
  if (startDate && !isIsoDate(startDate)) return { ok: false, message: "Start date isn't a valid date." };
  if (typeof annual === "string") return { ok: false, message: annual };
  if (typeof sick === "string") return { ok: false, message: sick };
  if (!name) return { ok: false, message: "Name can't be blank." };
  if (!ROLES.includes(role)) return { ok: false, message: "Pick a role." };
  if (typeof standard === "string") return { ok: false, message: standard };
  if (userId === me.user_id && (role !== "admin" || !active)) {
    return { ok: false, message: "You can't remove your own admin access. Ask another admin to do it." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name, role, is_active: active, standard_day_hours: standard, start_date: startDate || null, annual_leave_days: annual, sick_leave_days: sick })
    .eq("user_id", userId);
  if (error) return { ok: false, message: friendly(error.message) };

  revalidatePath("/portal/admin/staff");
  return { ok: true, message: "Saved." };
}

// ------------------------------------------------------------------ clients

export async function saveClient(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(fd, "id");
  const values = { name: text(fd, "name"), billing_email: textOrNull(fd, "billing_email"), address: textOrNull(fd, "address") };
  if (!values.name) return { ok: false, message: "Enter the client's name." };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("clients").update(values).eq("id", id)
    : await supabase.from("clients").insert(values);
  if (error) return { ok: false, message: friendly(error.message) };

  revalidatePath("/portal/admin/clients");
  revalidatePath("/portal/admin/projects");
  return { ok: true, message: id ? "Saved." : `Added ${values.name}.` };
}

// ------------------------------------------------------------------ projects

export async function saveProject(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(fd, "id");
  const status = text(fd, "status") || "active";
  const rate = numberOrNull(fd, "rate", "Charge-out rate", 0, 100000);
  const values = {
    project_no: text(fd, "project_no"),
    name: text(fd, "name"),
    client_id: textOrNull(fd, "client_id"),
    is_internal: checked(fd, "is_internal"),
    default_chargeable: checked(fd, "default_chargeable"),
    status,
  };
  if (!values.project_no) return { ok: false, message: "Enter a project number." };
  if (!values.name) return { ok: false, message: "Enter a project name." };
  if (!["active", "on_hold", "closed"].includes(status)) return { ok: false, message: "Pick a status." };
  if (typeof rate === "string") return { ok: false, message: rate };

  const supabase = await createClient();
  let projectId = id;
  if (id) {
    const { error } = await supabase.from("projects").update(values).eq("id", id);
    if (error) return { ok: false, message: friendly(error.message) };
  } else {
    const { data, error } = await supabase.from("projects").insert(values).select("id").single();
    if (error) return { ok: false, message: friendly(error.message) };
    projectId = data.id;
  }

  const { error: rateError } = await supabase
    .from("project_rates")
    .upsert({ project_id: projectId, rate }, { onConflict: "project_id" });
  if (rateError) return { ok: false, message: "Project saved, but the rate wasn't: " + rateError.message };

  revalidatePath("/portal/admin/projects");
  return { ok: true, message: id ? "Saved." : `Added ${values.project_no}.` };
}

// ------------------------------------------------------------------ work types

export async function saveWorkType(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(fd, "id");
  const sort = numberOrNull(fd, "sort_order", "Order", 0, 100000);
  if (typeof sort === "string") return { ok: false, message: sort };
  const values = { name: text(fd, "name"), sort_order: Math.round(sort ?? 0), is_active: id ? checked(fd, "is_active") : true };
  if (!values.name) return { ok: false, message: "Enter a name." };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("work_types").update(values).eq("id", id)
    : await supabase.from("work_types").insert(values);
  if (error) return { ok: false, message: friendly(error.message) };

  revalidatePath("/portal/admin/work-types");
  return { ok: true, message: id ? "Saved." : `Added ${values.name}.` };
}

// ------------------------------------------------------------------ settings

export async function saveSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const gstPercent = numberOrNull(fd, "gst_percent", "GST", 0, 99);
  const standard = numberOrNull(fd, "standard_day_hours", "Standard day", 0.25, 24);
  const nextNo = numberOrNull(fd, "next_invoice_no", "Next invoice number", 1, 9999999);
  const terms = numberOrNull(fd, "payment_terms_days", "Payment terms", 0, 365);
  const annual = numberOrNull(fd, "annual_leave_days", "Annual leave", 0, 365);
  const sick = numberOrNull(fd, "sick_leave_days", "Sick leave", 0, 365);
  for (const v of [gstPercent, standard, nextNo, terms, annual, sick]) {
    if (typeof v === "string") return { ok: false, message: v };
    if (v === null) return { ok: false, message: "GST, standard day, next invoice number and payment terms are all required." };
  }
  const companyName = text(fd, "company_name");
  if (!companyName) return { ok: false, message: "Enter the company name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      company_name: companyName,
      company_tagline: text(fd, "company_tagline"),
      gst_number: textOrNull(fd, "gst_number"),
      address: textOrNull(fd, "address"),
      contact_line: textOrNull(fd, "contact_line"),
      bank_details: textOrNull(fd, "bank_details"),
      gst_rate: (gstPercent as number) / 100,
      standard_day_hours: standard as number,
      invoice_prefix: text(fd, "invoice_prefix"),
      next_invoice_no: Math.round(nextNo as number),
      payment_terms_days: Math.round(terms as number),
      annual_leave_days: annual as number,
      sick_leave_days: sick as number,
    })
    .eq("id", true);
  if (error) return { ok: false, message: friendly(error.message) };

  revalidatePath("/portal/admin/settings");
  return { ok: true, message: "Settings saved." };
}

// ------------------------------------------------------------------ public holidays

export async function saveHoliday(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const day = text(fd, "day");
  const name = text(fd, "name");
  if (!isIsoDate(day)) return { ok: false, message: "Pick a date." };
  if (!name) return { ok: false, message: "Give the day a name." };

  const supabase = await createClient();
  const { error } = await supabase.from("public_holidays").upsert({ day, name }, { onConflict: "day" });
  if (error) return { ok: false, message: friendly(error.message) };

  revalidatePath("/portal/admin/holidays");
  return { ok: true, message: `Added ${name}.` };
}

export async function deleteHoliday(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("public_holidays").delete().eq("day", text(fd, "day"));
  if (error) return { ok: false, message: friendly(error.message) };

  revalidatePath("/portal/admin/holidays");
  return { ok: true, message: "Removed." };
}
