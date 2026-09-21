import { AdminTabs } from "@/components/admin-tabs";
import { requireAdmin } from "@/lib/auth";

// Everything under /admin is the workbook's "Lists" sheet, split up.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Setup</h1>
        <p className="mt-1 text-muted">Staff, projects, rates and the company details that appear on invoices.</p>
      </div>
      <AdminTabs />
      {children}
    </div>
  );
}
