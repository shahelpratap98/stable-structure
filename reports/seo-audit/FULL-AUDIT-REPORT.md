# Full SEO Audit — stablestructure.co.nz

**Date:** 20 August 2026
**Business type:** Local professional service (hybrid: Botany office + service-area, nationwide NZ)
**Pages audited:** 22 (crawled 28 URLs including assets)
**SEO Health Score: 84/100**

Method: live crawl of all sitemap URLs, four specialist audits (technical, content/E-E-A-T, AI search readiness, local), Google Lighthouse mobile runs, and Google's Rich Results Test. Every finding below was independently verified against the live site before being recorded — one specialist claim was found to be overstated and is corrected in the notes.

---

## Score by category

| Category | Weight | Score | Contribution |
|---|---|---|---|
| Technical SEO | 22% | 88 | 19.4 |
| Content Quality | 23% | 70 | 16.1 |
| On-Page SEO | 20% | 88 | 17.6 |
| Schema / Structured Data | 10% | 92 | 9.2 |
| Performance (Core Web Vitals) | 10% | 97 | 9.7 |
| AI Search Readiness | 10% | 82 | 8.2 |
| Images | 5% | 72 | 3.6 |
| **Total** | | | **84/100** |

Content Quality is the score ceiling. Everything else is in good or excellent shape.

---

## Fixed during this audit

All of the following were found, fixed, deployed and verified live on 20 August.

| Severity | Finding | Fix |
|---|---|---|
| **High** | `build/generate.js` was publicly served, returning HTTP 200 with 127KB of site-generator source. `vercel.json`, `README.md` and `.gitignore` were also exposed. Cause: `outputDirectory` is the repo root. | Redirected at the routing layer (they cannot be `.vercelignore`d — the build command needs them). Verified: all now 308 away. |
| **High** | The "Home" nav link on all 22 pages pointed at `/index.html`, which permanently redirects to `/` — so the most-clicked link on the site paid a needless 308 hop. | Nav now points at the site root. Verified live. |
| **High** | Guide breadcrumbs declared a page named "Guides" located at `services.html`. That page did not exist — a factual error in machine-readable data, and the two guides had no hub linking them. | Built a real `/guides.html` hub; breadcrumbs corrected to point at it. |
| **Medium** | Trailing-slash URLs (`/services/`, `/guides/`, `/services/<slug>/`) dead-ended in 404s. Internal links never used them, but external links, citations and typed URLs did. | Redirects added. Note: the first attempt failed because Vercel strips the trailing slash *before* evaluating redirects; corrected to source on the stripped form. |
| **Medium** | The projects page lazy-loaded its first, above-the-fold image — a documented LCP anti-pattern and the likely cause of its 2.8s LCP versus 1.5s elsewhere. | First image now `fetchpriority="high"`, remainder still lazy. |
| **Medium** | FAQ said retaining walls need engineering "above certain heights" while the guide and service page both state the precise 1.5m/surcharge rule. Inconsistent facts weaken AI citation confidence. | FAQ now states the real threshold and links the guide. |
| **Medium** | The About page said the founder had "more than eight years" of experience two sentences before "over 20 years". An AI summarising that page in isolation could report the wrong figure. | Reworded so firm age and career experience are clearly distinct. |
| **Medium** | 11 title tags exceeded the length Google displays, so they were being truncated in results. | All titles now under 60 characters. |
| **Medium** | Project image alt text was sliced at a hard 110 characters, producing fragments ending mid-word ("engineered timber framing a"). Present in both the generator and the lightbox script. | Now trims on a clause or word boundary and never ends on a dangling function word. |
| **Medium** | Star ratings used `aria-label` on a bare `<div>` — prohibited ARIA, so screen readers announced nothing. Footer and feature headings also skipped levels. | `role="img"` added; heading levels corrected with CSS kept in sync. Home accessibility went 94 → 100. |

---

## Open findings

### Content Quality — the score ceiling

**High — five service pages are thin.** Measured unique editorial content (excluding shared nav, sidebar and CTA chrome):

| Page | Unique words | Status |
|---|---|---|
| building-consent-documentation | 900 | rewritten |
| retaining-walls | 897 | rewritten |
| construction-supervision | 862 | rewritten |
| site-inspections | 741 | rewritten |
| **structural-design** | **183** | original |
| **decks-outdoor-living** | **168** | original |
| **civil-design** | **162** | original |
| **swimming-pools** | **161** | original |
| **carports-sheds-portals** | **160** | original |

The five originals carry roughly one fifth the substance of the four rewritten pages. `structural-design` is the most commercially significant of them — it targets the "structural engineer Auckland" cluster, the highest-value query set the business has.

Positive: no boilerplate overlap above 8% between any pair, so the unique closing paragraphs are doing their job. These pages are thin, not duplicated.

**Medium — supporting pages are light.** Reviews 119 words, projects 154, sectors 156, process 168, contact 212. Reasonable for functional pages, but sectors and process are indexable pages competing on their own.

### Local

**High — no Auckland-specific regulatory content.** "TC1/TC2/TC3" appears zero times sitewide (verified). For a firm doing retaining walls and foundations in the geography affected by the 2023 Auckland floods and now navigating land-classification consenting, this is the strongest content opportunity available: genuine expertise, specific to the service area, targeting the exact underperforming query cluster.

*Correction:* the local specialist reported "Auckland Council" appears zero times. Verified false — it appears three times, on `building-consent-documentation.html`. The valid form of the finding is that it appears on only one page of 22, and not on `retaining-walls.html` where it would matter most.

**Medium — the local-content pattern exists but is unreplicated.** `construction-supervision.html` has a genuine "Supervision in South and East Auckland" section explaining why Botany-based coverage matters operationally. That is the correct model — real reasoning tied to geography, not a doorway page. It is not repeated on any other service page.

**Medium — `Service` schema declares `areaServed: "New Zealand"` only** while the visible copy names Botany, Flat Bush, Howick, Pakuranga and Manukau. Adding city-level entries is content-supported and carries no doorway risk.

**Medium — review cadence.** Reviews are timestamped ~4 years, ~2 years, ~6 months and ~1 month ago. The trend is accelerating but the listing has been stale for most of its life. The fix is process, not tooling: ask at PS4/CCC sign-off every time — the highest-satisfaction moment in an engagement.

### AI Search Readiness — 78/100 (specialist score)

All major AI crawlers are unblocked (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bingbot, CCBot). Nothing is preventing citation.

Strengths: the guides open with genuinely quotable, self-contained answers. The retaining-wall guide's opening 52 words state the consent threshold precisely enough to be lifted verbatim into an AI answer.

**Medium — brand ambiguity.** "Stable Structure" collides with "stable diffusion" and similar tech terminology that dominates training corpora. Mitigation is currently incidental rather than deliberate: the name should never appear without "structural/civil engineer", "Auckland" or "Limited" in the same sentence, particularly in H1s and opening paragraphs.

**Medium — no `Article` schema on the guides.** The visible "Reviewed by … CPEng #1030007 · Updated 13 August 2026" byline is a strong human-facing signal with no machine-readable counterpart (`author`, `datePublished`, `dateModified`).

**Low — no NZBN in `sameAs`.** The NZ Companies Register entry is a free, authoritative, collision-proof entity anchor that a tech-term lookalike cannot share.

**Low — no `llms.txt`.** Honest verdict: no major crawler has a documented dependency on it, and Google has stated it is not used for Search or AI Overviews. Cheap to add, genuinely low impact. Not a priority.

### Images

**Medium — project photos are unoptimised.** 289KB and 276KB JPEGs, roughly 1MB total on the projects page. Converting to WebP would cut about 70% with no visible quality loss. This is the main remaining performance item.

### Technical

**Medium — apex domain takes two redirect hops.** `http://stablestructure.co.nz` → `https://stablestructure.co.nz` → `https://www.stablestructure.co.nz`. Bare-domain backlinks and citations pay double latency and an extra crawl hop. Fixable in DNS/domain config.

**Low — IndexNow not implemented.** Sitemap `lastmod` is accurate, so a post-deploy ping to `api.indexnow.org` would speed Bing/Yandex pickup at near-zero cost. Google, which dominates NZ search, is already well served.

---

## Verified clean

No action needed on any of these — checked and confirmed:

- Internal link integrity: zero broken links across all 22 pages
- Zero orphan pages
- Titles, meta descriptions and H1s unique on every page; exactly one H1 per page
- HTTP/2 confirmed via ALPN; Brotli compression on HTML
- Zero mixed content
- Real 404s return true 404 status; `/404.html` self-tags `noindex`
- All five security headers present and intact after the config change
- Canonicals, sitemap (22 URLs with per-page `lastmod`) and robots.txt correct
- Google Rich Results Test: passes on home, service and guide page types, breadcrumbs valid
- Lighthouse mobile: 100 performance / 100 accessibility / 100 best practices / 100 SEO on the homepage; LCP 1.53s
- `hreflang` correctly absent for a single-market site
- No `aggregateRating` or `FAQPage` schema — both correctly avoided

---

## Prioritised action plan

**Phase 1 — highest commercial value (the score ceiling)**
1. Rewrite `structural-design.html` to the depth of the four completed pages. It targets the most valuable query cluster the business has and currently carries 183 words.
2. Publish an Auckland-specific TC1/TC2/TC3 and Auckland Council consent article, and add an Auckland Council paragraph to `retaining-walls.html`.

**Phase 2 — content depth**
3. Rewrite the remaining four thin service pages (civil-design, swimming-pools, decks-outdoor-living, carports-sheds-portals).
4. Replicate the South/East Auckland local pattern onto the rewritten service pages.

**Phase 3 — technical polish**
5. Convert project photos to WebP (~70% saving; the last real performance item).
6. Add `Article` schema with author and dates to the guides; add city-level `areaServed`; add NZBN to `sameAs`.
7. Collapse the apex redirect chain to a single hop.

**Phase 4 — ongoing**
8. Review-ask process at every PS4/CCC sign-off; reply to every review naming service and suburb where true.
9. Seed GBP Q&A and Services from existing site copy; upload existing project photos to GBP.
10. Re-run this audit quarterly; compare Search Console against the recorded baselines.

---

## Limitations

- No DataForSEO or live SERP access this session: current local-pack composition, competitor review counts and keyword positions were not verified live. The Search Console baseline from 11 August remains the reference.
- The Google Business Profile dashboard could not be inspected. Services, Q&A, Posts and review-response state are inferred, not observed. Confirm before treating those as net-new work.
- Citation indexation (Engineering NZ, SESOC, NZSEE, Yellow) was not independently re-verified.
