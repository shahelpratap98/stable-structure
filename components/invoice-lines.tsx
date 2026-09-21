import { formatHours } from "@/lib/dates";
import type { InvoiceLine } from "@/lib/invoices";

const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

// The body of the workbook's Invoice sheet: lines, subtotal, GST, total due.
export function InvoiceLines({ lines, subtotal, gstRate, gst, total, hours }: { lines: InvoiceLine[]; subtotal: number; gstRate: number; gst: number; total: number; hours: number }) {
  return (
    <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-ink text-xs tracking-wide text-white uppercase">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Description of work</th>
            <th className="px-4 py-2.5 text-right font-semibold">Hours</th>
            <th className="px-4 py-2.5 text-right font-semibold">Rate ($/hr)</th>
            <th className="px-4 py-2.5 text-right font-semibold">Amount ($)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="px-4 py-2.5">
                <span className="font-semibold text-ink">{l.description}</span>
                {l.detail ? <span className="mt-0.5 block text-[13px] text-muted">{l.detail}</span> : null}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatHours(l.hours)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{l.rate === null ? <span className="chip bg-warn-bg text-warn">No rate</span> : money.format(l.rate)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{money.format(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-ink text-ink">
          <tr>
            <td className="px-4 pt-3 pb-1 text-muted">Total hours billed: <span className="tabular-nums">{formatHours(hours)}</span></td>
            <td colSpan={2} className="px-4 pt-3 pb-1 text-right">Subtotal (excl. GST)</td>
            <td className="px-4 pt-3 pb-1 text-right tabular-nums">{money.format(subtotal)}</td>
          </tr>
          <tr>
            <td />
            <td colSpan={2} className="px-4 py-1 text-right">GST @ {(gstRate * 100).toFixed(1)}%</td>
            <td className="px-4 py-1 text-right tabular-nums">{money.format(gst)}</td>
          </tr>
          <tr className="font-display text-base font-semibold">
            <td />
            <td colSpan={2} className="px-4 pt-1 pb-3 text-right">TOTAL DUE (incl. GST)</td>
            <td className="px-4 pt-1 pb-3 text-right tabular-nums">{money.format(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
