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
| `2026-09-08` | 9 Aug – 5 Sep 2026 (28d) | **Domain property** (all URL variants) — use this one for reporting. First post-sprint pull. Window starts 4 days before wave 1, so per-day comparisons should use the 14 Aug+ slice. Apex variant has consolidated; `http://www` still reporting separately. |

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
| `2026-09-08-https-www-property` | 9 Aug – 5 Sep 2026 (28d) | Same window, **URL-prefix property for `https://www.` only**. Shows 98 clicks vs 131 — the 33-click gap is the still-indexed `http://www` homepage. |

## Which property to export from

**Always use the Domain property.** The `https://www` URL-prefix property misses
about **25% of clicks**, because Google still has the old `http://www` homepage
indexed (34 clicks at position 4.16 in this window). The redirect is correct —
a single 308 hop to https with a matching canonical — so this is Google
consolidation lag, not a site fault, and it should fade on its own.

Worth watching: for `structural engineer auckland`, the blended position is 7.7
while the canonical https URL alone sits at 26.7. The old http URL is still
holding the ranking equity for the most commercially valuable query. Expect the
https figures to improve as consolidation completes.
