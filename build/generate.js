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

/* Google Business Profile Place ID — paste it here once retrieved from the GBP
   dashboard (or https://developers.google.com/maps/documentation/places/web-service/place-id).
   While empty, review CTAs fall back to the generic Maps search link. */
const GOOGLE_PLACE_ID = '';

/* Per-page lastmod discipline for sitemap.xml: every entry in `pages` carries a
   `lastmod` — update it ONLY when that page's content meaningfully changes.
   (2026-08-13 = the schema/font/perf sprint touched every page's head.) */
const SPRINT_DATE = '2026-08-13';

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
const stars5 = () => `<div class="stars" aria-label="5 out of 5 stars">${star().repeat(5)}</div>`;

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
    sub: 'Engineered retaining walls in timber, block or concrete — designed to hold, drain and last on any slope.',
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
    description: 'Structural and civil engineering consultancy in Botany, Auckland, serving all of New Zealand.',
    telephone: PHONE_TEL,
    email: EMAIL,
    address: { '@type': 'PostalAddress', addressLocality: 'Botany', addressRegion: 'Auckland', addressCountry: 'NZ' },
    areaServed: 'New Zealand',
    sameAs: [LINKEDIN_URL, FACEBOOK_URL],
    founder: {
      '@type': 'Person',
      name: OWNER,
      jobTitle: 'Director',
      hasCredential: [
        { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Chartered Professional Engineer (CPEng), Engineering New Zealand', identifier: '1030007', url: 'https://members.engineeringnz.org/s/cpeng-register' },
        { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Chartered Engineer (CEng), United Kingdom' },
        { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Member of the Institution of Structural Engineers (MIStructE)' },
      ],
    },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '08:30', closes: '17:00',
    }],
    slogan: 'Strong solutions for your vision',
  };
}

/* Breadcrumb trail derived from the output path so it always mirrors the
   visible breadcrumb labels (2-level for top pages, 3-level for services and
   guides). Returns null for the homepage and 404. */
const TOP_LABELS = {
  'services.html': 'Services', 'sectors.html': 'Sectors', 'projects.html': 'Our Projects',
  'about.html': 'About', 'process.html': 'Process', 'testimonials.html': 'Reviews',
  'faq.html': 'FAQ', 'contact.html': 'Contact', 'privacy.html': 'Privacy Policy',
};
function crumbTrail(file, pageTitle) {
  if (!file || file === 'index.html' || file === '404.html') return null;
  const home = { label: 'Home', url: SITE_URL };
  if (file.startsWith('services/')) {
    return [home, { label: 'Services', url: `${SITE_URL}services.html` }, { label: pageTitle, url: SITE_URL + file }];
  }
  if (file.startsWith('guides/')) {
    return [home, { label: 'Guides', url: `${SITE_URL}services.html` }, { label: pageTitle, url: SITE_URL + file }];
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
  const graph = [orgNode()];
  if (file === 'index.html') {
    graph.push({ '@type': 'WebSite', '@id': `${SITE_URL}#website`, url: SITE_URL, name: 'Stable Structure Limited', publisher: { '@id': ORG_ID } });
  }
  const trail = o.noindex ? null : crumbTrail(file, o.serviceName || o.pageLabel || '');
  if (trail) graph.push(breadcrumbNode(trail));
  if (o.serviceType) {
    graph.push({
      '@type': 'Service',
      name: o.serviceName || o.title,
      serviceType: o.serviceType,
      provider: { '@id': ORG_ID },
      areaServed: 'New Zealand',
      url: pageUrl,
      description: o.desc,
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
<meta property="og:image" content="${SITE_URL}assets/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preload" href="${base}assets/fonts/space-grotesk-var-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="${base}assets/fonts/inter-var-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="icon" href="${base}favicon.ico" sizes="any" />
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="${base}assets/favicon-48.png" sizes="48x48" type="image/png" />
<link rel="apple-touch-icon" href="${base}assets/apple-touch-icon.png" />
<link rel="stylesheet" href="${base}styles.css?v=${SPRINT_DATE}" />
<script type="application/ld+json">
${ldFor(o, file, pageUrl)}
</script>
</head>
<body>`;
}

/* Brand links to the site root (works at any depth on Vercel); the logo is a
   9KB 3x-density WebP (was a 207KB PNG) with explicit dimensions to avoid CLS. */
const brand = (base, footer) => `<a class="brand" href="${BASE_PATH}" aria-label="Stable Structure Limited home">
  <img class="logo" src="${base}assets/logo.webp" width="303" height="186" alt="Stable Structure Limited — Structural & Civil Engineering"${footer ? '' : ' fetchpriority="high"'} />
</a>`;

const NAV = [
  { key: 'home', label: 'Home', href: 'index.html' },
  { key: 'services', label: 'Services', href: 'services.html', dd: true },
  { key: 'sectors', label: 'Sectors', href: 'sectors.html' },
  { key: 'projects', label: 'Our Projects', href: 'projects.html' },
  { key: 'about', label: 'About', href: 'about.html' },
  { key: 'process', label: 'Process', href: 'process.html' },
  { key: 'reviews', label: 'Reviews', href: 'testimonials.html' },
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
    return `<a class="${cls}" href="${base}${n.href}">${n.label}</a>`;
  }).join('\n      ');

  const mobileServices = SERVICES.map(s => `<a href="${base}${svcPath(s)}">${s.title}</a>`).join('\n          ');

  return `<header class="site" id="top">
  <div class="container nav">
    ${brand(base)}
    <nav class="nav-links" aria-label="Primary">
      ${links}
    </nav>
    <div class="nav-cta">
      <a class="btn btn-primary" href="${base}contact.html">Get a Free Quote</a>
    </div>
    <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu">${si('burger', 2)}</button>
  </div>
</header>

<div class="mobile-menu" id="mobileMenu">
  <a class="m-link" href="${base}index.html">Home</a>
  <details class="m-acc">
    <summary>Services <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I.caret}</svg></summary>
    <div class="m-sub">
      <a href="${base}services.html"><strong>All services</strong></a>
          ${mobileServices}
    </div>
  </details>
  <a class="m-link" href="${base}sectors.html">Sectors</a>
  <a class="m-link" href="${base}projects.html">Our Projects</a>
  <a class="m-link" href="${base}about.html">About</a>
  <a class="m-link" href="${base}process.html">Process</a>
  <a class="m-link" href="${base}testimonials.html">Reviews</a>
  <a class="m-link" href="${base}faq.html">FAQ</a>
  <a class="m-link" href="${base}contact.html">Contact</a>
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
        <h5>Services</h5>
        ${someServices}
        <a href="${base}services.html">View all services →</a>
      </div>
      <div class="foot-col">
        <h5>Company</h5>
        <a href="${base}sectors.html">Sectors</a>
        <a href="${base}projects.html">Our projects</a>
        <a href="${base}about.html">About us</a>
        <a href="${base}process.html">Our process</a>
        <a href="${base}testimonials.html">Reviews</a>
        <a href="${base}faq.html">FAQ</a>
        <a href="${base}contact.html">Contact</a>
      </div>
    </div>
    <div class="foot-grid" style="border-bottom:none;padding-bottom:0;grid-template-columns:1fr">
      <div class="foot-col">
        <h5>Get in touch</h5>
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
      <span>© <span id="year">2026</span> Stable Structure Limited. All rights reserved.</span>
      <span><a href="${base}privacy.html">Privacy Policy</a> · Structural &amp; Civil Engineering · Auckland, New Zealand</span>
    </div>
  </div>
</footer>`;
}

function callbar(base) {
  return `<div class="callbar" role="complementary" aria-label="Quick contact">
  <div class="cb-txt"><b>Ready to start?</b><span>Free quote · Mon–Fri 8:30–5</span></div>
  <a class="btn btn-wa" href="${waHref()}" target="_blank" rel="noopener" aria-label="Message us on WhatsApp">${wa()} WhatsApp</a>
  <a class="btn btn-primary icononly" href="tel:${PHONE_TEL}" aria-label="Call ${PHONE_DISPLAY}">${si('phone', 2)}</a>
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
   bump SPRINT_DATE on any styles.css / main.js edit. */
const scripts = (base) => `<script src="${base}main.js?v=${SPRINT_DATE}"></script>\n</body>\n</html>`;

function pageHero(base, o) {
  const crumbs = (o.crumbs || []).map((c, i, arr) => {
    const last = i === arr.length - 1;
    const link = last ? `<span>${c.label}</span>` : `<a href="${base}${c.href}">${c.label}</a>`;
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
  featured: {
    initial: 'S', name: 'Sonia Singh', meta: 'Local Guide · 26 reviews', when: 'a month ago',
    text: 'Gajan &amp; Team are very Professional, reliable, and incredibly thorough. Highly recommend their structural engineering services.',
    org: 'Proconcept Design Ltd',
  },
  others: [
    { initial: 'A', name: 'Ananayan', when: '6 months ago' },
    { initial: 'N', name: 'Niranjan Tharma', when: '2 years ago' },
    { initial: 'A', name: 'arunthamil 2004', when: '4 years ago' },
  ],
};
const googleGlyph = () => `<svg class="gg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.6-2-6.5-4.8H1.7v3A11.9 11.9 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.5 14.6a7.1 7.1 0 0 1 0-4.6v-3H1.7a12 12 0 0 0 0 10.6z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.7 11.7 0 0 0 12 0 11.9 11.9 0 0 0 1.7 6l3.8 3c.9-2.8 3.5-4.8 6.5-4.8z"/></svg>`;

function reviewsSummary() {
  return `<div class="reviews-summary reveal">
      <div class="rs-score">
        <div class="rs-num">${REVIEWS.rating}</div>
        <div>${stars5()}<span class="rs-meta">${googleGlyph()} From our Google reviews</span></div>
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
      <blockquote>“${f.text}”</blockquote>
      <figcaption class="who"><div class="av">${f.initial}</div><div><b>${f.name}</b><span>${f.org} · ${f.meta} · ${f.when}</span></div></figcaption>
    </figure>`;
}
function otherReviews() {
  return `<div class="rev-mini-grid">
      ${REVIEWS.others.map(r => `<div class="rev-mini reveal"><div class="av">${r.initial}</div><div class="rm-body"><b>${r.name}</b><div class="stars sm">${star().repeat(5)}</div><span>${r.when} · via Google</span></div></div>`).join('\n      ')}
    </div>`;
}

/* FAQ */
const FAQS = [
  ['Do you provide PS1 documentation for building consent?', 'Yes. We prepare detailed structural and civil drawings, calculations and Producer Statements (PS1) so your building consent application is complete and consent-ready.'],
  ['Which areas of New Zealand do you cover?', 'We are based in Botany, Auckland and provide structural and civil engineering services for residential, commercial and industrial projects throughout New Zealand.'],
  ['Do I need a structural engineer for a deck or retaining wall?', 'Often, yes — higher decks, cantilevered structures and retaining walls above certain heights require engineering design and council consent. If you are unsure, give us a call and we will let you know what is needed.'],
  ['How much does structural engineering cost?', 'It depends on the size and complexity of your project. We provide a clear, upfront quote before any work begins — get in touch with your plans or a description and we will give you a free, no-obligation estimate.'],
  ['How soon can you start?', 'We pride ourselves on responsive turnaround. Timeframes vary with workload and project scope, so call or send an enquiry and we will confirm our current availability for you.'],
  ['Can you work from my architect or designer’s plans?', 'Absolutely. We regularly collaborate with architects, designers and builders, providing the structural and civil engineering to bring their plans to life and through consent.'],
];
function faqBlock(list) {
  return `<div class="faq">
      ${list.map((f, i) => `<details class="reveal"${i === 0 ? ' open' : ''}>
        <summary>${f[0]}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">${I.plus}</svg></summary>
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
        <div class="infoitem"><div class="ii">${si('clock', 2)}</div><div><b>Office hours</b><span>Monday – Friday, 8:30am – 5:00pm</span></div></div>
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

    <!-- Enquiry form. Submits via the visitor's email app to ${EMAIL} (no backend needed).
         For a smoother inbox experience, swap action for a form endpoint (e.g. Formspree). -->
    <form class="enquiry reveal" id="enquiryForm" action="mailto:${EMAIL}" method="post" enctype="text/plain" novalidate>
      <h3>Make an enquiry</h3>
      <p class="fsub">Your enquiry goes straight to ${OWNER}. We usually reply within one business day.</p>
      <div class="field two">
        <div class="field"><label for="name">Full name <span class="req">*</span></label><input id="name" name="name" type="text" autocomplete="name" required placeholder="Jane Smith" /></div>
        <div class="field"><label for="phone">Phone <span class="req">*</span></label><input id="phone" name="phone" type="tel" autocomplete="tel" required placeholder="021 000 0000" /></div>
      </div>
      <div class="field"><label for="email">Email <span class="req">*</span></label><input id="email" name="email" type="email" autocomplete="email" required placeholder="you@email.co.nz" /></div>
      <div class="field"><label for="service">What do you need help with?</label>
        <select id="service" name="service"><option value="">Select a service…</option>
          ${opts}
          <option>Something else</option>
        </select>
      </div>
      <div class="field"><label for="message">Project details</label>
        <textarea id="message" name="message" placeholder="Tell us about your project, location and timeframe…"></textarea>
        <p class="hint">Adding your suburb and a rough timeframe helps us reply with a useful quote.</p>
      </div>
      <button type="submit" class="btn btn-primary btn-lg">Send enquiry ${si('arrow', 2.2)}</button>
      <div class="form-status" id="formStatus" role="status" aria-live="polite"></div>
      <p class="form-note">By sending this enquiry you agree to be contacted about your project. We never share your details.</p>
    </form>
  </div>`;
}

/* ---------- Page assembly ---------- */
const skipLink = () => `<a class="skip-link" href="#main">Skip to main content</a>`;

function layout({ base, active, headO, body, file }) {
  return [
    head(headO, base, file),
    skipLink(),
    header(base, active),
    `<main id="main">`,
    body,
    `</main>`,
    callbar(base),
    footer(base),
    scripts(base),
  ].join('\n');
}

/* Home hero (with structural visual) */
function homeHero(base) {
  return `<section class="hero">
  <div class="container hero-grid">
    <div class="reveal">
      <span class="hero-badge"><span class="dot"></span>Kiwi-owned · Botany, Auckland</span>
      <h1 style="margin-top:18px">Strong solutions for <span class="hl">your vision.</span></h1>
      <p class="sub">Stable Structure Limited is a premier structural &amp; civil engineering consultancy. From your first sketch to final sign-off, we turn complex engineering challenges into practical, cost-effective, fully compliant designs — right across New Zealand.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="${base}contact.html">Request a Free Quote ${si('arrow', 2.2)}</a>
        <a class="btn btn-wa btn-lg" href="${waHref()}" target="_blank" rel="noopener">${wa()} WhatsApp us</a>
      </div>
      <div class="hero-trust">
        <div class="ht">${si('shield', 2)}NZ Building Code compliant</div>
        <div class="ht">${si('check', 2)}Consent-ready documentation</div>
        <div class="ht">${si('clock', 2)}Fast, responsive turnaround</div>
      </div>
    </div>
    <div class="hero-visual reveal">
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
    <div class="stat"><div class="num">100<span class="u">%</span></div><div class="lbl">Compliance-focused design</div></div>
    <div class="stat"><div class="num">5.0<span class="u">★</span></div><div class="lbl">Average client rating</div></div>
    <div class="stat"><div class="num">12<span class="u">+</span></div><div class="lbl">Engineering service lines</div></div>
    <div class="stat"><div class="num">NZ</div><div class="lbl">Wide project coverage</div></div>
  </div></div></section>`;
}

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

  const cards = projects.map((p) => {
    const imgs = p.images.map((i) => `${base}${i}`);
    const caption = p.caption || '';
    const extra = imgs.length - 1;
    const alt = caption ? caption.replace(/\s+/g, ' ').slice(0, 110) : 'Stable Structure project photo';
    return `<article class="proj-card reveal" data-images="${esc(JSON.stringify(imgs))}" data-caption="${esc(caption)}"${p.permalink ? ` data-permalink="${esc(p.permalink)}"` : ''}>
        <button class="proj-media" type="button" aria-label="View photos for this project">
          <img src="${imgs[0]}" width="1200" height="900" loading="lazy" alt="${esc(alt)}" />
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
<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Project photo" hidden>
  <button class="lb-btn lb-close" type="button" aria-label="Close">${si('close', 2.2)}</button>
  <button class="lb-btn lb-prev" type="button" aria-label="Previous photo">${si('chevr', 2.2)}</button>
  <figure class="lb-figure">
    <img class="lb-img" src="" alt="" />
    <figcaption class="lb-cap"></figcaption>
  </figure>
  <button class="lb-btn lb-next" type="button" aria-label="Next photo">${si('chevr', 2.2)}</button>
</div>`;
}

function projectsVideo() {
  if (!PROJECT_VIDEO_EMBED) return '';
  return `<section class="pad-sm"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">In motion</span><h2 class="section-title">See our work in action</h2><p class="lead">A closer look at one of our recent builds, straight from our Facebook.</p></div>
      <div class="video-embed reveal">
        <iframe title="Stable Structure project video" src="${PROJECT_VIDEO_EMBED}" loading="lazy" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>
      </div>
    </div></section>`;
}

function teamSection(base) {
  const team = [
    {
      photo: 'gajanthan.jpg', name: OWNER, role: 'Director',
      cred: 'BSc(Eng) · MSc(Struct) · MIStructE · CMEngNZ · CEng (UK) · CPEng (NZ) #1030007',
      bio: [
        `Gajanthan founded Stable Structure Limited and has spent more than eight years delivering innovative, practical engineering solutions. He holds a Bachelor of Engineering (Structural) from Sri Lanka and a Master of Science in Structural Engineering from the National University of Singapore, and is both a Chartered Structural Engineer (MIStructE, UK) and a Chartered Professional Engineer (CPEng) with Engineering New Zealand.`,
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
      photo: 'damitha.jpg', name: 'Damitha Disanthi', role: 'Structural Draughtsperson',
      cred: 'B.Arch.(Hons) · AIA · RIBA · MSc in Project Management',
      bio: [
        `Damitha brings over ten years of experience across architecture, project management and technical documentation. She holds a Bachelor of Architecture (Honours) from the University of Moratuwa, Sri Lanka.`,
        `Since relocating to New Zealand she has worked in structural drafting, preparing the detailed structural drawings and building consent documentation that carry a project through council — working in AutoCAD and Revit.`,
      ],
      note: `Outside work, Damitha enjoys time with her family, exploring New Zealand's natural landscapes, and continually building her knowledge of New Zealand building standards and construction practices.`,
      actions: '',
    },
    {
      photo: 'kemaruban.jpg', name: 'Kemaruban Rajaratnam', role: 'Project Coordinator / Graduate Structural Engineer',
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
        <div class="tm-photo"><img src="${base}assets/team/${m.photo}" width="720" height="900" loading="lazy" alt="${m.name}, ${m.role} at Stable Structure Limited" /></div>
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
      <div class="section-head center reveal"><span class="eyebrow">Our team</span><h2 class="section-title">Meet the engineers behind your project</h2><p class="lead">You work directly with experienced, chartered engineers who take personal ownership of your project — from first concept through to final sign-off.</p></div>
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
        <div class="feature"><div class="fic">${si('gem', 2)}</div><div><h4>Practical, cost-effective solutions</h4><p>We value-engineer every design so it is economical to build without compromising safety or performance.</p></div></div>
        <div class="feature"><div class="fic">${si('shield', 2)}</div><div><h4>Compliance you can rely on</h4><p>Every project is designed to the NZ Building Code and relevant standards, with clear documentation for council.</p></div></div>
        <div class="feature"><div class="fic">${si('users', 2)}</div><div><h4>Expert guidance at every stage</h4><p>Clear communication and hands-on advice from concept to completion — you are never left guessing.</p></div></div>
        <div class="feature"><div class="fic">${si('clock', 2)}</div><div><h4>Responsive, on-time delivery</h4><p>We keep your project moving with fast turnaround and proactive engineering support.</p></div></div>
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
const byline = (base) => `<div class="byline reveal">
  <span class="bv">GV</span>
  <span>Reviewed by <b>${OWNER}</b>, <a href="${CPENG_REGISTER_URL}" target="_blank" rel="noopener" title="Verify on the CPEng register">CPEng #${CPENG_NUMBER}</a> · <a href="${base}about.html">Director, Stable Structure</a></span>
  <span class="upd">${UPDATED_DISPLAY}</span>
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
      ['Is a PS1 a guarantee of the build?', 'No. A PS1 covers the design. Verification that the build matches the design is a PS4, issued after construction monitoring. Many projects need both, and we provide both.'],
      ['Can you work from my draughtsperson’s plans?', 'Yes. We regularly provide the engineering and PS1 to sit behind plans from architects, designers and draughtspeople. We slot into your existing team.'],
      ['My consent got an RFI. Can you help?', 'Yes. We prepare the engineering response and liaise with council, whether or not we produced the original design.'],
      ['Do minor renovations need a PS1?', 'Only where there is specific engineering design, such as removing a load-bearing wall or adding a steel beam. If your project stays fully within NZS 3604, a PS1 may not be needed. Send us your plans and we will tell you straight.'],
    ])}
    <h2>Why owners and designers use us for consent documentation</h2>
    <p>Consent documentation is where an engineering consultancy either saves you weeks or costs you weeks. Ours is prepared by the same chartered engineer who signs the PS1, which is exactly the accountability council wants to see, and exactly what gets your project to site sooner.</p>`,

  /* ---- Retaining Walls — GSC: pos 45.2, "concrete/engineered retaining walls", "nzs 3604" ---- */
  'retaining-walls': (base) => `
    <p style="font-size:17px">An engineered retaining wall holds back soil, water and load for decades without complaint. We design timber pole, concrete block and reinforced concrete retaining walls across East Auckland and New Zealand-wide, and prepare the calculations and consent documentation that councils require.</p>
    ${byline(base)}
    <h2>When does a retaining wall need an engineer?</h2>
    <p>Under the Building Act, a retaining wall retaining up to 1.5 metres with no extra load behind it (no surcharge) is generally exempt from building consent. Engineering enters the picture when the wall retains <b>more than 1.5 metres</b>, or carries a <b>surcharge</b>: a driveway, building, pool or sloping ground above the wall. Those walls need specific engineering design and consent, and councils will not accept them without calculations and a PS1. Walls near boundaries, on soft ground, or supporting vehicle loads deserve engineering even when they are technically exempt, because they are the ones that fail expensively.</p>
    ${guideLink(base, 'guides/retaining-wall-consent-nz.html', 'Guide: When does a retaining wall need consent in NZ?')}
    <h2>Timber, block or concrete: which wall is right?</h2>
    <p><b>Timber pole walls</b> are the workhorse of Auckland sections: economical up to around 2 to 3 metres, quick to build, and well suited to sloped landscaping. <b>Concrete block (masonry) walls</b> suit tighter urban sites and tie in neatly with buildings and boundary walls. <b>Reinforced concrete walls</b> carry the biggest loads in the least thickness, which makes them the pick for driveways, basements and heavily surcharged boundaries. We design all three, and we will tell you honestly which one your site actually needs rather than defaulting to the most expensive option.</p>
    <h2>How much does retaining wall engineering cost?</h2>
    <p>The engineering fee tracks the wall, not the section price: height, surcharge, ground conditions (and whether a geotechnical report is needed), total wall length and site access are what move it. The wall itself is priced by your contractor, and a well-engineered design usually pays for itself by trimming over-conservative sizing from the build. Send us a photo, a rough height and what sits above the wall and we will give you a <b>fixed quote before we start</b>, so there are no surprises at either end.</p>
    <h2>Drainage: the part that actually keeps walls standing</h2>
    <p>Most retaining wall failures in Auckland are water failures, not soil failures. Every wall we design includes subsoil drainage: drainage metal, a properly falled novacoil drain and an outlet that daylights somewhere sensible. It is unglamorous, invisible after backfill, and the reason our walls stay straight through an Auckland winter.</p>
    <h2>What about the ground itself?</h2>
    <p>A retaining wall is only as good as what it stands in. For most residential walls we design from conservative published soil parameters appropriate to your area, which keeps costs down. Taller walls, soft or filled ground, and walls supporting buildings justify a geotechnical investigation, and we will tell you up front when that is genuinely needed rather than discovering it mid-project. Where a geotech report exists we design directly to its parameters, which usually sharpens the design and saves construction cost.</p>
    <h2>How the design process runs</h2>
    <p>First we look at your site: photos, plans and levels are often enough to scope and quote. Then we design the wall and its drainage, produce the drawings and calculations, and issue the PS1 for consent where one is required. During construction we inspect the critical stages, typically pole embedment or footing steel and the drainage before backfill, and close out with the PS4 your council needs. One engineer, one thread of responsibility, from first sketch to sign-off.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['My wall is under 1.5m. Do I still need an engineer?', 'If it carries no surcharge, usually not for consent. But walls under 1.5m holding up driveways, pools or buildings still need engineering, and any wall near a boundary is worth designing properly.'],
      ['Do you handle the building consent too?', 'Yes. We prepare the drawings, calculations and PS1, and can manage the consent application and any council RFIs end to end.'],
      ['Can you design walls outside Auckland?', 'Yes. We design retaining walls throughout New Zealand and prepare documentation for any council, with site-specific loads and ground assumptions for your region.'],
      ['What about existing walls that are leaning?', 'We inspect and assess existing retaining walls, report on their condition, and design remediation or replacement where needed.'],
    ])}
    <h2>Fences, pools and boundaries on top of walls</h2>
    <p>Two details catch people out. A fence or barrier fixed to the top of a retaining wall adds wind and impact load the wall must be designed for, so tell your engineer about it before the design is done, not after the fence goes up. And where a wall sits on or near a boundary, the design must respect both properties: footing positions, drainage discharge and construction access all need answers your neighbour can live with. We deal with both situations weekly and design for them from the start.</p>
    <h2>Built on slopes, priced for real budgets</h2>
    <p>Auckland is a city of slopes, and almost every section eventually needs ground held back. Our walls are engineered to carry exactly the loads your site imposes, with drainage that keeps them working and documentation that goes through council first time.</p>`,

  /* ---- Construction Supervision — GSC: pos 35.3, biggest impression pool, "south auckland" ---- */
  'construction-supervision': (base) => `
    <p style="font-size:17px">Construction supervision (often called construction monitoring) is ongoing engineering oversight of the structural work on your build: an engineer who visits site at the moments that matter, solves problems before they become defects, and issues the completion documentation your council requires. We provide construction supervision across South and East Auckland, and for projects throughout New Zealand.</p>
    ${byline(base)}
    <h2>What does an engineer actually do during supervision?</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Inspects critical structural stages before they are covered up: foundations, reinforcing, framing, connections</span></li>
      <li>${si('check', 2.2)}<span>Answers builder queries fast so the site never waits on engineering</span></li>
      <li>${si('check', 2.2)}<span>Resolves the surprises every build produces: unexpected ground, substitutions, clashes</span></li>
      <li>${si('check', 2.2)}<span>Documents each visit with a written site report</span></li>
      <li>${si('check', 2.2)}<span>Issues the PS4 (Construction Review) council needs before Code Compliance</span></li>
    </ul>
    <h2>Is construction monitoring required on my project?</h2>
    <p>If your consent involved specific engineering design, the consent conditions almost always require engineering construction monitoring, and council will withhold the Code Compliance Certificate until a PS4 is issued. In New Zealand this is formalised as construction monitoring service levels <b>CM1 to CM5</b>: CM1 is occasional review of a simple element, CM5 is near-continuous oversight of complex structures. Residential projects typically sit at CM2 or CM3, meaning inspections at defined critical stages. Your consent documents state the required level; if you are unsure, send them to us and we will tell you exactly what is needed.</p>
    <h2>What does construction supervision cost?</h2>
    <p>Monitoring is priced per site visit or as a fixed package for the whole build, agreed up front: most single-dwelling projects need three to six visits plus the PS4, and the required CM level in your consent sets the visit count more than anything else. Send us your consent conditions and we will quote the full monitoring scope as one fixed number. The honest comparison is not against zero: it is against the cost of rebuilding covered-up work that failed a council inspection, which is always more.</p>
    <h2>Supervision in South and East Auckland</h2>
    <p>Being based in Botany means South Auckland and East Auckland sites (Flat Bush, Howick, Pakuranga, Manukau and surrounds) get genuinely responsive coverage: an engineer who can be on site quickly when the concrete truck is booked for tomorrow morning. For projects further afield we plan monitoring visits around the construction programme, and we supervise builds nationwide.</p>
    <h2>How monitoring fits your build programme</h2>
    <p>At engagement we agree the hold points with you and your builder: the stages that must not proceed until they are inspected. Typical residential hold points are foundation excavation, footing reinforcement before pour, subfloor or slab steel, structural framing before lining, and retaining drainage before backfill. Your builder gives us a day or two of notice as each stage approaches; we inspect, report the same day, and the build carries straight on. Done this way, monitoring costs the programme nothing: the inspections slot into gaps that exist anyway between trades.</p>
    <h2>When something on site is not right</h2>
    <p>It happens on most builds: reinforcing in the wrong place, a substituted beam, ground that does not match the borelog. What matters is what happens next. We document the issue, design the fix (often on the spot), and confirm it at the next visit, keeping a clear paper trail so the PS4 at the end is honest and defensible. Builders tend to like working with us for exactly this reason: problems get solved in hours, not buried in emails.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['What is the difference between supervision and a one-off inspection?', 'A one-off inspection answers a single question. Supervision is a planned series of stage inspections across the build, ending in a PS4. Council conditions usually require the latter for engineered designs.'],
      ['Can you supervise a design by another engineer?', 'Yes, subject to reviewing the design first. We regularly pick up monitoring for projects where the original designer is unavailable.'],
      ['Who books the inspections?', 'Your builder calls us at the agreed hold points, typically a day or two ahead. We fit site visits around concrete pours and council inspections so the programme never slips on our account.'],
      ['Do you issue the PS4 at the end?', 'Yes. Once the monitored work is complete and any items closed out, we issue the PS4 council needs for your Code Compliance Certificate.'],
    ])}
    <h2>Who engages us for supervision</h2>
    <p>Homeowners building or renovating engage us so someone technical is watching their biggest investment. Builders engage us because consent conditions demand monitoring and they want an engineer who answers the phone and turns up. Architects and designers engage us to protect their design intent through construction. Whoever holds the contract, the service is the same: planned inspections, fast answers, honest reports and a PS4 at the end that means something.</p>
    <h2>The engineer on your side of the fence</h2>
    <p>A build is a thousand small decisions made quickly. Supervision means those decisions get made with an engineer in the loop, your documentation arrives complete at the end, and nobody is arguing with council about covered-up work a year later.</p>`,

  /* ---- Site Inspections (stretch 4th) — GSC: pos 38.0, "structural inspection", "ps4" ---- */
  'site-inspections': (base) => `
    <p style="font-size:17px">A structural site inspection is an engineer's independent check of structural work at a critical stage: before the concrete pour, before the framing is lined, before anything is buried or covered. We carry out inspections across Auckland and New Zealand-wide, with written reports and PS4 documentation councils accept.</p>
    ${byline(base)}
    <h2>Which stages need a structural inspection?</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span>Foundation excavations: confirming bearing before footings are poured</span></li>
      <li>${si('check', 2.2)}<span>Reinforcing steel: placement, cover and laps checked against the drawings</span></li>
      <li>${si('check', 2.2)}<span>Structural framing, beams and connections before linings close them in</span></li>
      <li>${si('check', 2.2)}<span>Retaining wall construction and drainage before backfill</span></li>
      <li>${si('check', 2.2)}<span>Remedial and pre-purchase structural assessments</span></li>
    </ul>
    <h2>What is a PS4 construction review?</h2>
    <p>A PS4 (Producer Statement, Construction Review) is the engineer's formal statement that the structural work has been built in accordance with the consented design. Council requires it before issuing your Code Compliance Certificate whenever the project involved specific engineering design. A PS4 can only responsibly be issued by an engineer who actually inspected the critical stages, which is why booking inspections early matters: an engineer cannot review work that is already buried.</p>
    <h2>What does a site inspection cost?</h2>
    <p>A single inspection with a written report is priced by location and scope, quoted fixed when you book, with PS4 documentation priced within a monitoring package rather than per visit. For projects outside Auckland we quote travel transparently, and for construction monitoring across a whole build our <a href="construction-supervision.html">construction supervision service</a> is usually the better-value structure.</p>
    <h2>How an inspection visit works</h2>
    <p>Your builder (or you) books the inspection a day or two ahead, telling us the stage and what is being covered up. On site, the engineer checks the work against the consented drawings: dimensions, materials, reinforcing placement and cover, fixings and connections, drainage falls. Anything that does not match is identified immediately and a fix agreed, usually while everyone is still standing next to it. You receive a written report the same day recording what was inspected, what was found and what, if anything, must change before the stage proceeds.</p>
    <h2>What the written report gives you</h2>
    <p>Each report states the date, stage, drawings referenced, observations and outcome, which builds the evidence chain behind the final PS4. That paper trail matters beyond council: it is what a future buyer's lawyer, an insurer or a dispute resolver will ask for when questions arise years later. Owners who keep our inspection reports with their property records are consistently glad they did.</p>
    <h2>Inspections anywhere in New Zealand</h2>
    <p>Most of our inspection work is in Auckland, but engineered builds happen everywhere, and regional projects from Waikato to Queenstown regularly need independent PS4 construction review. We support remote projects with planned inspection visits scheduled around your critical stages, so distance never becomes a compliance gap.</p>
    <h2>Common questions</h2>
    ${miniFaq([
      ['The builder says council inspects anyway. Why add an engineer?', 'Council inspectors check Code minimums; they do not verify specific engineering design, and they will ask for the engineer’s PS4 on engineered elements. The two inspections do different jobs.'],
      ['Can I book a one-off inspection?', 'Yes. Single inspections with a written report are common for retaining walls, decks and remedial questions. If a PS4 is needed across multiple stages, we will say so up front.'],
      ['How much notice do you need?', 'For Auckland sites, a day or two is usually enough. Booking the sequence of hold points at the start of the build is even better.'],
      ['Can you inspect a problem in an existing house?', 'Yes. We assess cracking, sagging, leaks with structural implications and other concerns, and report with clear next steps.'],
    ])}
    <h2>Beyond new builds: assessments of existing structures</h2>
    <p>Inspections are not only for construction. We assess existing houses and structures for buyers before purchase, for owners worried about cracking or movement, and for insurers and lawyers who need an engineer's written opinion. The output is the same discipline applied to an existing building: a clear report stating what we observed, what it means structurally, and what to do about it, with costs and urgency ranked honestly.</p>
    <h2>Independent eyes at the moments that matter</h2>
    <p>Structural problems are cheap to fix at inspection and expensive to fix at discovery. An hour of engineering eyes at the right stage is the best money on the whole build programme.</p>`,
};

/* ---------- Guides (Phase 3) ---------- */
const GUIDES = [
  {
    slug: 'what-is-a-ps1', title: 'What is a PS1? Producer Statements Explained',
    label: 'What is a PS1?',
    desc: 'A plain-English guide to New Zealand producer statements: what a PS1 covers, how it differs from a PS4, who can issue them, what they cost and when your building consent needs one.',
    eyebrow: 'Guide', h1: 'What is a PS1? Producer statements, <span class="hl">explained simply</span>',
    sub: 'What a PS1 actually covers, how it differs from a PS4, who can issue one, and what it should cost. Written by a chartered structural engineer.',
    body: (base) => `
    <p style="font-size:17px">A PS1 (Producer Statement, Design) is a formal statement signed by a qualified engineer confirming that a design complies with the New Zealand Building Code. Councils rely on producer statements instead of re-checking specialist engineering themselves, which makes the PS1 one of the most important documents in your building consent application.</p>
    ${byline(base)}
    <h2>The four producer statements, in one minute</h2>
    <ul class="ticks">
      <li>${si('check', 2.2)}<span><b>PS1, Design:</b> the designer's statement that the design complies with the Building Code. Lodged with your consent application.</span></li>
      <li>${si('check', 2.2)}<span><b>PS2, Design Review:</b> an independent engineer's peer review of someone else's design. Councils request it for complex or unusual structures.</span></li>
      <li>${si('check', 2.2)}<span><b>PS3, Construction:</b> the contractor's statement that they built the works in accordance with the design.</span></li>
      <li>${si('check', 2.2)}<span><b>PS4, Construction Review:</b> the engineer's statement, after construction monitoring, that the built work matches the consented design. Council wants this before your Code Compliance Certificate.</span></li>
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
    <h2>Need a PS1 for your project?</h2>
    <p>Send us your plans and we will confirm the scope, quote a fixed fee, and deliver consent-ready documentation with the PS1 signed by a chartered engineer. See our <a href="${base}services/building-consent-documentation.html">building consent documentation service</a> for what is included.</p>`,
  },
  {
    slug: 'retaining-wall-consent-nz', title: 'When Does a Retaining Wall Need Consent in NZ?',
    label: 'Retaining wall consent rules',
    desc: 'The New Zealand retaining wall consent rules in plain English: the 1.5 metre threshold, what counts as a surcharge, when you need an engineer, and how the design process works.',
    eyebrow: 'Guide', h1: 'When does a retaining wall need <span class="hl">consent in NZ?</span>',
    sub: 'The 1.5 metre rule, what surcharge actually means, and when a wall needs engineering. The plain-English version of the rules.',
    body: (base) => `
    <p style="font-size:17px">In New Zealand, a retaining wall needs building consent when it retains more than 1.5 metres of ground, or when it retains any height with a surcharge: extra load above the wall such as a driveway, building or sloping ground. That is the short answer. The details, and the traps, are below.</p>
    ${byline(base)}
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
    <h2>Get a straight answer on your wall</h2>
    <p>Send us a photo, a rough height and what sits above the wall, and we will tell you whether it needs consent, what design makes sense, and a fixed price for the engineering. Details on our <a href="${base}services/retaining-walls.html">retaining wall design service</a>.</p>`,
  },
];

/* ---------- Individual pages ---------- */
const pages = [];

/* HOME */
pages.push({
  file: 'index.html', base: '', active: 'home',
  headO: { title: 'Structural Engineer Auckland | Stable Structure Limited', desc: 'Chartered structural and civil engineers in Botany, Auckland. Structural design, PS1 consent documentation, site inspections and construction supervision — across Auckland and all of New Zealand.' },
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
      <div style="text-align:center;margin-top:36px" class="reveal"><a class="btn btn-ghost btn-lg" href="testimonials.html">Read all reviews ${si('arrow', 2.2)}</a></div>
    </div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* SERVICES overview */
pages.push({
  file: 'services.html', base: '', active: 'services',
  headO: { title: 'Services | Stable Structure Limited — Structural & Civil Engineering', desc: 'Explore Stable Structure’s engineering services: structural design, civil design, building consent documentation, site inspections, construction supervision, retaining walls, pools, decks and more.' },
  body: [
    pageHero('', { eyebrow: 'Our services', title: 'Structural &amp; civil engineering, end to end', sub: 'From foundations to final sign-off, we cover every stage of your project. Choose a service to see how we can help.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Services' }] }),
    `<section class="pad"><div class="container">${servicesGrid('')}</div></section>`,
    `<section class="pad-sm" style="background:var(--surface-2)"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Helpful guides</span><h2 class="section-title">Straight answers from our engineers</h2></div>
      <div class="guide-links reveal" style="max-width:640px;margin-inline:auto">
        ${GUIDES.map(g => `<a href="guides/${g.slug}.html">${si('consent', 2)} ${g.title}</a>`).join('\n        ')}
      </div>
    </div></section>`,
    `<section class="pad-sm process"><div class="container"><div class="section-head reveal"><span class="eyebrow">How it works</span><h2 class="section-title">A clear path from concept to completion</h2><p class="lead">A straightforward, transparent process that keeps you informed at every step.</p></div>${processSteps()}</div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* SECTORS */
pages.push({
  file: 'sectors.html', base: '', active: 'sectors',
  headO: { title: 'Sectors | Stable Structure Limited — Residential, Commercial & Industrial', desc: 'Structural and civil engineering for residential, commercial and industrial projects across New Zealand.' },
  body: [
    pageHero('', { eyebrow: 'Who we work with', title: 'Engineering across <span class="hl">every sector</span>', sub: 'The same rigour, clarity and compliance — whether it is a backyard deck or a commercial development.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Sectors' }] }),
    `<section class="pad"><div class="container">${sectorsBlock('')}</div></section>`,
    `<section class="pad-sm" style="background:var(--surface-2)"><div class="container"><div class="section-head center reveal"><span class="eyebrow">Whatever you are building</span><h2 class="section-title">Trusted by homeowners, developers &amp; builders</h2><p class="lead">Our clients include homeowners, property developers, commercial investors, construction companies, architects, designers and real estate professionals.</p></div>${reviewsSummary()}<div style="margin-top:24px">${featuredReview()}</div></div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* OUR PROJECTS — gallery of manual entries + hashtagged Facebook posts */
pages.push({
  file: 'projects.html', base: '', active: 'projects',
  headO: { title: 'Our Projects | Stable Structure Limited — Recent Engineering Work', desc: 'Recent structural and civil engineering projects by Stable Structure Limited — new builds, decks, retaining walls, carports and commercial work across Auckland and New Zealand.' },
  body: [
    pageHero('', { eyebrow: 'Our projects', title: 'Recent work, <span class="hl">straight from site</span>', sub: 'A look at what we have been building — new builds, decks, retaining walls, carports and commercial projects from across New Zealand.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Our Projects' }] }),
    projectsSection(''),
    projectsVideo(),
    ctaBand('', { title: 'Have a project like these in mind?', waMsg: "Hi Stable Structure, I saw your projects and I'd like to enquire about mine." }),
  ].join('\n'),
});

/* ABOUT / WHY US */
pages.push({
  file: 'about.html', base: '', active: 'about',
  headO: { title: 'About | Stable Structure Limited — Kiwi-owned Engineering Consultancy', desc: 'Stable Structure Limited is a Kiwi-owned structural and civil engineering consultancy in Botany, Auckland, simplifying complex engineering with practical, compliant solutions.' },
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
  headO: { title: 'Our Process | Stable Structure Limited', desc: 'A clear, transparent engineering process from concept to completion — consult, design, consent and supervise.' },
  body: [
    pageHero('', { eyebrow: 'How it works', title: 'A clear path from <span class="hl">concept to completion</span>', sub: 'A straightforward, transparent process that keeps you informed and your project on track at every step.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Process' }] }),
    `<section class="pad process"><div class="container">${processSteps()}</div></section>`,
    `<section class="pad-sm"><div class="container"><div class="section-head center reveal"><span class="eyebrow">Every step covered</span><h2 class="section-title">What you can expect from us</h2></div>
      <div class="feature-list" style="max-width:760px;margin-inline:auto">
        <div class="feature"><div class="fic">${si('check', 2)}</div><div><h4>An upfront, transparent quote</h4><p>You will know the scope and cost before we begin — no surprises.</p></div></div>
        <div class="feature"><div class="fic">${si('consent', 2)}</div><div><h4>Clear, consent-ready documentation</h4><p>Drawings, calculations and PS1s prepared to move smoothly through council.</p></div></div>
        <div class="feature"><div class="fic">${si('users', 2)}</div><div><h4>A responsive point of contact</h4><p>Real engineering advice whenever you need it, throughout the project.</p></div></div>
        <div class="feature"><div class="fic">${si('supervision', 2)}</div><div><h4>Verified, supervised construction</h4><p>Site inspections and supervision so the build matches the design.</p></div></div>
      </div>
    </div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* TESTIMONIALS */
pages.push({
  file: 'testimonials.html', base: '', active: 'reviews',
  headO: { title: 'Reviews | Stable Structure Limited', desc: 'Read what clients say about Stable Structure Limited — 5-star structural and civil engineering across New Zealand.' },
  body: [
    pageHero('', { eyebrow: 'Client reviews', title: 'Rated <span class="hl">5.0 on Google</span>', sub: 'Every one of our Google reviews is a 5-star rating. Here is what clients say about working with Stable Structure.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Reviews' }] }),
    `<section class="pad"><div class="container">
      ${reviewsSummary()}
      <div style="margin:36px 0 14px"><div class="section-head center reveal" style="margin-bottom:24px"><span class="eyebrow">Featured review</span></div>${featuredReview()}</div>
      <div class="section-head center reveal" style="margin:48px auto 0"><span class="eyebrow">More 5-star ratings</span><h2 class="section-title">Consistently rated five stars</h2><p class="lead">Further verified Google ratings from clients across our projects.</p></div>
      ${otherReviews()}
    </div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* FAQ */
pages.push({
  file: 'faq.html', base: '', active: 'faq',
  headO: { title: 'FAQ | Stable Structure Limited', desc: 'Frequently asked questions about structural and civil engineering, building consent, PS1/PS4, retaining walls, decks and more.' },
  body: [
    pageHero('', { eyebrow: 'Good to know', title: 'Frequently asked <span class="hl">questions</span>', sub: 'Answers to the questions we hear most. Still unsure? Call or WhatsApp us and we will help.', crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'FAQ' }] }),
    `<section class="pad"><div class="container">${faqBlock(FAQS)}</div></section>`,
    ctaBand(''),
  ].join('\n'),
});

/* CONTACT */
pages.push({
  file: 'contact.html', base: '', active: 'contact',
  headO: { title: 'Contact | Stable Structure Limited — Get a Free Quote', desc: 'Contact Stable Structure Limited for structural and civil engineering in Auckland and across New Zealand. Call or WhatsApp 021 148 8984, or send an enquiry.' },
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
  'structural-design': 'Structural Design Engineer, Auckland | Stable Structure',
  'civil-design': 'Civil Engineering Design, Auckland | Stable Structure',
  'building-consent-documentation': 'PS1 & Building Consent Documentation, Auckland | Stable Structure',
  'site-inspections': 'Structural Site Inspections & PS4, Auckland | Stable Structure',
  'construction-supervision': 'Construction Supervision Engineers, Auckland | Stable Structure',
  'retaining-walls': 'Retaining Wall Design & PS1 Engineer, Auckland | Stable Structure',
  'swimming-pools': 'Swimming Pool Structural Design, Auckland | Stable Structure',
  'decks-outdoor-living': 'Deck & Outdoor Structure Engineering, Auckland | Stable Structure',
  'carports-sheds-portals': 'Portal Frame, Carport & Shed Design NZ | Stable Structure',
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
      eyebrow: 'Service', title: s.title, sub: s.sub,
      crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Services', href: 'services.html' }, { label: s.title }],
      waMsg: `Hi Stable Structure, I'd like to enquire about ${s.title}.`,
    }),
    `<section class="pad"><div class="container"><div class="svc-layout">
      <div class="prose reveal">
        ${prose}
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
    file: svcPath(s), base, active: 'services', lastmod: SPRINT_DATE,
    headO: {
      title: SERVICE_TITLES[s.slug] || `${s.title} | Stable Structure Limited`,
      desc: s.short,
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
      crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Guides', href: 'services.html' }, { label: g.label }],
      waMsg: `Hi Stable Structure, I read your guide "${g.title}" and have a question.`,
    }),
    `<section class="pad"><div class="container"><div class="svc-layout">
      <div class="prose reveal">
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
    file: `guides/${g.slug}.html`, base, active: '', lastmod: SPRINT_DATE,
    headO: { title: `${g.title} | Stable Structure`, desc: g.desc, pageLabel: g.label },
    body,
  });
});

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
        <a class="btn btn-primary btn-lg" href="${NOTFOUND_BASE}index.html">Back to home ${si('arrow', 2.2)}</a>
        <a class="btn btn-ghost btn-lg" href="${NOTFOUND_BASE}contact.html">Contact us</a>
      </div>
    </div>
  </section>`,
    `<section class="pad"><div class="container">
      <div class="section-head center reveal"><span class="eyebrow">Popular pages</span><h2 class="section-title">Where would you like to go?</h2></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:8px" class="reveal">
        <a class="btn btn-ghost btn-lg" href="${NOTFOUND_BASE}index.html">Home</a>
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
  fs.writeFileSync(outPath, layout({ base: p.base, active: p.active, headO: p.headO, body: p.body, file: p.file }), 'utf8');
  count++;
  console.log('  ✓', p.file);
});

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

console.log(`\nGenerated ${count} pages + sitemap.xml + robots.txt.`);
