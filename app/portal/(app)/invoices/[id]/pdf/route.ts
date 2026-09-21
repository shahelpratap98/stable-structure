import { NextResponse, type NextRequest } from "next/server";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { loadInvoice } from "@/lib/invoices";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Row-level security does the gatekeeping: the invoices table is only
// readable by approvers and admins, so anyone else gets a 404 here.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Not found.", { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in first.", { status: 401 });
  const limit = await rateLimit("downloads", user.id);
  if (!limit.ok) {
    return new NextResponse("Too many downloads. Wait a few minutes and try again.", { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const loaded = await loadInvoice(supabase, id);
  if (!loaded) return new NextResponse("Not found.", { status: 404 });
  if (loaded.invoice.is_external) return new NextResponse("This invoice was raised outside the portal, so there is no PDF.", { status: 404 });

  const pdf = await renderInvoicePdf(loaded);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${loaded.invoice.invoice_no}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
