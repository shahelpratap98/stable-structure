import { ActionForm } from "@/components/action-form";
import { createClient } from "@/lib/supabase/server";
import { saveEntry } from "./actions";

export type EntryFormValues = {
  id: string;
  entry_date: string;
  project_id: string | null;
  work_type_id: string | null;
  chargeable: boolean;
  hours: number | null;
  description: string;
  rate_override: number | null;
};

// Shared by "add for someone" and "edit". With `entry` it edits; without, it
// creates and needs an employee picked.
export async function EntryForm({ entry, defaultDate, locked = false }: { entry?: EntryFormValues; defaultDate?: string; locked?: boolean }) {
  const supabase = await createClient();
  const [staffRes, projectsRes, typesRes] = await Promise.all([
    entry ? Promise.resolve({ data: [] as { user_id: string; display_name: string }[] }) : supabase.from("profiles").select("user_id, display_name").eq("is_active", true).order("display_name"),
    supabase.from("v_projects").select("id, project_no, name, rate, status").order("project_no", { ascending: false }),
    supabase.from("work_types").select("id, name, is_active").order("sort_order"),
  ]);

  // Keep retired projects / work types selectable when the entry already uses them.
  const projects = (projectsRes.data ?? []).filter((p) => p.status === "active" || p.id === entry?.project_id);
  const types = (typesRes.data ?? []).filter((t) => t.is_active || t.id === entry?.work_type_id);

  return (
    <ActionForm action={saveEntry} submitLabel={entry ? "Save changes" : "Add entry"} hideSubmit={locked} className="flex flex-col gap-4">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <fieldset disabled={locked} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {!entry ? (
            <div>
              <label htmlFor="e-user" className="field-label">Employee</label>
              <select id="e-user" name="user_id" required defaultValue="" className="field">
                <option value="" disabled>Choose who this is for…</option>
                {(staffRes.data ?? []).map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
              </select>
            </div>
          ) : null}
          <div>
            <label htmlFor="e-date" className="field-label">Date</label>
            <input id="e-date" name="entry_date" type="date" required defaultValue={entry?.entry_date ?? defaultDate} className="field" />
          </div>
          <div>
            <label htmlFor="e-project" className="field-label">Project</label>
            <select id="e-project" name="project_id" required defaultValue={entry?.project_id ?? ""} className="field">
              <option value="" disabled>Choose a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_no} · {p.name}{p.rate === null ? " (no rate)" : ` ($${p.rate}/hr)`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="e-type" className="field-label">Work type</label>
            <select id="e-type" name="work_type_id" required defaultValue={entry?.work_type_id ?? ""} className="field">
              <option value="" disabled>Choose…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="e-charge" className="field-label">Chargeable</label>
            <select id="e-charge" name="chargeable" defaultValue={entry && !entry.chargeable ? "no" : "yes"} className="field">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label htmlFor="e-hours" className="field-label">Hours</label>
            <input id="e-hours" name="hours" type="number" required min={0.25} max={24} step={0.25} defaultValue={entry?.hours ?? ""} className="field tabular-nums" />
          </div>
          <div>
            <label htmlFor="e-override" className="field-label">Rate override ($/hr)</label>
            <input id="e-override" name="rate_override" type="number" min={0} step={0.01} defaultValue={entry?.rate_override ?? ""} placeholder="Blank = project rate" className="field tabular-nums" />
          </div>
        </div>
        <div>
          <label htmlFor="e-desc" className="field-label">Task description</label>
          <input id="e-desc" name="description" required maxLength={500} defaultValue={entry?.description} className="field" />
        </div>
      </fieldset>
    </ActionForm>
  );
}
