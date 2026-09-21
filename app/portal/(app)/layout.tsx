import Link from "next/link";
import { signOut } from "@/app/portal/auth-actions";
import { NavLinks } from "@/components/nav-links";
import { isAdmin, isApprover, requireProfile } from "@/lib/auth";
import { WEBSITE_URL } from "@/lib/paths";
import { createClient } from "@/lib/supabase/server";
import { ActionSubmit } from "@/components/pending-buttons";

const ROLE_LABEL = { employee: "Staff", approver: "Approver", admin: "Admin" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const approver = isApprover(profile.role);

  let pending = 0;
  if (approver) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted");
    pending = count ?? 0;
  }

  const links = [
    { href: "/portal/my/day", label: "My day" },
    ...(approver ? [{ href: "/portal/approvals", label: "Approvals", badge: pending }] : []),
    ...(approver ? [{ href: "/portal/entries", label: "All entries" }] : []),
    ...(approver ? [{ href: "/portal/invoices", label: "Invoices" }] : []),
    { href: "/portal/reports", label: approver ? "Reports" : "My hours" },
    ...(isAdmin(profile.role) ? [{ href: "/portal/admin", label: "Setup" }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
          <a href={WEBSITE_URL} className="flex items-center gap-3" aria-label="Stable Structure website">
            {/* Same logo file as the website header. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={"/assets/logo.webp"} width={303} height={186} alt="" className="h-9 w-auto rounded bg-white p-0.5" />
            <span className="font-display text-[15px] font-semibold tracking-[0.12em] uppercase">
              Staff <span className="text-accent">Portal</span>
            </span>
          </a>
          <NavLinks links={links} />
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-white/80">
              <Link href="/portal/account" className="underline-offset-4 hover:text-white hover:underline">{profile.display_name}</Link>
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">
                {ROLE_LABEL[profile.role]}
              </span>
            </span>
            <form action={signOut}>
              <ActionSubmit pendingLabel="Signing out…" className="font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
                Sign out
              </ActionSubmit>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
