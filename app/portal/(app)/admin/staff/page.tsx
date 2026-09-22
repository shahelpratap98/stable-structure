import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { inviteStaff, staffSignInLink, updateStaff } from "../actions";

export const metadata: Metadata = { title: "Staff" };

const ROLE_OPTIONS = [
  { value: "employee", label: "Staff — enters own time" },
  { value: "approver", label: "Approver — sees all time and rates, approves" },
  { value: "admin", label: "Admin — approver plus setup and invoices" },
];

export default async function StaffPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  type StaffRow = Profile & { start_date?: string | null; annual_leave_days?: number | null; sick_leave_days?: number | null; balance_as_of?: string | null; annual_opening_days?: number | null; sick_opening_days?: number | null };
  const wide = await supabase
    .from("profiles")
    .select("user_id, display_name, email, role, standard_day_hours, is_active, start_date, annual_leave_days, sick_leave_days, balance_as_of, annual_opening_days, sick_opening_days")
    .order("is_active", { ascending: false })
    .order("display_name");
  // Before migration 0800 the leave columns don't exist; still show the team.
  const narrow = wide.data
    ? null
    : await supabase.from("profiles").select("user_id, display_name, email, role, standard_day_hours, is_active").order("is_active", { ascending: false }).order("display_name");
  const data = (wide.data ?? narrow?.data ?? []) as StaffRow[];
  const staff = data;

  // Who has actually signed in yet (needs the service key; optional).
  const admin = createAdminClient();
  const signedIn = new Map<string, boolean>();
  if (admin) {
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
    users?.users.forEach((u) => signedIn.set(u.id, Boolean(u.last_sign_in_at)));
  }

  return (
    <div className="flex flex-col gap-8">
      {!admin ? (
        <p className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          <span className="font-semibold">Adding staff is switched off.</span> The server is missing{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>. Add it to <code>portal/.env.local</code> (and to the Vercel project), then restart.
        </p>
      ) : null}

      <section aria-labelledby="invite-heading" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="invite-heading" className="text-xl font-semibold">Add a staff member</h2>
        <p className="mt-1 text-sm text-muted">
          Creates their account and gives you a one-time link to send them. They choose their own password.
        </p>
        <ActionForm action={inviteStaff} submitLabel="Create account and get link" pendingLabel="Creating…" className="mt-4 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="invite-name" className="field-label">Name</label>
              <input id="invite-name" name="display_name" required maxLength={80} className="field" placeholder="As it should appear on timesheets" />
            </div>
            <div>
              <label htmlFor="invite-email" className="field-label">Email</label>
              <input id="invite-email" name="email" type="email" required className="field" />
            </div>
            <div>
              <label htmlFor="invite-role" className="field-label">Role</label>
              <select id="invite-role" name="role" defaultValue="employee" className="field">
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
        </ActionForm>
      </section>

      <section aria-labelledby="staff-heading">
        <h2 id="staff-heading" className="text-xl font-semibold">Team ({staff.filter((s) => s.is_active).length} active)</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {staff.map((person) => {
            const pending = admin && signedIn.get(person.user_id) === false;
            return (
              <li key={person.user_id} className="rounded-xl border border-line bg-surface">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span className="font-semibold text-ink">{person.display_name}</span>
                    <span className="text-sm text-muted">{person.email}</span>
                    <span className="ml-auto flex flex-wrap gap-1.5">
                      {person.user_id === me.user_id ? <span className="chip bg-steel-100 text-steel">You</span> : null}
                      {pending ? <span className="chip bg-warn-bg text-warn">Hasn&apos;t signed in yet</span> : null}
                      {!person.is_active ? <span className="chip bg-bad-bg text-bad">Deactivated</span> : null}
                      <span className="chip bg-surface-2 text-ink capitalize">{person.role === "employee" ? "Staff" : person.role}</span>
                    </span>
                  </summary>
                  <div className="flex flex-col gap-5 border-t border-line px-4 py-4">
                    <ActionForm action={updateStaff} submitLabel="Save changes" className="flex flex-col gap-4">
                      <input type="hidden" name="user_id" value={person.user_id} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label htmlFor={`name-${person.user_id}`} className="field-label">Name</label>
                          <input id={`name-${person.user_id}`} name="display_name" defaultValue={person.display_name} required maxLength={80} className="field" />
                        </div>
                        <div>
                          <label htmlFor={`role-${person.user_id}`} className="field-label">Role</label>
                          <select id={`role-${person.user_id}`} name="role" defaultValue={person.role} className="field">
                            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`std-${person.user_id}`} className="field-label">Standard day (hours)</label>
                          <input id={`std-${person.user_id}`} name="standard_day_hours" type="number" min={0.25} max={24} step={0.25} defaultValue={person.standard_day_hours ?? ""} placeholder="Company default" className="field" />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label htmlFor={`start-${person.user_id}`} className="field-label">Start date</label>
                          <input id={`start-${person.user_id}`} name="start_date" type="date" defaultValue={person.start_date ?? ""} className="field" />
                          <p className="mt-1 text-xs text-muted">Their leave year runs from this anniversary.</p>
                        </div>
                        <div>
                          <label htmlFor={`al-${person.user_id}`} className="field-label">Annual leave (days/yr)</label>
                          <input id={`al-${person.user_id}`} name="annual_leave_days" type="number" min={0} max={365} step={0.5} defaultValue={person.annual_leave_days ?? ""} placeholder="Company default" className="field tabular-nums" />
                        </div>
                        <div>
                          <label htmlFor={`sl-${person.user_id}`} className="field-label">Sick leave (days/yr)</label>
                          <input id={`sl-${person.user_id}`} name="sick_leave_days" type="number" min={0} max={365} step={0.5} defaultValue={person.sick_leave_days ?? ""} placeholder="Company default" className="field tabular-nums" />
                        </div>
                      </div>
                      <details className="rounded-lg border border-line bg-surface-2/50 px-3 py-2">
                        <summary className="cursor-pointer text-sm font-semibold text-ink">Opening leave balances (carried over from the old system)</summary>
                        <p className="mt-1 text-xs text-muted">Enter what they had on a given date; leave recorded here before that date is ignored, and each anniversary after it adds a year&apos;s entitlement. Leave blank to start from a full entitlement this leave year.</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <div>
                            <label htmlFor={`asof-${person.user_id}`} className="field-label">Correct as of</label>
                            <input id={`asof-${person.user_id}`} name="balance_as_of" type="date" defaultValue={person.balance_as_of ?? ""} className="field" />
                          </div>
                          <div>
                            <label htmlFor={`ao-${person.user_id}`} className="field-label">Annual leave balance (days)</label>
                            <input id={`ao-${person.user_id}`} name="annual_opening_days" type="number" min={0} max={1000} step={0.5} defaultValue={person.annual_opening_days ?? ""} className="field tabular-nums" />
                          </div>
                          <div>
                            <label htmlFor={`so-${person.user_id}`} className="field-label">Sick leave balance (days)</label>
                            <input id={`so-${person.user_id}`} name="sick_opening_days" type="number" min={0} max={1000} step={0.5} defaultValue={person.sick_opening_days ?? ""} className="field tabular-nums" />
                          </div>
                        </div>
                      </details>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="is_active" defaultChecked={person.is_active} className="size-4 accent-ink" />
                        Active — can sign in. Untick to lock them out; their past time is kept.
                      </label>
                    </ActionForm>
                    {admin ? (
                      <ActionForm action={staffSignInLink} submitLabel="Get a new sign-in link" pendingLabel="Creating…" quiet className="border-t border-line pt-4">
                        <input type="hidden" name="email" value={person.email} />
                        <p className="mb-2 text-sm text-muted">Lost invite or forgotten password? This makes a fresh one-time link for {person.display_name}.</p>
                      </ActionForm>
                    ) : null}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
