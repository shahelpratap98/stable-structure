import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { isAdmin, requireProfile } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { createDesignJob, removeEngineer, saveEngineer } from "./actions";

export const metadata: Metadata = { title: "Design" };

type JobRow = {
  id: string;
  job_no: string;
  title: string;
  address: string;
  status: "draft" | "in_review" | "signed";
  revision: number;
  updated_at: string;
  member_count: number | null;
  project: { project_no: string; name: string } | null;
  editor: { display_name: string } | null;
};

const STATUS = {
  draft: ["Draft", "bg-surface-2 text-muted"],
  in_review: ["In review", "bg-accent-100 text-accent-600"],
  signed: ["Signed off", "bg-ok-bg text-ok"],
} as const;

export default async function DesignPage() {
  const profile = await requireProfile();
  const admin = isAdmin(profile.role);
  const supabase = await createClient();
  const [jobsRes, projectsRes] = await Promise.all([
    supabase
      .from("design_jobs")
      .select("id, job_no, title, address, status, revision, updated_at, member_count, project:projects(project_no, name), editor:profiles!design_jobs_updated_by_fkey(display_name)")
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase.from("projects").select("id, project_no, name").eq("status", "active").order("project_no", { ascending: false }).limit(500),
  ]);
  const missingTable = jobsRes.error?.code === "42P01" || jobsRes.error?.message.includes("design_jobs");
  const jobs = (jobsRes.data ?? []) as unknown as JobRow[];
  const projects = projectsRes.data ?? [];
  // CPEng register (migration 1100); admins only.
  const peopleRes = admin ? await supabase.rpc("design_people") : null;
  const people = (peopleRes?.data ?? []) as { user_id: string; display_name: string; cpeng_number: string | null }[];
  const signoffReady = admin && !peopleRes?.error;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold">Design</h1>
        <p className="mt-1 text-muted">
          Lay out a structure over the architect&apos;s plans, see it in 3D and check every member.{" "}
          <Link href="/portal/design/guide" className="font-semibold text-accent-600 hover:underline">
            How to use it
          </Link>
        </p>
      </div>

      {missingTable ? (
        <p className="rounded-xl border border-warn bg-warn-bg px-5 py-4 text-sm text-warn">
          The design tables aren&apos;t in the database yet. Run migration <code>20261014001000_design.sql</code> in the Supabase SQL editor.
        </p>
      ) : null}
      {admin && !missingTable && !signoffReady ? (
        <p className="rounded-xl border border-warn bg-warn-bg px-5 py-4 text-sm text-warn">
          Review and sign-off are switched off. Run migration <code>20261018001100_design_signoff.sql</code> in the Supabase SQL editor.
        </p>
      ) : null}

      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" className="text-xl font-semibold">Design jobs</h2>
        {jobs.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-surface px-5 py-6 text-center text-muted">No design jobs yet. Start one below.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((j) => {
              const [label, cls] = STATUS[j.status];
              return (
                <li key={j.id}>
                  <Link href={`/portal/design/${j.id}`} className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-ink">
                        {j.job_no ? <span className="mr-1.5 text-muted tabular-nums">{j.job_no}</span> : null}
                        {j.title}
                      </p>
                      <span className={`chip shrink-0 ${cls}`}>{label}</span>
                    </div>
                    {j.address ? <p className="text-sm text-muted">{j.address}</p> : null}
                    <p className="mt-auto text-xs text-muted tabular-nums">
                      {j.member_count ?? 0} {j.member_count === 1 ? "member" : "members"} · rev {j.revision} · {formatDay(j.updated_at.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}
                      {j.editor ? ` · ${j.editor.display_name}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="new-heading" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="new-heading" className="text-xl font-semibold">New design job</h2>
        <ActionForm action={createDesignJob} submitLabel="Create and open" pendingLabel="Creating…" className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Name</span>
            <input name="title" required maxLength={200} placeholder="14 Kauri Rise, new dwelling" className="field" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Job number</span>
            <input name="job_no" maxLength={40} placeholder="26021" className="field" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Site address</span>
            <input name="address" maxLength={300} placeholder="14 Kauri Rise, Flat Bush, Auckland" className="field" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Linked project (optional)</span>
            <select name="project_id" className="field" defaultValue="">
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_no} · {p.name}
                </option>
              ))}
            </select>
          </label>
        </ActionForm>
      </section>

      {signoffReady ? (
        <section aria-labelledby="cpeng-heading" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="cpeng-heading" className="text-xl font-semibold">Chartered engineers</h2>
          <p className="mt-1 text-sm text-muted">Only the people listed here can check and sign off a design. Their CPEng number goes on the council report.</p>
          {people.some((p) => p.cpeng_number) ? (
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {people
                .filter((p) => p.cpeng_number)
                .map((p) => (
                  <li key={p.user_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="font-semibold">{p.display_name}</span>
                    <span className="text-sm text-muted tabular-nums">CPEng {p.cpeng_number}</span>
                    <ActionForm action={removeEngineer} submitLabel="Remove" pendingLabel="Removing…" quiet className="ml-auto">
                      <input type="hidden" name="user_id" value={p.user_id} />
                    </ActionForm>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-warn">Nobody yet. Add the engineers who will sign designs.</p>
          )}
          <ActionForm action={saveEngineer} submitLabel="Add or update" className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Staff member</span>
              <select name="user_id" required className="field" defaultValue="">
                <option value="" disabled>
                  Pick…
                </option>
                {people.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">CPEng registration number</span>
              <input name="cpeng_number" required maxLength={20} className="field tabular-nums" placeholder="1012345" />
            </label>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
