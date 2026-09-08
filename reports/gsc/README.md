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
