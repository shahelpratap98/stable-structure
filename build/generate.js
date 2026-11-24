/* ===========================================================
   Stable Structure Limited — static site generator
   Run:  node build/generate.js
   Emits index.html + section pages + services/*.html at repo root.
   Edit CONTENT here, then re-run to regenerate every page with a
   consistent header, footer, Services dropdown and WhatsApp CTAs.
   =========================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Canonical site origin — used for <link rel="canonical">, og:url, sitemap.xml
   and robots.txt so every emitted URL stays in sync, and for the 404 page's
   absolute links.

   The live site is www.stablestructure.co.nz (the apex 308-redirects to www),
   so that is hardcoded as the canonical home. It deliberately takes priority
   over Vercel's auto-detected *.vercel.app URL — otherwise preview and
   production builds advertise the .vercel.app host as canonical and Google
   indexes that instead of the real domain.

   Override with the SITE_URL env var if the canonical domain ever changes. */
const SITE_URL = (() => {
  const raw = process.env.SITE_URL || 'https://www.stablestructure.co.nz/';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.endsWith('/') ? withProtocol : `${withProtocol}/`;
})();

/* Path the site is served under ('/' on Vercel, '/stable-structure/' on
   GitHub Pages). The 404 page needs absolute links, so it must match. */
const BASE_PATH = new URL(SITE_URL).pathname;

/* ---------- Business constants ---------- */
const PHONE_DISPLAY = '021 148 8984';
const PHONE_TEL = '+64211488984';
const EMAIL = 'gajan@stablestructure.co.nz';
const OWNER = 'Gajanthan Vethanathan';
const WA_NUMBER = '64211488984';
const WA_DEFAULT = "Hi Stable Structure, I'd like to enquire about a project.";
const FACEBOOK_URL = 'https://www.facebook.com/StableStructure.Auckland';
const LINKEDIN_URL = 'https://www.linkedin.com/company/stablestructure/';
/* Optional featured video on the Projects page — a Facebook plugin embed URL
   (the src from Facebook's "Embed" dialog), or '' to hide the section. This is
   the one part of the page that loads from Facebook. */
const PROJECT_VIDEO_EMBED = 'https://www.facebook.com/plugins/video.php?height=314&href=https%3A%2F%2Fwww.facebook.com%2Freel%2F28072485295674770%2F&show_text=false&width=560&t=0';
const waHref = (msg) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg || WA_DEFAULT)}`;

/* Google Business Profile Place ID (supplied by owner 2026-08-13).
   Drives the direct write-review and listing URLs for every review CTA. */
const GOOGLE_PLACE_ID = 'ChIJxZLAskitcm0RtVe_xgOAW3A';

/* Legal entity, from the Companies Office (company 7491516). Shown in the
   footer and the organisation markup; the registered street address stays off
   the site on purpose. */
const LEGAL_NAME = 'Stable Structure Limited';
const NZBN = '9429047474703';

/* Per-page lastmod discipline for sitemap.xml: every entry in `pages` carries a
   `lastmod` — update it ONLY when that page's content meaningfully changes.
   (2026-08-13 = the schema/font/perf sprint touched every page's head.) */
const SPRINT_DATE = '2026-08-13';
/* lastmod for pages whose content changed in the November 2026 SEO pass. */
const CONTENT_DATE = '2026-11-24';
const CONTENT_DISPLAY = 'Updated 24 November 2026';
/* Cache-buster for styles.css / main.js. Kept separate from SPRINT_DATE so a
   styling tweak does not also rewrite every page's sitemap <lastmod>. */
const ASSET_VERSION = '2026-11-24.3';

/* ---------- Icons (24x24) ---------- */
const I = {
  structural: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
  civil: '<path d="m2 20 6-14 4 9 3-5 7 10zM2 20h20"/>',
  consent: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  inspection: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  supervision: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  retaining: '<path d="M4 20h16M4 20V10l4-2 4 3 4-2 4 2v9M9 20v-4h4v4"/>',
  pool: '<path d="M2 12c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M2 17c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M5 8V5a2 2 0 0 1 2-2h2"/>',
  deck: '<path d="M3 10h18M5 10V6h14v4M6 10v10M18 10v10M6 20h12"/>',
  carport: '<path d="M3 21V11l9-6 9 6v10M3 21h18M9 21v-6h6v6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.85.55 2.81.68A2 2 0 0 1 22 16.92z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevr: '<path d="m9 6 6 6-6 6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  gem: '<path d="M9.5 2 3 9l9 13 9-13-6.5-7zM3 9h18M9.5 2 12 9l2.5-7M8 9l4 13 4-13"/>',
  burger: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  building: '<path d="M3 21h18M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M10 8h.01M14 8h.01M10 12h.01M14 12h.01M10 16h.01M14 16h.01"/>',
  factory: '<path d="m2 20 6-14 4 9 3-5 7 10zM2 20h20"/>',
  globe: '<path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m22 6-10 7L2 6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
};
const WHATSAPP = '<path fill="currentColor" d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.91-9.91a9.82 9.82 0 0 0-2.91-7.02zM12.04 20.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/>';
const STAR = '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>';
const FACEBOOK = '<path fill="currentColor" d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.79-3.91 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.9h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94z"/>';
const LINKEDIN = '<path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zm1.78 13.02H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/>';

const si = (name, sw = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;
const wa = () => `<svg viewBox="0 0 24 24" aria-hidden="true">${WHATSAPP}</svg>`;
const fb = () => `<svg viewBox="0 0 24 24" aria-hidden="true">${FACEBOOK}</svg>`;
const li = () => `<svg viewBox="0 0 24 24" aria-hidden="true">${LINKEDIN}</svg>`;
const star = () => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${STAR}</svg>`;
/* role="img" is required: aria-label is prohibited on a bare <div> (no implicit
   role), so screen readers ignored the rating. Flagged by Lighthouse 2026-08-20. */
const stars5 = () => `<div class="stars" role="img" aria-label="Rated 5 out of 5 stars">${star().repeat(5)}</div>`;

/* ---------- Services data ---------- */
const SERVICES = [
  { slug: 'structural-design', title: 'Structural Design', icon: 'structural', tags: ['New builds', 'Extensions', 'Alterations'],
    short: 'Robust, efficient structural systems for new builds, additions and alterations — foundations, framing, beams, bracing and load paths.',
    sub: 'Engineered structural systems that are safe, efficient and buildable — for homes, additions and commercial projects.',
    intro: ['Good structural design is invisible when it is done right — the building simply stands, performs and lasts. We design the bones of your project: the foundations, framing, beams, columns, bracing and connections that carry every load safely to the ground.',
      'Our focus is on practical, cost-effective solutions. We value-engineer each design so it is economical to build and easy for your builder to construct, without ever compromising on safety or compliance with the New Zealand Building Code.'],
    includes: ['Foundation and footing design', 'Timber, steel and concrete framing', 'Beams, lintels and columns', 'Bracing and lateral load design', 'Structural calculations and drawings', 'Producer Statements (PS1)'],
    ideal: ['New residential builds', 'Additions and alterations', 'Removing load-bearing walls', 'Commercial and multi-unit structures'] },
  { slug: 'civil-design', title: 'Civil Design', icon: 'civil', tags: ['Drainage', 'Earthworks', 'Stormwater'],
    short: 'Site development, earthworks, drainage, stormwater and access design that works with your land and satisfies council requirements.',
    sub: 'Civil engineering that makes your site work — earthworks, drainage, stormwater and access designed around your land.',
    intro: ['The ground your project sits on matters just as much as the structure above it. Our civil design services make sure your site drains properly, manages stormwater, and provides safe, compliant access — all while working with the natural fall and features of your land.',
      'We prepare clear civil documentation that satisfies council requirements and keeps your project moving through consent and construction.'],
    includes: ['Site and earthworks design', 'Stormwater and drainage design', 'Sediment and erosion control', 'Driveways and vehicle access', 'Land development support', 'Civil consent documentation'],
    ideal: ['Subdivisions and land development', 'Sloping or difficult sites', 'New builds needing drainage design', 'Meeting council civil requirements'] },
  { slug: 'building-consent-documentation', title: 'Building Consent Documentation', icon: 'consent', tags: ['PS1', 'Drawings', 'Calculations'],
    short: 'Detailed drawings, calculations and PS1 documentation prepared to give your consent application the best chance of a smooth approval.',
    sub: 'Complete, consent-ready documentation that gives your building consent application the best chance of a smooth approval.',
    intro: ['A building consent is only as strong as the documentation behind it. We prepare thorough, well-presented engineering drawings, calculations and Producer Statements so your application is complete, clear and easy for council to assess.',
      'Good documentation up front means fewer requests for information, fewer delays, and a faster path to approval — and we are here to respond to any council queries along the way.'],
    includes: ['Detailed structural drawings', 'Engineering calculations', 'Producer Statements (PS1)', 'Specifications and construction details', 'Council RFI responses', 'Coordination with your designer or architect'],
    ideal: ['Building consent applications', 'Design-and-build projects', 'Owners managing their own consent', 'Responding to council queries'] },
  { slug: 'site-inspections', title: 'Site Inspections', icon: 'inspection', tags: ['Stage checks', 'PS4', 'Reports'],
    short: 'On-site verification at key construction stages to confirm work is being built to the approved design and standards.',
    sub: 'Independent, on-site verification at key stages to confirm your build matches the approved design and standards.',
    intro: ['Building to the approved design is what keeps your project safe and compliant. We carry out site inspections at the critical construction stages — checking foundations, framing and structural elements before they are covered up.',
      'You receive clear written reports, and where required we can issue a Producer Statement (PS4) confirming the structural work has been completed in accordance with the design.'],
    includes: ['Foundation and footing inspections', 'Framing and structural checks', 'Stage-by-stage verification', 'Written inspection reports', 'Producer Statements (PS4)', 'Advice on remedial work if needed'],
    ideal: ['Confirming build quality', 'Meeting council inspection requirements', 'PS4 construction review', 'Peace of mind during your build'] },
  { slug: 'construction-supervision', title: 'Construction Supervision', icon: 'supervision', tags: ['Oversight', 'Quality', 'Support'],
    short: 'Ongoing engineering oversight from groundwork to hand-over, so issues are solved early and quality is maintained throughout.',
    sub: 'Hands-on engineering oversight from groundwork to hand-over, so issues are caught early and quality never slips.',
    intro: ['Complex builds benefit from an engineer who stays involved. Our construction supervision keeps expert eyes on your project throughout, coordinating with your builder, solving issues early and making sure the finished result matches the design intent.',
      'It is the difference between hoping a build goes well and knowing it is being managed with technical confidence from start to finish.'],
    includes: ['Ongoing engineering oversight', 'On-site problem solving', 'Coordination with builders and trades', 'Quality assurance at each stage', 'Completion documentation', 'A single point of engineering contact'],
    ideal: ['Complex or high-value builds', 'Owners who want oversight', 'Structurally challenging projects', 'End-to-end engineering support'] },
  { slug: 'retaining-walls', title: 'Retaining Walls', icon: 'retaining', tags: ['Timber', 'Block', 'Concrete'],
    short: 'Engineered timber, block and concrete retaining wall design that manages loads, drainage and slope safely and economically.',
    sub: 'Retaining wall design by chartered structural engineers in Botany, East Auckland: timber, block and concrete walls, driveway and boundary walls, drainage, PS1 and consent.',
    intro: ['A retaining wall does hard, invisible work — holding back soil, water and load for decades. We design retaining walls that are strong where it counts and economical where it can be, matched to your site conditions, slope and materials.',
      'From a low garden wall to a tall surcharged structure near a boundary or driveway, we handle the engineering and the consent documentation.'],
    includes: ['Timber pole and sleeper walls', 'Concrete block and masonry walls', 'Reinforced concrete walls', 'Drainage and subsoil design', 'Geotechnical coordination', 'Consent documentation'],
    ideal: ['Sloping sections', 'Terracing and landscaping', 'Walls over 1.5m or surcharged', 'Boundary and driveway retaining'] },
  { slug: 'swimming-pools', title: 'Swimming Pools', icon: 'pool', tags: ['In-ground', 'Surrounds', 'Fencing'],
    short: 'Structural design for in-ground and above-ground pools, pool surrounds and associated retaining and fencing compliance.',
    sub: 'Structural design for pools, surrounds and the retaining and fencing that keep them safe and compliant.',
    intro: ['A swimming pool is a significant structure, especially on a sloping or challenging site. We provide the structural design for in-ground pools, pool surrounds and decking, plus any associated retaining walls — all coordinated so the whole project works together.',
      'We also make sure pool fencing and barriers meet the required safety standards, giving you a compliant, worry-free result.'],
    includes: ['In-ground pool structural design', 'Pool surrounds and decking', 'Associated retaining walls', 'Pool fencing and barrier compliance', 'Consent documentation', 'Site-specific engineering'],
    ideal: ['New pool installations', 'Pools on sloping sites', 'Pool and retaining combinations', 'Consent for pool structures'] },
  { slug: 'decks-outdoor-living', title: 'Decks & Outdoor Living', icon: 'deck', tags: ['Decks', 'Pergolas', 'Cantilevers'],
    short: 'Safe, durable decks, pergolas and outdoor structures — including high or cantilevered decks that need proper engineering.',
    sub: 'Safe, durable decks and outdoor structures — including the high and cantilevered designs that need real engineering.',
    intro: ['Outdoor living adds enormous value to a home, but elevated and cantilevered decks carry serious loads and need proper engineering. We design deck subframes, posts, bracing and barriers that are safe underfoot and built to last in New Zealand conditions.',
      'Whether it is a simple raised deck, a dramatic cantilever or a pergola, we provide the design and consent documentation to do it right.'],
    includes: ['Deck framing and subframe design', 'High and cantilevered decks', 'Pergolas and shade structures', 'Balustrade and barrier design', 'Post and footing design', 'Consent documentation'],
    ideal: ['Elevated or high decks', 'Decks over 1.5m off the ground', 'Cantilevered and complex decks', 'Outdoor living areas'] },
  { slug: 'carports-sheds-portals', title: 'Carports, Sheds & Portals', icon: 'carport', tags: ['Carports', 'Sheds', 'Portal frames'],
    short: 'Portal-frame and light-structure design for carports, sheds and outbuildings — practical spans built to last.',
    sub: 'Portal-frame and light-structure design for carports, sheds and outbuildings — practical clear spans, built to last.',
    intro: ['Carports, sheds and outbuildings look simple, but getting the spans, portals and connections right is what keeps them standing through wind and weather. We design efficient portal-frame and light structures that give you the clear space you need at a sensible cost.',
      'From a single carport to a large rural shed, we provide the structural design and the documentation your consent requires.'],
    includes: ['Portal-frame design', 'Carports and canopies', 'Sheds and outbuildings', 'Farm and rural structures', 'Large clear-span structures', 'Consent documentation'],
    ideal: ['Carports and car canopies', 'Storage and workshop sheds', 'Rural and lifestyle blocks', 'Large clear-span structures'] },
];
const svcPath = (s) => `services/${s.slug}.html`;

/* ---------- Our Projects data ----------
   The gallery merges the hand-authored projects with the ones synced from
   Facebook (see build/README.md). Newest first, deduped by id. A missing or
   malformed data file degrades to an empty gallery rather than breaking the
   build, so a bad sync can never take the site down. */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function loadProjects() {
  const read = (file) => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`  ! ${file}: ${err.message} — ignored`);
      return [];
    }
  };
  const seen = new Set();
  return [...read('projects.manual.json'), ...read('projects.facebook.json')]
    .filter((p) => p && p.id && Array.isArray(p.images) && p.images.length)
    .filter((p) => (seen.has(p.id) ? false : seen.add(p.id)))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

const projectDate = (d) => {
  const t = Date.parse(d);
  return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });
};

/* ---------- Structured data (JSON-LD @graph per page) ----------
   One Organization node shared by @id across the site; WebSite on the homepage
   only; BreadcrumbList mirroring the visible breadcrumb; Service on service
   pages. Deliberately NO aggregateRating (self-serving review markup violates
   Google's structured-data policy) and NO FAQPage (rich results retired).
   NOTE: address stays at suburb level and there is no `geo` — street address and
   coordinates must come from Gajan/GBP, never guessed. */
const ORG_ID = `${SITE_URL}#organization`;
const PERSON_ID = `${SITE_URL}#gajanthan`;
const AREA_SERVED = [
  { '@type': 'City', name: 'Auckland' },
  { '@type': 'Place', name: 'Botany, Auckland' },
  { '@type': 'Place', name: 'Howick, Auckland' },
  { '@type': 'Place', name: 'Pakuranga, Auckland' },
  { '@type': 'Place', name: 'Flat Bush, Auckland' },
  { '@type': 'Country', name: 'New Zealand' },
];

const SERVICE_TYPE = {
  'structural-design': 'Structural Engineering Design',
  'civil-design': 'Civil Engineering Design',
  'building-consent-documentation': 'PS1 Producer Statement Preparation',
  'site-inspections': 'Structural Site Inspection (PS4)',
  'construction-supervision': 'Construction Supervision (Engineering)',
  'retaining-walls': 'Retaining Wall Structural Design',
  'swimming-pools': 'Swimming Pool Structural Design',
  'decks-outdoor-living': 'Deck & Outdoor Structure Design',
  'carports-sheds-portals': 'Portal Frame & Shed Structural Design',
};

function orgNode() {
  return {
    '@type': 'ProfessionalService',
    '@id': ORG_ID,
    name: 'Stable Structure Limited',
    url: SITE_URL,
    logo: `${SITE_URL}assets/logo.png`,
    image: `${SITE_URL}assets/og-image.jpg`,
    legalName: LEGAL_NAME,
    identifier: { '@type': 'PropertyValue', propertyID: 'NZBN', value: NZBN },
    description: 'Structural and civil engineering consultancy in Botany, Auckland, serving all of New Zealand.',
    telephone: PHONE_TEL,
    email: EMAIL,
    address: { '@type': 'PostalAddress', addressLocality: 'Botany', addressRegion: 'Auckland', postalCode: '2010', addressCountry: 'NZ' },
    areaServed: AREA_SERVED,
    hasMap: GOOGLE_REVIEWS_URL,
    contactPoint: { '@type': 'ContactPoint', telephone: PHONE_TEL, email: EMAIL, contactType: 'customer service', areaServed: 'NZ', availableLanguage: 'English' },
    knowsAbout: ['Structural engineering', 'Civil engineering', 'Producer statements (PS1 and PS4)', 'Building consent documentation', 'Retaining wall design', 'Construction monitoring'],
    sameAs: [LINKEDIN_URL, FACEBOOK_URL],
    founder: { '@id': PERSON_ID },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '08:30', closes: '17:00',
    }],
    slogan: 'Strong solutions for your vision',
  };
}

/* The director, referenced by @id from the organisation, articles and bylines. */
function personNode() {
  return {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: OWNER,
    jobTitle: 'Director',
    url: `${SITE_URL}about.html`,
    image: `${SITE_URL}assets/team/gajanthan.jpg`,
    worksFor: { '@id': ORG_ID },
    hasCredential: [
      { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Chartered Professional Engineer (CPEng), Engineering New Zealand', identifier: '1030007', url: 'https://members.engineeringnz.org/s/cpeng-register' },
      { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Chartered Engineer (CEng), United Kingdom' },
      { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Member of the Institution of Structural Engineers (MIStructE)' },
    ],
  };
}

/* Breadcrumb trail derived from the output path so it always mirrors the
   visible breadcrumb labels (2-level for top pages, 3-level for services and
   guides). Returns null for the homepage and 404. */
const TOP_LABELS = {
  'services.html': 'Services', 'sectors.html': 'Sectors', 'projects.html': 'Our Projects',
  'about.html': 'About', 'process.html': 'Process', 'testimonials.html': 'Reviews',
  'faq.html': 'FAQ', 'contact.html': 'Contact', 'privacy.html': 'Privacy Policy',
  'granny-flats.html': 'Granny Flats', 'guides.html': 'Guides',
  'builders-architects.html': 'For Builders & Architects',
};
function crumbTrail(file, pageTitle) {
  if (!file || file === 'index.html' || file === '404.html') return null;
  const home = { label: 'Home', url: SITE_URL };
  if (file.startsWith('services/')) {
    return [home, { label: 'Services', url: `${SITE_URL}services.html` }, { label: pageTitle, url: SITE_URL + file }];
  }
  if (file.startsWith('guides/')) {
    // Points at the real guides hub — it previously claimed a page called
    // "Guides" lived at services.html, which is a factual error in the graph.
    return [home, { label: 'Guides', url: `${SITE_URL}guides.html` }, { label: pageTitle, url: SITE_URL + file }];
  }
  if (!TOP_LABELS[file]) return null;
  return [home, { label: TOP_LABELS[file], url: SITE_URL + file }];
}

function breadcrumbNode(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.label, item: c.url,
    })),
  };
}

function ldFor(o, file, pageUrl) {
  const graph = [orgNode(), personNode()];
  if (file === 'index.html') {
    graph.push({ '@type': 'WebSite', '@id': `${SITE_URL}#website`, url: SITE_URL, name: 'Stable Structure Limited', publisher: { '@id': ORG_ID } });
  }
  const trail = o.noindex ? null : crumbTrail(file, o.serviceName || o.pageLabel || '');
  if (trail) graph.push(breadcrumbNode(trail));
  if (o.extraLd) graph.push(...o.extraLd);
  if (o.serviceType) {
    graph.push({
      '@type': 'Service',
      '@id': `${pageUrl}#service`,
      name: o.serviceName || o.title,
      serviceType: o.serviceType,
      provider: { '@id': ORG_ID },
      areaServed: AREA_SERVED,
      url: pageUrl,
      mainEntityOfPage: pageUrl,
      description: o.desc,
    });
  }
  if (o.article) {
    graph.push({
      '@type': 'Article',
      '@id': `${pageUrl}#article`,
      headline: o.article.headline,
      description: o.desc,
      author: { '@id': PERSON_ID },
      publisher: { '@id': ORG_ID },
      datePublished: o.article.published,
      dateModified: o.article.modified,
      mainEntityOfPage: pageUrl,
      image: `${SITE_URL}${o.ogImage || 'assets/og-image.jpg'}`,
      inLanguage: 'en-NZ',
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

/* ---------- Shared building blocks ---------- */
function head(o, base, file) {
  // Absolute URL for this page, derived from its output path (file).
  // The homepage resolves to the bare domain, not /index.html — that is the URL
  // visitors land on and what sitemap.xml declares, so the canonical must match
  // or Google sees two competing URLs for the same page.
  const pageUrl = SITE_URL + (file === 'index.html' ? '' : (file || ''));
  // Error pages (404) opt out of canonical/indexing via headO.noindex.
  const canonical = o.noindex ? '' : `<link rel="canonical" href="${pageUrl}" />\n`;
  const robots = o.noindex ? `<meta name="robots" content="noindex" />\n` : '';
  return `<!doctype html>
<html lang="en-NZ">
<head>
<script>document.documentElement.className='js';</script>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${o.title}</title>
<meta name="description" content="${o.desc}" />
<meta name="theme-color" content="#0C1E33" />
${canonical}${robots}<meta property="og:title" content="${o.title}" />
<meta property="og:description" content="${o.desc}" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="en_NZ" />
<meta property="og:site_name" content="Stable Structure Limited" />
<meta property="og:image" content="${SITE_URL}${o.ogImage || 'assets/og-image.jpg'}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preload" href="${base}assets/fonts/space-grotesk-var-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="${base}assets/fonts/inter-var-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="icon" href="${base}favicon.ico" sizes="any" />
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="${base}assets/favicon-48.png" sizes="48x48" type="image/png" />
<link rel="apple-touch-icon" href="${base}assets/apple-touch-icon.png" />
<link rel="stylesheet" href="${base}styles.css?v=${ASSET_VERSION}" />
${o.noindex ? '' : `<script type="application/ld+json">
${ldFor(o, file, pageUrl)}
</script>
`}</head>
<body>`;
}

/* Brand links to the site root (works at any depth on Vercel); the logo is a
   9KB 3x-density WebP (was a 207KB PNG) with explicit dimensions to avoid CLS. */
const brand = (base, footer) => `<a class="brand" href="${BASE_PATH}" aria-label="Stable Structure Limited home">
  <img class="logo" src="${base}assets/logo.webp" srcset="${base}assets/logo-208.webp 208w, ${base}assets/logo.webp 303w" sizes="104px" width="303" height="186" alt="Stable Structure Limited — Structural & Civil Engineering" />
</a>`;

const NAV = [
  /* Home points at the site root, not index.html — vercel.json permanently
     redirects /index.html to /, so linking the latter made the most-clicked
     link on every page pay a needless 308 hop. */
  { key: 'home', label: 'Home', href: '', root: true },
  { key: 'services', label: 'Services', href: 'services.html', dd: true },
  { key: 'sectors', label: 'Sectors', href: 'sectors.html' },
  { key: 'projects', label: 'Projects', href: 'projects.html' },
  { key: 'granny', label: 'Granny Flats', href: 'granny-flats.html' },
  { key: 'about', label: 'About', href: 'about.html' },
  { key: 'process', label: 'Process', href: 'process.html' },
  { key: 'reviews', label: 'Reviews', href: 'testimonials.html' },
  { key: 'guides', label: 'Guides', href: 'guides.html' },
  { key: 'faq', label: 'FAQ', href: 'faq.html' },
  { key: 'contact', label: 'Contact', href: 'contact.html' },
];

function ddPanel(base) {
  const items = SERVICES.map(s => `<a class="dd-item" href="${base}${svcPath(s)}">
        <span class="di">${si(s.icon)}</span>
        <span><b>${s.title}</b><span>${s.tags.join(' · ')}</span></span>
      </a>`).join('\n      ');
  return `<div class="dd-panel" id="ddPanel" role="menu" aria-label="Services">
      <div class="dd-grid">
      ${items}
      </div>
      <div class="dd-foot">
        <span>Not sure what you need? We will point you the right way.</span>
        <a class="btn btn-primary" href="${base}services.html">All services ${si('arrow', 2.2)}</a>
      </div>
    </div>`;
}

function header(base, active) {
  const links = NAV.map(n => {
    const cls = 'nl' + (active === n.key ? ' active' : '');
    if (n.dd) {
      return `<div class="has-dd">
        <button class="dd-toggle nl${active === n.key ? ' active' : ''}" id="ddToggle" aria-haspopup="true" aria-expanded="false" aria-controls="ddPanel">Services <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I.caret}</svg></button>
        ${ddPanel(base)}
      </div>`;
    }
    // root links resolve to the site root (BASE_PATH), never to /index.html
    return `<a class="${cls}" href="${n.root ? BASE_PATH : base + n.href}">${n.label}</a>`;
  }).join('\n      ');

  const mobileServices = SERVICES.map(s => `<a href="${base}${svcPath(s)}">${s.title}</a>`).join('\n          ');

  return `<header class="site" id="top">
  <div class="container nav">
    ${brand(base)}
    <nav class="nav-links" aria-label="Primary">
      ${links}
    </nav>
    <div class="nav-cta">
      <a class="staff-login" href="/portal/login" rel="nofollow">Staff login</a>
      <a class="btn btn-primary" href="${base}contact.html">Get a Free Quote</a>
    </div>
    <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu">${si('burger', 2)}</button>
  </div>
</header>

<div class="mobile-menu" id="mobileMenu">
  <a class="m-link" href="${BASE_PATH}">Home</a>
  <details class="m-acc">
    <summary>Services <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I.caret}</svg></summary>
    <div class="m-sub">
      <a href="${base}services.html"><strong>All services</strong></a>
          ${mobileServices}
    </div>
  </details>
  <a class="m-link" href="${base}sectors.html">Sectors</a>
  <a class="m-link" href="${base}projects.html">Our Projects</a>
  <a class="m-link" href="${base}granny-flats.html">Granny Flats</a>
  <a class="m-link" href="${base}about.html">About</a>
  <a class="m-link" href="${base}process.html">Process</a>
  <a class="m-link" href="${base}testimonials.html">Reviews</a>
  <a class="m-link" href="${base}guides.html">Guides</a>
  <a class="m-link" href="${base}faq.html">FAQ</a>
  <a class="m-link" href="${base}contact.html">Contact</a>
  <a class="m-link m-staff" href="/portal/login" rel="nofollow">Staff login</a>
  <div class="m-cta">
    <a class="btn btn-primary btn-lg" href="${base}contact.html">Get a Free Quote</a>
    <a class="btn btn-wa btn-lg" href="${waHref()}" target="_blank" rel="noopener">${wa()} WhatsApp us</a>
    <a class="btn btn-ghost btn-lg" href="tel:${PHONE_TEL}">Call ${PHONE_DISPLAY}</a>
  </div>
</div>`;
}

function footer(base) {
  const someServices = SERVICES.slice(0, 5).map(s => `<a href="${base}${svcPath(s)}">${s.title}</a>`).join('\n        ');
  return `<footer class="site">
  <div class="container">
    <div class="foot-grid">
      <div>
        ${brand(base, true)}
        <p class="foot-about">Kiwi-owned structural and civil engineering consultancy in Botany, Auckland — delivering practical, compliant engineering from concept to completion, right across New Zealand.</p>
      </div>
      <div class="foot-col">
        <h2 class="fh">Services</h2>
        ${someServices}
        <a href="${base}services.html">View all services →</a>
      </div>
      <div class="foot-col">
        <h2 class="fh">Company</h2>
        <a href="${base}sectors.html">Sectors</a>
        <a href="${base}projects.html">Our projects</a>
        <a href="${base}granny-flats.html">Granny flats &amp; 3D models</a>
        <a href="${base}about.html">About us</a>
        <a href="${base}process.html">Our process</a>
        <a href="${base}testimonials.html">Reviews</a>
        <a href="${base}guides.html">Engineering guides</a>
        <a href="${base}builders-architects.html">For builders &amp; architects</a>
        <a href="${base}faq.html">FAQ</a>
        <a href="${base}contact.html">Contact</a>
      </div>
    </div>
    <div class="foot-grid" style="border-bottom:none;padding-bottom:0;grid-template-columns:1fr">
      <div class="foot-col">
        <h2 class="fh">Get in touch</h2>
        <a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a>
        <a href="mailto:${EMAIL}">${EMAIL}</a>
        <a href="${waHref()}" target="_blank" rel="noopener">WhatsApp us</a>
        <span class="fi">Botany, Auckland — serving Howick, Pakuranga, Flat Bush, East Auckland &amp; all of NZ</span>
        <span class="fi">Mon–Fri, 8:30am–5:00pm</span>
        <div class="foot-social">
          <a href="${LINKEDIN_URL}" target="_blank" rel="noopener" aria-label="Stable Structure on LinkedIn">${li()}</a>
          <a href="${FACEBOOK_URL}" target="_blank" rel="noopener" aria-label="Stable Structure on Facebook">${fb()}</a>
        </div>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© <span id="year">2026</span> ${LEGAL_NAME} · NZBN ${NZBN}. All rights reserved.</span>
      <span><a href="${base}privacy.html">Privacy Policy</a> · <a href="/portal/login" rel="nofollow">Staff login</a> · Structural &amp; Civil Engineering · Auckland, New Zealand</span>
    </div>
  </div>
</footer>`;
}

function callbar(base) {
  return `<div class="callbar" role="complementary" aria-label="Quick contact">
  <a class="btn btn-primary cb-call" href="tel:${PHONE_TEL}">${si('phone', 2)} Call ${PHONE_DISPLAY}</a>
  <a class="btn btn-wa" href="${waHref()}" target="_blank" rel="noopener" aria-label="Message us on WhatsApp">${wa()} WhatsApp</a>
</div>`;
}

function ctaBand(base, opts) {
  opts = opts || {};
  const title = opts.title || 'Ready to build with confidence?';
  const text = opts.text || 'Tell us about your project and we will get back to you with practical engineering advice and a free, no-obligation quote.';
  const waMsg = opts.waMsg || WA_DEFAULT;
  return `<section class="pad-sm cta-wrap"><div class="container">
    <div class="cta-band border-glow-card reveal">
      <span class="edge-light"></span>
      <div class="border-glow-inner">
        <div class="grid-bg"></div>
        <span class="eyebrow on-dark">Let's talk</span>
        <h2>${title}</h2>
        <p>${text}</p>
        <div class="cta-actions">
          <a class="btn btn-primary btn-lg" href="${base}contact.html">Request a Free Quote ${si('arrow', 2.2)}</a>
          <a class="btn btn-wa btn-lg" href="${waHref(waMsg)}" target="_blank" rel="noopener">${wa()} WhatsApp us</a>
        </div>
      </div>
    </div>
  </div></section>`;
}

/* ?v= busts the long-lived immutable cache (vercel.json) whenever these change:
   bump ASSET_VERSION on any styles.css / main.js edit. */
const scripts = (base, extra) => `${extra ? extra + '\n' : ''}<script src="${base}main.js?v=${ASSET_VERSION}"></script>\n</body>\n</html>`;

function pageHero(base, o) {
  const crumbs = (o.crumbs || []).map((c, i, arr) => {
    const last = i === arr.length - 1;
    const href = c.href === 'index.html' ? BASE_PATH : base + c.href;
    const link = last ? `<span>${c.label}</span>` : `<a href="${href}">${c.label}</a>`;
    return link + (last ? '' : ` <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I.chevr}</svg> `);
  }).join('');
  const cta = o.cta === false ? '' : `<div class="ph-cta">
        <a class="btn btn-primary btn-lg" href="${base}contact.html">Request a Free Quote ${si('arrow', 2.2)}</a>
        <a class="btn btn-wa btn-lg" href="${waHref(o.waMsg)}" target="_blank" rel="noopener">${wa()} WhatsApp us</a>
      </div>`;
  return `<section class="page-hero">
    <div class="container">
      ${o.crumbs ? `<nav class="breadcrumb" aria-label="Breadcrumb">${crumbs}</nav>` : ''}
      <span class="eyebrow on-dark">${o.eyebrow}</span>
      <h1>${o.title}</h1>
      ${o.sub ? `<p class="sub">${o.sub}</p>` : ''}
      ${cta}
    </div>
  </section>`;
}

/* Services grid (used on home + services page) */
function servicesGrid(base) {
  return `<div class="grid-services">
      ${SERVICES.map(s => `<a class="svc reveal" href="${base}${svcPath(s)}">
        <div class="ic">${si(s.icon)}</div>
        <h3>${s.title}</h3>
        <p>${s.short}</p>
        <div class="spacer"></div>
        <div class="tags">${s.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        <span class="more">Learn more ${si('arrow', 2.2)}</span>
      </a>`).join('\n      ')}
    </div>`;
}

/* Sectors block */
function sectorsBlock(base) {
  const art = {
    res: `<svg class="bgart" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="400" fill="#16324e"/><g stroke="#537FAC" stroke-width="2" opacity=".85"><path d="M40 340 L200 120 L360 340" fill="none"/><path d="M40 340 H360"/><path d="M90 340 V240 H150 V340 M250 340 V240 H310 V340"/><path d="M180 340 V270 H220 V340"/></g><g fill="#1DA9E3" opacity=".9"><circle cx="200" cy="120" r="4"/></g></svg>`,
    com: `<svg class="bgart" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="400" fill="#123049"/><g stroke="#537FAC" stroke-width="2" opacity=".85"><rect x="90" y="90" width="90" height="250"/><rect x="210" y="140" width="110" height="200"/><path d="M105 120h20M145 120h20M105 160h20M145 160h20M105 200h20M145 200h20M230 170h25M285 170h25M230 220h25M285 220h25"/></g><g fill="#1DA9E3" opacity=".9"><rect x="90" y="86" width="90" height="6"/></g></svg>`,
    ind: `<svg class="bgart" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="400" fill="#0f2c44"/><g stroke="#537FAC" stroke-width="2" opacity=".85"><path d="M40 320 H360 M70 320 V180 L200 120 L330 180 V320"/><path d="M110 180 V320 M290 180 V320 M200 130 V320"/><path d="M70 210 H330 M70 260 H330"/></g><g fill="#1DA9E3" opacity=".9"><circle cx="200" cy="120" r="4"/></g></svg>`,
  };
  return `<div class="sectors">
      <article class="sector reveal">${art.res}<div><span class="k">Residential</span><h3>Homes &amp; renovations</h3><p>New builds, extensions, decks, retaining walls, pools and additions — designed to protect your investment and pass consent.</p></div></article>
      <article class="sector reveal">${art.com}<div><span class="k">Commercial</span><h3>Commercial &amp; retail</h3><p>Fit-outs, mixed-use and commercial buildings engineered for developers and investors — efficient, buildable and code-compliant.</p></div></article>
      <article class="sector reveal">${art.ind}<div><span class="k">Industrial</span><h3>Industrial &amp; warehousing</h3><p>Portal frames, warehouses, sheds and industrial structures with the load capacity and durability your operation demands.</p></div></article>
    </div>`;
}

/* ---------- Google reviews (real — from Google Business Profile) ----------
   Once GOOGLE_PLACE_ID is set (top of file) the CTAs switch to the direct
   write-review and listing URLs; until then they fall back to a Maps search.
   NOTE: the director's own rating is deliberately NOT displayed — showing it
   as social proof is misleading, and its removal from the Google listing is
   being handled separately. Do not re-add it. */
const GOOGLE_REVIEWS_URL = GOOGLE_PLACE_ID
  ? `https://www.google.com/maps/place/?q=place_id:${GOOGLE_PLACE_ID}`
  : 'https://www.google.com/maps/search/?api=1&query=Stable+Structure+Botany+Downs+Auckland';
const GOOGLE_WRITE_URL = GOOGLE_PLACE_ID
  ? `https://search.google.com/local/writereview?placeid=${GOOGLE_PLACE_ID}`
  : GOOGLE_REVIEWS_URL;
const REVIEWS = {
  rating: '5.0',
  checked: 'October 2026', // when the rating and reviews were last copied from Google
  featured: {
    initial: 'H', name: 'Haran / Kash', meta: 'A-Frame Builders Ltd', when: 'August 2026',
    paras: [
      'We have worked with Gajanthan Vethanathan and Stable Structure on multiple residential development projects, and the level of service has been exceptional every time.',
      'Gajanthan is an outstanding Structural and Civil Engineer with exceptional technical knowledge, professionalism, and attention to detail. He is always responsive, provides practical engineering solutions, and works closely with the entire project team to ensure everything runs smoothly. His advice has been invaluable throughout our developments, from the design stage through to construction.',
      'As the engineering partner for A-Frame Builders, Gajanthan has consistently delivered high-quality work, met tight deadlines, and gone above and beyond to support our projects. His commitment, integrity, and problem-solving skills give us complete confidence on every job.',
    ],
  },
  /* Written Google reviews, verbatim. */
  written: [
    { initial: 'P', name: 'Prutvi Kumar', meta: '', when: 'August 2026',
      text: 'Gajan and team are very efficient the designs are very thorough. They provide the details which are clear and easy to understand. They respond to site clarifications and council queries efficiently and resolve issues. I highly recommend them.' },
    { initial: 'A', name: 'Aleki Bon', meta: 'Local Guide', when: 'August 2026',
      text: 'The team at Stable Structure as &lsquo;solid&rsquo; to deal with. They are efficient and have superior knowledge in their field. We send lot of work their way as they get the jobs done fast and at a fair price point.' },
    { initial: 'J', name: 'Jedd Forbes', meta: '', when: 'August 2026',
      text: 'Gajan is a pleasure to work with. Professional, calm and considered. Looking forward to the next project.' },
    { initial: 'S', name: 'Sonia Singh', meta: 'Proconcept Design Ltd', when: 'June 2026',
      text: 'Gajan &amp; Team are very Professional, reliable, and incredibly thorough. Highly recommend their structural engineering services.' },
  ],
  others: [
    { initial: 'A', name: 'Ananayan', when: 'January 2026' },
    { initial: 'N', name: 'Niranjan Tharma', when: '2024' },
    { initial: 'A', name: 'arunthamil 2004', when: '2022' },
  ],
};
const googleGlyph = () => `<svg class="gg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.6-2-6.5-4.8H1.7v3A11.9 11.9 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.5 14.6a7.1 7.1 0 0 1 0-4.6v-3H1.7a12 12 0 0 0 0 10.6z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.7 11.7 0 0 0 12 0 11.9 11.9 0 0 0 1.7 6l3.8 3c.9-2.8 3.5-4.8 6.5-4.8z"/></svg>`;

function reviewsSummary() {
  return `<div class="reviews-summary reveal">
      <div class="rs-score">
        <div class="rs-num">${REVIEWS.rating}</div>
        <div>${stars5()}<span class="rs-meta">${googleGlyph()} Google rating, checked ${REVIEWS.checked}</span></div>
      </div>
      <div class="rs-actions">
        <a class="btn btn-primary" href="${GOOGLE_REVIEWS_URL}" target="_blank" rel="noopener">Read our Google reviews ${si('arrow', 2.2)}</a>
        <a class="btn btn-ghost" href="${GOOGLE_WRITE_URL}" target="_blank" rel="noopener">Write a review</a>
      </div>
    </div>`;
}
function featuredReview() {
  const f = REVIEWS.featured;
  return `<figure class="tcard featured-review reveal">
      <div class="fr-top">${stars5()}<span class="via">${googleGlyph()} Google review</span></div>
      <blockquote>${f.paras.map((t, i) => `<p>${i === 0 ? '“' : ''}${t}${i === f.paras.length - 1 ? '”' : ''}</p>`).join('')}</blockquote>
      <figcaption class="who"><div class="av">${f.initial}</div><div><b>${f.name}</b><span>${f.meta} · ${f.when} · via Google</span></div></figcaption>
    </figure>`;
}
function writtenReviews(n = REVIEWS.written.length) {
  return `<div class="rev-grid${n % 3 === 0 ? ' three' : ''}">
      ${REVIEWS.written.slice(0, n).map(r => `<figure class="tcard reveal">
        <div class="stars sm" role="img" aria-label="Rated 5 out of 5 stars">${star().repeat(5)}</div>
        <blockquote>“${r.text}”</blockquote>
        <figcaption class="who"><div class="av">${r.initial}</div><div><b>${r.name}</b><span>${r.meta ? r.meta + ' · ' : ''}${r.when} · via Google</span></div></figcaption>
      </figure>`).join('\n      ')}
    </div>`;
}
function otherReviews() {
  return `<div class="rev-mini-grid">
      ${REVIEWS.others.map(r => `<div class="rev-mini reveal"><div class="av">${r.initial}</div><div class="rm-body"><b>${r.name}</b><div class="stars sm" role="img" aria-label="Rated 5 out of 5 stars">${star().repeat(5)}</div><span>${r.when} · via Google</span></div></div>`).join('\n      ')}
    </div>`;
}

/* FAQ */
const FAQS = [
  ['Do you provide PS1 documentation for building consent?', 'Yes. We prepare detailed structural and civil drawings, calculations and Producer Statements (PS1) so your building consent application is complete and consent-ready.'],
  ['Which areas of New Zealand do you cover?', 'We are based in Botany, Auckland and provide structural and civil engineering services for residential, commercial and industrial projects throughout New Zealand.'],
  ['Do I need a structural engineer for a deck or retaining wall?', 'Often, yes. A retaining wall needs engineering design and building consent once it retains more than 1.5 metres of ground, or at any height if it carries a surcharge such as a driveway, building or sloping ground above it. Decks generally need engineering once they are more than 1.5 metres off the ground, or where they are cantilevered. Our <a href="guides/retaining-wall-consent-nz.html">guide to retaining wall consent</a> covers the rules in full, and our <a href="services/retaining-walls.html">retaining wall engineering</a> page explains how we design them. If you are unsure, give us a call and we will tell you straight.'],
  ['How much does structural engineering cost?', 'It depends on what sits behind the job: a single beam, deck or standard retaining wall is a much smaller piece of work than full structural design for a new build. The cost drivers are the number of engineered elements, the ground, how complete your drawings are, and whether a geotechnical report is needed. We quote every job as a <b>fixed fee in writing before we start</b>, usually within one business day of receiving your plans, so the number never moves mid-project.'],
  ['How long does engineering take?', 'For straightforward residential elements, allow <b>one to two weeks</b> from receiving your plans to consent-ready drawings, calculations and PS1. Full new-build packages typically take <b>three to six weeks</b>. Once lodged, council has 20 working days to process a building consent; our guide to <a href="guides/building-consent-timeframes-auckland.html">consent timeframes and RFIs</a> explains what pauses that clock.'],
  ['How soon can you start?', 'We confirm availability and a fixed quote, usually within one business day of receiving your plans. Bringing us in while your drawings are still being finished is the easiest way to keep engineering off your critical path.'],
  ['Can you work from my architect or designer’s plans?', 'Absolutely. Most of our work comes that way: architects, designers and draughtspeople send their plans and we provide the structural engineering and PS1 behind them. See <a href="builders-architects.html">working with builders and architects</a> for how we fit into your team.'],
  ['Do I need an engineer to remove a wall?', 'If the wall is load-bearing or part of the house’s bracing, yes, and the work needs building consent. Our guide on <a href="guides/removing-load-bearing-wall-nz.html">removing a load-bearing wall</a> explains how to tell, what the engineer designs and what it involves.'],
  ['Who signs your producer statements?', 'Every PS1 and PS4 we issue is signed by our director, Gajanthan Vethanathan, a Chartered Professional Engineer (CPEng #1030007) you can check on Engineering New Zealand’s public register.'],
];
function faqBlock(list) {
  return `<div class="faq">
      ${list.map((f, i) => `<details class="reveal"${i === 0 ? ' open' : ''}>
        <summary><h3 class="faq-q">${f[0]}</h3><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">${I.plus}</svg></summary>
        <div class="ans">${f[1]}</div>
      </details>`).join('\n      ')}
    </div>`;
}

/* Enquiry form + contact info (contact page) */
function contactBlock(base) {
  const opts = SERVICES.map(s => `<option>${s.title}</option>`).join('\n          ');
  return `<div class="container contact-grid">
    <div class="contact-info reveal">
      <span class="eyebrow">Get in touch</span>
      <h2 class="section-title">Reach us your way</h2>
      <p class="lead">Tell us what you are planning and we will get back to you with practical engineering advice and a free, no-obligation quote.</p>
      <div class="infolist">
        <div class="infoitem"><div class="ii">${si('phone', 2)}</div><div><b>Call us</b><a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a></div></div>
        <div class="infoitem"><div class="ii wa">${wa()}</div><div><b>WhatsApp</b><a href="${waHref()}" target="_blank" rel="noopener">Message ${PHONE_DISPLAY}</a></div></div>
        <div class="infoitem"><div class="ii">${si('mail', 2)}</div><div><b>Email</b><a href="mailto:${EMAIL}">${EMAIL}</a></div></div>
        <div class="infoitem"><div class="ii">${si('pin', 2)}</div><div><b>Location</b><span>Botany, Auckland — serving all of New Zealand</span></div></div>
        <div class="infoitem"><div class="ii">${si('clock', 2)}</div><div><b>Office hours</b><span>Monday – Friday, 8:30am – 5:00pm · site visits by appointment</span></div></div>
      </div>
      <div class="map-embed reveal">
        <iframe src="https://maps.google.com/maps?q=Stable%20Structure%20Limited%2C%20Botany%2C%20Auckland&z=13&output=embed" loading="lazy" title="Map showing Stable Structure Limited in Botany, Auckland" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
      </div>
      <p class="areas"><b>Areas we serve:</b> Botany, Howick, Pakuranga, Flat Bush and wider East Auckland — with structural and civil engineering delivered nationwide across New Zealand.</p>
      <div class="callout">
        <div style="flex:1;min-width:180px"><b>Prefer to talk it through?</b><p>Call or WhatsApp for a quick, no-pressure chat about your build.</p></div>
        <a class="btn btn-wa" href="${waHref()}" target="_blank" rel="noopener">${wa()} WhatsApp</a>
      </div>
    </div>

    <!-- Enquiry form. Posts to /api/enquiry (app/api/enquiry/route.ts), which
         emails it to ${EMAIL} with Reply-To set to the visitor. -->
    <form class="enquiry reveal" id="enquiryForm" action="/api/enquiry" method="post" novalidate>
      <h3>Make an enquiry</h3>
      <p class="fsub">Your enquiry goes straight to ${OWNER}. We usually reply within one business day.</p>
      <div class="field two">
        <div class="field"><label for="name">Full name <span class="req">*</span></label><input id="name" name="name" type="text" autocomplete="name" required placeholder="Jane Smith" /></div>
        <div class="field"><label for="phone">Phone <span class="req">*</span></label><input id="phone" name="phone" type="tel" autocomplete="tel" required placeholder="021 000 0000" /></div>
      </div>
      <div class="field"><label for="email">Email <span class="req">*</span></label><input id="email" name="email" type="email" autocomplete="email" required placeholder="you@email.co.nz" /></div>
      <div class="field"><label for="role">I am a…</label>
        <select id="role" name="role"><option value="">Select…</option>
          <option>Homeowner</option>
          <option>Builder</option>
          <option>Architect or designer</option>
          <option>Developer</option>
          <option>Other</option>
        </select>
      </div>
      <div class="field"><label for="service">What do you need help with?</label>
        <select id="service" name="service"><option value="">Select a service…</option>
          ${opts}
          <option>Something else</option>
        </select>
      </div>
      <div class="field"><label for="message">Project details</label>
        <textarea id="message" name="message" placeholder="Tell us about your project, location and timeframe…"></textarea>
        <p class="hint">Adding your suburb and a rough timeframe helps us reply with a useful quote. Have plans or photos? Email them to <a href="mailto:${EMAIL}">${EMAIL}</a> or send them on <a href="${waHref()}" target="_blank" rel="noopener">WhatsApp</a>.</p>
      </div>
      <div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off" /></div>
      <button type="submit" class="btn btn-primary btn-lg">Send enquiry ${si('arrow', 2.2)}</button>
      <div class="form-status" id="formStatus" role="status" aria-live="polite"></div>
      <p class="form-note">By sending this enquiry you agree to be contacted about your project. We never share your details.</p>
    </form>
  </div>`;
}

/* ---------- Page assembly ---------- */
const skipLink = () => `<a class="skip-link" href="#main">Skip to main content</a>`;

function layout({ base, active, headO, body, file, extraScripts }) {
  return [
    head(headO, base, file),
    skipLink(),
    header(base, active),
    `<main id="main">`,
    body,
    `</main>`,
    callbar(base),
    footer(base),
    scripts(base, extraScripts),
  ].join('\n');
}

/* Home hero (with structural visual) */
function homeHero(base) {
  return `<section class="hero">
  <div class="container hero-grid">
    <div>
      <span class="hero-badge"><span class="dot"></span>Kiwi-owned · Botany, Auckland</span>
      <h1 style="margin-top:18px">Strong solutions for <span class="hl">your vision.</span></h1>
      <p class="sub">Stable Structure Limited is a structural and civil engineering consultancy in Botany, Auckland, led by a Chartered Professional Engineer (CPEng). From your first sketch to final sign-off, we turn complex engineering challenges into practical, cost-effective, fully compliant designs, right across New Zealand.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="${base}contact.html">Request a Free Quote ${si('arrow', 2.2)}</a>
        <a class="btn btn-wa btn-lg" href="${waHref()}" target="_blank" rel="noopener">${wa()} WhatsApp us</a>
      </div>
      <p class="hero-call">Or call <a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a> · Mon–Fri, 8:30am–5pm</p>
      <div class="hero-trust">
        <div class="ht">${si('shield', 2)}NZ Building Code compliant</div>
        <div class="ht">${si('check', 2)}Consent-ready documentation</div>
        <div class="ht">${si('clock', 2)}Fast, responsive turnaround</div>
      </div>
    </div>
    <div class="hero-visual">
      <svg class="frame" viewBox="0 0 480 420" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Structural steel portal frame diagram">
        <defs><linearGradient id="beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3FC0F0"/><stop offset="1" stop-color="#1580B0"/></linearGradient></defs>
        <line x1="30" y1="380" x2="450" y2="380" stroke="#3E6188" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round"/>
        <rect x="70" y="150" width="14" height="230" rx="3" fill="url(#beam)"/>
        <rect x="396" y="150" width="14" height="230" rx="3" fill="url(#beam)"/>
        <path d="M77 150 L240 66 L403 150" stroke="url(#beam)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <line x1="77" y1="150" x2="403" y2="150" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>
        <g stroke="#7FA0C0" stroke-width="2.2" opacity=".85" stroke-linecap="round"><path d="M84 156 L240 118 L396 156"/><path d="M120 150 L160 118"/><path d="M200 150 L240 118"/><path d="M280 150 L240 118"/><path d="M360 150 L320 118"/><path d="M160 118 L200 150"/><path d="M320 118 L280 150"/></g>
        <g stroke="#1DA9E3" stroke-width="1.6" opacity=".9"><line x1="77" y1="404" x2="403" y2="404"/><line x1="77" y1="398" x2="77" y2="410"/><line x1="403" y1="398" x2="403" y2="410"/></g>
        <g fill="#fff"><circle cx="77" cy="150" r="5"/><circle cx="403" cy="150" r="5"/><circle cx="240" cy="66" r="5"/></g>
        <g fill="#1DA9E3"><circle cx="240" cy="118" r="4"/></g>
      </svg>
      <div class="spec-card sc-1"><div class="ico">${si('shield', 2)}</div><div><b>Code-compliant</b><span>NZS &amp; NZ Building Code</span></div></div>
      <div class="spec-card sc-2"><div class="ico">${si('phone', 2)}</div><div><b>Concept → Completion</b><span>End-to-end engineering</span></div></div>
    </div>
  </div>
</section>`;
}

function trustbar() {
  return `<div class="trustbar"><div class="container">
    <div class="tb-item">${si('structural', 2)}Residential</div>
    <div class="tb-item">${si('building', 2)}Commercial</div>
    <div class="tb-item">${si('factory', 2)}Industrial</div>
    <div class="tb-item">${si('globe', 2)}Nationwide, NZ</div>
    <div class="tb-item">${si('check', 2)}Council consent ready</div>
  </div></div>`;
}

function statsBlock() {
  return `<section class="pad-sm"><div class="container"><div class="stats reveal">
    <div class="stat"><div class="num">20<span class="u">+</span></div><div class="lbl">Years of structural engineering experience</div></div>
    <div class="stat"><div class="num">5.0<span class="u">★</span></div><div class="lbl">Google rating</div></div>
    <div class="stat"><div class="num">CPEng</div><div class="lbl">Chartered engineer signs every PS1</div></div>
    <div class="stat"><div class="num">NZ</div><div class="lbl">Wide project coverage</div></div>
  </div></div></section>`;
}

/* Full-image lightbox (main.js). Needs a .proj-grid on the page. */
const lightboxMarkup = () => `<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Project photo" hidden>
  <button class="lb-btn lb-close" type="button" aria-label="Close">${si('close', 2.2)}</button>
  <button class="lb-btn lb-prev" type="button" aria-label="Previous photo">${si('chevr', 2.2)}</button>
  <figure class="lb-figure">
    <img class="lb-img" alt="" />
    <figcaption class="lb-cap"></figcaption>
  </figure>
  <button class="lb-btn lb-next" type="button" aria-label="Next photo">${si('chevr', 2.2)}</button>
</div>`;

function projectsSection(base) {
  const projects = loadProjects();

  /* Nothing published yet — the sync only picks up newly tagged posts, so the
     page must still read as intentional on day one. */
  if (!projects.length) {
    return `<section class="pad"><div class="container">
      <div class="proj-empty reveal">
        <div class="proj-empty-ic">${si('camera', 1.7)}</div>
        <h2>Our latest projects are on their way</h2>
        <p>We are putting this gallery together right now. In the meantime you can see our most recent work over on Facebook — or tell us about your project and we will get straight back to you.</p>
        <div class="proj-empty-cta">
          <a class="btn btn-primary btn-lg" href="${FACEBOOK_URL}" target="_blank" rel="noopener">${fb()} See our Facebook page</a>
          <a class="btn btn-ghost btn-lg" href="${base}contact.html">Request a free quote</a>
        </div>
      </div>
    </div></section>`;
  }

  const cards = projects.map((p, cardIdx) => {
    const imgs = p.images.map((i) => `${base}${i}`);
    const caption = p.caption || '';
    const extra = imgs.length - 1;
    /* Alt text comes from the post caption, but a hard slice cut mid-word
       ("...engineered timber framing a"), which reads as broken to a screen
       reader. Trim on a clause or whole-word boundary instead. */
    const DANGLING = /\s+(?:a|an|the|of|for|with|and|or|to|in|on|at|by|from|as|is|are|was|were|that|which|our|its|their)$/i;
    const altFrom = (c) => {
      const flat = c.replace(/\s+/g, ' ').trim();
      if (flat.length <= 110) return flat;
      const cut = flat.slice(0, 110);
      const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' — '), cut.lastIndexOf(', '));
      const end = stop > 45 ? stop : cut.lastIndexOf(' ');
      let out = flat.slice(0, end > 0 ? end : 110).replace(/[\s,—–-]+$/, '');
      // never end on a dangling function word — trim until the phrase closes
      while (DANGLING.test(out)) out = out.replace(DANGLING, '');
      return out;
    };
    const alt = p.alt || (caption.trim() ? altFrom(caption) : `Stable Structure engineering project${p.date ? `, ${projectDate(p.date)}` : ''}`);
    /* WebP copies (1200, 900 and 600 wide) sit beside each JPEG when they have been
       made; Facebook-synced photos without them fall back to the JPEG. */
    const webp = (i) => i.replace(/\.jpe?g$/i, '.webp');
    const small = (i) => i.replace(/\.jpe?g$/i, '-600.webp');
    const mid = (i) => i.replace(/\.jpe?g$/i, '-900.webp');
    const hasWebp = (i) => /\.jpe?g$/i.test(i) && [webp(i), small(i), mid(i)].every((f) => fs.existsSync(path.join(ROOT, f)));
    const first = p.images[0];
    const media = hasWebp(first)
      ? `<img src="${base}${webp(first)}" srcset="${base}${small(first)} 600w, ${base}${mid(first)} 900w, ${base}${webp(first)} 1200w" sizes="(max-width: 700px) 100vw, 380px"`
      : `<img src="${imgs[0]}"`;
    const full = p.images.map((i) => `${base}${hasWebp(i) ? webp(i) : i}`);
    return `<article class="proj-card${cardIdx === 0 ? '' : ' reveal'}" data-images="${esc(JSON.stringify(full))}" data-caption="${esc(caption)}"${p.permalink ? ` data-permalink="${esc(p.permalink)}"` : ''}>
        <button class="proj-media" type="button" aria-label="View photos for this project">
          ${media} width="1200" height="900" ${cardIdx === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} alt="${esc(alt)}" />
          ${extra > 0 ? `<span class="proj-count">${si('camera', 2)}+${extra}</span>` : ''}
        </button>
        <div class="proj-body">
          ${p.date ? `<time class="proj-date" datetime="${esc(p.date)}">${projectDate(p.date)}</time>` : ''}
          ${caption ? `<p class="proj-cap">${esc(caption).replace(/\n/g, '<br />')}</p>` : ''}
          ${p.permalink ? `<a class="proj-link" href="${esc(p.permalink)}" target="_blank" rel="noopener">${fb()} View post</a>` : ''}
        </div>
      </article>`;
  }).join('\n      ');

  return `<section class="pad"><div class="container">
      <div class="proj-grid">
      ${cards}
      </div>
      <p class="proj-foot reveal">Follow <a href="${FACEBOOK_URL}" target="_blank" rel="noopener">Stable Structure on Facebook</a> to see new projects as they are finished.</p>
    </div></section>
${lightboxMarkup()}`;
}

function projectsVideo() {
  if (!PROJECT_VIDEO_EMBED) return '';
  return `<section class="pad-sm"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">In motion</span><h2 class="section-title">See our work in action</h2><p class="lead">A closer look at one of our recent builds, straight from our Facebook.</p></div>
      <!-- Click to load: the Facebook player (about 2 MB) only loads when asked for.
           main.js swaps the button for the iframe. -->
      <div class="video-embed video-facade reveal" data-src="${esc(PROJECT_VIDEO_EMBED)}">
        <button class="vf-play" type="button" aria-label="Play the project video (loads from Facebook)">
          <span class="vf-ic"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>
          <span class="vf-txt"><b>Play the video</b><span>Loads from Facebook</span></span>
        </button>
      </div>
    </div></section>`;
}

function teamSection(base) {
  const team = [
    {
      photo: 'gajanthan.jpg', name: OWNER, role: 'Director',
      cred: 'BSc(Eng) · MSc(Struct) · MIStructE · CMEngNZ · CEng (UK) · CPEng (NZ) #1030007',
      bio: [
        `Gajanthan founded Stable Structure Limited more than eight years ago, bringing over 20 years of structural engineering experience to the practice. He holds a Bachelor of Engineering (Structural) from Sri Lanka and a Master of Science in Structural Engineering from the National University of Singapore, and is both a Chartered Structural Engineer (MIStructE, UK) and a Chartered Professional Engineer (CPEng) with Engineering New Zealand.`,
        `With over 20 years of experience across Sri Lanka, Singapore and New Zealand, his work spans complex infrastructure and buildings — from underground structures for tunnels and railway stations and harbour jetties, through to residential developments, commercial buildings and industrial structures. He is passionate about mentoring engineers, delivering technical seminars, and finding practical, economical solutions that never compromise safety or quality.`,
      ],
      note: `Outside work, Gajanthan is a keen badminton player who enjoys organising tournaments, supporting charitable initiatives, and spending time with his family and in nature.`,
      actions: `<div class="tm-actions">
          <a class="btn btn-primary" href="mailto:${EMAIL}">${si('mail', 2)} Email Gajan</a>
          <a class="btn btn-wa" href="${waHref()}" target="_blank" rel="noopener">${wa()} WhatsApp</a>
        </div>`,
    },
    {
      photo: 'morgan.jpg', name: 'Morgan Wang', role: 'Intermediate Structural Engineer',
      cred: 'BE · MEngNZ',
      bio: [
        `Morgan brings over seven years of local New Zealand experience, specialising in temporary works, residential and light commercial projects. He delivers stable, buildable and compliant structural solutions that balance safety, cost and client requirements — working closely with architects, builders and clients across the whole project lifecycle, from pre-design reviews and structural analysis through to drawings, site inspections and construction documentation.`,
        `His project record spans complex temporary works such as SED scaffolding, hanging platforms, grandstands and event platforms, as well as steel canopies, warehouse sheds, new residential developments and renovations.`,
      ],
      note: `Outside work, Morgan enjoys time with family and friends, and keeps balance through sport, music, good food and movies.`,
      actions: '',
    },
    {
      photo: 'thibakaran.jpg', name: 'Thibakaran Sivakumaran', role: 'Intermediate to Senior Structural Engineer',
      cred: 'HND Civil (UK) · BEng Civil (NZ) · MSc in Structural Engineering (NZ)',
      bio: [
        `Thibakaran has over five years of experience delivering practical, efficient and compliant structural design across commercial and residential projects. His work covers timber, structural steel, light-gauge steel and reinforced concrete systems — including new builds, alterations, additions and strengthening works — and he stays involved throughout the project, from early design and analysis to detailed documentation, construction support and coordination with architects, contractors and other stakeholders.`,
        `He is committed to buildable, cost-effective and robust engineering solutions that meet project requirements, relevant standards and New Zealand building regulations.`,
      ],
      note: `Outside work, Thibakaran plays group badminton and local tournaments, and turns out for one-day grade cricket with his club.`,
      actions: '',
    },
    {
      photo: 'damitha.jpg', name: 'Damitha Disanthi', role: 'Architectural Designer',
      cred: 'B.Arch.(Hons) · AIA · RIBA · MSc in Project Management',
      bio: [
        `Damitha brings over ten years of experience across architecture, project management and technical documentation. She holds a Bachelor of Architecture (Honours) from the University of Moratuwa, Sri Lanka.`,
        `Since relocating to New Zealand she has worked in structural drafting, preparing the detailed structural drawings and building consent documentation that carry a project through council — working in AutoCAD and Revit.`,
      ],
      note: `Outside work, Damitha enjoys time with her family, exploring New Zealand's natural landscapes, and continually building her knowledge of New Zealand building standards and construction practices.`,
      actions: '',
    },
    {
      photo: 'kemaruban.jpg', name: 'Kemaruban Rajaratnam', role: 'Project Coordinator',
      cred: 'BSc (Eng)',
      bio: [
        `Kemaruban brings over three years of experience delivering structural engineering solutions for New Zealand projects. He specialises in residential developments, producing practical, buildable and code-compliant designs that balance safety, cost efficiency and client requirements.`,
        `He graduated with a Bachelor of Engineering (Honours) in Civil Engineering from the University of Peradeniya, Sri Lanka. His expertise covers structural analysis, design, documentation and project coordination for residential developments — including multi-unit buildings up to three storeys — with every design meeting the relevant New Zealand standards and building regulations.`,
      ],
      note: `Beyond engineering, Kemaruban keeps a balanced lifestyle through time with family and friends, sport, travel, and exploring different cultures and cuisines.`,
      actions: '',
    },
  ];
  const members = team.map((m, i) => `<div class="team-member${i % 2 ? ' rev' : ''} reveal">
        <div class="tm-photo"><img src="${base}assets/team/${fs.existsSync(path.join(ROOT, 'assets/team', m.photo.replace(/\.jpg$/, '.webp'))) ? m.photo.replace(/\.jpg$/, '.webp') : m.photo}" width="720" height="900" loading="lazy" alt="${m.name}, ${m.role} at Stable Structure Limited" /></div>
        <div class="tm-body">
          <div class="tm-role">${m.role}</div>
          <h3 class="tm-name">${m.name}</h3>
          ${m.cred ? `<p class="tm-cred">${m.cred}</p>` : ''}
          ${m.bio.map(p => `<p class="bio">${p}</p>`).join('\n          ')}
          <p class="tm-note">${m.note}</p>
          ${m.actions}
        </div>
      </div>`).join('\n      ');
  return `<section class="pad" style="background:var(--surface-2)"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Our team</span><h2 class="section-title">Meet the engineers behind your project</h2><p class="lead">You work directly with experienced engineers who take personal ownership of your project, from first concept through to final sign-off. Every producer statement (PS1 and PS4) we issue is signed by our director, a Chartered Professional Engineer you can <a href="${CPENG_REGISTER_URL}" target="_blank" rel="noopener">check on the CPEng register</a> (#1030007).</p></div>
      <div class="team" style="margin-top:56px">
      ${members}
      </div>
    </div></section>`;
}

function whyBlock(base) {
  return `<div class="container split">
    <div class="reveal">
      <span class="eyebrow">Why Stable Structure</span>
      <h2 class="section-title">Complex engineering, made simple and certain</h2>
      <p class="lead">Our job is to remove the risk and guesswork from your build. We translate ambitious ideas into designs that are practical to build, kind to your budget, and confidently compliant with New Zealand standards.</p>
      <div class="feature-list">
        <div class="feature"><div class="fic">${si('gem', 2)}</div><div><h3 class="fh4">Practical, cost-effective solutions</h3><p>We value-engineer every design so it is economical to build without compromising safety or performance.</p></div></div>
        <div class="feature"><div class="fic">${si('shield', 2)}</div><div><h3 class="fh4">Compliance you can rely on</h3><p>Every project is designed to the NZ Building Code and relevant standards, with clear documentation for council.</p></div></div>
        <div class="feature"><div class="fic">${si('users', 2)}</div><div><h3 class="fh4">Expert guidance at every stage</h3><p>Clear communication and hands-on advice from concept to completion — you are never left guessing.</p></div></div>
        <div class="feature"><div class="fic">${si('clock', 2)}</div><div><h3 class="fh4">Responsive, on-time delivery</h3><p>We keep your project moving with fast turnaround and proactive engineering support.</p></div></div>
      </div>
    </div>
    <div class="why-visual reveal">
      <div class="grid-bg"></div>
      <div><span class="eyebrow on-dark">Our promise</span><p class="qmark" style="margin-top:18px">“Every design leaves our desk buildable, compliant and clear — engineered to give you technical confidence from concept to completion.”</p></div>
      <div class="attr"><div class="av">SS</div><div><b style="color:#fff">Stable Structure Limited</b><span>Structural &amp; Civil Engineering · Auckland</span></div></div>
    </div>
  </div>`;
}

function processSteps() {
  const steps = [
    ['01', 'Consult &amp; scope', 'We discuss your vision, review plans and site, and give you a clear, upfront quote and scope.'],
    ['02', 'Design &amp; document', 'We produce the structural and civil design plus detailed, consent-ready drawings and calculations.'],
    ['03', 'Consent &amp; approve', 'We supply PS1 documentation and support your building consent through to approval.'],
    ['04', 'Build &amp; supervise', 'We inspect and supervise on site, verifying the build and issuing documentation at completion.'],
  ];
  return `<div class="steps">
      ${steps.map((s, i) => `<div class="step reveal">${i < 3 ? '<span class="line"></span>' : ''}<div class="n">${s[0]}</div><h4>${s[1]}</h4><p>${s[2]}</p></div>`).join('\n      ')}
    </div>`;
}

/* ---------- Phase-3 content: article helpers ---------- */
const UPDATED_DISPLAY = 'Updated 13 August 2026';

/* Byline shown on rewritten service pages and guides. CPEng #1030007 verified
   on the Registration Authority's CPEng register (status Current, first
   registered 5/10/2018, practice field Structural engineering, 2026-08-13).
   The register has no per-person permalink, so we link its search page. */
const CPENG_REGISTER_URL = 'https://members.engineeringnz.org/s/cpeng-register';
const CPENG_NUMBER = '1030007';
const byline = (base, updated) => `<div class="byline reveal">
  <span class="bv">GV</span>
  <span>Reviewed by <b>${OWNER}</b>, <a href="${CPENG_REGISTER_URL}" target="_blank" rel="noopener" title="Verify on the CPEng register">CPEng #${CPENG_NUMBER}</a> · <a href="${base}about.html">Director, Stable Structure</a></span>
  <span class="upd">${updated || UPDATED_DISPLAY}</span>
</div>`;

const miniFaq = (qas) => `<div class="mini-faq">
  ${qas.map(([q, a]) => `<details><summary>${q}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">${I.plus}</svg></summary><div class="ans">${a}</div></details>`).join('\n  ')}
</div>`;

const guideLink = (base, href, label) => `<div class="guide-links"><a href="${base}${href}">${si('consent', 2)} ${label}</a></div>`;

/* Cost sections deliberately carry NO dollar figures: they answer with cost
   drivers + the fixed-quote promise. Proposed market-guide ranges live in the
   WO-2026-SS01 completion report; add them here only once Gajan confirms. */

/* Unique closing paragraphs so no two service pages share the same boilerplate close. */
const CLOSES = {
  'structural-design': 'From a single steel beam to a full architectural home, the structural design we hand over is one your builder can price with confidence and council can approve without a fight.',
  'civil-design': 'Land only becomes a building site once the water, access and earthworks are solved. That is the part we take off your plate.',
  'swimming-pools': 'A pool is one of the few structures you build to hold force in every direction. Ours are designed so the only thing you think about is swimming in it.',
  'decks-outdoor-living': 'The best decks disappear into the way you live. Get the engineering right once, and yours will do exactly that for decades.',
  'carports-sheds-portals': 'Clear spans, honest steel and documentation council will accept the first time: that is what a good portal frame looks like on paper and on site.',
};

const ARTICLES = {
  /* ---- Building Consent Documentation (PS1) — GSC: pos 22.8, "building documentation" ---- */
  'building-consent-documentation': (base) => `
    <p style="font-size:17px">Building consent documentation is the engineering evidence behind your consent application: the drawings, calculations and Producer Statements that show Auckland Council (or any NZ council) that your design complies with the Building Code. A complete, well-organised documentation package is the single biggest factor in how quickly your consent is granted.</p>
    ${byline(base)}
    <h2>What does consent documentation include?</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Detailed structural drawings your builder can price and build from</span></li>
      <li>${si('check', 2.2)}<span>Engineering calculations covering gravity, wind and earthquake loads</span></li>
      <li>${si('check', 2.2)}<span>A PS1 (Producer Statement, Design) signed by a Chartered Professional Engineer</span></li>
      <li>${si('check', 2.2)}<span>Specifications and construction details for the structural elements</span></li>
      <li>${si('check', 2.2)}<span>Responses to council Requests for Information (RFIs) at no drama</span></li>
      <li>${si('check', 2.2)}<span>Coordination with your architect, designer or draughtsperson</span></li>
    </ul>
    <h2>What is a PS1 and why does council want one?</h2>
    <p>A PS1 is a formal statement from a qualified engineer that the structural design complies with the New Zealand Building Code, most commonly clause B1 (Structure). Where a design goes beyond the standard NZS 3604 timber-framing rules (larger spans, steel beams, retaining, difficult ground), council relies on a PS1 from a CPEng engineer instead of checking the specific engineering design themselves. Our PS1s are signed by our director, a Chartered Professional Engineer, and are accepted by councils across New Zealand. If you want the full picture of how producer statements work, read our plain-English guide below.</p>
    ${guideLink(base, 'guides/what-is-a-ps1.html', 'Guide: What is a PS1? Producer statements explained (PS1 vs PS4)')}
    <h2>How much does a PS1 cost in Auckland?</h2>
    <p>It depends on what sits behind it: a single engineered element (a beam, a deck, a standard retaining wall) is a much smaller piece of work than full structural design for an alteration or new build. The real cost drivers are the number of structural elements, ground conditions, how complete the architectural drawings are, and whether geotechnical input is needed. We quote every job as a <b>fixed fee up front</b> from your plans, usually within one business day, so you know the exact number before any work begins and it never moves mid-project.</p>
    <h2>How long does it take?</h2>
    <p>For straightforward residential elements, allow <b>one to two weeks</b> from receiving your plans to issuing consent-ready documentation. Full new-build packages typically take <b>three to six weeks</b>. Once lodged, council has 20 working days to process a consent; clean documentation is what keeps that clock from restarting with RFIs.</p>
    <h2>Auckland Council specifics we handle for you</h2>
    <p>Auckland Council reviews structural documentation closely, and an incomplete package triggers an RFI that stops the 20-day clock. We prepare documentation to match what Auckland's processing engineers expect to see: clear load paths, referenced standards (NZS 3604, NZS 1170, NZS 3101, NZS 3404), buildable details and a tidy calculation set. When an RFI does arrive, we respond directly to council so your application keeps moving.</p>
    <h2>What we need from you to start</h2>
    <p>The short list: your architectural or draughting drawings (PDF or CAD), the site address, and any geotechnical report if one exists. From that we confirm the engineering scope and give you a fixed quote, usually within one business day. If your designer is still drawing, we are happy to work alongside them so the structure and architecture develop together instead of the engineering arriving as an afterthought. Owners managing their own consent are welcome: we explain each document in plain English so you know exactly what you are lodging and why council wants it.</p>
    <h2>What council actually checks</h2>
    <p>A processing engineer at council is looking for three things: a complete load path (every load has a named route to the ground), referenced design standards with calculations that match the drawings, and details a builder can actually construct. Packages fail on mismatches: a beam on the drawing that never appears in the calculations, a bracing schedule that disagrees with the plan, a detail copied from a different job. Because our drawings and calculations are produced together by the same engineer, those mismatches do not happen, and that is the single biggest reason our applications move through without RFIs.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['Is a PS1 a guarantee of the build?', 'No. A PS1 covers the design. Verification that the build matches the design is a PS4, issued after <a href="construction-supervision.html">construction monitoring</a>. Many projects need both, and we provide both.'],
      ['Can you work from my draughtsperson’s plans?', 'Yes. We regularly provide the engineering and PS1 to sit behind plans from architects, designers and draughtspeople. We slot into your existing team.'],
      ['My consent got an RFI. Can you help?', 'Yes. We prepare the engineering response and liaise with council, whether or not we produced the original design.'],
      ['Do minor renovations need a PS1?', 'Only where there is specific engineering design, such as removing a load-bearing wall or adding a steel beam. If your project stays fully within NZS 3604, a PS1 may not be needed. Send us your plans and we will tell you straight.'],
    ])}
    <h2>Why owners and designers use us for consent documentation</h2>
    <p>Consent documentation is where an engineering consultancy either saves you weeks or costs you weeks. Ours is prepared by the same chartered engineer who signs the PS1, which is exactly the accountability council wants to see, and exactly what gets your project to site sooner.</p>`,

  /* ---- Retaining Walls — GSC 30 Sep 2026 (60 days): 98 queries, 755 impressions, 1 click; closest to page 1:
     "engineered retaining walls" 13.9, "structural retaining wall" 10.6, "structural engineer retaining wall" 16.1,
     "driveway retaining wall cost" 18.7, "retaining walls east auckland" 21.3 ---- */
  'retaining-walls': (base) => `
    <p style="font-size:17px">An engineered retaining wall holds back soil, water and load for decades without complaint. We are retaining wall engineers based in Botany: we design timber pole, concrete block and reinforced concrete retaining walls across East Auckland and New Zealand-wide, and prepare the drawings, calculations and PS1 that councils require.</p>
    <p>Most Auckland retaining wall builders bring in a structural engineer for any wall over 1.5 metres or holding up a driveway. We are that engineer, and homeowners, landscapers and builders engage us directly.</p>
    ${byline(base, 'Updated 30 September 2026')}
    <figure class="rw-fig">
      <div class="rw-scroll"><svg viewBox="0 0 680 380" role="img" aria-labelledby="rw-fig-t rw-fig-d" xmlns="http://www.w3.org/2000/svg">
        <title id="rw-fig-t">Cross-section of an engineered timber pole retaining wall</title>
        <desc id="rw-fig-d">A driveway on the high side pushes load onto the retained soil. Timber poles are embedded below the lower ground. Behind the wall, drainage metal wrapped in filter cloth leads water down to a perforated subsoil drain that carries it away to an outlet.</desc>
        <defs>
          <pattern id="rw-soil" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10 L10 0" class="rw-hatch"/></pattern>
          <pattern id="rw-metal" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2" class="rw-stone"/><circle cx="9" cy="8" r="2.2" class="rw-stone"/></pattern>
          <marker id="rw-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="rw-arrowhead"/></marker>
          <marker id="rw-arrow-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="rw-arrowhead-red"/></marker>
        </defs>
        <!-- retained soil (high side) and lower ground -->
        <path d="M20 118 H300 V360 H20 Z" fill="url(#rw-soil)" class="rw-soil"/>
        <path d="M340 258 H660 V360 H340 Z" fill="url(#rw-soil)" class="rw-soil"/>
        <path d="M300 118 H340 V360 H300 Z" fill="url(#rw-soil)" class="rw-soil"/>
        <!-- surcharge: driveway slab + vehicle load arrows -->
        <rect x="40" y="104" width="220" height="14" rx="2" class="rw-slab"/>
        <g class="rw-load">
          <line x1="80" y1="52" x2="80" y2="98" marker-end="url(#rw-arrow)"/>
          <line x1="150" y1="52" x2="150" y2="98" marker-end="url(#rw-arrow)"/>
          <line x1="220" y1="52" x2="220" y2="98" marker-end="url(#rw-arrow)"/>
        </g>
        <text x="150" y="40" class="rw-label" text-anchor="middle">Driveway or building above = surcharge</text>
        <!-- drainage metal and filter cloth behind the wall -->
        <rect x="302" y="128" width="30" height="126" fill="url(#rw-metal)" class="rw-metal"/>
        <path d="M300 128 V256 H334" class="rw-cloth"/>
        <!-- subsoil drain -->
        <circle cx="317" cy="246" r="9" class="rw-pipe"/>
        <circle cx="317" cy="246" r="3" class="rw-pipe-hole"/>
        <!-- timber pole wall + lagging, embedded below lower ground -->
        <rect x="334" y="112" width="16" height="226" rx="3" class="rw-pole"/>
        <line x1="334" y1="140" x2="350" y2="140" class="rw-lag"/><line x1="334" y1="170" x2="350" y2="170" class="rw-lag"/>
        <line x1="334" y1="200" x2="350" y2="200" class="rw-lag"/><line x1="334" y1="230" x2="350" y2="230" class="rw-lag"/>
        <!-- soil pressure arrows -->
        <g class="rw-press">
          <line x1="236" y1="160" x2="292" y2="160" marker-end="url(#rw-arrow-red)"/>
          <line x1="226" y1="200" x2="292" y2="200" marker-end="url(#rw-arrow-red)"/>
          <line x1="216" y1="240" x2="292" y2="240" marker-end="url(#rw-arrow-red)"/>
        </g>
        <text x="120" y="205" class="rw-label" text-anchor="middle">Soil and water</text>
        <text x="120" y="223" class="rw-label" text-anchor="middle">push on the wall</text>
        <!-- dimensions -->
        <g class="rw-dim">
          <line x1="382" y1="118" x2="382" y2="256" marker-start="url(#rw-arrow)" marker-end="url(#rw-arrow)"/>
          <line x1="382" y1="262" x2="382" y2="336" marker-start="url(#rw-arrow)" marker-end="url(#rw-arrow)"/>
        </g>
        <text x="396" y="182" class="rw-label">Retained height</text>
        <text x="396" y="200" class="rw-note">over 1.5 m, or any surcharge,</text>
        <text x="396" y="216" class="rw-note">needs engineering and consent</text>
        <text x="396" y="296" class="rw-label">Embedment</text>
        <text x="396" y="314" class="rw-note">poles set deep enough to resist the push</text>
        <!-- leader labels for drainage -->
        <g class="rw-leader"><polyline points="300,132 420,46 470,46"/><polyline points="318,160 430,72 470,72"/><polyline points="326,246 440,98 470,98"/></g>
        <text x="476" y="50" class="rw-label">Filter cloth</text>
        <text x="476" y="76" class="rw-label">Drainage metal</text>
        <text x="476" y="102" class="rw-label">Subsoil drain</text>
        <text x="476" y="119" class="rw-note">falls to an outlet, so water</text>
        <text x="476" y="134" class="rw-note">never builds up behind the wall</text>
        <text x="600" y="282" class="rw-note" text-anchor="middle">Lower ground</text>
      </svg></div>
      <p class="rw-hint">Swipe the diagram sideways to see all of it.</p>
      <figcaption>How an engineered timber pole retaining wall works. Illustrative, not to scale: every wall is sized for its own height, surcharge and ground.</figcaption>
    </figure>
    <h2>When does a retaining wall need an engineer?</h2>
    <p>Under the Building Act, a retaining wall retaining up to 1.5 metres with no extra load behind it (no surcharge) is generally exempt from building consent. Engineering enters the picture when the wall retains <b>more than 1.5 metres</b>, or carries a <b>surcharge</b>: a driveway, building, pool or sloping ground above the wall. Those walls need specific engineering design and consent, and councils will not accept them without calculations and a PS1. Walls near boundaries, on soft ground, or supporting vehicle loads deserve engineering even when they are technically exempt, because they are the ones that fail expensively.</p>
    ${guideLink(base, 'guides/retaining-wall-consent-nz.html', 'Guide: When does a retaining wall need consent in NZ?')}
    <h2>Timber, block or concrete: which wall is right?</h2>
    <p><b>Timber pole walls</b> are the workhorse of Auckland sections: economical up to around 2 to 3 metres, quick to build, and well suited to sloped landscaping. <b>Concrete block (masonry) walls</b> suit tighter urban sites and tie in neatly with buildings and boundary walls. <b>Reinforced concrete walls</b> carry the biggest loads in the least thickness, which makes them the pick for driveways, basements and heavily surcharged boundaries. We design all three, and we will tell you honestly which one your site actually needs rather than defaulting to the most expensive option.</p>
    <h2>Driveway retaining walls</h2>
    <p>A wall holding up a driveway is the classic surcharged wall: every car and delivery van on the drive pushes on it, so it needs specific engineering and building consent at any height. The design allows for vehicle loads behind the wall, keeps the posts or footing clear of the driveway's own structure, and, where people could fall 1 metre or more, includes the barrier the Building Code requires along the edge. Timber pole walls suit many residential drives; tall or heavily loaded driveway walls usually move to reinforced concrete or concrete block. We size them for the vehicles that will actually use the drive, not a worst case that doubles your build cost.</p>
    <h2>How much does an engineered retaining wall cost?</h2>
    <p>The total has two parts: the <b>engineering</b> (design, drawings, calculations, PS1 and inspections during construction) and the <b>build</b>, priced by your contractor. Engineering is usually the smaller share, and a well-engineered design often pays for itself by trimming over-conservative sizing from the build. What moves both numbers:</p>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span><b>Height.</b> Taller walls need deeper embedment, bigger members or a switch to concrete.</span></li>
      <li>${si('check', 2.2)}<span><b>Surcharge.</b> A driveway, building, pool or slope above the wall adds load, so a driveway wall costs more than a garden wall of the same height.</span></li>
      <li>${si('check', 2.2)}<span><b>Ground.</b> Soft, filled or wet ground, and whether a geotechnical report is needed.</span></li>
      <li>${si('check', 2.2)}<span><b>Length, access and material.</b> Machine access, a tight boundary and the wall type all change the build price.</span></li>
      <li>${si('check', 2.2)}<span><b>Drainage outlet.</b> Where the water can go decides how much drainage work is involved.</span></li>
    </ul>
    <p>Send us a photo, a rough height and what sits above the wall and we will give you a <b>fixed engineering quote in writing before we start</b>. Your contractor can then price the build from our drawings, so the builder quotes you compare are like for like.</p>
    <h2>Drainage: the part that actually keeps walls standing</h2>
    <p>Most retaining wall failures in Auckland are water failures, not soil failures. Every wall we design includes subsoil drainage: drainage metal, a properly falled novacoil drain and an outlet that daylights somewhere sensible. It is unglamorous, invisible after backfill, and the reason our walls stay straight through an Auckland winter.</p>
    <h2>What about the ground itself?</h2>
    <p>A retaining wall is only as good as what it stands in. For most residential walls we design from conservative published soil parameters appropriate to your area, which keeps costs down. Taller walls, soft or filled ground, and walls supporting buildings justify a geotechnical investigation, and we will tell you up front when that is genuinely needed rather than discovering it mid-project. Where a geotech report exists we design directly to its parameters, which usually sharpens the design and saves construction cost.</p>
    <h2>The standards behind the design</h2>
    <p>Retaining walls sit outside NZS 3604, the standard for light timber-framed buildings, so any wall that needs consent is specifically designed by an engineer to meet Building Code clause B1 (Structure). In practice that means loads, including earthquake loads, to the AS/NZS 1170 loading standards, and each material to its own standard: NZS 3603 for timber, NZS 4230 for concrete masonry and NZS 3101 for reinforced concrete. The PS1 we issue is the engineer's formal statement that the wall complies.</p>
    <h2>How the design process runs</h2>
    <p>First we look at your site: photos, plans and levels are often enough to scope and quote. Then we design the wall and its drainage, produce the drawings and calculations, and issue the PS1 for consent where one is required. During construction we inspect the critical stages, typically pole embedment or footing steel and the drainage before backfill, and close out with the PS4 your council needs. One engineer, one thread of responsibility, from first sketch to sign-off.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['My wall is under 1.5m. Do I still need an engineer?', 'If it carries no surcharge, usually not for consent. But walls under 1.5m holding up driveways, pools or buildings still need engineering, and any wall near a boundary is worth designing properly.'],
      ['Do you handle the building consent too?', 'Yes. We prepare the drawings, calculations and PS1, and can manage the consent application and any council RFIs end to end.'],
      ['Can you design walls outside Auckland?', 'Yes. We design retaining walls throughout New Zealand and prepare documentation for any council, with site-specific loads and ground assumptions for your region.'],
      ['What about existing walls that are leaning?', 'We inspect and assess existing retaining walls, report on their condition, and design remediation or replacement where needed.'],
      ['Does NZS 3604 cover retaining walls?', 'No. NZS 3604 covers light timber-framed buildings, not retaining walls. A wall that needs consent is specifically designed by an engineer to the Building Code, using the loading standards and the material standard for timber, masonry or concrete.'],
      ['Can you work with my retaining wall builder or landscaper?', 'Yes, and many of our walls come to us that way. We design the wall, your builder or landscaper builds it, and we inspect the critical stages and issue the PS4 at the end.'],
      ['How much does an engineer charge to design a retaining wall?', 'It depends on the height, what sits above the wall, the ground and the length. Send a photo, a rough height and what is above it, and we will give you a fixed quote in writing before any work starts.'],
    ])}
    <h2>Fences, pools and boundaries on top of walls</h2>
    <p>Two details catch people out. A fence or barrier fixed to the top of a retaining wall adds wind and impact load the wall must be designed for, so tell your engineer about it before the design is done, not after the fence goes up. And where a wall sits on or near a boundary, the design must respect both properties: footing positions, drainage discharge and construction access all need answers your neighbour can live with. We deal with both situations weekly and design for them from the start.</p>
    <h2>Retaining walls in East Auckland</h2>
    <p>We are based in Botany, so Howick, Pakuranga, Flat Bush, Dannemora, Beachlands, Manukau and the surrounding suburbs are on our doorstep: site visits are quick and we know the local ground. Much of Auckland sits on clay soils that swell in winter and shrink in summer, which is exactly why drainage and embedment matter so much here. We design walls for homeowners directly, and for the landscapers and retaining wall builders who need an engineer they can call.</p>
    <h2>Built on slopes, priced for real budgets</h2>
    <p>Auckland is a city of slopes, and almost every section eventually needs ground held back. Our walls are engineered to carry exactly the loads your site imposes, with drainage that keeps them working and documentation that goes through council first time.</p>`,

  /* ---- Construction Supervision — GSC 30 Sep 2026 (60 days): 30 queries, 443 impressions, 0 clicks.
     Searchers say "construction monitoring" + CM levels: cm3 11.5, "building construction supervision south
     auckland" 15.9, "construction supervision" 15.4, "monitoring levels" 21.9, cm2 29.5, "monitoring services" 33.3 ---- */
  'construction-supervision': (base) => `
    <p style="font-size:17px">Construction monitoring, also called construction supervision, is an engineer's independent check that the structural work on your build matches the consented design: planned site visits at the stages that matter, fast answers for your builder, and the PS4 your council needs before it issues Code Compliance. We provide construction monitoring across South and East Auckland, and for projects throughout New Zealand.</p>
    <p>If your building consent names a monitoring level such as <b>CM2</b> or <b>CM3</b>, this page explains what that means, what the engineer checks, and how it fits your build.</p>
    ${byline(base, 'Updated 30 September 2026')}
    <figure class="cm-holds" aria-labelledby="cm-holds-cap">
      <figcaption id="cm-holds-cap">Typical hold points on a house build</figcaption>
      <ol>
        <li><b>Foundation excavation</b><span>Bearing confirmed before footings are poured</span></li>
        <li><b>Reinforcing steel</b><span>Footing and slab steel checked before the concrete pour</span></li>
        <li><b>Structural framing</b><span>Beams, bracing and connections checked before linings</span></li>
        <li><b>Retaining drainage</b><span>Drains and metal checked before backfill</span></li>
        <li><b>PS4 issued</b><span>Construction review statement for your Code Compliance Certificate</span></li>
      </ol>
    </figure>
    <h2>What does an engineer do during construction monitoring?</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Inspects critical structural stages before they are covered up: foundations, reinforcing, framing, connections</span></li>
      <li>${si('check', 2.2)}<span>Answers builder queries fast so the site never waits on engineering</span></li>
      <li>${si('check', 2.2)}<span>Resolves the surprises every build produces: unexpected ground, substitutions, clashes</span></li>
      <li>${si('check', 2.2)}<span>Documents each visit with a written site report</span></li>
      <li>${si('check', 2.2)}<span>Issues the PS4 (Construction Review) council needs before Code Compliance</span></li>
    </ul>
    <h2>Is construction monitoring required on my project?</h2>
    <p>If your consent involved specific engineering design, the consent conditions almost always require engineering construction monitoring, and council will withhold the Code Compliance Certificate until a PS4 is issued. The design engineer sets the level of monitoring the project needs, and it is recorded with the consent documentation. If you are unsure what yours requires, send us your consent documents and we will tell you exactly what is needed.</p>
    <h2>Construction monitoring levels CM1 to CM5</h2>
    <p>New Zealand engineers describe how closely a build is monitored using five levels, defined in Engineering New Zealand's <a href="https://www.engineeringnz.org/documents/112/Construction_Monitoring_Services.pdf" target="_blank" rel="noopener">Construction Monitoring Services</a> guideline. The higher the level, the more of the work the engineer sees for themselves.</p>
    <div class="cm-table-wrap">
      <table class="cm-table">
        <caption>Construction monitoring levels (summarised from Engineering New Zealand)</caption>
        <thead><tr><th scope="col">Level</th><th scope="col">What the engineer reviews</th><th scope="col">Suits</th></tr></thead>
        <tbody>
          <tr><th scope="row">CM1</th><td>The results of another party's quality checks, with site visits at an agreed frequency.</td><td>A secondary service, for example when someone else is providing the main monitoring.</td></tr>
          <tr><th scope="row">CM2</th><td>A sample of each important work procedure, material and component, and a representative sample of completed work before it is covered.</td><td>Smaller, routine projects with an experienced, competent builder.</td></tr>
          <tr><th scope="row">CM3</th><td>Random samples of important work procedures, to an extent agreed with the client, and the important completed work before it is covered.</td><td>Medium-sized, routine projects with an experienced builder.</td></tr>
          <tr><th scope="row">CM4</th><td>Regular samples of work procedures, materials and components, and the majority of completed work.</td><td>Projects that need a lower than normal risk of non-compliance.</td></tr>
          <tr><th scope="row">CM5</th><td>Engineering staff on site to review the work constantly.</td><td>Major, critical, innovative or complex projects.</td></tr>
        </tbody>
      </table>
    </div>
    <p>The level is chosen by scoring four things: the size of the project, how complex the construction is, how experienced the builder is, and how serious the consequences would be if something were built wrong.</p>
    <h2>CM2 or CM3: which does a house need?</h2>
    <p>Most homes, extensions and residential structures in Auckland are monitored at <b>CM2</b> or <b>CM3</b>. CM2 suits smaller, routine work by an experienced builder: the engineer reviews a sample of each important stage and relies on the builder carrying the same standard through the rest. CM3 suits a medium-sized routine project and involves more of the important work being checked before it is covered. In practice both mean a planned set of site visits at the hold points agreed at the start, a written report after each one, and a PS4 at the end.</p>
    <h2>What does construction monitoring cost?</h2>
    <p>Monitoring is priced per site visit or as a fixed package for the whole build, agreed up front: most single-dwelling projects need three to six visits plus the PS4, and the required CM level in your consent sets the visit count more than anything else. Send us your consent conditions and we will quote the full monitoring scope as one fixed number. The honest comparison is not against zero: it is against the cost of rebuilding covered-up work that failed a council inspection, which is always more.</p>
    <h2>Construction supervision in South and East Auckland</h2>
    <p>Being based in Botany means building sites in South Auckland and East Auckland (Flat Bush, Howick, Pakuranga, Manukau, Papatoetoe, Takanini and surrounds) get genuinely responsive coverage: an engineer who can be on site quickly when the concrete truck is booked for tomorrow morning. For projects further afield we plan monitoring visits around the construction programme, and we supervise builds nationwide.</p>
    <h2>How monitoring fits your build programme</h2>
    <p>At engagement we agree the hold points with you and your builder: the stages that must not proceed until they are inspected. Typical residential hold points are foundation excavation, footing reinforcement before pour, subfloor or slab steel, structural framing before lining, and retaining drainage before backfill. Your builder gives us a day or two of notice as each stage approaches; we inspect, report the same day, and the build carries straight on. Done this way, monitoring costs the programme nothing: the inspections slot into gaps that exist anyway between trades.</p>
    <h2>When something on site is not right</h2>
    <p>It happens on most builds: reinforcing in the wrong place, a substituted beam, ground that does not match the borelog. What matters is what happens next. We document the issue, design the fix (often on the spot), and confirm it at the next visit, keeping a clear paper trail so the PS4 at the end is honest and defensible. Builders tend to like working with us for exactly this reason: problems get solved in hours, not buried in emails.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['What is the difference between monitoring and a one-off inspection?', 'A one-off inspection answers a single question. Construction monitoring is a planned series of stage inspections across the build, ending in a PS4. Council conditions usually require the latter for engineered designs. For single visits, see our <a href="site-inspections.html">site inspections</a>.'],
      ['What is CM2 construction monitoring?', 'CM2 is the level where the engineer reviews a sample of each important work procedure, material and component, and a representative sample of completed work before it is covered. It suits smaller, routine projects with an experienced builder, which covers many houses and extensions.'],
      ['Who decides the construction monitoring level?', 'The design engineer, based on the size and complexity of the project, the builder, and the consequences of anything going wrong. It is recorded with the consent documentation, and the engineer who monitors the build issues the PS4 at the end.'],
      ['Can you supervise a design by another engineer?', 'Yes, subject to reviewing the design first. We regularly pick up monitoring for projects where the original designer is unavailable.'],
      ['Who books the inspections?', 'Your builder calls us at the agreed hold points, typically a day or two ahead. We fit site visits around concrete pours and council inspections so the programme never slips on our account.'],
      ['Do you issue the PS4 at the end?', 'Yes. Once the monitored work is complete and any items closed out, we issue the PS4 council needs for your Code Compliance Certificate.'],
    ])}
    <h2>Who engages us for supervision</h2>
    <p>Homeowners building or renovating engage us so someone technical is watching their biggest investment. Builders engage us because consent conditions demand monitoring and they want an engineer who answers the phone and turns up. Architects and designers engage us to protect their design intent through construction. Whoever holds the contract, the service is the same: planned inspections, fast answers, honest reports and a PS4 at the end that means something.</p>
    <h2>The engineer on your side of the fence</h2>
    <p>A build is a thousand small decisions made quickly. Supervision means those decisions get made with an engineer in the loop, your documentation arrives complete at the end, and nobody is arguing with council about covered-up work a year later.</p>`,

  /* ---- Site Inspections — GSC 30 Sep 2026 (60 days): 35 queries, 340 impressions, 0 clicks. PS4 cluster:
     "what is a ps4 in construction" 7.0, "ps4 in construction" 4.2, "ps4 construction" 9.5, "ps4 building" 11,
     "ps4 construction review nz" 37.2 (50 impr); "concrete inspection services" 14.6. ("structural inspection" is mostly UK noise.) ---- */
  'site-inspections': (base) => `
    <p style="font-size:17px">A structural site inspection is an engineer's independent check of structural work at a critical stage: before the concrete pour, before the framing is lined, before anything is buried or covered. We carry out inspections across Auckland and New Zealand-wide, leave a written record on site after every visit, and issue the PS4 construction review your council needs for Code Compliance.</p>
    ${byline(base, 'Updated 30 September 2026')}
    <h2>Which stages need a structural inspection?</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Foundation excavations: confirming bearing before footings are poured</span></li>
      <li>${si('check', 2.2)}<span>Reinforcing steel: placement, cover and laps checked against the drawings</span></li>
      <li>${si('check', 2.2)}<span>Structural framing, beams and connections before linings close them in</span></li>
      <li>${si('check', 2.2)}<span>Retaining wall construction and drainage before backfill</span></li>
      <li>${si('check', 2.2)}<span>Remedial and pre-purchase structural assessments</span></li>
    </ul>
    <h2 id="ps4">What is a PS4 in construction?</h2>
    <p>A <b>PS4 (Producer Statement, Construction Review)</b> is the formal statement from the design professional who reviewed the builder's work, confirming that the building work was carried out in accordance with the consented plans and the New Zealand Building Code. Council relies on it before issuing your Code Compliance Certificate whenever the consent called for engineering involvement in construction, such as foundations, steel placement, fill compaction or specifically designed structure.</p>
    <p>A PS4 can only be issued for work the engineer actually observed, which is why booking inspections at the right stages matters: an engineer cannot review work that is already buried.</p>
    <h2>Who can issue a PS4?</h2>
    <p>The PS4 comes from the design professional engaged to observe construction. That can be the original designer, a peer reviewer, or an independent, suitably qualified person agreed with Council. Councils often make it a condition of consent that a Chartered Professional Engineer (CPEng) monitors the structural work and issues the PS4.</p>
    <p>In Auckland, Council's <a href="https://www.aucklandcouncil.govt.nz/building-and-consents/building-consents/producer-statement-authors/Documents/ac2301-producer-statement-policy.pdf" target="_blank" rel="noopener">producer statement policy</a> sets out the detail. Producer statements are accepted at Council's discretion from authors on its Producer Statement Register. After every inspection the engineer must leave a site record describing what was inspected, the findings and any instructions given to the builder, so the council inspector can see it. The PS4 is then supplied as soon as practical after the work is complete, backed by those records.</p>
    <h2>PS1, PS2, PS3 and PS4 at a glance</h2>
    <div class="cm-table-wrap">
      <table class="cm-table ps-table">
        <caption>New Zealand producer statements, as described in Auckland Council's producer statement policy</caption>
        <thead><tr><th scope="col">Statement</th><th scope="col">Issued by</th><th scope="col">What it confirms</th></tr></thead>
        <tbody>
          <tr><th scope="row">PS1 Design</th><td>The design professional</td><td>The building work as designed and documented complies with the Building Code.</td></tr>
          <tr><th scope="row">PS2 Design review</th><td>A design professional who reviewed someone else's design</td><td>The design they reviewed complies with the Building Code.</td></tr>
          <tr><th scope="row">PS3 Construction</th><td>The contractor who did the work</td><td>Specialist work such as piling, waterproofing membranes or cladding systems was built to the consented plans.</td></tr>
          <tr><th scope="row">PS4 Construction review</th><td>The design professional who reviewed the contractor's work</td><td>The building work was carried out in accordance with the consented plans and the Building Code.</td></tr>
        </tbody>
      </table>
    </div>
    <p>The design side is covered in more depth in our guide <a href="${base}guides/what-is-a-ps1.html">What is a PS1?</a></p>
    <h2>What does a site inspection cost?</h2>
    <p>A single inspection with a written report is priced by location and scope, quoted fixed when you book, with PS4 documentation priced within a monitoring package rather than per visit. For projects outside Auckland we quote travel transparently, and for construction monitoring across a whole build our <a href="construction-supervision.html">construction monitoring service (CM2 and CM3)</a> is usually the better-value structure.</p>
    <h2>Pre-pour concrete inspections</h2>
    <p>The most common inspection we do is the pre-pour: the last chance to check foundation and slab reinforcing before concrete makes it invisible forever. We check bar sizes and spacing against the drawings, cover to the steel (the concrete depth that protects it from corrosion), lap lengths, starter bars and hold-down fixings, penetrations and setdowns, and the footing dimensions and bearing. Anything out is fixed while the formwork is still open, and the pour goes ahead on time.</p>
    <h2>How an inspection visit works</h2>
    <p>Your builder (or you) books the inspection a day or two ahead, telling us the stage and what is being covered up. On site, the engineer checks the work against the consented drawings: dimensions, materials, reinforcing placement and cover, fixings and connections, drainage falls. Anything that does not match is identified immediately and a fix agreed, usually while everyone is still standing next to it. You receive a written report the same day recording what was inspected, what was found and what, if anything, must change before the stage proceeds.</p>
    <h2>What the written report gives you</h2>
    <p>Each report states the date, stage, drawings referenced, observations and outcome, which builds the evidence chain behind the final PS4. That paper trail matters beyond council: it is what a future buyer's lawyer, an insurer or a dispute resolver will ask for when questions arise years later. Owners who keep our inspection reports with their property records are consistently glad they did.</p>
    <h2>What if the work was covered before it was inspected?</h2>
    <p>It happens: the slab is poured or the linings go on before anyone calls the engineer. The engineer can only sign a PS4 for what they observed, so a missed hold point usually means opening up the work, testing, or collecting other evidence, and council decides what it will accept. It is always cheaper to book the inspection. If a hold point has already been missed, call us before anything else is covered and we will work out the most practical way forward.</p>
    <h2>Inspections anywhere in New Zealand</h2>
    <p>Most of our inspection work is in Auckland, but engineered builds happen everywhere, and regional projects from Waikato to Queenstown regularly need independent PS4 construction review. We support remote projects with planned inspection visits scheduled around your critical stages, so distance never becomes a compliance gap.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['The builder says council inspects anyway. Why add an engineer?', 'Council inspectors check Code minimums; they do not verify specific engineering design, and they will ask for the engineer’s PS4 on engineered elements. The two inspections do different jobs.'],
      ['Can I book a one-off inspection?', 'Yes. Single inspections with a written report are common for retaining walls, decks and remedial questions. If a PS4 is needed across multiple stages, we will say so up front.'],
      ['How much notice do you need?', 'For Auckland sites, a day or two is usually enough. Booking the sequence of hold points at the start of the build is even better.'],
      ['Can you inspect a problem in an existing house?', 'Yes. We assess cracking, sagging, leaks with structural implications and other concerns, and report with clear next steps.'],
      ['What is the difference between a PS3 and a PS4?', 'A PS3 comes from the contractor who did the work, usually for specialist items such as piling or waterproofing membranes. A PS4 comes from the design professional who reviewed the contractor’s work on site. They are different people confirming different things.'],
      ['What does the engineer leave on site after an inspection?', 'A written site record of what was inspected, what was found and any instructions given to the builder. Auckland Council expects it to be left on site so the council inspector can review it, and the records together support the final PS4.'],
      ['Do I need a PS4 for my Code Compliance Certificate?', 'If your consent conditions call for engineering construction monitoring or a PS4, yes: council will ask for it before issuing Code Compliance. Your consent documents will say. Send them to us if you are unsure.'],
    ])}
    <h2>Beyond new builds: assessments of existing structures</h2>
    <p>Inspections are not only for construction. We assess existing houses and structures for buyers before purchase, for owners worried about cracking or movement, and for insurers and lawyers who need an engineer's written opinion. The output is the same discipline applied to an existing building: a clear report stating what we observed, what it means structurally, and what to do about it, with costs and urgency ranked honestly.</p>
    <h2>Independent eyes at the moments that matter</h2>
    <p>Structural problems are cheap to fix at inspection and expensive to fix at discovery. An hour of engineering eyes at the right stage is the best money on the whole build programme.</p>`,

  /* ---- Structural Design (expanded Nov 2026 from a 280-word template page) ---- */
  'structural-design': (base) => `
    <p style="font-size:17px">Structural design is the engineering that holds a building up: the foundations, framing, beams, columns, bracing and connections that carry every load safely to the ground. We are chartered structural engineers in Botany, Auckland, designing new homes, additions, alterations and commercial buildings, and preparing the drawings, calculations and PS1 your building consent needs.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <h2>When do you need a structural engineer?</h2>
    <p>Most New Zealand houses are framed to NZS 3604, the standard for light timber-framed buildings, which lets a designer size many members straight from tables. A structural engineer is needed wherever a design goes beyond what that standard covers. The common triggers:</p>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Removing or opening up a load-bearing wall</span></li>
      <li>${si('check', 2.2)}<span>Steel beams, portal frames and long or open-plan spans</span></li>
      <li>${si('check', 2.2)}<span>Sloping, soft or filled ground, and foundations near retaining walls or boundaries</span></li>
      <li>${si('check', 2.2)}<span>Concrete and masonry walls, suspended slabs and basements</span></li>
      <li>${si('check', 2.2)}<span>Heavy loads such as roof-top decks, spa pools, large water tanks or green roofs</span></li>
      <li>${si('check', 2.2)}<span>Multi-unit, commercial and industrial buildings</span></li>
    </ul>
    <p>Your designer or council will usually flag these. If you are not sure, send us your plans and we will tell you straight whether specific engineering is needed, and what it covers.</p>
    ${guideLink(base, 'guides/what-is-a-ps1.html', 'Guide: What is a PS1? Producer statements explained')}
    <h2>What our structural design includes</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Foundation and footing design, sized for your ground and loads</span></li>
      <li>${si('check', 2.2)}<span>Timber, steel and concrete framing members: beams, lintels and columns</span></li>
      <li>${si('check', 2.2)}<span>Bracing design to resist wind and earthquake</span></li>
      <li>${si('check', 2.2)}<span>Connection details your builder can follow on site</span></li>
      <li>${si('check', 2.2)}<span>A full calculation set, with structural drawings that match it</span></li>
      <li>${si('check', 2.2)}<span>A PS1 signed by a Chartered Professional Engineer, and responses to council requests for information</span></li>
    </ul>
    <h2>Removing a load-bearing wall</h2>
    <p>Opening up a kitchen and living area is one of the most common jobs we do. Taking out a load-bearing wall needs a beam to carry what the wall held up, posts and footings to carry the beam, and often replacement bracing, because many internal walls also brace the house against wind and earthquake. Under the Building Act, work on an internal wall needs building consent when the wall is load-bearing or a bracing element. We design the beam and its supports, check the bracing, and provide the drawings and PS1 for consent.</p>
    ${guideLink(base, 'guides/removing-load-bearing-wall-nz.html', 'Guide: Removing a load-bearing wall in NZ')}
    <h2>Foundations and the ground</h2>
    <p>Every load ends up in the ground, so foundations are designed for what is actually under your site. Much of Auckland is clay that swells when wet and shrinks when dry, and some sections sit on fill or slopes. Depending on the site we design timber piles, concrete pads and strip footings, slabs on grade, rib raft slabs or deeper piles. For most houses we can design from conservative published soil values. Where the ground is soft, filled, sloping or expansive, a geotechnical report sharpens the design, and we will tell you up front if one is genuinely needed.</p>
    <h2>Bracing against wind and earthquake</h2>
    <p>Gravity is only half the job. A building must also resist sideways loads from wind and earthquake, which in a timber house is done by bracing walls, and around large openings by steel or timber portal frames. Open-plan layouts, big glazed walls and garage doors all take bracing away, so we design where it goes back in. Loads come from the AS/NZS 1170 loading standards, with earthquake actions to NZS 1170.5, and each material is designed to its own standard: NZS 3603 for timber, NZS 3404 for steel and NZS 3101 for concrete.</p>
    <h2>How long does structural design take?</h2>
    <p>For straightforward residential elements, such as a beam, a deck or a wall removal, allow <b>one to two weeks</b> from receiving your plans to consent-ready drawings, calculations and PS1. Full packages for a new house typically take <b>three to six weeks</b>. Once lodged, council has 20 working days to decide on your consent, a clock that pauses whenever it asks for more information.</p>
    ${guideLink(base, 'guides/building-consent-timeframes-auckland.html', 'Guide: How long does building consent take in Auckland?')}
    <h2>What does structural design cost?</h2>
    <p>The fee follows the scope: the number of engineered elements, the ground, how complete the architectural drawings are, and whether steel, concrete or geotechnical input is involved. We quote a <b>fixed fee in writing before we start</b>, usually within one business day of receiving your plans, so the number does not move mid-project.</p>
    <h2>What we need to start</h2>
    <p>Your architectural or draughting drawings (PDF or CAD), the site address, and any geotechnical report that already exists. If your designer is still drawing, bring us in now: designing the structure alongside the architecture costs less than fitting it in afterwards. Architects and builders can see <a href="${base}builders-architects.html">how we work with design teams</a>.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['My plans follow NZS 3604. Do I still need an engineer?', 'Possibly not for the whole house. NZS 3604 covers most standard timber framing, and only the parts outside it need specific engineering, such as a steel beam or a larger opening. We will tell you which parts need us before you pay for anything.'],
      ['Can you work with my architect or draughtsperson?', 'Yes. Most of our structural design sits behind plans from architects, designers and draughtspeople. We coordinate directly with them so the drawings and calculations stay in step.'],
      ['Do you design steel and concrete as well as timber?', 'Yes: timber, structural steel, light-gauge steel, reinforced concrete and masonry, for new buildings, alterations and strengthening work.'],
      ['Who answers council’s questions about the structure?', 'We do. If council issues a request for information about the engineering, we respond directly so your consent keeps moving.'],
    ])}
    <h2>Designed to be built</h2>
    <p>${CLOSES['structural-design']}</p>`,

  /* ---- Civil Design (expanded Nov 2026) ---- */
  'civil-design': (base) => `
    <p style="font-size:17px">Civil design is the engineering of the ground around a building: how your site handles stormwater, drainage, earthworks, driveways and access. We design civil works for houses, subdivisions and commercial sites from our base in Botany, Auckland, and prepare the drawings and calculations council needs for building and resource consent.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <h2>What civil design covers</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span><b>Stormwater.</b> Collecting roof and paving runoff and getting it safely to soakage, a tank or the public network</span></li>
      <li>${si('check', 2.2)}<span><b>Drainage.</b> Subsoil and surface drainage that keeps water away from foundations and retaining walls</span></li>
      <li>${si('check', 2.2)}<span><b>Earthworks.</b> Cut, fill and site levels, coordinated with the foundations and retaining</span></li>
      <li>${si('check', 2.2)}<span><b>Erosion and sediment control.</b> Keeping soil on site while it is being built</span></li>
      <li>${si('check', 2.2)}<span><b>Driveways and access.</b> Gradients, edges, crossings and vehicle loads</span></li>
      <li>${si('check', 2.2)}<span><b>Land development.</b> Civil engineering input for subdivisions and multi-unit sites</span></li>
    </ul>
    <h2>Stormwater on Auckland sites</h2>
    <p>New roofs and paving send more water off a site, and faster, and Auckland Council expects that water to be managed. Depending on where the site is and what lies downstream, that can mean connecting to the public stormwater network, soakage into the ground, or tanks that hold water back and release it slowly. The Auckland Unitary Plan sets on-site stormwater management requirements in some areas, so the answer is site-specific. We work out what applies to your property and size the system to suit.</p>
    <h2>Earthworks and sediment control</h2>
    <p>Moving soil changes how a site drains and how stable it is. We design cut and fill levels that work with the building and its retaining walls, and erosion and sediment controls that keep soil out of neighbours’ properties and stormwater drains during construction. Larger earthworks can also trigger Auckland Unitary Plan rules that need resource consent, so we flag that early rather than at lodgement.</p>
    <h2>Driveways and vehicle access</h2>
    <p>Steep driveways, crossings and turning areas need to work for real cars and delivery trucks. We design gradients and edges, any retaining that holds a driveway up, and the drainage that keeps water off it. A new or altered vehicle crossing onto a public road in Auckland also needs approval from Auckland Transport, which your civil drawings support.</p>
    <h2>Sloping and difficult sites</h2>
    <p>Slopes, overland flow paths and flood-prone land are where civil and structural design meet. We look at where water goes in a heavy storm as well as day to day, coordinate with geotechnical engineers on slope stability, and design retaining, drainage and foundations together so each supports the others.</p>
    ${guideLink(base, 'services/retaining-walls.html', 'Engineered retaining walls in Auckland')}
    <h2>How civil design fits your consent</h2>
    <p>Civil drawings and calculations are lodged with your building consent, and with a resource consent where one is needed. Because we also do the structural engineering, the civil and structural packages are drawn together and agree with each other, which avoids a common cause of council requests for information. See our <a href="building-consent-documentation.html">building consent documentation service</a> for the rest of the package.</p>
    <h2>Timing and cost</h2>
    <p>For a single house, civil design usually runs alongside the structural design. Subdivisions and larger sites take longer and depend on council and utility requirements. Either way, we quote a <b>fixed fee in writing before we start</b>, usually within one business day of receiving your plans.</p>
    <h2>What we need to start</h2>
    <p>The site address, your architectural or site plans, a survey with levels if you have one, and any geotechnical report. For stormwater, it helps to know where the property drains today and whether there is a public stormwater connection nearby. From that we confirm the scope and quote a fixed fee, usually within one business day.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['Do I need a civil engineer for a new house?', 'Often, for stormwater, drainage and driveway design, particularly on sloping sites or where the house adds a lot of roof and paving. On a simple flat site your designer and drainlayer may cover it. We can tell you which applies.'],
      ['Can you design stormwater tanks and soakage?', 'Yes. We size detention and retention tanks and soakage systems to suit the site and the council’s requirements.'],
      ['Do you work on subdivisions?', 'Yes. We provide civil and structural engineering input for subdivisions and multi-unit developments, working alongside your surveyor and planner.'],
    ])}
    <h2>Getting the ground right</h2>
    <p>${CLOSES['civil-design']}</p>`,

  /* ---- Swimming Pools (expanded Nov 2026). Barrier rules checked against
     Building Act s162C/s162D and Building Code F9 on legislation.govt.nz. ---- */
  'swimming-pools': (base) => `
    <p style="font-size:17px">A swimming pool is a structure that holds water pressure from the inside and soil pressure from the outside, and on a sloping Auckland section it often comes with retaining walls and a deck. We provide structural design for in-ground pools, pool surrounds and the retaining and barriers around them, with the drawings, calculations and PS1 council needs.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <h2>Does a pool need consent and a barrier?</h2>
    <p>Most new in-ground pools need a building consent. Every residential pool that holds water must also have physical barriers that restrict access by unsupervised children under 5 years of age, under <a href="https://www.legislation.govt.nz/act/public/2004/72/en/latest/" target="_blank" rel="noopener">section 162C of the Building Act</a> and clause F9 of the Building Code, and councils must inspect residential pool barriers at least once every three years. Small heated pools, such as spa pools, can meet the rules with a compliant safety cover instead of a fence.</p>
    <h2>What the engineer designs</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>The pool shell: reinforced concrete or concrete block walls and floor</span></li>
      <li>${si('check', 2.2)}<span>Pools on slopes, beside the house or near a boundary, where the pool loads the ground next to it</span></li>
      <li>${si('check', 2.2)}<span>Groundwater and uplift: an empty pool in wet ground can float, so the design resists it</span></li>
      <li>${si('check', 2.2)}<span>Retaining walls around the pool and on the downhill side</span></li>
      <li>${si('check', 2.2)}<span>Pool surrounds, decks and the structure under paving</span></li>
      <li>${si('check', 2.2)}<span>Barrier and balustrade structure, including glass fence posts and fixings</span></li>
    </ul>
    <h2>Pools on sloping sites</h2>
    <p>On a slope, part of the pool is usually below ground and part is held up by retaining or a suspended structure. That changes the loads on every wall: the high side carries soil pressure when the pool is empty, the low side carries water pressure when it is full, and both must keep working for decades. We design the pool and its retaining together so they share loads properly instead of fighting each other.</p>
    ${guideLink(base, 'guides/retaining-wall-consent-nz.html', 'Guide: When does a retaining wall need consent in NZ?')}
    <h2>Pools near houses and boundaries</h2>
    <p>A pool dug next to existing foundations can undermine them, and a pool near a boundary affects the neighbour’s ground. We check the zone of influence around the excavation, design temporary support where it is needed, and make sure the pool does not load your house, or the one next door, in ways it was never designed for.</p>
    <h2>How the process runs</h2>
    <p>We review your pool layout and site, design the shell, retaining and surrounds, and issue drawings, calculations and a PS1 for consent. During construction we inspect the reinforcing steel before concrete is poured, and any other stages your consent names, then issue the PS4 council needs before code compliance. Design for a residential pool usually takes one to two weeks once we have the layout, longer where it comes with significant retaining.</p>
    <h2>What affects the cost</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span><b>Size and depth</b> of the pool</span></li>
      <li>${si('check', 2.2)}<span><b>Slope</b>, and how much retaining the site needs</span></li>
      <li>${si('check', 2.2)}<span><b>Ground and groundwater</b> conditions</span></li>
      <li>${si('check', 2.2)}<span><b>How close</b> the pool sits to buildings and boundaries</span></li>
      <li>${si('check', 2.2)}<span><b>Surrounds and barriers</b>: decks, paving and glass fencing</span></li>
    </ul>
    <p>We quote a <b>fixed engineering fee in writing before we start</b>, usually within one business day.</p>
    <h2>What we need to start</h2>
    <p>Your pool layout or the pool builder’s drawings, the site address, photos of the area and the levels if you have them, and any geotechnical report. Tell us what sits near the pool: the house, a boundary, a driveway or a slope. If the pool is still an idea, we can advise on where it can go and what that means for the structure before you commit.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['Does a fibreglass pool need an engineer?', 'The shell is designed by its manufacturer, but on a slope, near a building or with retaining, the excavation, retaining and surrounds still need engineering. We design those parts.'],
      ['Do you design the pool fence?', 'We design the structure of barriers and balustrades, such as posts, fixings and glass support, and check the layout against clause F9. The pool builder or fencing supplier usually supplies the barrier itself.'],
      ['Can a pool sit above a retaining wall?', 'Yes, with engineering. A pool above a wall is a heavy surcharge, so the wall is designed for it from the start.'],
    ])}
    <h2>Built to hold</h2>
    <p>${CLOSES['swimming-pools']}</p>`,

  /* ---- Decks (expanded Nov 2026). The 1.5 m exemption (Building Act Schedule 1
     clause 24) and the 1 m barrier rule (Building Code F4.3.1) checked on
     legislation.govt.nz. ---- */
  'decks-outdoor-living': (base) => `
    <p style="font-size:17px">Decks look simple, but a raised or cantilevered deck carries people, furniture, spa pools and wind, and an under-designed one can fail without warning. We engineer deck subframes, posts, footings, cantilevers and barriers across Auckland, and provide the drawings, calculations and PS1 for consent.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <h2>Does a deck need consent?</h2>
    <p>Under Schedule 1 of the Building Act, a deck is exempt from building consent when it is not possible to fall more than 1.5 metres from it, <b>even if it collapses</b>. Above that it needs consent, and high, cantilevered or heavily loaded decks need specific engineering. Separately, the Building Code requires a barrier wherever people could fall 1 metre or more, so many exempt decks still need a compliant balustrade. Exempt work must still comply with the Building Code.</p>
    ${guideLink(base, 'guides/deck-consent-nz.html', 'Guide: Does my deck need consent or an engineer?')}
    <h2>When a deck needs real engineering</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Decks more than 1.5 metres above the ground beneath them</span></li>
      <li>${si('check', 2.2)}<span>Cantilevered decks with no posts at the outer edge</span></li>
      <li>${si('check', 2.2)}<span>Decks fixed to the house, where the connection carries load and must stay weathertight</span></li>
      <li>${si('check', 2.2)}<span>Heavy loads: spa pools, large planters, outdoor kitchens or big gatherings</span></li>
      <li>${si('check', 2.2)}<span>Decks on slopes, over retaining walls or near boundaries</span></li>
      <li>${si('check', 2.2)}<span>Roof-top decks over living spaces</span></li>
    </ul>
    <h2>What we design</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Bearers, joists and the subframe layout</span></li>
      <li>${si('check', 2.2)}<span>Posts, piles and footings sized for your ground</span></li>
      <li>${si('check', 2.2)}<span>Cantilevers and their back-span into the house or frame</span></li>
      <li>${si('check', 2.2)}<span>The connection to the house, including the weathertightness detail</span></li>
      <li>${si('check', 2.2)}<span>Balustrade and barrier posts, glass support and fixings</span></li>
      <li>${si('check', 2.2)}<span>Drawings, calculations and a PS1 for consent</span></li>
    </ul>
    <h2>Built for New Zealand weather</h2>
    <p>Outdoor timber is specified by hazard class under NZS 3602, typically H3.2 for joists and bearers above ground and H4 or H5 for posts and piles in the ground, depending on what they hold up. Fixings matter as much as the timber, especially near the coast, where stainless steel may be needed. We specify both so the deck lasts as long as the house.</p>
    <h2>Barriers and balustrades</h2>
    <p>A barrier has to resist people leaning and falling against it, so its posts and fixings are part of the structure, not decoration. We design balustrade posts, glass support and their connection into the deck framing, which is where most barrier problems start.</p>
    <h2>Pergolas and outdoor structures</h2>
    <p>Pergolas are exempt from building consent, but louvre roofs, canopies and shade structures catch the wind and lift. We design posts, beams and footings to hold them down in your site’s wind conditions, and connections that do not damage the house they attach to.</p>
    <h2>Timing and cost</h2>
    <p>A typical engineered deck takes one to two weeks from receiving your plans or sketch to consent-ready documentation. The fee depends on height, size, cantilevers, loads and ground, and we quote it as a <b>fixed fee in writing before we start</b>.</p>
    <h2>What we need to start</h2>
    <p>A plan or sketch with the deck’s size and height above the ground, photos of where it will go, and whether it will carry anything heavy, such as a spa pool or large planters. If it attaches to the house, a photo of that wall and its cladding helps. From that we confirm whether it needs consent or engineering and quote a fixed fee.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['Can I build a deck under 1.5 m without consent?', 'Usually, if no one could fall more than 1.5 metres even if the deck collapsed. It must still comply with the Building Code, including a barrier if the fall is 1 metre or more.'],
      ['Do you inspect decks during construction?', 'Yes. We inspect footings and framing at the stages your consent names, and issue a PS4 at the end.'],
      ['Can you assess an existing deck?', 'Yes. We assess sagging, bouncy or ageing decks and balustrades, and report on what needs repair or replacement.'],
      ['Can you design a deck from a sketch?', 'Yes. A sketch with dimensions and heights, plus photos of the site, is often enough to design a straightforward deck.'],
    ])}
    <h2>Engineered once, enjoyed for decades</h2>
    <p>${CLOSES['decks-outdoor-living']}</p>`,

  /* ---- Carports, Sheds & Portals (expanded Nov 2026). Exemption limits from
     Building Act Schedule 1 clauses 3, 4, 6 and 18-18A on legislation.govt.nz. ---- */
  'carports-sheds-portals': (base) => `
    <p style="font-size:17px">A portal frame is a rigid frame of columns and rafters that gives a building a clear span with no internal posts, which is why carports, garages, workshops, farm sheds and warehouses use them. We design steel and timber portal frames and light structures across Auckland and New Zealand, with the drawings, calculations and PS1 council needs.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <h2>Do carports and sheds need consent?</h2>
    <p>Schedule 1 of the Building Act exempts some small structures from building consent:</p>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span><b>Carports</b> at ground level up to 20 m², or up to 40 m² where a licensed building practitioner designs or builds it</span></li>
      <li>${si('check', 2.2)}<span><b>Single-storey detached buildings</b>, such as sheds, up to 10 m², with no sanitary facilities or potable water storage</span></li>
      <li>${si('check', 2.2)}<span><b>Detached buildings from 10 to 30 m²</b>, when built from lightweight materials to Acceptable Solution B1/AS1 or designed or built by a licensed building practitioner, with conditions on distance from boundaries and other buildings</span></li>
      <li>${si('check', 2.2)}<span><b>Pergolas</b>, of any size</span></li>
    </ul>
    <p>Exempt structures must still meet the Building Code, and planning rules may still apply. Anything bigger, closer to a boundary, or with long spans, steel portals or heavy use needs consent and specific engineering. The <a href="https://www.legislation.govt.nz/act/public/2004/72/en/latest/" target="_blank" rel="noopener">Building Act on legislation.govt.nz</a> sets out every condition.</p>
    <h2>How a portal frame works</h2>
    <p>Instead of relying on internal walls, a portal frame resists wind and earthquake through stiff connections at the knees and ridge, and through its base connections into the foundations. That makes the connections and footings the critical parts of the design. We design the frame members, haunches, base plates, purlins and girts, the bracing in the roof and walls, and footings that resist uplift and overturning, with loads to AS/NZS 1170, steel to NZS 3404 and timber to NZS 3603.</p>
    <h2>Wind is usually the governing load</h2>
    <p>Light buildings are more likely to be lifted or pushed over by wind than damaged by an earthquake. Large roller doors matter too: an open door lets wind pressurise the inside of the building, which adds to the uplift on the roof. We design for the doors you will actually have, and for the wind exposure of your site.</p>
    <h2>Carports attached to a house</h2>
    <p>An attached carport loads the house it is fixed to, and the connection has to carry uplift as well as weight without causing leaks. We check the existing structure, design the fixing, and keep the roof and gutter details weathertight.</p>
    <h2>Rural and large sheds</h2>
    <p>Farm sheds, implement sheds and workshops often need wide clear spans, mezzanines or large doors. We design efficient frames that use standard steel sections where possible, so your fabricator can price and build them without surprises.</p>
    <h2>Timing and cost</h2>
    <p>A carport or standard shed design typically takes one to two weeks from receiving your layout. Larger industrial buildings take longer and are scheduled with your builder or fabricator. We quote a <b>fixed fee in writing before we start</b>.</p>
    <h2>What we need to start</h2>
    <p>The building’s size and layout, door sizes and positions, the site address, and how the building will be used: a carport, storage, a workshop or rural use. If you have a kitset supplier or fabricator lined up, send their drawings too. From that we confirm whether consent is needed and quote a fixed fee, usually within one business day.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['Can I use a kitset shed?', 'Many kitset sheds come with engineering for set wind conditions. If your site is more exposed, the shed is altered, or council asks for site-specific design, we can review or redesign the frame and footings.'],
      ['Steel or timber portals?', 'Steel gives longer spans in slimmer members; timber suits smaller spans and a warmer look. We design both and recommend what suits your span and budget.'],
      ['Do you design the foundations too?', 'Yes. Portal footings carry uplift and overturning as well as weight, so we design them with the frame.'],
    ])}
    <h2>Clear spans that stay standing</h2>
    <p>${CLOSES['carports-sheds-portals']}</p>`,
};

/* ---------- Guides (Phase 3) ---------- */
const GUIDES = [
  {
    slug: 'what-is-a-ps1', title: 'What is a PS1? Producer Statements Explained', metaTitle: 'What is a PS1? Producer Statements Explained (NZ)',
    published: '2026-08-13', modified: CONTENT_DATE,
    label: 'What is a PS1?',
    desc: 'What a PS1 producer statement covers, how it differs from a PS4, who can issue one and when your NZ building consent needs it. By a chartered engineer.',
    eyebrow: 'Guide', h1: 'What is a PS1? Producer statements, <span class="hl">explained simply</span>',
    sub: 'What a PS1 actually covers, how it differs from a PS4, who can issue one, and what it should cost. Written by a chartered structural engineer.',
    body: (base) => `
    <p style="font-size:17px">A PS1 (Producer Statement, Design) is a formal statement signed by a qualified engineer confirming that a design complies with the New Zealand Building Code. Councils rely on producer statements instead of re-checking specialist engineering themselves, which makes the PS1 one of the most important documents in your building consent application.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <h2>The four producer statements, in one minute</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span><b>PS1, Design:</b> the designer's statement that the design complies with the Building Code. Lodged with your consent application.</span></li>
      <li>${si('check', 2.2)}<span><b>PS2, Design Review:</b> an independent engineer's peer review of someone else's design. Councils request it for complex or unusual structures.</span></li>
      <li>${si('check', 2.2)}<span><b>PS3, Construction:</b> the contractor's statement that they built the works in accordance with the design.</span></li>
      <li>${si('check', 2.2)}<span><b><a href="${base}services/site-inspections.html#ps4">PS4, Construction Review</a>:</b> the engineer's statement, after construction monitoring, that the built work matches the consented design. Council wants this before your Code Compliance Certificate.</span></li>
    </ul>
    <h2>When does a building consent need a PS1?</h2>
    <p>Whenever your project includes <b>specific engineering design</b>: anything outside the standard "acceptable solutions" such as NZS 3604 timber framing. Common triggers include removing a load-bearing wall, steel beams and portals, decks above 1.5 metres, retaining walls over 1.5 metres or carrying surcharge, swimming pools, difficult ground, and almost every commercial structure. If your project stays entirely within NZS 3604, you may not need one at all: a good engineer will tell you that for free rather than sell you paperwork you do not need.</p>
    <h2>Who can issue a PS1?</h2>
    <p>Producer statements are only worth what the signature behind them is worth. Councils generally accept PS1s from Chartered Professional Engineers (CPEng), the legally protected quality mark administered by Engineering New Zealand. At Stable Structure every PS1 is signed by our director, ${OWNER}, CPEng, a chartered structural engineer with more than 20 years of experience across New Zealand, Singapore and Sri Lanka.</p>
    <h2>How much does a PS1 cost in NZ?</h2>
    <p>The PS1 itself is the last page of a body of engineering work, so the real question is what the design behind it costs, and that scales with scope: a single engineered element is a far smaller job than complete structural design for a renovation or new build. Reputable engineers quote a fixed fee from your drawings before starting. Be wary of very cheap PS1s advertised online: a producer statement signed without real design work behind it is exactly the kind councils reject.</p>
    <h2>Is a PS1 a guarantee?</h2>
    <p>No, and it is worth understanding why. A PS1 is the designer's professional statement about the <i>design</i>. It does not certify the construction: that is the PS4's job, issued after the engineer has monitored the build. This is why councils commonly require both on engineered projects, and why we offer design, monitoring and PS4 as one continuous service, so nothing falls between the gaps.</p>
    <h2>Where the PS1 sits in your consent timeline</h2>
    <p>The sequence for a typical engineered residential project: your designer completes the architectural drawings, the engineer designs the structural elements and issues the PS1 (one to two weeks for simple scopes), the full package is lodged with council, and council's 20 working day clock starts. If engineering is engaged late, it becomes the critical path, so the cheapest schedule decision you can make is bringing the engineer in while the drawings are still being finished. To lodge, your engineer will need the current drawing set, the site address and any geotech report that exists: three things you can send in one email.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['My council asked for a PS1 after lodgement. Is that bad?', 'Not at all, it simply means an element of your design needs specific engineering. We can usually design the element and issue the PS1 within one to two weeks.'],
      ['Can a draughtsperson issue a PS1?', 'No. Producer statements for structural design need to come from a suitably qualified engineer, in practice a CPEng for council acceptance.'],
      ['Does a PS1 expire?', 'The statement itself does not carry an expiry, but if the design changes after issue, it must be re-confirmed or re-issued to match what is actually built.'],
      ['What does council do with the PS1?', 'It forms part of your consent documentation: council relies on it to grant consent for the engineered elements without independently re-checking the calculations.'],
    ])}
    <p>Once your documentation is lodged, our guide to <a href="${base}guides/building-consent-timeframes-auckland.html">building consent timeframes and RFIs</a> explains what happens next.</p>
    <h2>Sources</h2>
    <p class="sources">Check any CPEng engineer on <a href="${CPENG_REGISTER_URL}" target="_blank" rel="noopener">Engineering New Zealand’s CPEng register</a>. Building consent and code compliance are governed by the <a href="https://www.legislation.govt.nz/act/public/2004/72/en/latest/" target="_blank" rel="noopener">Building Act 2004</a>, and structural design must meet clause B1 of the <a href="https://www.legislation.govt.nz/secondary-legislation/pco-drafted/1992/150/en/latest/" target="_blank" rel="noopener">Building Code</a> (Schedule 1 of the Building Regulations 1992). This guide is general information, not advice for a specific site.</p>
    <h2>Need a PS1 for your project?</h2>
    <p>Send us your plans and we will confirm the scope, quote a fixed fee, and deliver consent-ready documentation with the PS1 signed by a chartered engineer. See our <a href="${base}services/building-consent-documentation.html">building consent documentation service</a> for what is included.</p>`,
  },
  {
    slug: 'retaining-wall-consent-nz', title: 'When Does a Retaining Wall Need Consent in NZ?', metaTitle: 'Retaining Wall Consent Rules NZ | Stable Structure',
    published: '2026-08-13', modified: CONTENT_DATE,
    label: 'Retaining wall consent rules',
    desc: 'NZ retaining wall consent rules in plain English: the 1.5 metre threshold, what counts as a surcharge, when you need an engineer and how the process works.',
    eyebrow: 'Guide', h1: 'When does a retaining wall need <span class="hl">consent in NZ?</span>',
    sub: 'The 1.5 metre rule, what surcharge actually means, and when a wall needs engineering. The plain-English version of the rules.',
    body: (base) => `
    <p style="font-size:17px">In New Zealand, a retaining wall needs building consent when it retains more than 1.5 metres of ground, or when it retains any height with a surcharge: extra load above the wall such as a driveway, building or sloping ground. That is the short answer. The details, and the traps, are below.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <h2>The 1.5 metre rule, precisely</h2>
    <p>The Building Act's Schedule 1 exempts a retaining wall from consent when it retains <b>no more than 1.5 metres depth of ground</b> and does not support any surcharge or load additional to the ground itself. Both conditions must hold. A 1.2 metre wall under a flat lawn is typically exempt; the same wall holding up the edge of a driveway is not, because vehicles are a surcharge.</p>
    <h2>What counts as a surcharge?</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Driveways, parking or vehicle access above the wall</span></li>
      <li>${si('check', 2.2)}<span>Buildings, sheds or pools within the wall's zone of influence</span></li>
      <li>${si('check', 2.2)}<span>Ground that slopes up and away behind the wall</span></li>
      <li>${si('check', 2.2)}<span>Another retaining wall stepping above (terraced walls load each other)</span></li>
    </ul>
    <p>If any of these sit behind your wall, treat it as needing engineering design and consent regardless of height.</p>
    <h2>Exempt from consent is not exempt from physics</h2>
    <p>Plenty of sub-1.5 metre walls are built without consent, badly, and Auckland's winters find them. Exemption removes the paperwork, not the loads: soil pressure, water pressure and time work on every wall. For walls near boundaries, above paths, or anywhere a failure would be expensive or dangerous, engineering design is cheap insurance even when the law does not demand it.</p>
    <h2>What does the engineering process look like?</h2>
    <p>For a consented wall the sequence is straightforward: we assess the site and ground conditions (sometimes with a geotech report for larger walls), design the wall in timber, concrete block or reinforced concrete, produce the drawings and calculations, and issue the PS1 for your consent application. During construction, council conditions typically require inspection of footings and drainage before backfill, ending in a PS4. Design fees scale with the wall's height, surcharge and ground conditions, and are quoted fixed before we start.</p>
    <h2>The council process, step by step</h2>
    <p>For a wall that needs consent, expect this sequence: engineering design and PS1 (typically one to two weeks), consent lodgement, council processing (20 working days, paused by any RFI), then construction with the inspections named in your consent conditions, usually footings or pole embedment and drainage before backfill. The engineer's PS4 after the final inspection is what unlocks your Code Compliance Certificate. Start to finish, a straightforward consented wall commonly runs eight to twelve weeks including council time, which is worth knowing before you book a contractor. Engineering fees are quoted fixed from your site details before any work begins.</p>
    <h2>Does this differ around the country?</h2>
    <p>The Building Act exemption is national, so the 1.5 metre and surcharge tests apply from Kaitaia to Bluff. What changes regionally is the engineering itself: ground conditions, seismic loads and council documentation preferences differ, which is why walls in Canterbury or Otago are designed to the same standards but not the same numbers as walls in Auckland. We design retaining walls for sites throughout New Zealand.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['Who is responsible if my neighbour’s wall fails onto my land?', 'Generally the owner of the land the wall retains, but boundaries make this legally messy fast. An engineering assessment gives you the facts before it becomes a dispute.'],
      ['Can I replace an old wall like-for-like without consent?', 'Only if the replacement itself meets the exemption tests (under 1.5m, no surcharge). The age of the old wall does not grandfather the new one.'],
      ['Do timber walls need engineering too?', 'Yes, when over 1.5m or surcharged. Timber pole walls are engineered structures: pole embedment, spacing and drainage all come from calculation, not habit.'],
      ['How tall can a retaining wall go?', 'With proper engineering, effectively as tall as your project needs: taller walls simply move into reinforced concrete, tiebacks or terraced designs with geotech input.'],
    ])}
    <h2>Sources</h2>
    <p class="sources">The exemption is clause 20 of Schedule 1 to the <a href="https://www.legislation.govt.nz/act/public/2004/72/en/latest/" target="_blank" rel="noopener">Building Act 2004</a>: a retaining wall that retains not more than 1.5 metres depth of ground and does not support any surcharge. Where people could fall 1 metre or more, clause F4 of the <a href="https://www.legislation.govt.nz/secondary-legislation/pco-drafted/1992/150/en/latest/" target="_blank" rel="noopener">Building Code</a> requires a barrier. This guide is general information, not advice for a specific site.</p>

    <h2>Get a straight answer on your wall</h2>
    <p>Send us a photo, a rough height and what sits above the wall, and we will tell you whether it needs consent, what design makes sense, and a fixed price for the engineering. Details on our <a href="${base}services/retaining-walls.html">engineered retaining wall design in Auckland</a>.</p>`,
  },
  {
    slug: 'deck-consent-nz', title: 'Does My Deck Need Consent or an Engineer in NZ?', metaTitle: 'Deck Consent Rules NZ: When You Need an Engineer',
    published: CONTENT_DATE, modified: CONTENT_DATE,
    label: 'Deck consent rules',
    desc: 'When an NZ deck needs building consent or an engineer: the 1.5 metre fall rule, when a barrier is required, cantilevers, spa pools and the process.',
    eyebrow: 'Guide', h1: 'Does my deck need <span class="hl">consent or an engineer?</span>',
    sub: 'The 1.5 metre rule, the 1 metre barrier rule, and the decks that need engineering whatever their height. Written by a chartered structural engineer.',
    body: (base) => `
    <p style="font-size:17px">In New Zealand, a deck needs building consent when it is possible to fall more than 1.5 metres from it, even if the deck collapses. Below that it is usually exempt, but it must still meet the Building Code, including a barrier wherever people could fall 1 metre or more. High, cantilevered and heavily loaded decks need specific engineering design.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <figure class="cm-holds" aria-labelledby="deck-steps-cap">
      <figcaption id="deck-steps-cap">Three questions for any deck</figcaption>
      <ol>
        <li><b>Could someone fall more than 1.5 m?</b><span>Even if the deck collapsed? If yes, it needs building consent</span></li>
        <li><b>Could someone fall 1 m or more?</b><span>If yes, the Building Code requires a barrier, consent or not</span></li>
        <li><b>Is it cantilevered, heavily loaded or on a slope?</b><span>If yes, it needs specific engineering design</span></li>
      </ol>
    </figure>
    <h2>The 1.5 metre rule, precisely</h2>
    <p>Schedule 1 of the Building Act exempts from consent building work on “a deck, platform, bridge, boardwalk, or the like from which it is not possible to fall more than 1.5 metres even if it collapses”. Two details catch people out. The fall is measured to the ground below the deck, not to the lawn by the house, so a deck on a falling slope can be under 1.5 metres at one end and well over it at the other. And “even if it collapses” means the test is about the height of the fall, not how strong the deck is.</p>
    <h2>The 1 metre barrier rule</h2>
    <p>Clause F4 of the Building Code requires a barrier where people could fall 1 metre or more. So a deck 1.2 metres off the ground can be exempt from consent and still need a compliant balustrade. Exempt is not the same as unregulated: exempt work must still comply with the Building Code.</p>
    <h2>Decks that need engineering</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Decks with a possible fall of more than 1.5 metres</span></li>
      <li>${si('check', 2.2)}<span>Cantilevered decks with no posts at the outer edge</span></li>
      <li>${si('check', 2.2)}<span>Spa pools, heavy planters, outdoor kitchens or other heavy loads</span></li>
      <li>${si('check', 2.2)}<span>Decks on slopes or above retaining walls</span></li>
      <li>${si('check', 2.2)}<span>Decks fixed to the house where the connection carries load</span></li>
      <li>${si('check', 2.2)}<span>Roof-top decks over living spaces</span></li>
    </ul>
    <h2>Decks attached to the house</h2>
    <p>A deck fixed to the house relies on that connection to carry part of its load, and the fixing passes through the cladding, so it affects weathertightness as well as strength. Many deck failures start at the connection. Whether or not your deck needs consent, the connection deserves proper detailing.</p>
    <h2>The process for a consented deck</h2>
    <p>We design the subframe, posts, footings, barrier and connections, and issue drawings, calculations and a PS1. Your consent is lodged, and council has 20 working days to decide, paused by any request for information. During construction, footings and framing are typically inspected, and the engineer’s PS4 supports your code compliance certificate. Design for a straightforward deck usually takes one to two weeks.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['Do I need consent to replace an old deck?', 'The new deck is assessed on its own merits: if a fall of more than 1.5 metres is possible, it needs consent, whatever the old deck had.'],
      ['Does a deck under 1 metre need a balustrade?', 'The Building Code requires a barrier where people could fall 1 metre or more, so a lower deck usually does not need one, though you can still choose to add one.'],
      ['Do I need an engineer for a low deck?', 'Usually not, if it follows NZS 3604. A spa pool, heavy planters or a cantilever change that, so tell your builder about any heavy loads before it is designed.'],
      ['Who builds a consented deck?', 'Your builder, working from the consented drawings. We inspect at the stages your consent names and issue the PS4.'],
    ])}
    <h2>Sources</h2>
    <p class="sources">The exemption is clause 24 of Schedule 1 to the <a href="https://www.legislation.govt.nz/act/public/2004/72/en/latest/" target="_blank" rel="noopener">Building Act 2004</a>. The barrier rule is clause F4.3.1 of the <a href="https://www.legislation.govt.nz/secondary-legislation/pco-drafted/1992/150/en/latest/" target="_blank" rel="noopener">Building Code</a>, Schedule 1 of the Building Regulations 1992. This guide is general information, not advice for a specific site.</p>
    <h2>Get a straight answer on your deck</h2>
    <p>Send a sketch with heights and a photo of the site, and we will tell you whether it needs consent or engineering and quote a fixed fee. See our <a href="${base}services/decks-outdoor-living.html">deck engineering service</a>.</p>`,
  },
  {
    slug: 'removing-load-bearing-wall-nz', title: 'Removing a Load-Bearing Wall in NZ: Engineer, Beam and Consent', metaTitle: 'Removing a Load-Bearing Wall in NZ | Stable Structure',
    published: CONTENT_DATE, modified: CONTENT_DATE,
    label: 'Removing a load-bearing wall',
    desc: 'How to tell if a wall is load-bearing, why bracing matters, what the engineer designs and when removing an internal wall needs building consent in NZ.',
    eyebrow: 'Guide', h1: 'Removing a <span class="hl">load-bearing wall</span> in NZ',
    sub: 'How to tell if a wall is load-bearing, why bracing matters, what the engineer designs, and when you need consent.',
    body: (base) => `
    <p style="font-size:17px">Removing or altering an internal wall in New Zealand needs building consent if the wall is load-bearing or a bracing element, and that work needs an engineer to design the beam, posts and footings that take its place. Most non-load-bearing internal walls can be altered without consent. The hard part is knowing which is which.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <h2>What the law says</h2>
    <p>Schedule 1 of the Building Act exempts building work on an internal wall in an existing building unless the wall is load-bearing, a bracing element, a fire separation wall, part of a specified system, or built of masonry units laid in mortar, such as brick or concrete block. If any of those apply, the work needs building consent.</p>
    <h2>How to tell if a wall is load-bearing</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>It runs at right angles to the floor or ceiling joists above it</span></li>
      <li>${si('check', 2.2)}<span>It sits near the middle of the house, under the ridge or a change in the roof line</span></li>
      <li>${si('check', 2.2)}<span>There is a wall, beam or post directly above it, or a foundation or concrete nib below it</span></li>
      <li>${si('check', 2.2)}<span>It is thicker than the other internal walls</span></li>
    </ul>
    <p>None of these is proof on its own. Roof trusses, for example, may span the whole house so that a central wall carries nothing, while an older house with a rafter roof may depend on it. An engineer confirms it from the drawings, a look in the ceiling space and under the floor, or both.</p>
    <h2>The wall you cannot see: bracing</h2>
    <p>Many internal walls brace the house against wind and earthquake even when they carry no weight. Lined walls with specific fixings count as bracing elements in the house’s bracing design, and removing one can leave the house short. The answer is to add bracing elsewhere or design a portal frame, which is part of what the engineer works out.</p>
    <h2>What the engineer designs</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>A beam sized for the loads above, in timber, LVL or steel</span></li>
      <li>${si('check', 2.2)}<span>Posts or columns at each end, and their connection to the beam</span></li>
      <li>${si('check', 2.2)}<span>Footings under the posts, so the load reaches the ground</span></li>
      <li>${si('check', 2.2)}<span>Replacement bracing if the wall was a bracing element</span></li>
      <li>${si('check', 2.2)}<span>Temporary propping while the wall comes out</span></li>
      <li>${si('check', 2.2)}<span>Drawings, calculations and a PS1 for consent</span></li>
    </ul>
    <h2>Can the beam be hidden in the ceiling?</h2>
    <p>Often, yes. A flush beam within the ceiling depth gives a clean opening, but it has to fit among the ceiling joists and may need steel to stay shallow. A dropped beam below the ceiling is usually simpler and cheaper. Where your house allows, we will show you both options.</p>
    <h2>How long it takes</h2>
    <p>Engineering for a wall removal typically takes one to two weeks from receiving plans and photos. Council then has 20 working days to decide on the consent, paused by any request for information. During construction, the beam, posts and footings are inspected at the stages your consent names.</p>
    ${guideLink(base, 'guides/building-consent-timeframes-auckland.html', 'Guide: How long does building consent take in Auckland?')}
    <h2>Common questions</h2>
    ${miniFaq([
      ['Can I remove the wall without consent if I am careful?', 'Not if it is load-bearing or a bracing element: that work needs consent. Unconsented structural work can cause problems when you sell or insure the house, and the structural risk is real.'],
      ['Is LVL or steel better for the beam?', 'LVL suits many residential spans and is easy for builders to work with. Steel carries more load in less depth, so it is the pick for long spans or flush beams. We size both and recommend one.'],
      ['What do you need from me?', 'Floor plans if you have them, photos of the wall and the ceiling space above it, and the address. From that we can usually confirm the scope and give a fixed quote.'],
    ])}
    <h2>Sources</h2>
    <p class="sources">The internal wall exemption is clause 11 of Schedule 1 to the <a href="https://www.legislation.govt.nz/act/public/2004/72/en/latest/" target="_blank" rel="noopener">Building Act 2004</a>. Structural work must meet clause B1 of the <a href="https://www.legislation.govt.nz/secondary-legislation/pco-drafted/1992/150/en/latest/" target="_blank" rel="noopener">Building Code</a>. This guide is general information, not advice for a specific site.</p>
    <h2>Planning to open up your house?</h2>
    <p>Send us plans or photos and we will confirm whether the wall is load-bearing, what it takes to remove it, and a fixed fee. See our <a href="${base}services/structural-design.html">structural design service</a>.</p>`,
  },
  {
    slug: 'building-consent-timeframes-auckland', title: 'How Long Does Building Consent Take in Auckland?', metaTitle: 'Building Consent Timeframes Auckland: 20 Days & RFIs',
    published: CONTENT_DATE, modified: CONTENT_DATE,
    label: 'Consent timeframes and RFIs',
    desc: 'Council has 20 working days to decide a building consent, and RFIs pause the clock. What slows Auckland consents, the 12-month lapse rule and code compliance.',
    eyebrow: 'Guide', h1: 'How long does <span class="hl">building consent</span> take in Auckland?',
    sub: 'The 20 working day clock, what pauses it, the 12-month lapse rule and code compliance, explained by a chartered engineer.',
    body: (base) => `
    <p style="font-size:17px">Under the Building Act, council has 20 working days to grant or refuse a building consent once it receives the application. That clock pauses whenever council asks for more information, so the real time from lodgement to consent depends mostly on how complete and consistent your documentation is.</p>
    ${byline(base, CONTENT_DISPLAY)}
    <figure class="cm-holds" aria-labelledby="bc-steps-cap">
      <figcaption id="bc-steps-cap">From design to code compliance</figcaption>
      <ol>
        <li><b>Design and PS1</b><span>One to two weeks for straightforward elements, three to six for a new house</span></li>
        <li><b>Lodge the consent</b><span>Council’s 20 working days start</span></li>
        <li><b>Requests for information</b><span>Each one pauses the clock until it is answered</span></li>
        <li><b>Build and inspections</b><span>Work must start within 12 months of the consent being issued</span></li>
        <li><b>Code compliance certificate</b><span>Council decides within 20 working days of your application</span></li>
      </ol>
    </figure>
    <h2>The 20 working day clock</h2>
    <p>Section 48 of the Building Act gives a building consent authority 20 working days after receiving an application to grant or refuse it. Working days exclude weekends and public holidays, and the Act also excludes every day from 20 December to 10 January, so an application lodged in early December takes longer than the calendar suggests.</p>
    <h2>What pauses it: requests for information</h2>
    <p>If council needs more information, it can ask within those 20 days, and the clock is suspended until it receives the answer. Every request for information (RFI) adds the time it takes to respond plus the time council takes to review the response, so a single RFI can add weeks.</p>
    <h2>Common reasons for engineering RFIs</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Drawings and calculations that disagree, such as a beam on the plan that never appears in the calculations</span></li>
      <li>${si('check', 2.2)}<span>A bracing design that does not match the floor plan</span></li>
      <li>${si('check', 2.2)}<span>Missing geotechnical information for foundations or retaining walls</span></li>
      <li>${si('check', 2.2)}<span>Details copied from another job that do not fit this one</span></li>
      <li>${si('check', 2.2)}<span>A producer statement that is missing or does not cover all the engineered work</span></li>
    </ul>
    <h2>How to keep the clock moving</h2>
    <p>Bring the engineer in while the drawings are being finished, not after. Have the drawings and calculations produced together so they agree. Include the geotechnical report if there is one, and make sure the PS1 covers everything that was specifically engineered. Our <a href="${base}services/building-consent-documentation.html">building consent documentation service</a> is built around exactly that, and we answer council’s engineering questions directly.</p>
    <h2>After consent: the 12-month rule</h2>
    <p>A building consent lapses if the work has not started within 12 months of the consent being issued, unless council allows a longer period. If your build might be delayed, talk to council before the year is up.</p>
    <h2>Inspections and code compliance</h2>
    <p>During construction, council inspects at the stages listed in your consent, and engineers carry out any construction monitoring it requires. When the work is finished you apply for a code compliance certificate, and council has 20 working days to decide whether to issue it, again paused by any request for information. If no one applies within two years of the consent being granted, council must make that decision anyway, so it pays to apply on time with your PS4 and other documents ready.</p>
    ${guideLink(base, 'services/construction-supervision.html', 'Construction monitoring and the PS4')}
    <h2>Common questions</h2>
    ${miniFaq([
      ['Can I start work while my consent is being processed?', 'No. Building work that needs a consent cannot start until the consent has been issued.'],
      ['Does a PIM speed up my consent?', 'A project information memorandum tells you about the site and other requirements before you design, which can prevent surprises, but it does not shorten council’s 20 working days.'],
      ['What if council asks about the engineering?', 'We respond directly to council on structural and civil questions, whether or not we produced the original design.'],
    ])}
    <h2>Sources</h2>
    <p class="sources">Processing times are in sections 48 (building consent) and 93 (code compliance certificate) of the <a href="https://www.legislation.govt.nz/act/public/2004/72/en/latest/" target="_blank" rel="noopener">Building Act 2004</a>, consent lapsing is section 52, and working days are defined in section 7. This guide is general information, not advice for a specific site.</p>
    <h2>Want your consent to go through first time?</h2>
    <p>Send us your plans and we will prepare engineering documentation that matches them, with a fixed fee quoted up front. See our <a href="${base}services/building-consent-documentation.html">PS1 and building consent documentation</a>.</p>`,
  },
];

/* ---------- Individual pages ---------- */
const pages = [];

/* HOME */
pages.push({
  file: 'index.html', base: '', active: 'home', lastmod: CONTENT_DATE,
  headO: { title: 'Structural Engineer Auckland | Stable Structure Limited', desc: 'Chartered structural and civil engineers in Botany, Auckland: structural design, PS1 consent documents, inspections and PS4. Fixed-fee quotes in one day.' },
  body: [
    homeHero(''),
    trustbar(),
    statsBlock(),
    `<section id="services" class="pad"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">What we do</span><h2 class="section-title">Full-service structural &amp; civil engineering</h2><p class="lead">One consultancy for the whole journey — design, documentation, consent and construction. Explore our services below.</p></div>
      ${servicesGrid('')}
    </div></section>`,
    `<section class="pad" style="background:var(--surface-2)"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Who we work with</span><h2 class="section-title">Engineering across every sector</h2><p class="lead">From a homeowner's first deck to a developer's commercial build, we bring the same rigour, clarity and compliance to every project.</p></div>
      ${sectorsBlock('')}
    </div></section>`,
    `<section class="pad">${whyBlock('')}</section>`,
    `<section class="pad" style="background:var(--surface-2)"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Client reviews</span><h2 class="section-title">Rated 5.0 on Google</h2><p class="lead">Our clients rate Stable Structure 5 stars for technical expertise, communication and attention to detail.</p></div>
      ${reviewsSummary()}
      <div style="margin-top:24px">${featuredReview()}</div>
      ${writtenReviews(3)}
      <div style="text-align:center;margin-top:36px" class="reveal"><a class="btn btn-ghost btn-lg" href="testimonials.html">Read all reviews ${si('arrow', 2.2)}</a></div>
    </div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* SERVICES overview */
pages.push({
  file: 'services.html', base: '', active: 'services', lastmod: '2026-09-24',
  headO: { title: 'Structural &amp; Civil Engineering Services, Auckland', desc: 'Structural design, PS1 consent documents, inspections, construction monitoring, retaining walls, pools, decks and portal frames, by CPEng engineers in Auckland.' },
  body: [
    pageHero('', { eyebrow: 'Our services', title: 'Structural &amp; civil engineering, end to end', sub: 'From foundations to final sign-off, we cover every stage of your project. Choose a service to see how we can help.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Services' }] }),
    `<section class="pad"><div class="container">${servicesGrid('')}
      <div class="callout reveal" style="margin-top:36px">
        <div><b>Planning a 70m² granny flat?</b><p>Since 15 January 2026 a small standalone dwelling can be built without a building consent. See our <a href="granny-flats.html">consent-exempt 70m² granny flat designs</a> and explore the 3D structural models behind them.</p></div>
        <a class="btn btn-primary" href="granny-flats.html">Granny flat designs ${si('arrow', 2.2)}</a>
      </div>
    </div></section>`,
    `<section class="pad-sm" style="background:var(--surface-2)"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Helpful guides</span><h2 class="section-title">Straight answers from our engineers</h2></div>
      <div class="guide-links reveal" style="max-width:640px;margin-inline:auto">
        ${GUIDES.map(g => `<a href="guides/${g.slug}.html">${si('consent', 2)} ${g.title}</a>`).join('\n        ')}
      </div>
      <div class="callout reveal" style="max-width:820px;margin:32px auto 0">
        <div><b>Architect, designer or builder?</b><p>Send us your plans for a fixed quote within one business day, then drawings, calculations and a PS1 that match your set.</p></div>
        <a class="btn btn-primary" href="builders-architects.html">How we work with design teams ${si('arrow', 2.2)}</a>
      </div>
    </div></section>`,
    `<section class="pad-sm process"><div class="container"><div class="section-head reveal"><span class="eyebrow">How it works</span><h2 class="section-title">A clear path from concept to completion</h2><p class="lead">A straightforward, transparent process that keeps you informed at every step.</p></div>${processSteps()}</div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* SECTORS */
pages.push({
  file: 'sectors.html', base: '', active: 'sectors',
  headO: { title: 'Residential, Commercial &amp; Industrial Engineering NZ', desc: 'Structural and civil engineering for homes and renovations, commercial and retail buildings, and industrial sheds and warehouses, across Auckland and NZ.' },
  body: [
    pageHero('', { eyebrow: 'Who we work with', title: 'Engineering across <span class="hl">every sector</span>', sub: 'The same rigour, clarity and compliance — whether it is a backyard deck or a commercial development.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Sectors' }] }),
    `<section class="pad"><div class="container">${sectorsBlock('')}</div></section>`,
    `<section class="pad-sm" style="background:var(--surface-2)"><div class="container"><div class="section-head center reveal"><span class="eyebrow">Whatever you are building</span><h2 class="section-title">Trusted by homeowners, developers &amp; builders</h2><p class="lead">Our clients include homeowners, property developers, commercial investors, construction companies, architects, designers and real estate professionals.</p></div>${reviewsSummary()}<div style="margin-top:24px">${featuredReview()}</div></div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* OUR PROJECTS — gallery of manual entries + hashtagged Facebook posts */
pages.push({
  file: 'projects.html', base: '', active: 'projects', lastmod: CONTENT_DATE,
  headO: { title: 'Recent Engineering Projects | Stable Structure', desc: 'Recent structural engineering projects by Stable Structure: new housing, commercial buildings, a helicopter hangar and more, across Auckland and New Zealand.' },
  body: [
    pageHero('', { eyebrow: 'Our projects', title: 'Recent work, <span class="hl">straight from site</span>', sub: 'A look at what we have been building — new builds, decks, retaining walls, carports and commercial projects from across New Zealand.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Our Projects' }] }),
    projectsSection(''),
    projectsVideo(),
    ctaBand('', { title: 'Have a project like these in mind?', waMsg: "Hi Stable Structure, I saw your projects and I'd like to enquire about mine." }),
  ].join('\n'),
});

/* ABOUT / WHY US */
pages.push({
  file: 'about.html', base: '', active: 'about', lastmod: CONTENT_DATE,
  headO: { title: 'About Our Engineers | Stable Structure, Auckland', desc: 'Meet the engineers at Stable Structure, a Kiwi-owned consultancy in Botany, Auckland, led by a Chartered Professional Engineer with 20+ years of experience.' },
  body: [
    pageHero('', { eyebrow: 'About us', title: 'Engineering you can <span class="hl">build on</span>', sub: 'A Kiwi-owned structural and civil engineering consultancy built on technical expertise, practical solutions and exceptional client service.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'About' }] }),
    teamSection(''),
    statsBlock(),
    `<section class="pad" style="background:var(--surface-2)">${whyBlock('')}</section>`,
    `<section class="pad-sm"><div class="container"><div class="section-head center reveal"><span class="eyebrow">Our promise</span><h2 class="section-title">Technical confidence, from concept to completion</h2><p class="lead">Stable Structure simplifies complex engineering challenges through practical, cost-effective solutions — while ensuring every project meets New Zealand building standards and compliance requirements. From concept to completion, you receive expert guidance and technical confidence at every stage.</p></div></div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* PROCESS */
pages.push({
  file: 'process.html', base: '', active: 'process',
  headO: { title: 'Our Engineering Process: Quote to PS4 | Stable Structure', desc: 'How we work: a fixed quote from your plans, design and PS1, support through building consent, then site inspections and the PS4 for code compliance.' },
  body: [
    pageHero('', { eyebrow: 'How it works', title: 'A clear path from <span class="hl">concept to completion</span>', sub: 'A straightforward, transparent process that keeps you informed and your project on track at every step.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Process' }] }),
    `<section class="pad process"><div class="container">${processSteps()}</div></section>`,
    `<section class="pad-sm"><div class="container"><div class="section-head center reveal"><span class="eyebrow">Every step covered</span><h2 class="section-title">What you can expect from us</h2></div>
      <div class="feature-list" style="max-width:760px;margin-inline:auto">
        <div class="feature"><div class="fic">${si('check', 2)}</div><div><h3 class="fh4">An upfront, transparent quote</h3><p>You will know the scope and cost before we begin — no surprises.</p></div></div>
        <div class="feature"><div class="fic">${si('consent', 2)}</div><div><h3 class="fh4">Clear, consent-ready documentation</h3><p>Drawings, calculations and PS1s prepared to move smoothly through council.</p></div></div>
        <div class="feature"><div class="fic">${si('users', 2)}</div><div><h3 class="fh4">A responsive point of contact</h3><p>Real engineering advice whenever you need it, throughout the project.</p></div></div>
        <div class="feature"><div class="fic">${si('supervision', 2)}</div><div><h3 class="fh4">Verified, supervised construction</h3><p>Site inspections and supervision so the build matches the design.</p></div></div>
      </div>
    </div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* TESTIMONIALS */
pages.push({
  file: 'testimonials.html', base: '', active: 'reviews', lastmod: CONTENT_DATE,
  headO: { title: 'Client Reviews: 5.0 on Google | Stable Structure Engineers', desc: 'What builders, designers and homeowners say about working with Stable Structure: every one of our Google reviews is five stars. Read them here.' },
  body: [
    pageHero('', { eyebrow: 'Client reviews', title: 'Rated <span class="hl">5.0 on Google</span>', sub: 'Every one of our Google reviews is a 5-star rating. Here is what clients say about working with Stable Structure.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Reviews' }] }),
    `<section class="pad"><div class="container">
      ${reviewsSummary()}
      <div style="margin:36px 0 14px"><div class="section-head center reveal" style="margin-bottom:24px"><span class="eyebrow">Featured review</span></div>${featuredReview()}</div>
      <div class="section-head center reveal" style="margin:48px auto 0"><span class="eyebrow">What clients say</span><h2 class="section-title">From builders, designers &amp; developers</h2></div>
      ${writtenReviews()}
      <div class="section-head center reveal" style="margin:48px auto 0"><span class="eyebrow">More 5-star ratings</span><h2 class="section-title">Consistently rated five stars</h2><p class="lead">Further verified Google ratings from clients across our projects.</p></div>
      ${otherReviews()}
    </div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* FAQ */
pages.push({
  file: 'faq.html', base: '', active: 'faq', lastmod: CONTENT_DATE,
  headO: { title: 'Engineering FAQ: PS1, Consent &amp; Cost | Stable Structure', desc: 'Answers on PS1s, building consent, engineering costs and turnaround, decks, retaining walls and removing walls, from chartered engineers in Auckland.' },
  body: [
    pageHero('', { eyebrow: 'Good to know', title: 'Frequently asked <span class="hl">questions</span>', sub: 'Answers to the questions we hear most. Still unsure? Call or WhatsApp us and we will help.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'FAQ' }] }),
    `<section class="pad"><div class="container">${faqBlock(FAQS)}</div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* CONTACT */
pages.push({
  file: 'contact.html', base: '', active: 'contact', lastmod: CONTENT_DATE,
  headO: { title: 'Contact | Stable Structure Limited — Get a Free Quote', desc: 'Get a free, fixed-fee engineering quote. Call or WhatsApp 021 148 8984, email us your plans, or send an enquiry. Botany, Auckland, serving all of NZ.' },
  body: [
    pageHero('', { eyebrow: 'Contact', title: 'Let\'s talk about <span class="hl">your project</span>', sub: 'Free, no-obligation quotes. Call, WhatsApp or send an enquiry and we will reply within one business day.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Contact' }], cta: false }),
    `<section class="pad">${contactBlock('')}</section>`,
  ].join('\n'),
});

/* SERVICE detail pages
   Titles are search-first (service + Auckland + credential terms), not
   brand-first — "structural engineer auckland" sat at position 14 in GSC with a
   33% CTR the one time it reached page 1. */
const SERVICE_TITLES = {
  'structural-design': 'Structural Design &amp; PS1 Engineer Auckland | Stable Structure',
  'civil-design': 'Civil Engineering: Stormwater &amp; Earthworks, Auckland',
  'building-consent-documentation': 'PS1 &amp; Building Consent Documents Auckland | Fixed Fee',
  'site-inspections': 'Site Inspections &amp; PS4 Construction Review, Auckland',
  'construction-supervision': 'Construction Monitoring &amp; PS4, Auckland | CM1–CM5',
  'retaining-walls': 'Engineered Retaining Wall Design Auckland | Stable Structure',
  'swimming-pools': 'Swimming Pool Engineer Auckland: Design &amp; PS1',
  'decks-outdoor-living': 'Deck Engineer Auckland: High &amp; Cantilevered Decks',
  'carports-sheds-portals': 'Portal Frame, Carport &amp; Shed Engineering NZ',
};

/* Per-service overrides where search data showed the generic title/description
   weren't matching what people search for. */
const SERVICE_H1 = {
  'structural-design': 'Structural <span class="hl">design</span>, Auckland',
  'decks-outdoor-living': 'Deck <span class="hl">engineering</span>, Auckland',
  'site-inspections': 'Site inspections &amp; <span class="hl">PS4</span> construction review',
  'construction-supervision': 'Construction <span class="hl">monitoring</span> &amp; supervision, Auckland',
  'retaining-walls': 'Engineered <span class="hl">retaining walls</span>, Auckland',
};
const SERVICE_DESCS = {
  'structural-design': 'Structural design by chartered engineers in Auckland: beams, foundations, bracing and wall removals, with drawings, calcs and PS1. Fixed-fee quotes.',
  'civil-design': 'Civil engineering in Auckland: stormwater, soakage and tanks, drainage, earthworks, driveways and sediment control, with drawings for consent.',
  'building-consent-documentation': 'Consent-ready drawings, calculations and a PS1 signed by a CPEng engineer, with council RFIs answered for you. Fixed fee, quoted within one business day.',
  'swimming-pools': 'Structural design for in-ground pools in Auckland: pool shells, slopes, retaining, surrounds and barriers, with drawings, calculations and PS1 for consent.',
  'decks-outdoor-living': 'Deck engineering in Auckland: decks over 1.5 m, cantilevers, spa pool loads and balustrades, with drawings, calculations and PS1. Fixed-fee quotes.',
  'carports-sheds-portals': 'Steel and timber portal frames, carports, sheds and rural buildings, designed for NZ wind and earthquake loads, with drawings and PS1 for consent.',
  'site-inspections': 'Structural site inspections and PS4 construction review across Auckland: pre-pour and framing inspections, written site records, and the PS4 council needs.',
  'construction-supervision': 'Construction monitoring (CM1 to CM5) in South and East Auckland: stage inspections, written site reports and the PS4 council needs. Fixed-fee quotes.',
  'retaining-walls': 'Retaining wall engineers in Botany, East Auckland. Engineered timber, block and concrete walls, driveway walls, drainage, PS1 and consent. Fixed quotes.',
};
const SERVICE_LASTMOD = {
  'structural-design': CONTENT_DATE,
  'civil-design': CONTENT_DATE,
  'building-consent-documentation': CONTENT_DATE,
  'swimming-pools': CONTENT_DATE,
  'decks-outdoor-living': CONTENT_DATE,
  'carports-sheds-portals': CONTENT_DATE,
  'site-inspections': '2026-09-30',
  'construction-supervision': '2026-09-30',
  'retaining-walls': '2026-09-30',
};

SERVICES.forEach((s) => {
  const base = '../';
  const asideList = SERVICES.map(x => `<a href="${x.slug}.html"${x.slug === s.slug ? ' class="current" aria-current="page"' : ''}>${x.title} ${si('chevr', 2)}</a>`).join('\n          ');
  const article = ARTICLES[s.slug];
  const prose = article
    ? `<span class="eyebrow">${s.title}</span>
        ${article(base)}`
    : `<span class="eyebrow">${s.title}</span>
        ${s.intro.map(p => `<p style="font-size:17px">${p}</p>`).join('\n        ')}
        <h2>What's included</h2>
        <ul class="ticks">${s.includes.map(x => `<li>${si('check', 2.2)}<span>${x}</span></li>`).join('')}</ul>
        <h2>Ideal for</h2>
        <ul class="ticks">${s.ideal.map(x => `<li>${si('check', 2.2)}<span>${x}</span></li>`).join('')}</ul>
        <h2>Why it matters</h2>
        <p style="font-size:17px">${CLOSES[s.slug] || s.short}</p>`;
  const body = [
    pageHero(base, {
      eyebrow: 'Service', title: SERVICE_H1[s.slug] || s.title, sub: s.sub,
      crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Services', href: 'services.html' }, { label: s.title }],
      waMsg: `Hi Stable Structure, I'd like to enquire about ${s.title}.`,
    }),
    `<section class="pad"><div class="container"><div class="svc-layout">
      <div class="prose">
        ${prose}
        ${s.slug === 'carports-sheds-portals' ? `<div class="callout">
          <div><b>Thinking bigger than a shed?</b><p>The same light timber and steel framing is what we use for <a href="${base}granny-flats.html">70m² granny flat designs that need no building consent</a>. Seven concepts, with interactive 3D structural models.</p></div>
          <a class="btn btn-primary" href="${base}granny-flats.html">See the granny flat designs ${si('arrow', 2.2)}</a>
        </div>` : ''}
      </div>
      <aside class="svc-aside reveal">
        <div class="aside-card">
          <h4>Get a free quote</h4>
          <p>Tell us about your ${s.title.toLowerCase()} project and we will get back to you within one business day.</p>
          <a class="btn btn-primary" href="${base}contact.html">Request a Free Quote ${si('arrow', 2.2)}</a>
          <a class="btn btn-wa" href="${waHref(`Hi Stable Structure, I'd like to enquire about ${s.title}.`)}" target="_blank" rel="noopener">${wa()} WhatsApp us</a>
          <a class="btn btn-ghost" href="tel:${PHONE_TEL}">${si('phone', 2)} Call ${PHONE_DISPLAY}</a>
        </div>
        <div class="aside-card">
          <h4>All services</h4>
          <nav class="aside-list" aria-label="All services">
          ${asideList}
          </nav>
        </div>
      </aside>
    </div></div></section>`,
    ctaBand(base, { title: `Ready to start your ${s.title.toLowerCase()} project?`, waMsg: `Hi Stable Structure, I'd like to enquire about ${s.title}.` }),
  ].join('\n');
  pages.push({
    file: svcPath(s), base, active: 'services', lastmod: SERVICE_LASTMOD[s.slug] || SPRINT_DATE,
    headO: {
      title: SERVICE_TITLES[s.slug] || `${s.title} | Stable Structure Limited`,
      desc: SERVICE_DESCS[s.slug] || s.short,
      serviceType: SERVICE_TYPE[s.slug],
      serviceName: s.title,
    },
    body,
  });
});

/* GUIDE pages (Phase 3) */
GUIDES.forEach((g) => {
  const base = '../';
  const body = [
    pageHero(base, {
      eyebrow: g.eyebrow, title: g.h1, sub: g.sub,
      crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Guides', href: 'guides.html' }, { label: g.label }],
      waMsg: `Hi Stable Structure, I read your guide "${g.title}" and have a question.`,
    }),
    `<section class="pad"><div class="container"><div class="svc-layout">
      <div class="prose">
        <span class="eyebrow">${g.eyebrow}</span>
        ${g.body(base)}
      </div>
      <aside class="svc-aside reveal">
        <div class="aside-card">
          <h4>Ask an engineer</h4>
          <p>Free, no-obligation advice on your project from a chartered structural engineer.</p>
          <a class="btn btn-primary" href="${base}contact.html">Request a Free Quote ${si('arrow', 2.2)}</a>
          <a class="btn btn-wa" href="${waHref()}" target="_blank" rel="noopener">${wa()} WhatsApp us</a>
          <a class="btn btn-ghost" href="tel:${PHONE_TEL}">${si('phone', 2)} Call ${PHONE_DISPLAY}</a>
        </div>
        <div class="aside-card">
          <h4>Guides</h4>
          <nav class="aside-list" aria-label="All guides">
          ${GUIDES.map(x => `<a href="${x.slug}.html"${x.slug === g.slug ? ' class="current" aria-current="page"' : ''}>${x.label} ${si('chevr', 2)}</a>`).join('\n          ')}
          </nav>
        </div>
      </aside>
    </div></div></section>`,
    ctaBand(base),
  ].join('\n');
  pages.push({
    file: `guides/${g.slug}.html`, base, active: 'guides', lastmod: g.modified || SPRINT_DATE,
    headO: { title: g.metaTitle || `${g.title} | Stable Structure`, desc: g.desc, pageLabel: g.label, article: { headline: g.title, published: g.published || SPRINT_DATE, modified: g.modified || SPRINT_DATE } },
    body,
  });
});

/* GUIDES HUB — the breadcrumb on each guide points here, and it gives the two
   guides a topical cluster point instead of leaving them as orphans hanging off
   the services page. */
pages.push({
  file: 'guides.html', base: '', active: 'guides', lastmod: CONTENT_DATE,
  headO: { title: 'Structural Engineering Guides NZ | Stable Structure', desc: 'Plain-English NZ engineering guides: PS1 producer statements, deck and retaining wall consent, removing a load-bearing wall and consent timeframes.', pageLabel: 'Guides' },
  body: [
    pageHero('', { eyebrow: 'Guides', title: 'Straight answers from <span class="hl">our engineers</span>', sub: 'The questions we are asked most, answered properly. Written and reviewed by a Chartered Professional Engineer.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Guides' }] }),
    `<section class="pad"><div class="container">
      <div class="grid-services">
      ${GUIDES.map(g => `<a class="svc reveal" href="guides/${g.slug}.html">
        <div class="ic">${si('consent')}</div>
        <h3>${g.title}</h3>
        <p>${g.desc}</p>
        <div class="spacer"></div>
        <span class="more">Read the guide ${si('arrow', 2.2)}</span>
      </a>`).join('\n      ')}
      </div>
    </div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* BUILDERS & ARCHITECTS — the journey for design teams and trades, who send
   most of the work but had no page of their own. */
pages.push({
  file: 'builders-architects.html', base: '', active: '', lastmod: CONTENT_DATE,
  headO: { title: 'Structural Engineering for Builders &amp; Architects, Auckland', desc: 'Engineering behind your plans: fixed quotes in one business day, drawings, calcs and a CPEng-signed PS1 that match your set, then inspections and PS4.', pageLabel: 'For Builders & Architects' },
  body: [
    pageHero('', { eyebrow: 'For builders &amp; architects', title: 'Engineering behind <span class="hl">your plans</span>', sub: 'Send us your drawings, get a fixed quote within one business day, and get back drawings, calculations and a PS1 that match your set. Then inspections and the PS4 when it is built.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'For Builders &amp; Architects' }], waMsg: "Hi Stable Structure, I'm a builder/designer and I'd like a quote on some plans." }),
    `<section class="pad"><div class="container"><div class="prose" style="max-width:760px;margin-inline:auto">
      <h2>How we fit into your team</h2>
      <p>Most of our work arrives from architects, designers, draughtspeople and builders who need the engineering behind their plans. We work from your drawings, coordinate directly with you as the design develops, and answer council’s structural questions so the consent keeps moving. You keep the client relationship; we make the structure work.</p>
      <h2>What you send us</h2>
      <ul class="ticks">
      <li>${si('check', 2.2)}<span>Your current drawing set, as PDF or DWG</span></li>
      <li>${si('check', 2.2)}<span>The site address</span></li>
      <li>${si('check', 2.2)}<span>Any geotechnical report that already exists</span></li>
      <li>${si('check', 2.2)}<span>Anything we should know: member sizes to match, budget limits or a lodgement date</span></li>
    </ul>
      <h2>What you get back</h2>
      <ul class="ticks">
      <li>${si('check', 2.2)}<span>Structural drawings and details that match your set</span></li>
      <li>${si('check', 2.2)}<span>A calculation set that agrees with the drawings</span></li>
      <li>${si('check', 2.2)}<span>A PS1 signed by a Chartered Professional Engineer (CPEng #1030007)</span></li>
      <li>${si('check', 2.2)}<span>Member sizes and specifications your builder can price from</span></li>
      <li>${si('check', 2.2)}<span>Responses to council requests for information</span></li>
      <li>${si('check', 2.2)}<span>Construction monitoring, written site records and the PS4 once it is built</span></li>
    </ul>
      <h2>Turnaround</h2>
      <p>A fixed quote usually within one business day of receiving plans. Straightforward residential elements typically take one to two weeks to consent-ready documentation, and full new-build packages three to six weeks. Bringing us in while the drawings are still being finished keeps engineering off your critical path. Our guide to <a href="guides/building-consent-timeframes-auckland.html">consent timeframes and RFIs</a> covers what happens after lodgement.</p>
      <h2>Drawings that sit with yours</h2>
      <p>Our team drafts in AutoCAD and Revit, so our structural drawings sit cleanly alongside your architectural set, and the calculations are produced with the drawings so the two always agree.</p>
      <h2>For builders: on site</h2>
      <p>When questions come up on site, you get an engineer who answers them. We inspect at the hold points your consent names, such as footings, reinforcing and framing, leave a written site record for the council inspector, and issue the PS4 at the end. For Auckland sites, a day or two’s notice is usually enough. See <a href="services/construction-supervision.html">construction monitoring</a> for how it runs.</p>
      <h2>Developers and repeat work</h2>
      <p>We work with builders and developers across repeat residential projects, from single homes to multi-unit developments of up to three storeys.</p>
      <blockquote>“As the engineering partner for A-Frame Builders, Gajanthan has consistently delivered high-quality work, met tight deadlines, and gone above and beyond to support our projects.”<br /><small>Haran / Kash, A-Frame Builders Ltd, Google review</small></blockquote>
      <h2>Send us a set of plans</h2>
      <p>Email your drawings to <a href="mailto:${EMAIL}">${EMAIL}</a>, send them on <a href="${waHref("Hi Stable Structure, I'd like a quote on some plans.")}" target="_blank" rel="noopener">WhatsApp</a>, or call ${PHONE_DISPLAY}. We will confirm the scope and a fixed fee, usually within one business day.</p>
    </div></div></section>`,
    ctaBand('', { title: 'Have a set of plans that needs engineering?', text: 'Send them through and we will come back with the scope and a fixed fee, usually within one business day.', waMsg: "Hi Stable Structure, I'd like a quote on some plans." }),
  ].join('\n'),
});

/* ---------- GRANNY FLATS (2026 70m² exemption) + interactive 3D models ----------
   Content from the Stable Structure 70m² Granny Flats brochure (assets/). The
   three GLB models were converted from the practice's IFC files; their stats
   JSON sits beside them and drives the element counts and dimensions below.
   three.js is NOT loaded with the page: a tiny inline script injects the
   viewer bundle only when a model scrolls near the viewport. */
const GF_DESIGNS = [
  { n: '01', slug: 'gable-retreat', title: 'Gable Retreat', w: 1200, h: 1097, specs: ['2 bedrooms', '1 bathroom', 'Open-plan kitchen, dining & living', 'Laundry', 'Wraparound deck'] },
  { n: '02', slug: 'skillion-studio', title: 'Skillion Studio', w: 1200, h: 1125, specs: ['1 bedroom', '1 bathroom', 'Open-plan living', 'Kitchen', 'Covered outdoor living deck'] },
  { n: '03', slug: 'timber-courtyard', title: 'Timber Courtyard', w: 1200, h: 1097, specs: ['2 bedrooms', '1 bathroom', 'Laundry', 'Study nook', 'Bifold doors to an outdoor deck'] },
  { n: '04', slug: 'pavilion-gable', title: 'Pavilion Gable', w: 1200, h: 1000, size: '11.6 × 7.0 m', specs: ['2 bedrooms', '1 bathroom', 'Study', 'Living with fireplace', 'Laundry', 'Covered outdoor living'] },
  { n: '05', slug: 'covered-deck-cottage', title: 'Covered Deck Cottage', w: 1160, h: 1355, specs: ['Bedroom 2.8 × 3.0 m', '1 bathroom', 'Open-plan living 4.8 × 3.9 m', 'Kitchen', 'Full-width covered deck'] },
  { n: '06', slug: 'three-bedroom-skillion', title: 'Three-Bedroom Skillion', w: 1200, h: 1247, specs: ['3 bedrooms', '1 bathroom', 'Open-plan kitchen & living', 'Laundry', 'Covered outdoor 3.0 × 5.6 m'] },
  { n: '07', slug: 'linear-modern', title: 'Linear Modern', w: 1200, h: 800, size: '14.5 × 7.0 m', specs: ['2 bedrooms', '1 bathroom', 'Study', 'Open-plan kitchen, dining & living', 'Laundry', 'Stacking doors to outdoor living'] },
];

const GF_MODELS = [
  { slug: 'portal-shed-structural', kind: 'Steel portal frame', title: 'Clear-span steel portal frame',
    desc: 'A clear-span steel portal frame: 410UB53.7 universal-beam columns carry knee-braced SHS trusses, with C15015 cold-formed purlins and girts, fly braces to the rafters and bolted base plates on 600 mm diameter, 2.5 m deep bored pier footings.',
    lead: 'Piles', leadLabel: 'pier footings' },
  { slug: 'gable-shed-frame', kind: 'Timber gable frame', title: 'Timber gable frame on piles',
    desc: 'A conventional timber gable frame on pile foundations: 48 floor piles and 58 footings support the floor joists, with wall girts, rafters and roof purlins framing the building. Door and window openings are modelled so the lintels and trimmers are real.',
    lead: 'Piles', leadLabel: 'floor piles' },
  { slug: 'skillion-shed-frame', kind: 'Skillion (mono-pitch) frame', title: 'Skillion mono-pitch frame',
    desc: 'A mono-pitch skillion frame nearly 30 m long: 24 columns on individual footings, wall girts and roof members, with strap bracing to the roof plane and the walls to resist wind and earthquake loads.',
    lead: 'Columns', leadLabel: 'columns' },
];

function gfModelStats(slug) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'models', `${slug}.json`), 'utf8'));
}

const gfNum = (n) => Number(n).toFixed(1).replace(/\.0$/, '');

function gfViewer(base, m, i) {
  const st = gfModelStats(m.slug);
  const total = Object.values(st.layers).reduce((a, b) => a + b, 0);
  const facts = [
    [`${gfNum(st.size_m.length)} m`, 'long'],
    [`${gfNum(st.size_m.width)} m`, 'wide'],
    [String(st.layers[m.lead] || 0), m.leadLabel],
    [String(total), 'elements modelled'],
  ];
  return `<article class="mv reveal" id="mv-${m.slug}" data-model="${base}assets/models/${m.slug}.glb?v=${ASSET_VERSION}" data-counts="${esc(JSON.stringify(st.layers))}" aria-label="Interactive 3D model: ${esc(m.title)}">
        <div class="mv-head">
          <div>
            <span class="mv-kicker">Model 0${i + 1} · ${m.kind}</span>
            <h3>${m.title}</h3>
            <p>${m.desc}</p>
          </div>
          <ul class="mv-facts">${facts.map(f => `<li><b>${f[0]}</b><span>${f[1]}</span></li>`).join('')}</ul>
        </div>
        <div class="mv-stage"><p class="mv-status">Loading 3D model…</p></div>
        <div class="mv-bar">
          <div class="mv-tools">
            <button type="button" class="mv-btn" data-mv-reset>${si('arrow', 2.2)} Reset view</button>
            <button type="button" class="mv-btn" data-mv-wire aria-pressed="false">Wireframe</button>
            <button type="button" class="mv-btn" data-mv-full>Fullscreen</button>
          </div>
          <p class="mv-dims"></p>
        </div>
        <div class="mv-layers" aria-label="Show or hide element types"></div>
        <p class="mv-hint">Drag to orbit · scroll or pinch to zoom · right-drag or two fingers to pan · untick a layer to hide it</p>
      </article>`;
}

/* Accordion gallery for the seven designs (a vanilla port of React Bits'
   AccordionGallery: expanding panels, 3D tilt, greyscale on collapsed panels,
   caption reveal). main.js drives it; clicking the open panel shows the full
   image in the lightbox. Each design's details sit below and follow the open
   panel. Without JS the default panel stays open and every detail shows. */
const GF_DEFAULT = 3; // Pavilion Gable, the middle of seven

function gfCaption(d) {
  return `Design ${d.n} · ${d.title}${d.size ? ` · ${d.size}` : ''} — ${d.specs.join(' · ')}. Images are indicative; final layouts, sizes and finishes are confirmed at design stage.`;
}

function gfAccordion(base) {
  const panels = GF_DESIGNS.map((d, i) => {
    const img = `${base}assets/granny-flats/${d.slug}.webp`;
    const small = `${base}assets/granny-flats/${d.slug}-640.webp`;
    const on = i === GF_DEFAULT;
    return `<button type="button" class="ag-panel${on ? ' ag-panel--active' : ''}" data-index="${i}" aria-current="${on}" aria-controls="gf-detail-${d.slug}" aria-label="Design ${d.n}, ${esc(d.title)}" data-images="${esc(JSON.stringify([img]))}" data-caption="${esc(gfCaption(d))}">
          <span class="ag-frame"><span class="ag-media"><img src="${small}" srcset="${small} 640w, ${img} ${d.w}w" sizes="(max-width:640px) 100vw, 760px" width="${d.w}" height="${d.h}" loading="lazy" decoding="async" alt="${esc(d.title)} — 70m² granny flat concept render by Stable Structure" draggable="false" /></span><span class="ag-overlay" aria-hidden="true"></span></span>
          <span class="ag-label" aria-hidden="true"><span class="ag-bar"></span><span class="ag-text"><small>Design ${d.n}</small>${d.title}</span></span>
        </button>`;
  }).join('\n        ');
  const details = GF_DESIGNS.map((d, i) => `<div class="gf-detail${i === GF_DEFAULT ? ' is-active' : ''}" id="gf-detail-${d.slug}">
          <div>
            <span class="proj-date">Design ${d.n}${d.size ? ` · ${d.size}` : ''}</span>
            <h3 class="gf-title">${d.title}</h3>
            <ul class="gf-specs">${d.area ? `<li class="gf-area">${d.area} m² floor area</li>` : ''}${d.specs.map(sp => `<li>${sp}</li>`).join('')}</ul>
          </div>
          <button type="button" class="btn btn-ghost gf-full" data-index="${i}">View full size</button>
        </div>`).join('\n        ');
  return `<div class="ag reveal" id="gf-gallery" data-default="${GF_DEFAULT}" aria-label="Seven granny flat designs. Choose one to see it larger.">
        ${panels}
      </div>
      <div class="gf-details reveal" aria-live="polite">
        ${details}
      </div>`;
}

const GF_WA = "Hi Stable Structure, I'd like to talk about a 70m² granny flat on my property.";
const GF_LASTMOD = '2026-09-24';
const gfDate = (iso) => new Date(iso + 'T12:00:00+12:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' });

/* Page-level structured data for the granny flats page: WebSite + WebPage +
   Service (with the seven designs as an offer catalogue) + ImageGallery.
   Merged into the same @graph as the organisation so every @id resolves. */
function gfLd() {
  const url = `${SITE_URL}granny-flats.html`;
  const img = (d) => `${SITE_URL}assets/granny-flats/${d.slug}.webp`;
  return [
    { '@type': 'WebSite', '@id': `${SITE_URL}#website`, url: SITE_URL, name: 'Stable Structure Limited', publisher: { '@id': ORG_ID } },
    {
      '@type': 'WebPage', '@id': `${url}#webpage`, url,
      name: '70m² Consent-Exempt Granny Flat Designs, Auckland',
      description: 'Seven engineer-designed 70m² granny flat concepts for Auckland under the 2026 consent exemption, with interactive 3D structural models.',
      inLanguage: 'en-NZ', datePublished: '2026-09-24', dateModified: GF_LASTMOD,
      isPartOf: { '@id': `${SITE_URL}#website` }, publisher: { '@id': ORG_ID },
      about: { '@id': `${url}#service` },
      primaryImageOfPage: { '@id': img(GF_DESIGNS[3]) },
      hasPart: { '@id': `${url}#designs` },
      reviewedBy: { '@id': PERSON_ID },
    },
    {
      '@type': 'Service', '@id': `${url}#service`,
      name: '70m² granny flat design and structural engineering',
      serviceType: 'Minor dwelling design, structural engineering and council notification documentation',
      description: 'Engineer-designed 70m² granny flat concepts for Auckland sections that meet the building-consent exemption, with structural design, PIM and council notification documentation, and construction coordination.',
      provider: { '@id': ORG_ID }, areaServed: { '@type': 'City', name: 'Auckland' }, url,
      hasOfferCatalog: {
        '@type': 'OfferCatalog', name: 'Granny flat design collection',
        itemListElement: GF_DESIGNS.map(d => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: `${d.title} granny flat design`, description: `${d.specs.join(', ')}${d.size ? `, ${d.size}` : ''}`, image: img(d), provider: { '@id': ORG_ID } } })),
      },
    },
    {
      '@type': 'ImageGallery', '@id': `${url}#designs`, name: 'Seven 70m² granny flat design concepts',
      isPartOf: { '@id': `${url}#webpage` },
      hasPart: GF_DESIGNS.map(d => ({ '@type': 'ImageObject', '@id': img(d), contentUrl: img(d), caption: `${d.title} — 70m² granny flat concept${d.size ? `, ${d.size}` : ''}`, width: d.w, height: d.h, creditText: 'Stable Structure Limited', creator: { '@id': ORG_ID } })),
    },
  ];
}

function grannyFlatsPage() {
  const base = '';
  const tick = (t) => `<li>${si('check', 2.4)}<span>${t}</span></li>`;
  const perks = [
    ['users', 'A comfortable second home', 'Independent living for elderly parents, adult children or visiting family.'],
    ['gem', 'Potential rental income', 'Subject to the property’s planning and other requirements.'],
    ['pin', 'More from your land', 'Add function and value to an under-used part of your section.'],
    ['clock', 'Fewer delays', 'Where a project qualifies, skipping the consent process can simplify and speed up construction.'],
    ['shield', 'Engineer-designed', 'Designed by a chartered structural engineer, so compliance is built in rather than bolted on.'],
  ];
  /* Conditions verified 24 Sep 2026 against MBIE's building design conditions
     checklist (building.govt.nz, Dec 2025) and Auckland Council's granny flats
     exemption page. The exemption became law on 15 January 2026. */
  const conditions = [
    ['New, single-storey and standalone', 'A new detached, self-contained dwelling for one household, with no mezzanine or loft.'],
    ['Floor area', 'A maximum of 70m².'],
    ['Height', 'Floor level no more than 1 m above the supporting ground, and the building no more than 4 m high above floor level.'],
    ['Setbacks', 'At least 2 m from other residential buildings and from legal boundaries, and not built across a boundary.'],
    ['Construction', 'Light timber or steel framing, with roof cladding up to 20 kg/m² and wall cladding up to 220 kg/m².'],
    ['Building Code', 'Must still comply with the NZ Building Code, using the standard compliance pathways for water supply, stormwater and drainage.'],
    ['Licensed professionals', 'Design and construction carried out or supervised by licensed building practitioners, with Records of Work for restricted building work.'],
    ['PIM and council notification', 'A Project Information Memorandum (PIM) from Auckland Council before work starts (allow 20 working days), then notification with final plans, Records of Work and certificates once complete.'],
  ];
  const MBIE_URL = 'https://www.building.govt.nz/projects-and-consents/planning-a-successful-build/scope-and-design/check-if-you-need-consents/building-work-that-doesnt-need-a-building-consent/granny-flats-exemption-guidance-and-resources';
  const AKL_URL = 'https://www.aucklandcouncil.govt.nz/en/building-and-consents/consent-exemptions/granny-flats-building-consent-exemption.html';
  const compliance = ['Structural stability', 'Foundations', 'Ground conditions', 'Weathertightness', 'Insulation & energy', 'Fire safety', 'Ventilation', 'Natural light', 'Plumbing & sanitary', 'Stormwater', 'Wastewater', 'Electrical work', 'Moisture control', 'Site access'];
  const checks = ['Site layout, available building area and building position', 'Boundaries, setbacks and existing buildings', 'Foundations and ground conditions', 'Drainage, wastewater and stormwater disposal', 'Access, vehicle parking and services', 'Planning and property-specific restrictions', 'Height and setback requirements', 'Flooding, overland flow and other site constraints', 'Heritage or other overlays where applicable'];
  const features = ['2-bedroom layouts', 'Open-plan kitchen & living', 'Full bathrooms', 'Laundry', 'Built-in storage', 'Indoor-outdoor living', 'Covered outdoor areas', 'Contemporary finishes'];
  const steps = [
    ['01', 'Site assessment', 'We review boundaries, access, services, ground conditions and site constraints before design begins.'],
    ['02', 'Concept design', 'A layout that suits your site and lifestyle: orientation, light, storage and outdoor connection.'],
    ['03', 'Detailed plans', 'Documentation to meet the Building Code, the exemption conditions and council notification.'],
    ['04', 'Construction', 'A quality build with qualified trades, supervised through to handover.'],
  ];
  const faqs = [
    ['Do I still need to tell the council?', 'Yes. The exemption removes the building consent, not the council’s involvement. You must apply for a Project Information Memorandum (PIM) from Auckland Council before work starts (the council allows 20 working days, and it may carry a development contribution), and notify the council with final plans, Records of Work and certificates once the build is finished. We prepare that documentation as part of the detailed plans.'],
    ['Does the exemption cover planning and resource consent?', 'No. It is a building-consent exemption only. Planning rules, resource consent, drainage and other council requirements may still apply depending on your property and location, which is why the site assessment comes first.'],
    ['Can I rent the granny flat out?', 'Potentially, subject to the property’s planning and other requirements. We check what applies to your site at the assessment stage, so you know before you commit.'],
    ['What can 70m² actually fit?', 'Comfortably two bedrooms, an open-plan kitchen and living area, a bathroom, laundry and plenty of storage; Design 06 fits three bedrooms. Smart space planning, natural light and built-in storage keep a compact home feeling generous.'],
    ['What if my site or design falls outside the exemption?', `Then we take the same design through building consent, with the structural drawings, calculations and <a href="${base}services/building-consent-documentation.html">PS1 documentation</a> we prepare for any residential project. Nothing is wasted.`],
  ];

  return {
    file: 'granny-flats.html', base, active: 'granny', lastmod: GF_LASTMOD,
    headO: { title: '70m² Consent-Exempt Granny Flat Designs, Auckland', desc: 'Seven engineer-designed 70m² granny flat concepts for Auckland under the 2026 building consent exemption. Explore the 3D structural models and get a free quote.', pageLabel: 'Granny Flats', ogImage: 'assets/granny-flats/og-granny-flats.jpg', extraLd: gfLd() },
    extraScripts: `<script>
(function(){var els=document.querySelectorAll('.mv[data-model]');if(!els.length)return;var done=false;
function load(){if(done)return;done=true;var s=document.createElement('script');s.type='module';s.src='${base}assets/vendor/model-viewer.js?v=${ASSET_VERSION}';document.body.appendChild(s);}
if(!('IntersectionObserver' in window))return load();
var io=new IntersectionObserver(function(en){if(en.some(function(e){return e.isIntersecting})){load();io.disconnect();}},{rootMargin:'600px'});
els.forEach(function(el){io.observe(el);});})();
</script>`,
    body: [
      pageHero(base, { eyebrow: 'Granny flats · 2026 exemption', title: '70m² granny flats <span class="hl">without building consent</span>', sub: 'Seven engineer-designed granny flat concepts for Auckland sections, plus interactive 3D structural models you can spin, zoom and take apart layer by layer. Designed in Botany to meet the 2026 consent exemption, and built to comply.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Granny Flats' }], waMsg: GF_WA }),

      `<section class="pad-sm"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Make more from your property</span><h2 class="section-title">More space. More flexibility. More value from your land.</h2><p class="lead">New Zealand’s 70m² granny flat exemption opens an opportunity for eligible homeowners to add a standalone minor dwelling without a building consent, provided every exemption requirement is met.</p></div>
      <div class="gf-perks">
        ${perks.map(p => `<div class="gf-perk reveal"><span class="fic">${si(p[0])}</span><div><b>${p[1]}</b>${p[2]}</div></div>`).join('\n        ')}
      </div>
      <nav class="gf-jump reveal" aria-label="On this page">
        <a href="#designs">The seven designs</a><a href="#models">Interactive 3D models</a><a href="#exemption">The exemption explained</a><a href="#site">Is it right for your site?</a><a href="#process">From idea to home</a>
      </nav>
    </div></section>`,

      `<section id="designs" class="pad" style="background:var(--surface-2)"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Design collection</span><h2 class="section-title">Seven ways to live well in 70m²</h2><p class="lead">Each design is a starting point. We tailor layout, orientation, cladding and finishes to your site, budget and lifestyle. Small doesn’t have to mean cramped: well-positioned windows, efficient kitchens and built-in storage make a compact home feel surprisingly generous.</p></div>
      <div class="gf-chips reveal">${features.map(f => `<span>${f}</span>`).join('')}</div>
      ${gfAccordion(base)}
      <p class="gf-note reveal">Images are indicative. Final layouts, sizes and finishes are confirmed at design stage. Hover or tap a design to open it, then tap it again to see it full size.</p>
      <div class="callout reveal" style="max-width:820px;margin:32px auto 0">
        <div><b>Already have plans?</b><p>If your designer has drawn your granny flat, we provide the structural design, PS1 and council documentation to build it, whether it qualifies for the exemption or needs a consent.</p></div>
        <a class="btn btn-primary" href="${base}services/building-consent-documentation.html">Building consent documentation ${si('arrow', 2.2)}</a>
      </div>
      ${lightboxMarkup()}
    </div></section>`,

      `<section id="models" class="pad"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Interactive 3D</span><h2 class="section-title">See the structure before it is built</h2><p class="lead">Every Stable Structure design starts as a full structural model, so loads, connections and bracing are resolved before anyone picks up a hammer. Explore three of our framing models below, built with the same lightweight timber and steel systems we use for granny flats and sheds. Drag to rotate, zoom in on a connection, and switch element types on and off.</p></div>
      ${GF_MODELS.map((m, i) => gfViewer(base, m, i)).join('\n      ')}
      <p class="gf-note reveal">Models are shown for illustration. Member sizes, connections and foundations for your project are designed for your site and confirmed on the drawings.</p>
    </div></section>`,

      `<section id="exemption" class="pad" style="background:var(--surface-2)"><div class="container">
      <div class="split">
        <div class="reveal">
          <span class="eyebrow">The exemption explained</span>
          <h2 class="section-title">What does the 70m² exemption mean?</h2>
          <p class="lead">Since 15 January 2026, eligible homeowners can build a new single-storey standalone dwelling of up to 70m² without a building consent, provided every condition of the exemption is met. Often called a granny flat, minor dwelling or self-contained unit, this pathway is designed to make smaller homes faster and more accessible to build.</p>
          <p class="gf-reviewed">${si('shield', 2)}<span>Reviewed by <a href="${base}about.html">Gajanthan Vethanathan</a>, Chartered Professional Engineer (CPEng #1030007) · Page updated ${gfDate(GF_LASTMOD)}</span></p>
          <p class="gf-summary">In short: the exemption covers a new, single-storey, standalone and self-contained dwelling of no more than 70m² floor area, built for one household. The floor can sit no more than 1 m above the supporting ground and the building can rise no more than 4 m above floor level. It must be at least 2 m from every legal boundary and from any other residential building, and it must be light-framed in timber or steel with lightweight cladding. Every part of the build must still meet the New Zealand Building Code, the work must be carried out or supervised by licensed building practitioners, and the owner must obtain a Project Information Memorandum from Auckland Council before starting and notify the council with final plans, Records of Work and certificates on completion. Planning rules and resource consent are separate and may still apply.</p>
          <div class="feature-list">
            ${conditions.map(c => `<div class="feature"><span class="fic">${si('check', 2.4)}</span><div><span class="fh4">${c[0]}</span><p>${c[1]}</p></div></div>`).join('\n            ')}
          </div>
          <p class="gf-sources">Sources: <a href="${MBIE_URL}" target="_blank" rel="noopener">MBIE granny flats exemption guidance</a> and <a href="${AKL_URL}" target="_blank" rel="noopener">Auckland Council: granny flats building consent exemption</a>. The conditions are summarised here; check the current official guidance before relying on them.</p>
        </div>
        <div class="gf-compliance reveal">
          <h3>“Consent-free” still means compliant</h3>
          <p>A qualifying granny flat may not need a building consent, but it must still meet the Building Code and other legislation. Your home still needs to be safe, durable, healthy and properly designed, and the Auckland Council notification process still applies.</p>
          <ul>${compliance.map(c => `<li>${si('check', 2.6)}${c}</li>`).join('')}</ul>
          <p>Planning or resource-consent considerations may also apply, depending on the property and location. Getting the site checked early helps avoid costly surprises later.</p>
        </div>
      </div>
    </div></section>`,

      `<section id="site" class="pad"><div class="container">
      <div class="split">
        <div class="reveal">
          <span class="eyebrow">Your site, your lifestyle</span>
          <h2 class="section-title">Is a 70m² granny flat right for your property?</h2>
          <p class="lead">Every property is different, and not every site will be suitable. Before you start, we assess your site and identify the things that matter. Getting the design right from the beginning saves time, money and costly changes later. We assess sections right across Auckland, from Botany, Howick and Flat Bush near our office to the rest of the region.</p>
          <h3 style="font-size:19px;margin-top:26px">What we check first</h3>
          <ul class="gf-list">${checks.map(tick).join('')}</ul>
        </div>
        <div class="reveal">
          <h3 style="font-size:19px">Why Auckland homeowners are building them</h3>
          <div class="feature-list">
            <div class="feature"><span class="fic">${si('users')}</span><div><span class="fh4">Independent accommodation</span><p>A comfortable home for elderly parents, adult children or visiting family.</p></div></div>
            <div class="feature"><span class="fic">${si('gem')}</span><div><span class="fh4">Rental income</span><p>Subject to the property’s planning and other requirements.</p></div></div>
            <div class="feature"><span class="fic">${si('pin')}</span><div><span class="fh4">Better use of your land</span><p>Add function to an under-used part of your section.</p></div></div>
            <div class="feature"><span class="fic">${si('building')}</span><div><span class="fh4">Changing family needs</span><p>Flexibility as your household changes over the years.</p></div></div>
            <div class="feature"><span class="fic">${si('clock')}</span><div><span class="fh4">Fewer delays</span><p>Where a project qualifies, skipping the consent process can simplify and speed up construction.</p></div></div>
          </div>
        </div>
      </div>
    </div></section>`,

      `<section id="process" class="pad process"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">From idea to home</span><h2 class="section-title">Practical design, quality construction and compliance, together</h2><p class="lead">With more than 12 years of experience in custom residential construction, Stable Structure understands small residential projects and minor dwellings, lightweight timber and steel framing, site-specific design, Building Code compliance and Auckland construction conditions. We coordinate the qualified trades and professionals your project needs. Meet the team on our <a href="${base}about.html">About page</a>, see <a href="${base}projects.html">recent projects</a>, or read our <a href="${base}testimonials.html">client reviews</a>.</p></div>
      <div class="steps">
        ${steps.map((s, i) => `<div class="step reveal">${i < 3 ? '<span class="line"></span>' : ''}<div class="n">${s[0]}</div><h4>${s[1]}</h4><p>${s[2]}</p></div>`).join('\n        ')}
      </div>
    </div></section>`,

      `<section class="pad"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Good to know</span><h2 class="section-title">Granny flat questions, answered</h2></div>
      ${faqBlock(faqs)}
      <div class="gf-brochure reveal">
        <div>
          <span class="mv-kicker">Take it with you</span>
          <h3>Download the granny flats brochure</h3>
          <p>All seven designs, the exemption conditions and our process in one PDF you can share with the family.</p>
        </div>
        <a class="btn btn-primary btn-lg" href="${base}assets/Stable-Structure-70m2-Granny-Flats-Brochure.pdf" download="Stable-Structure-70m2-Granny-Flats-Brochure.pdf">Download brochure (PDF, 4 MB) ${si('arrow', 2.2)}</a>
      </div>
      <p class="gf-disclaimer">This page provides general information only and is not legal or regulatory advice. Eligibility for the building-consent exemption depends on meeting all applicable requirements, and planning, resource-consent, drainage and other council requirements may still apply. Rental use is subject to applicable requirements. Images and models are indicative only.</p>
    </div></section>`,

      ctaBand(base, { title: 'Ready to unlock the potential of your property?', text: 'Your 70m² granny flat could be closer than you think. Talk to Stable Structure about your property, your requirements and what may be possible.', waMsg: GF_WA }),
    ].join('\n'),
  };
}
pages.push(grannyFlatsPage());

/* PRIVACY POLICY (T8: the enquiry form promises privacy; this page backs it up) */
pages.push({
  file: 'privacy.html', base: '', active: '', lastmod: SPRINT_DATE,
  headO: { title: 'Privacy Policy | Stable Structure Limited', desc: 'How Stable Structure Limited collects, uses and protects your personal information, in line with the New Zealand Privacy Act 2020.', pageLabel: 'Privacy Policy' },
  body: [
    pageHero('', { eyebrow: 'Privacy', title: 'Privacy <span class="hl">policy</span>', sub: 'How we collect, use and look after your information.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Privacy Policy' }], cta: false }),
    `<section class="pad"><div class="container"><div class="prose reveal" style="max-width:760px">
      <p style="font-size:17px">Stable Structure Limited ("we", "us") respects your privacy. This policy explains what personal information we collect through this website and how we handle it, in line with the New Zealand Privacy Act 2020.</p>
      <h2>What we collect</h2>
      <p>When you contact us by enquiry form, email, phone or WhatsApp, we collect the details you provide: typically your name, contact details, property address and information about your project. We do not collect payment information through this website.</p>
      <h2>How we use it</h2>
      <p>We use your information solely to respond to your enquiry, provide engineering services you engage us for, and communicate about your project. We do not sell, rent or share your personal information with third parties for marketing. Project information may be shared with councils, contractors or consultants only as needed to deliver the services you have asked for.</p>
      <h2>Storage and security</h2>
      <p>Your information is stored securely and retained only as long as needed for the purpose it was collected, or as required for our professional records. Engineering documentation carries statutory retention obligations, so project records are kept accordingly.</p>
      <h2>Cookies and analytics</h2>
      <p>This website does not run advertising trackers. Basic, privacy-respecting traffic measurement may be used to understand how the site is used.</p>
      <h2>Your rights</h2>
      <p>Under the Privacy Act 2020 you may ask for a copy of the personal information we hold about you, and ask us to correct it. Contact us at <a href="mailto:${EMAIL}">${EMAIL}</a> or ${PHONE_DISPLAY} and we will respond promptly.</p>
      <p><i>Last updated: 13 August 2026</i></p>
    </div></div></section>`,
  ].join('\n'),
});

/* 404 — both GitHub Pages and Vercel serve /404.html for any unknown path
   (including nested ones), so ALL links on this page must be absolute or they
   would resolve relative to the bad URL. Using an absolute base makes the
   shared header/footer/nav links absolute too. BASE_PATH tracks the host, so
   this stays correct at a domain root and under a subpath.
   Excluded from sitemap.xml and marked noindex. */
const NOTFOUND_BASE = BASE_PATH;
const notFoundPage = {
  file: '404.html', base: NOTFOUND_BASE, active: '', noindex: true,
  headO: { title: 'Page not found | Stable Structure Limited', desc: 'The page you were looking for could not be found. Explore our structural and civil engineering services or get in touch.', noindex: true },
  body: [
    `<section class="page-hero">
    <div class="container">
      <span class="eyebrow on-dark">Error 404</span>
      <h1>Page not found</h1>
      <p class="sub">Sorry, the page you were looking for does not exist or may have moved. Let's get you back on track.</p>
      <div class="ph-cta">
        <a class="btn btn-primary btn-lg" href="${NOTFOUND_BASE}">Back to home ${si('arrow', 2.2)}</a>
        <a class="btn btn-ghost btn-lg" href="${NOTFOUND_BASE}contact.html">Contact us</a>
      </div>
    </div>
  </section>`,
    `<section class="pad"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Popular pages</span><h2 class="section-title">Where would you like to go?</h2></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:8px" class="reveal">
        <a class="btn btn-ghost btn-lg" href="${NOTFOUND_BASE}">Home</a>
        <a class="btn btn-ghost btn-lg" href="${NOTFOUND_BASE}services.html">Services</a>
        <a class="btn btn-ghost btn-lg" href="${NOTFOUND_BASE}contact.html">Contact</a>
      </div>
    </div></section>`,
  ].join('\n'),
};

/* ---------- Write files ---------- */
let count = 0;
[...pages, notFoundPage].forEach((p) => {
  const outPath = path.join(ROOT, p.file);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, layout({ base: p.base, active: p.active, headO: p.headO, body: p.body, file: p.file, extraScripts: p.extraScripts }), 'utf8');
  count++;
  console.log('  ✓', p.file);
});

/* ---------- CSP inline-script hashes ----------
   The site has two inline scripts (the html.js flag and the 3D-viewer loader).
   next.config.ts allows them by hash instead of 'unsafe-inline', so record the
   hashes here from the HTML actually written. Runs before `next build`. */
{
  const crypto = require('crypto');
  const hashes = new Set();
  [...pages, notFoundPage].forEach((p) => {
    const html = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      hashes.add('sha256-' + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64'));
    }
  });
  fs.writeFileSync(path.join(ROOT, 'build', 'csp-inline-hashes.json'), JSON.stringify([...hashes], null, 2) + '\n', 'utf8');
  console.log('  ✓', 'build/csp-inline-hashes.json', `(${hashes.size} inline scripts)`);
}

/* ---------- sitemap.xml (indexable pages only; excludes 404) ----------
   lastmod discipline: every entry defaults to SPRINT_DATE because the
   2026-08-13 sprint changed every page's head (schema/fonts/og). From now on,
   set `lastmod` on a page's entry ONLY when its content meaningfully changes —
   never blanket-update all pages to the build date. */
const sitemapUrls = pages.map((p) => {
  const loc = SITE_URL + (p.file === 'index.html' ? '' : p.file);
  return `  <url><loc>${loc}</loc><lastmod>${p.lastmod || SPRINT_DATE}</lastmod></url>`;
}).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>\n`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');
console.log('  ✓', 'sitemap.xml', `(${pages.length} urls)`);

/* ---------- robots.txt (allow all; point crawlers to the sitemap) ---------- */
const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}sitemap.xml\n`;
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf8');
console.log('  ✓', 'robots.txt');

/* ---------- llms.txt (optional; a plain list of the main pages for AI tools) ---------- */
const llmsLine = (p) => `- [${(p.headO.pageLabel || p.headO.serviceName || p.headO.title).replace(/&amp;/g, '&').replace(/ \| .*$/, '')}](${SITE_URL}${p.file === 'index.html' ? '' : p.file}): ${p.headO.desc.replace(/&amp;/g, '&')}`;
const llms = `# ${LEGAL_NAME}

> Structural and civil engineering consultancy in Botany, Auckland, New Zealand, led by a Chartered Professional Engineer (CPEng #${CPENG_NUMBER}). Structural design, PS1 building consent documentation, site inspections, construction monitoring and PS4, retaining walls, pools, decks and portal frames, across Auckland and New Zealand.

Contact: ${PHONE_DISPLAY} · ${EMAIL} · Mon–Fri 8:30am–5pm

## Services
${pages.filter((p) => p.file.startsWith('services/')).map(llmsLine).join('\n')}

## Guides
${pages.filter((p) => p.file.startsWith('guides/')).map(llmsLine).join('\n')}

## Company
${pages.filter((p) => ['about.html', 'builders-architects.html', 'projects.html', 'testimonials.html', 'faq.html', 'contact.html', 'granny-flats.html'].includes(p.file)).map(llmsLine).join('\n')}
`;
fs.writeFileSync(path.join(ROOT, 'llms.txt'), llms, 'utf8');
console.log('  ✓', 'llms.txt');

console.log(`\nGenerated ${count} pages + sitemap.xml + robots.txt + llms.txt.`);
