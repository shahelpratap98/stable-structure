import Link from "next/link";
import { signOut } from "@/app/portal/auth-actions";
import { NavLinks } from "@/components/nav-links";
import { isAdmin, isApprover, requireProfile } from "@/lib/auth";
import { WEBSITE_URL } from "@/lib/paths";
import { createClient } from "@/lib/supabase/server";
import { MobileNav, type MobileLink } from "@/components/mobile-nav";
import { ActionSubmit } from "@/components/pending-buttons";

const ROLE_LABEL = { employee: "Staff", approver: "Approver", admin: "Admin" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const approver = isApprover(profile.role);

  let pending = 0;
  let leavePending = 0;
  if (approver) {
    const supabase = await createClient();
    const [entries, leave] = await Promise.all([
      supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "requested"),
    ]);
    pending = entries.count ?? 0;
    leavePending = leave.count ?? 0; // 0 until migration 0800 has run
  }

  const links = [
    { href: "/portal/my/day", label: "My day" },
    ...(approver ? [{ href: "/portal/approvals", label: "Approvals", badge: pending }] : []),
    ...(approver ? [{ href: "/portal/entries", label: "All entries" }] : []),
    ...(approver ? [{ href: "/portal/invoices", label: "Invoices" }] : []),
    { href: "/portal/reports", label: approver ? "Reports" : "My hours" },
    { href: "/portal/leave", label: "Leave", badge: leavePending },
    ...(isAdmin(profile.role) ? [{ href: "/portal/admin", label: "Setup" }] : []),
    { href: "/portal/guide", label: "Guide" },
  ];

  // Phone bottom bar: the three things used most, everything else under More.
  const primaryHrefs = approver ? ["/portal/my/day", "/portal/approvals", "/portal/leave"] : ["/portal/my/day", "/portal/leave", "/portal/reports"];
  const shortLabel: Record<string, string> = { "/portal/entries": "Entries", "/portal/reports": approver ? "Reports" : "Hours" };
  const asMobile = (l: (typeof links)[number]): MobileLink => ({ ...l, short: shortLabel[l.href] });
  const primary = primaryHrefs.map((h) => links.find((l) => l.href === h)).filter(Boolean).map((l) => asMobile(l!));
  const more = links.filter((l) => !primaryHrefs.includes(l.href)).map(asMobile);

  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-2.5 sm:justify-start sm:py-3 sm:px-6">
          <a href={WEBSITE_URL} className="flex items-center gap-3" aria-label="Stable Structure website">
            {/* Same logo file as the website header. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={"/assets/logo.webp"} width={303} height={186} alt="" className="h-9 w-auto rounded bg-white p-0.5" />
            <span className="font-display text-[15px] font-semibold tracking-[0.12em] uppercase">
              Staff <span className="text-accent">Portal</span>
            </span>
          </a>
          <div className="hidden sm:contents">
            <NavLinks links={links} />
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/80 sm:hidden">{profile.display_name.split(" ")[0]}</span>
          <div className="ml-auto hidden items-center gap-4 text-sm sm:flex">
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
      {/* printed pages get a plain letterhead line instead of the menu bar */}
      <p className="hidden border-b border-ink pb-2 text-sm font-semibold text-ink print:block">Stable Structure Limited · Staff portal</p>
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-8 print:max-w-none print:p-0 print:pt-4">{children}</main>
      <MobileNav primary={primary} more={more} name={profile.display_name} roleLabel={ROLE_LABEL[profile.role]} signOut={signOut} />
    </div>
  );
}
