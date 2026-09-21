"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/admin/staff", label: "Staff" },
  { href: "/portal/admin/projects", label: "Projects & rates" },
  { href: "/portal/admin/clients", label: "Clients" },
  { href: "/portal/admin/work-types", label: "Work types" },
  { href: "/portal/admin/holidays", label: "Public holidays" },
  { href: "/portal/admin/settings", label: "Company & GST" },
  { href: "/portal/admin/audit", label: "Audit log" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Setup sections" className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap ${
              active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
