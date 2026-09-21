import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { createClient } from "@/lib/supabase/server";
import { saveClient } from "../actions";

export const metadata: Metadata = { title: "Clients" };

type ClientRow = { id: string; name: string; billing_email: string | null; address: string | null };

function ClientFields({ c }: { c?: ClientRow }) {
  const k = c?.id ?? "new";
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`cname-${k}`} className="field-label">Name (appears as &quot;Bill to&quot;)</label>
          <input id={`cname-${k}`} name="name" defaultValue={c?.name} required maxLength={120} className="field" />
        </div>
        <div>
          <label htmlFor={`cemail-${k}`} className="field-label">Billing email</label>
          <input id={`cemail-${k}`} name="billing_email" type="email" defaultValue={c?.billing_email ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor={`caddr-${k}`} className="field-label">Postal address</label>
          <input id={`caddr-${k}`} name="address" defaultValue={c?.address ?? ""} maxLength={200} className="field" />
        </div>
      </div>
    </>
  );
}

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, name, billing_email, address").order("name");
  const clients = (data ?? []) as ClientRow[];

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="new-client-heading" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="new-client-heading" className="text-xl font-semibold">Add a client</h2>
        <ActionForm action={saveClient} submitLabel="Add client" className="mt-4 flex flex-col gap-4">
          <ClientFields />
        </ActionForm>
      </section>

      <section aria-labelledby="clients-heading">
        <h2 id="clients-heading" className="text-xl font-semibold">Clients ({clients.length})</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {clients.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-surface">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 px-4 py-3">
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span className="text-sm text-muted">{c.billing_email ?? "No billing email"}</span>
                </summary>
                <div className="border-t border-line px-4 py-4">
                  <ActionForm action={saveClient} submitLabel="Save changes" className="flex flex-col gap-4">
                    <ClientFields c={c} />
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
