import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { normaliseModel } from "@/lib/design/model";
import { createClient } from "@/lib/supabase/server";
import { DesignEditor } from "./editor";
import type { Signoff } from "./signoff";

export const metadata: Metadata = { title: "Design" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DesignJobPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [jobRes, plansRes] = await Promise.all([
    supabase.from("design_jobs").select("id, job_no, title, address, status, model, revision").eq("id", id).maybeSingle(),
    supabase.from("design_plans").select("id, file_name, page_count, storage_path").eq("job_id", id).order("created_at"),
  ]);
  const job = jobRes.data;
  if (!job) notFound();

  // Review and sign-off (migration 1100); the editor works without it.
  const [flowRes, peopleRes, settingsRes] = await Promise.all([
    supabase.from("design_jobs").select("designer_id, checker_id, submitted_at, signed_by, signed_at, signed_revision, review_note").eq("id", id).maybeSingle(),
    supabase.rpc("design_people"),
    supabase.from("settings").select("company_name").maybeSingle(),
  ]);
  const f = flowRes.data;
  const people = ((peopleRes.data ?? []) as { user_id: string; display_name: string; cpeng_number: string | null }[]).map((p) => ({ id: p.user_id, name: p.display_name, cpeng: p.cpeng_number ?? "" }));
  const signoff: Signoff | null =
    f && !peopleRes.error
      ? {
          designerId: f.designer_id,
          checkerId: f.checker_id,
          submittedAt: f.submitted_at,
          signedBy: f.signed_by,
          signedAt: f.signed_at,
          signedRevision: f.signed_revision,
          note: f.review_note ?? "",
          people,
          me: profile.user_id,
          isAdmin: isAdmin(profile.role),
        }
      : null;

  // Signed links last a working day; the editor keeps each PDF once loaded.
  const plans = plansRes.data ?? [];
  const signed = plans.length
    ? (await supabase.storage.from("design-plans").createSignedUrls(plans.map((p) => p.storage_path), 60 * 60 * 8)).data ?? []
    : [];

  return (
    <DesignEditor
      key={job.id}
      canDelete={isAdmin(profile.role)}
      signoff={signoff}
      company={settingsRes.data?.company_name || "Stable Structure"}
      job={{ id: job.id, title: job.title, jobNo: job.job_no, address: job.address, status: job.status }}
      initialModel={normaliseModel(job.model)}
      initialRevision={job.revision}
      initialPlans={plans.map((p, i) => ({ id: p.id, fileName: p.file_name, pageCount: p.page_count, url: signed[i]?.signedUrl ?? "" }))}
    />
  );
}
