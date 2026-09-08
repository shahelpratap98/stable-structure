# Google Search Console exports

Baselines for the monthly comparison reports. **Do not overwrite** — each pull
gets its own dated folder so deltas stay reproducible.

| Folder | Window actually covered | Notes |
|---|---|---|
| `2026-08-11-baseline` | 29 Jul – 8 Aug 2026 | Pre-sprint baseline. Exported as "Last 28 days" but the site was newly indexed, so only 11 days contain data. Taken from the URL-prefix property, before the Domain property existed — the Pages report still shows clicks split across http/www/apex. |

Sprint deploy dates (for aligning comparison windows):
- **13 Aug 2026** — wave 1: schema, fonts, logo, content rewrites, guides, titles
- **20 Aug 2026** — wave 2: accessibility, audit fixes, guides hub, redirects

A clean post-sprint window therefore starts **14 Aug 2026**.
| `2026-09-08` | 9 Aug – 5 Sep 2026 (28d) | First post-sprint pull. Window starts 4 days before wave 1, so per-day comparisons should use the 14 Aug+ slice. Apex variant has consolidated; `http://www` still reporting separately. |

## Comparison method (use this every month)

Windows are different lengths, so **always normalise to per-day** before
comparing. Also note the baseline contains a launch spike: 30 Jul 2026 alone
was 40 clicks, 44% of all baseline clicks, from the site announcement. Compare
against the de-spiked baseline (5.10 clicks/day) as well as the raw figure, or
the sprint will look like it lost traffic when it did not.

Split clicks brand vs non-brand. Brand = contains "stable" excluding
"stable consulting" (a different Auckland firm) and the stable-diffusion noise.
Brand demand decayed after launch; non-brand is the number that measures the
SEO work.
