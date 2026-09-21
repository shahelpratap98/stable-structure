import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { createClient } from "@/lib/supabase/server";
import { saveProject } from "../actions";

export const metadata: Metadata = { title: "Projects & rates" };

type ProjectRow = {
  id: string;
  project_no: string;
  name: string;
  client_id: string | null;
  client: string | null;
  rate: number | null;
  is_internal: boolean;
  default_chargeable: boolean;
  status: "active" | "on_hold" | "closed";
  missing_rate: boolean;
};

const STATUS_LABEL = { active: "Active", on_hold: "On hold", closed: "Closed" } as const;
const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

function ProjectFields({ p, clients }: { p?: ProjectRow; clients: { id: string; name: string }[] }) {
  const k = p?.id ?? "new";
  return (
    <>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[9rem_minmax(0,2fr)_minmax(0,1.4fr)_8rem_8rem]">
        <div>
          <label htmlFor={`no-${k}`} className="field-label">Project no.</label>
          <input id={`no-${k}`} name="project_no" defaultValue={p?.project_no} required maxLength={40} className="field" placeholder="26105" />
        </div>
        <div>
          <label htmlFor={`pname-${k}`} className="field-label">Project name</label>
          <input id={`pname-${k}`} name="name" defaultValue={p?.name} required maxLength={120} className="field" placeholder="Site address or job name" />
        </div>
        <div>
          <label htmlFor={`client-${k}`} className="field-label">Client</label>
          <select id={`client-${k}`} name="client_id" defaultValue={p?.client_id ?? ""} className="field">
            <option value="">No client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`rate-${k}`} className="field-label">Rate ($/hr)</label>
          <input id={`rate-${k}`} name="rate" type="number" min={0} step={0.01} defaultValue={p?.rate ?? ""} className="field tabular-nums" placeholder="Not set" />
        </div>
        <div>
          <label htmlFor={`status-${k}`} className="field-label">Status</label>
          <select id={`status-${k}`} name="status" defaultValue={p?.status ?? "active"} className="field">
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="default_chargeable" defaultChecked={p ? p.default_chargeable : true} className="size-4 accent-ink" />
          Time is chargeable by default
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_internal" defaultChecked={p?.is_internal ?? false} className="size-4 accent-ink" />
          Internal (admin, meetings) — never needs a rate
        </label>
      </div>
    </>
  );
}

export default async function ProjectsPage() {
  const supabase = await createClient();
  const [projectsRes, clientsRes] = await Promise.all([
    supabase.from("v_projects").select("id, project_no, name, client_id, client, rate, is_internal, default_chargeable, status, missing_rate").order("status").order("project_no", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
  ]);
  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const clients = clientsRes.data ?? [];
  const missing = projects.filter((p) => p.missing_rate && p.status === "active").length;

  return (
    <div className="flex flex-col gap-8">
      {missing > 0 ? (
        <p className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          <span className="font-semibold">{missing} active {missing === 1 ? "project has" : "projects have"} no charge-out rate.</span>{" "}
          Time can still be entered, but it shows a $0 value and can&apos;t be invoiced until a rate is set.
        </p>
      ) : null}

      <section aria-labelledby="new-project-heading" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="new-project-heading" className="text-xl font-semibold">Add a project</h2>
        <ActionForm action={saveProject} submitLabel="Add project" className="mt-4 flex flex-col gap-4">
          <ProjectFields clients={clients} />
        </ActionForm>
      </section>

      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading" className="text-xl font-semibold">Projects ({projects.length})</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id} className="rounded-xl border border-line bg-surface">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="font-semibold text-ink tabular-nums">{p.project_no}</span>
                  <span>{p.name}</span>
                  <span className="text-sm text-muted">{p.client ?? "No client"}</span>
                  <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    {p.is_internal ? <span className="chip bg-steel-100 text-steel">Internal</span> : null}
                    {p.status !== "active" ? <span className="chip bg-surface-2 text-muted">{STATUS_LABEL[p.status]}</span> : null}
                    {p.missing_rate ? (
                      <span className="chip bg-warn-bg text-warn">No rate</span>
                    ) : p.rate !== null ? (
                      <span className="text-sm font-semibold tabular-nums">{money.format(p.rate)}/hr</span>
                    ) : null}
                  </span>
                </summary>
                <div className="border-t border-line px-4 py-4">
                  <ActionForm action={saveProject} submitLabel="Save changes" className="flex flex-col gap-4">
                    <ProjectFields p={p} clients={clients} />
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
