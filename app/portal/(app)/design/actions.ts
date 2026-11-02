"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireAdmin, requireProfile } from "@/lib/auth";
import { coastDistance, findAddresses, type FoundAddress } from "@/lib/design/linz";
import { emptyModel, normaliseModel, type DesignModel } from "@/lib/design/model";
import { rateLimit, waitMessage } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createDesignJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile();
  const title = text(fd, "title");
  const jobNo = text(fd, "job_no");
  const address = text(fd, "address");
  const projectId = text(fd, "project_id");
  if (!title) return { ok: false, message: "Give the job a name." };
  if (title.length > 200 || jobNo.length > 40 || address.length > 300) return { ok: false, message: "That's too long." };
  if (projectId && !UUID.test(projectId)) return { ok: false, message: "Pick a project from the list." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("design_jobs")
    .insert({ title, job_no: jobNo, address, project_id: projectId || null, model: emptyModel(Number(text(fd, "storeys")) || 1) })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };

  revalidatePath("/portal/design");
  redirect(`/portal/design/${data.id}`);
}

export type SaveResult = { ok: true; revision: number } | { ok: false; reason: "conflict" | "signed" | "error" | "limit"; message: string };

// Called by the editor's autosave. Returns the new revision, or why not.
export async function saveDesign(jobId: string, expected: number, model: DesignModel, summary: string): Promise<SaveResult> {
  const me = await requireProfile();
  if (!UUID.test(jobId) || !Number.isInteger(expected) || expected < 0) return { ok: false, reason: "error", message: "Bad request." };
  const limit = await rateLimit("saves", me.user_id);
  if (!limit.ok) return { ok: false, reason: "limit", message: "Saving too often. " + waitMessage(limit.retryAfter) };

  // Re-shape what the browser sent so only known fields are stored.
  const clean = normaliseModel(model);
  const body = JSON.stringify(clean);
  if (body.length > 1_500_000) return { ok: false, reason: "error", message: "This model is too large to save." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_design", {
    p_job: jobId,
    p_expected: expected,
    p_model: clean,
    p_summary: summary.slice(0, 300),
  });
  if (error) {
    if (error.message.includes("design_conflict")) return { ok: false, reason: "conflict", message: "Someone else saved this job since you opened it." };
    if (error.message.includes("design_signed")) return { ok: false, reason: "signed", message: "This job has been signed off and is locked." };
    return { ok: false, reason: "error", message: error.message };
  }
  return { ok: true, revision: Number(data) };
}

// Record a plan PDF the browser has just uploaded to storage.
export async function registerPlan(jobId: string, storagePath: string, fileName: string, pageCount: number) {
  await requireProfile();
  if (!UUID.test(jobId) || !storagePath.startsWith(`${jobId}/`) || storagePath.includes("..")) return { ok: false as const, message: "Bad request." };
  const pages = Math.max(1, Math.min(500, Math.floor(pageCount) || 1));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("design_plans")
    .insert({ job_id: jobId, storage_path: storagePath, file_name: fileName.slice(0, 200) || "plan.pdf", page_count: pages })
    .select("id, file_name, page_count, storage_path")
    .single();
  if (error) return { ok: false as const, message: error.message };
  const { data: signed } = await supabase.storage.from("design-plans").createSignedUrl(storagePath, 60 * 60 * 8);
  return { ok: true as const, plan: { id: data.id, fileName: data.file_name, pageCount: data.page_count, url: signed?.signedUrl ?? "" } };
}

// Revisions for the history panel, newest first.
export async function listRevisions(jobId: string) {
  await requireProfile();
  if (!UUID.test(jobId)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("design_revisions")
    .select("revision, summary, saved_at, profiles:saved_by (display_name)")
    .eq("job_id", jobId)
    .order("revision", { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => ({
    revision: r.revision as number,
    summary: r.summary as string,
    savedAt: r.saved_at as string,
    by: ((r.profiles as unknown as { display_name: string } | null)?.display_name ?? "") as string,
  }));
}

export async function loadRevision(jobId: string, revision: number): Promise<DesignModel | null> {
  await requireProfile();
  if (!UUID.test(jobId) || !Number.isInteger(revision)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("design_revisions").select("model").eq("job_id", jobId).eq("revision", revision).maybeSingle();
  return data ? normaliseModel(data.model) : null;
}

export async function updateJobDetails(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile();
  const id = text(fd, "id");
  const title = text(fd, "title");
  const jobNo = text(fd, "job_no");
  const address = text(fd, "address");
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  if (!title) return { ok: false, message: "Give the job a name." };
  if (title.length > 200 || jobNo.length > 40 || address.length > 300) return { ok: false, message: "That's too long." };
  const supabase = await createClient();
  const { error } = await supabase.from("design_jobs").update({ title, job_no: jobNo, address }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/portal/design");
  revalidatePath(`/portal/design/${id}`);
  return { ok: true, message: "Saved." };
}

export async function deleteDesignJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(fd, "id");
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  const supabase = await createClient();
  const { data: plans } = await supabase.from("design_plans").select("storage_path").eq("job_id", id);
  const { error } = await supabase.from("design_jobs").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  if (plans?.length) await supabase.storage.from("design-plans").remove(plans.map((p) => p.storage_path));
  revalidatePath("/portal/design");
  redirect("/portal/design");
}

// ---------------------------------------------------------------- review and sign-off

export type FlowResult = { ok: true } | { ok: false; message: string };

const FLOW_ERRORS: [string, string][] = [
  ["design_conflict", "The model has been saved since you loaded it. Reload and check the latest revision."],
  ["design_not_draft", "This job has already been submitted."],
  ["design_not_in_review", "This job isn't waiting for review any more. Reload to see where it's at."],
  ["design_not_signed", "This job isn't signed."],
  ["design_empty", "Draw the structure before submitting it."],
];
const flowError = (message: string) => FLOW_ERRORS.find(([k]) => message.includes(k))?.[1] ?? message;

async function flow(jobId: string, fn: string, args: Record<string, unknown>): Promise<FlowResult> {
  await requireProfile();
  if (!UUID.test(jobId)) return { ok: false, message: "Bad request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_job: jobId, ...args });
  if (error) return { ok: false, message: flowError(error.message) };
  revalidatePath("/portal/design");
  revalidatePath(`/portal/design/${jobId}`);
  return { ok: true };
}

export async function submitDesign(jobId: string, designerId: string, checkerId: string, note: string) {
  if (!UUID.test(designerId) || !UUID.test(checkerId)) return { ok: false, message: "Pick a designer and a checker." } as FlowResult;
  return flow(jobId, "submit_design", { p_designer: designerId, p_checker: checkerId, p_note: note.slice(0, 1000) });
}

export async function returnDesign(jobId: string, note: string) {
  return flow(jobId, "return_design", { p_note: note.slice(0, 1000) });
}

export async function signDesign(jobId: string, expected: number) {
  if (!Number.isInteger(expected)) return { ok: false, message: "Bad request." } as FlowResult;
  return flow(jobId, "sign_design", { p_expected: expected });
}

export async function reopenDesign(jobId: string, reason: string) {
  await requireAdmin();
  if (!reason.trim()) return { ok: false, message: "Say why it's being reopened." } as FlowResult;
  return flow(jobId, "reopen_design", { p_reason: reason.slice(0, 900) });
}

// Admin: who is a CPEng.
export async function saveEngineer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const userId = text(fd, "user_id");
  const number = text(fd, "cpeng_number");
  if (!UUID.test(userId)) return { ok: false, message: "Pick a staff member." };
  if (!number || number.length > 20) return { ok: false, message: "Enter their CPEng registration number." };
  const supabase = await createClient();
  const { error } = await supabase.from("design_engineers").upsert({ user_id: userId, cpeng_number: number });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/portal/design");
  return { ok: true, message: "Saved." };
}

export async function removeEngineer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const userId = text(fd, "user_id");
  if (!UUID.test(userId)) return { ok: false, message: "Bad request." };
  const supabase = await createClient();
  const { error } = await supabase.from("design_engineers").delete().eq("user_id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/portal/design");
  return { ok: true, message: "Removed." };
}

// Site address lookup (LINZ): matching addresses for what was typed.
export async function searchSiteAddress(q: string): Promise<{ ok: true; found: FoundAddress[] } | { ok: false; message: string }> {
  const me = await requireProfile();
  if (typeof q !== "string" || q.length > 200) return { ok: false, message: "Bad request." };
  const limit = await rateLimit("siteLookups", me.user_id);
  if (!limit.ok) return { ok: false, message: "Too many lookups. " + waitMessage(limit.retryAfter) };
  const r = await findAddresses(q);
  return r.ok ? { ok: true, found: r.value } : r;
}

// The distance from a found address to the coast (null: more than 1 km).
export async function siteCoastDistance(lat: number, lon: number): Promise<{ ok: true; coastM: number | null } | { ok: false; message: string }> {
  const me = await requireProfile();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat > -33 || lat < -48 || lon < 165 || lon > 179) return { ok: false, message: "That's not in New Zealand." };
  const limit = await rateLimit("siteLookups", me.user_id);
  if (!limit.ok) return { ok: false, message: "Too many lookups. " + waitMessage(limit.retryAfter) };
  const r = await coastDistance(lat, lon);
  return r.ok ? { ok: true, coastM: r.value } : r;
}
