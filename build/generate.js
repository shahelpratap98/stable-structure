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

/* Canonical site origin. This client preview is served by GitHub Pages under
   the /stable-structure/ subpath. Used for <link rel="canonical">, og:url,
   sitemap.xml and robots.txt so every emitted URL stays in sync. */
const SITE_URL = 'https://shahelpratap98.github.io/stable-structure/';

/* ---------- Business constants ---------- */
const PHONE_DISPLAY = '021 148 8984';
const PHONE_TEL = '+64211488984';
const EMAIL = 'gajan@stablestructure.co.nz';
const OWNER = 'Gajanthan Vethanathan';
const WA_NUMBER = '64211488984';
const WA_DEFAULT = "Hi Stable Structure, I'd like to enquire about a project.";
const waHref = (msg) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg || WA_DEFAULT)}`;

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
};
const WHATSAPP = '<path fill="currentColor" d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.91-9.91a9.82 9.82 0 0 0-2.91-7.02zM12.04 20.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/>';
const STAR = '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>';

const si = (name, sw = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;
const wa = () => `<svg viewBox="0 0 24 24" aria-hidden="true">${WHATSAPP}</svg>`;
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

/* ---------- Shared building blocks ---------- */
function head(o, base, file) {
  // Absolute URL for this page, derived from its output path (file).
  const pageUrl = SITE_URL + (file || '');
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
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230C1E33'/%3E%3Cpath d='M6 22 L16 8 L26 22' fill='none' stroke='%231DA9E3' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M6 22 H26' stroke='%231DA9E3' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E" />
<link rel="stylesheet" href="${base}styles.css" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ProfessionalService","name":"Stable Structure Limited","description":"Structural and civil engineering consultancy in Botany, Auckland, serving all of New Zealand.","areaServed":"New Zealand","telephone":"${PHONE_TEL}","email":"${EMAIL}","founder":{"@type":"Person","name":"${OWNER}"},"address":{"@type":"PostalAddress","addressLocality":"Botany","addressRegion":"Auckland","addressCountry":"NZ"},"openingHours":"Mo-Fr 08:30-17:00","aggregateRating":{"@type":"AggregateRating","ratingValue":"5.0","reviewCount":"5"},"slogan":"Strong solutions for your vision"}
</script>
</head>
<body>`;
}

const brand = (base, footer) => `<a class="brand" href="${base}index.html" aria-label="Stable Structure Limited home">
  <img class="logo" src="${base}assets/logo.jpg" width="1720" height="900" alt="Stable Structure Limited — Structural & Civil Engineering"${footer ? '' : ' fetchpriority="high"'} />
</a>`;

const NAV = [
  { key: 'home', label: 'Home', href: 'index.html' },
  { key: 'services', label: 'Services', href: 'services.html', dd: true },
  { key: 'sectors', label: 'Sectors', href: 'sectors.html' },
  { key: 'about', label: 'About', href: 'about.html' },
  { key: 'process', label: 'Process', href: 'process.html' },
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
        <span class="fi">Botany, Auckland — serving all of NZ</span>
        <span class="fi">Mon–Fri, 8:30am–5:00pm</span>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© <span id="year">2026</span> Stable Structure Limited. All rights reserved.</span>
      <span>Structural &amp; Civil Engineering · Auckland, New Zealand</span>
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
  return `<section class="pad-sm"><div class="container">
    <div class="cta-band reveal">
      <span class="eyebrow on-dark">Let's talk</span>
      <h2>${title}</h2>
      <p>${text}</p>
      <div class="cta-actions">
        <a class="btn btn-primary btn-lg" href="${base}contact.html">Request a Free Quote ${si('arrow', 2.2)}</a>
        <a class="btn btn-wa btn-lg" href="${waHref(waMsg)}" target="_blank" rel="noopener">${wa()} WhatsApp us</a>
      </div>
    </div>
  </div></section>`;
}

const scripts = (base) => `<script src="${base}main.js"></script>\n</body>\n</html>`;

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
   NOTE for the owner: replace GOOGLE_REVIEWS_URL / GOOGLE_WRITE_URL with the
   canonical links from your Google Business Profile (Maps "share" link and the
   "Ask for reviews" short link) so the buttons open your exact listing. */
const GOOGLE_REVIEWS_URL = 'https://www.google.com/maps/search/?api=1&query=Stable+Structure+Botany+Downs+Auckland';
const GOOGLE_WRITE_URL = GOOGLE_REVIEWS_URL;
const REVIEWS = {
  rating: '5.0',
  count: 5,
  featured: {
    initial: 'S', name: 'Sonia Singh', meta: 'Local Guide · 26 reviews', when: 'a month ago',
    text: 'Gajan &amp; Team are very Professional, reliable, and incredibly thorough. Highly recommend their structural engineering services.',
    org: 'Proconcept Design Ltd',
  },
  others: [
    { initial: 'A', name: 'Ananayan', when: '6 months ago' },
    { initial: 'N', name: 'Niranjan Tharma', when: '2 years ago' },
    { initial: 'A', name: 'arunthamil 2004', when: '4 years ago' },
    { initial: 'G', name: 'Gajanthan Vethanathan', when: '5 years ago' },
  ],
};
const googleGlyph = () => `<svg class="gg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.6-2-6.5-4.8H1.7v3A11.9 11.9 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.5 14.6a7.1 7.1 0 0 1 0-4.6v-3H1.7a12 12 0 0 0 0 10.6z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.7 11.7 0 0 0 12 0 11.9 11.9 0 0 0 1.7 6l3.8 3c.9-2.8 3.5-4.8 6.5-4.8z"/></svg>`;

function reviewsSummary() {
  return `<div class="reviews-summary reveal">
      <div class="rs-score">
        <div class="rs-num">${REVIEWS.rating}</div>
        <div>${stars5()}<span class="rs-meta">${googleGlyph()} Based on ${REVIEWS.count} Google reviews</span></div>
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

function teamSection(base) {
  const team = [
    {
      photo: 'gajanthan.jpg', name: OWNER, role: 'Director',
      cred: 'BSc(Eng) · MSc(Struct) · MIStructE · CMEngNZ · CEng (UK) · CPEng (NZ)',
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
      cred: '',
      bio: [
        `Thibakaran has over five years of experience delivering practical, efficient and compliant structural design across commercial and residential projects. His work covers timber, structural steel, light-gauge steel and reinforced concrete systems — including new builds, alterations, additions and strengthening works — and he stays involved throughout the project, from early design and analysis to detailed documentation, construction support and coordination with architects, contractors and other stakeholders.`,
        `He is committed to buildable, cost-effective and robust engineering solutions that meet project requirements, relevant standards and New Zealand building regulations.`,
      ],
      note: `Outside work, Thibakaran plays group badminton and local tournaments, and turns out for one-day grade cricket with his club.`,
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

/* ---------- Individual pages ---------- */
const pages = [];

/* HOME */
pages.push({
  file: 'index.html', base: '', active: 'home',
  headO: { title: 'Stable Structure Limited | Structural & Civil Engineering — Auckland, NZ', desc: 'Kiwi-owned structural and civil engineering consultancy in Botany, Auckland. Structural design, civil design, building consent documentation, inspections and construction supervision across New Zealand.' },
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

/* SERVICE detail pages */
SERVICES.forEach((s) => {
  const base = '../';
  const asideList = SERVICES.map(x => `<a href="${x.slug}.html"${x.slug === s.slug ? ' class="current" aria-current="page"' : ''}>${x.title} ${si('chevr', 2)}</a>`).join('\n          ');
  const body = [
    pageHero(base, {
      eyebrow: 'Service', title: s.title, sub: s.sub,
      crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Services', href: 'services.html' }, { label: s.title }],
      waMsg: `Hi Stable Structure, I'd like to enquire about ${s.title}.`,
    }),
    `<section class="pad"><div class="container"><div class="svc-layout">
      <div class="prose reveal">
        <span class="eyebrow">${s.title}</span>
        ${s.intro.map(p => `<p style="font-size:17px">${p}</p>`).join('\n        ')}
        <h2>What's included</h2>
        <ul class="ticks">${s.includes.map(x => `<li>${si('check', 2.2)}<span>${x}</span></li>`).join('')}</ul>
        <h2>Ideal for</h2>
        <ul class="ticks">${s.ideal.map(x => `<li>${si('check', 2.2)}<span>${x}</span></li>`).join('')}</ul>
        <h2>Why it matters</h2>
        <p style="font-size:17px">Every ${s.title.toLowerCase()} project we take on is designed to be practical, cost-effective and fully compliant with the New Zealand Building Code — with clear documentation to carry it smoothly through consent and construction.</p>
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
  pages.push({ file: svcPath(s), base, active: 'services', headO: { title: `${s.title} | Stable Structure Limited`, desc: s.short }, body });
});

/* 404 — GitHub Pages serves /404.html for any unknown path (including nested
   ones). Because the site lives under the /stable-structure/ subpath, ALL links
   on this page must be absolute, or they would resolve relative to the bad URL.
   Using an absolute base makes the shared header/footer/nav links absolute too.
   Excluded from sitemap.xml and marked noindex. */
const NOTFOUND_BASE = '/stable-structure/';
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

/* ---------- sitemap.xml (indexable pages only; excludes 404) ---------- */
const sitemapUrls = pages.map((p) => {
  const loc = SITE_URL + (p.file === 'index.html' ? '' : p.file);
  return `  <url><loc>${loc}</loc></url>`;
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
