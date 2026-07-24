/* ===========================================================
   Stable Structure Limited — Facebook project sync
   Run:  node build/fetch-facebook.js   (npm run sync)

   Pulls posts from the business Facebook Page, keeps the ones tagged
   with PROJECT_HASHTAG that have photos, downloads those photos into
   assets/projects/ and writes build/projects.facebook.json, which
   generate.js renders on the Our Projects page.

   Requires (never commit these — they live in GitHub Secrets):
     FB_PAGE_ID     numeric Page ID
     FB_PAGE_TOKEN  Page access token

   Facebook's CDN URLs are signed and expire, so images are stored
   locally rather than hotlinked.

   Safe to re-run: images already on disk are not downloaded again, and
   if the API call fails the previous JSON is left untouched so the live
   page can never be blanked by a bad sync.
   =========================================================== */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_JSON = path.join(__dirname, 'projects.facebook.json');
const IMG_DIR = path.join(ROOT, 'assets', 'projects');
const IMG_REL = 'assets/projects';

/* Only posts whose caption contains this tag are published. Change here. */
const PROJECT_HASHTAG = '#project';

const GRAPH_VERSION = 'v21.0';
const POST_LIMIT = 50;          // most recent N posts to consider
const MAX_IMAGE_WIDTH = 1200;   // downscale for web
const JPEG_QUALITY = 82;

const PAGE_ID = process.env.FB_PAGE_ID;
const TOKEN = process.env.FB_PAGE_TOKEN;

function fail(msg) {
  console.error('\n✗ Facebook sync failed:', msg);
  console.error('  build/projects.facebook.json left unchanged — the site keeps its current projects.\n');
  process.exit(1);
}

/* Pull every usable photo URL out of a post, largest first.
   Multi-photo posts expose each image under attachments.subattachments. */
function imageUrls(post) {
  const urls = [];
  const atts = (post.attachments && post.attachments.data) || [];
  atts.forEach((att) => {
    const subs = (att.subattachments && att.subattachments.data) || [];
    if (subs.length) {
      subs.forEach((s) => {
        const src = s.media && s.media.image && s.media.image.src;
        if (src) urls.push(src);
      });
    } else {
      const src = att.media && att.media.image && att.media.image.src;
      if (src) urls.push(src);
    }
  });
  if (!urls.length && post.full_picture) urls.push(post.full_picture);
  return [...new Set(urls)];
}

/* Strip the control hashtag from the visible caption, tidy whitespace. */
function cleanCaption(message) {
  return String(message || '')
    .replace(new RegExp('\\' + PROJECT_HASHTAG + '\\b', 'gi'), '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasHashtag(message) {
  return new RegExp('\\' + PROJECT_HASHTAG + '\\b', 'i').test(String(message || ''));
}

async function downloadImage(url, destAbs) {
  if (fs.existsSync(destAbs)) return 'cached';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf)
    .rotate()
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(destAbs);
  return 'downloaded';
}

async function main() {
  if (!PAGE_ID || !TOKEN) {
    fail('missing FB_PAGE_ID and/or FB_PAGE_TOKEN environment variables.');
  }

  const fields = [
    'id', 'message', 'created_time', 'permalink_url', 'full_picture',
    'attachments{media_type,media,subattachments}',
  ].join(',');
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(PAGE_ID)}/posts`
    + `?fields=${encodeURIComponent(fields)}&limit=${POST_LIMIT}`
    + `&access_token=${encodeURIComponent(TOKEN)}`;

  let payload;
  try {
    const res = await fetch(url);
    payload = await res.json();
    if (!res.ok || payload.error) {
      const e = payload && payload.error;
      throw new Error(e ? `${e.type || 'GraphError'}: ${e.message}` : `HTTP ${res.status}`);
    }
  } catch (err) {
    fail(err.message);
  }

  const posts = (payload.data || []).filter((p) => hasHashtag(p.message));
  console.log(`Fetched ${(payload.data || []).length} post(s); ${posts.length} tagged ${PROJECT_HASHTAG}.`);

  fs.mkdirSync(IMG_DIR, { recursive: true });

  const projects = [];
  for (const post of posts) {
    const urls = imageUrls(post);
    if (!urls.length) {
      console.log(`  – skipped ${post.id} (tagged but no photo)`);
      continue;
    }

    const safeId = String(post.id).replace(/[^\w.-]/g, '_');
    const images = [];
    for (let i = 0; i < urls.length; i++) {
      const file = `fb-${safeId}-${i + 1}.jpg`;
      try {
        const how = await downloadImage(urls[i], path.join(IMG_DIR, file));
        images.push(`${IMG_REL}/${file}`);
        if (how === 'downloaded') console.log(`  ↓ ${file}`);
      } catch (err) {
        console.warn(`  ! ${file}: ${err.message} — skipping this image`);
      }
    }
    if (!images.length) continue;

    projects.push({
      id: `fb-${safeId}`,
      source: 'facebook',
      caption: cleanCaption(post.message),
      date: (post.created_time || '').slice(0, 10),
      images,
      permalink: post.permalink_url || '',
    });
  }

  projects.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  fs.writeFileSync(OUT_JSON, JSON.stringify(projects, null, 2) + '\n', 'utf8');
  console.log(`\n✓ Wrote ${projects.length} project(s) to build/projects.facebook.json`);
  console.log('  Run "npm run build" to regenerate the site.\n');
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
