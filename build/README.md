# Build scripts

The site is static. `generate.js` writes every `.html` file at the repo root, plus
`sitemap.xml` and `robots.txt`. Edit content here, then re-run the build — never edit
the generated `.html` files directly.

```bash
npm run build          # regenerate the site
npm run sync           # pull tagged project posts from Facebook
npm run sync:build     # sync, then regenerate
```

## Our Projects data

The Projects page merges **two** sources into one gallery (newest first, deduped by `id`):

| File | Who writes it | Purpose |
| --- | --- | --- |
| `projects.manual.json` | You, by hand | Projects added manually. Use this for work that predates the hashtag. |
| `projects.facebook.json` | `fetch-facebook.js` | Generated. Do not edit by hand — the next sync overwrites it. |

Both use the same shape:

```json
[
  {
    "id": "manual-riverside-deck",
    "source": "manual",
    "caption": "Cantilevered deck in Howick — engineered steel subframe.",
    "date": "2026-07-01",
    "images": ["assets/projects/riverside-deck-1.jpg"],
    "permalink": "https://www.facebook.com/..."
  }
]
```

- `id` — must be unique and stable. Changing it re-adds the project as new.
- `date` — `YYYY-MM-DD`. Controls ordering and the date shown on the card.
- `images` — repo-relative paths. First image is the card thumbnail; the rest appear in the lightbox.
- `permalink` — optional. When present the card shows a "View on Facebook" link.

### Adding a project manually

1. Optimise the photo into `assets/projects/` (keeps the page fast):

   ```bash
   node -e "require('sharp')('photo.jpg').rotate().resize({width:1200,withoutEnlargement:true}).jpeg({quality:82,mozjpeg:true}).toFile('assets/projects/my-project-1.jpg')"
   ```

2. Add an entry to `projects.manual.json`.
3. `npm run build`.

## Facebook sync

`fetch-facebook.js` pulls posts from the business Page, keeps only those whose caption
contains the hashtag (`PROJECT_HASHTAG`, default `#project`) **and** that have photos,
downloads the images locally, and writes `projects.facebook.json`.

Facebook's image URLs are signed and expire, so images must be stored locally rather than
hotlinked. Re-running is safe: existing images are not re-downloaded, and if the API call
fails the previous JSON is left untouched so the live page never goes blank.

It needs two environment variables (stored as GitHub Secrets, never committed):

```bash
FB_PAGE_ID=...        # numeric Page ID
FB_PAGE_TOKEN=...     # Page access token (prefer a non-expiring System User token)
```

`.github/workflows/sync-projects.yml` runs this on a schedule and commits any changes.
