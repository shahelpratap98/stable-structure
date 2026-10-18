import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { runVerification, type VResult } from "@/lib/design/verify";

export const metadata: Metadata = { title: "Design verification" };
export const dynamic = "force-dynamic"; // runs the engine on every visit

const show = (v: number | string | null, unit?: string) => {
  if (v === null) return "error";
  if (typeof v === "string") return v;
  const a = Math.abs(v);
  const s = a !== 0 && (a < 0.01 || a >= 1e5) ? v.toExponential(3) : v.toFixed(a < 1 ? 4 : a < 100 ? 3 : 1);
  return unit ? `${s} ${unit}` : s;
};

export default async function VerificationPage() {
  await requireProfile();
  const results = runVerification();
  const failed = results.filter((r) => !r.pass);
  const groups = [...new Set(results.map((r) => r.group))];
  const ranAt = new Date().toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm">
          <Link href="/portal/design" className="font-semibold text-accent-600 hover:underline">
            ← Design
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Engine verification</h1>
        <p className="mt-1 max-w-3xl text-muted">
          The design engine run just now against answers worked out independently: textbook formulas, published capacity tables, hand calculations and the results of past Stable Structure jobs. The same cases run as automated tests (<code>npm test</code>) before every release.
        </p>
      </div>

      <div className={`rounded-xl border px-5 py-4 ${failed.length ? "border-bad bg-bad-bg text-bad" : "border-line bg-surface"}`}>
        <p className="text-lg font-semibold">
          {failed.length ? `${failed.length} of ${results.length} checks do not match` : `All ${results.length} checks match`}
        </p>
        <p className="mt-1 text-sm text-muted">Run {ranAt}. A check passes when the engine is within the stated tolerance of the expected answer.</p>
      </div>

      {groups.map((g) => (
        <section key={g} className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3 text-lg font-semibold">{g}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-5 py-2 font-semibold">Check</th>
                  <th className="px-3 py-2 font-semibold">Expected</th>
                  <th className="px-3 py-2 font-semibold">Engine</th>
                  <th className="px-3 py-2 font-semibold">Tolerance</th>
                  <th className="px-5 py-2 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {results
                  .filter((r) => r.group === g)
                  .map((r: VResult) => (
                    <tr key={r.name} className="border-t border-line align-top">
                      <td className="px-5 py-2">
                        <div className="font-semibold text-ink">{r.name}</div>
                        <div className="text-xs text-muted">{r.source}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{show(r.want, r.unit)}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.error ? <span className="text-bad">{r.error}</span> : show(r.got, r.unit)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted">{typeof r.want === "number" ? (r.tol === 0 ? "exact" : `${((r.tol ?? 0.002) * 100).toFixed(1)} %`) : "same text"}</td>
                      <td className={`px-5 py-2 font-semibold whitespace-nowrap ${r.pass ? "text-ok" : "text-bad"}`}>{r.pass ? "Matches" : "Differs"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-line bg-surface p-5 text-sm leading-relaxed text-muted sm:p-6">
        <h2 className="text-lg font-semibold text-ink">What this does not prove</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
          <li>It checks the arithmetic and the methods on known cases. It does not check that a model has been drawn or loaded correctly: that is the designer&apos;s and the checker&apos;s job.</li>
          <li>Wind multipliers and some material values come from secondary sources; the guide lists which. Check them against the current standards.</li>
          <li>The calculations are drafts for a CPEng to review and sign. Passing every check here does not replace that review.</li>
        </ul>
      </section>
    </div>
  );
}
