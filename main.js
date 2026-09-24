/* Stable Structure Limited — shared behaviour */
(function () {
  // Year in footer
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Header scroll state
  var header = document.querySelector('header.site');
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mobile menu
  var burger = document.getElementById('burger');
  var menu = document.getElementById('mobileMenu');
  if (burger && menu) {
    var toggleMenu = function (open) {
      menu.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', function () { toggleMenu(!menu.classList.contains('open')); });
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { toggleMenu(false); }); });
  }

  // Desktop services dropdown — click toggle + keyboard/escape support (hover handled in CSS)
  var ddToggle = document.getElementById('ddToggle');
  var ddPanel = document.getElementById('ddPanel');
  if (ddToggle && ddPanel) {
    ddToggle.addEventListener('click', function (e) {
      e.preventDefault();
      var open = ddPanel.classList.toggle('open');
      ddToggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { ddPanel.classList.remove('open'); ddToggle.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('click', function (e) {
      if (!ddPanel.contains(e.target) && !ddToggle.contains(e.target)) {
        ddPanel.classList.remove('open'); ddToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Reveal on scroll — but never leave content stuck hidden.
  // Anything already in or above the viewport on load is shown immediately;
  // only genuinely below-the-fold elements animate in as they are reached.
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        el.classList.add('in'); // already visible on load — no pop-in
      } else {
        io.observe(el);
      }
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // Projects lightbox — click a card photo to view the full image and caption.
  // Multi-photo posts are browsable with the arrows or left/right keys.
  var lb = document.getElementById('lightbox');
  var grid = document.querySelector('.proj-grid');
  var openShot = null;
  if (lb) {
    var lbImg = lb.querySelector('.lb-img');
    var lbCap = lb.querySelector('.lb-cap');
    var shots = [];
    var idx = 0;
    var lastFocus = null;

    var show = function (i) {
      idx = (i + shots.length) % shots.length;
      lbImg.src = shots[idx];
      lb.classList.toggle('single', shots.length < 2);
    };

    var open = function (card) {
      try { shots = JSON.parse(card.getAttribute('data-images') || '[]'); }
      catch (e) { shots = []; }
      if (!shots.length) return;
      lastFocus = document.activeElement;
      var cap = card.getAttribute('data-caption') || '';
      lbCap.textContent = cap;
      // Trim on a word boundary, never mid-word, and never on a dangling
      // function word — a screen reader reads this label aloud in full.
      lbImg.alt = cap ? altFromCaption(cap) : 'Stable Structure project photo';
      lb.hidden = false;
      show(0);
      requestAnimationFrame(function () { lb.classList.add('open'); });
      document.body.style.overflow = 'hidden';
      lb.querySelector('.lb-close').focus();
    };

    var close = function () {
      lb.classList.remove('open');
      document.body.style.overflow = '';
      window.setTimeout(function () { lb.hidden = true; lbImg.removeAttribute('src'); }, 200);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };

    openShot = open;
    if (grid) grid.addEventListener('click', function (e) {
      var media = e.target.closest ? e.target.closest('.proj-media') : null;
      if (!media) return;
      var card = media.closest('.proj-card');
      if (card) open(card);
    });

    lb.addEventListener('click', function (e) {
      if (e.target.closest('.lb-close')) return close();
      if (e.target.closest('.lb-next')) return show(idx + 1);
      if (e.target.closest('.lb-prev')) return show(idx - 1);
      // Clicking the backdrop (not the image or caption) closes it
      if (!e.target.closest('.lb-figure')) close();
    });

    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'ArrowLeft') show(idx - 1);
    });
  }

  // Accordion gallery (granny flats designs). Port of React Bits'
  // AccordionGallery: the open panel grows, the others tilt away, go grey and
  // drift. Hover (on a mouse), focus or tap opens a panel; clicking the open
  // panel shows it in the lightbox. Arrow keys move between panels.
  var ag = document.getElementById('gf-gallery');
  if (ag) {
    var panels = [].slice.call(ag.querySelectorAll('.ag-panel'));
    var details = [].slice.call(document.querySelectorAll('.gf-detail'));
    var active = parseInt(ag.getAttribute('data-default'), 10) || 0;
    var RATIO = 0.52, TILT = 8, PARALLAX = 0.5, GAP = 10;
    var canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    var narrow = window.matchMedia('(max-width: 640px)');

    var layout = function () {
      var n = panels.length;
      var vertical = narrow.matches;
      var grow = n > 1 ? (RATIO * (n - 1)) / (1 - RATIO) : 1;
      var total = vertical ? ag.clientHeight : ag.clientWidth;
      var size = Math.max(140, Math.max(total - GAP * (n - 1), 120) * RATIO * 1.22);
      ag.style.setProperty('--ag-media-size', size + 'px');
      panels.forEach(function (p, i) {
        var on = i === active;
        var rot = vertical ? 0 : on ? 0 : i < active ? TILT : -TILT;
        var drift = Math.max(-1.5, Math.min(1.5, active - i));
        var shift = on ? 0 : drift * PARALLAX * size * 0.06;
        p.style.flexGrow = on ? grow : 1;
        p.style.transform = rot ? 'rotateY(' + rot + 'deg)' : '';
        p.classList.toggle('ag-panel--active', on);
        p.setAttribute('aria-current', on ? 'true' : 'false');
        var media = p.querySelector('.ag-media');
        if (media) media.style.transform = 'translate(-50%, -50%) translate' + (vertical ? 'Y' : 'X') + '(' + shift + 'px)';
      });
      details.forEach(function (d, i) { d.classList.toggle('is-active', i === active); });
    };
    // While panels are resizing they slide under a still cursor, and the
    // browser reports that as hovering a different panel. Hover is ignored
    // until the transition has finished so the gallery can't chase itself.
    var settledAt = 0;
    var activate = function (i) {
      if (i === active) return;
      active = i;
      settledAt = Date.now() + 650;
      layout();
    };

    // A mouse or touch press also focuses the button, just before its click.
    // Focus from a pointer is ignored so the first click opens the panel and
    // only a second click on the open panel shows the lightbox.
    var pressing = false;
    panels.forEach(function (p, i) {
      p.addEventListener('pointerdown', function () { pressing = true; });
      p.addEventListener('mouseenter', function () { if (canHover.matches && Date.now() > settledAt) activate(i); });
      p.addEventListener('mousemove', function () { if (canHover.matches && i !== active && Date.now() > settledAt) activate(i); });
      p.addEventListener('focus', function () { if (!pressing) activate(i); });
      p.addEventListener('click', function () {
        pressing = false;
        if (i !== active) return activate(i);
        if (openShot) openShot(p);
      });
      p.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % panels.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + panels.length) % panels.length;
        if (next === null) return;
        e.preventDefault();
        activate(next);
        panels[next].focus();
      });
    });
    [].slice.call(document.querySelectorAll('.gf-full')).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = panels[parseInt(b.getAttribute('data-index'), 10)];
        if (p && openShot) openShot(p);
      });
    });

    ag.classList.add('ag--ready');
    layout();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(ag);
    else window.addEventListener('resize', layout);
  }

  // Border glow — pointer-reactive edge glow on .border-glow-card
  // (ported from React Bits "BorderGlow"; CSS holds the design, JS only
  // feeds it the live cursor angle and how close the pointer is to an edge).
  var glowCards = document.querySelectorAll('.border-glow-card');
  glowCards.forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var rect = card.getBoundingClientRect();
      var cx = rect.width / 2;
      var cy = rect.height / 2;
      var dx = (e.clientX - rect.left) - cx;
      var dy = (e.clientY - rect.top) - cy;
      var kx = dx !== 0 ? cx / Math.abs(dx) : Infinity;
      var ky = dy !== 0 ? cy / Math.abs(dy) : Infinity;
      var edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
      var angle = 0;
      if (dx !== 0 || dy !== 0) {
        angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;
      }
      card.style.setProperty('--edge-proximity', (edge * 100).toFixed(3));
      card.style.setProperty('--cursor-angle', angle.toFixed(3) + 'deg');
    });
  });

  // Shared with build/generate.js: keep both in step if either changes.
  var DANGLING = /\s+(?:a|an|the|of|for|with|and|or|to|in|on|at|by|from|as|is|are|was|were|that|which|our|its|their)$/i;
  function altFromCaption(c) {
    var flat = String(c).replace(/\s+/g, ' ').trim();
    if (flat.length <= 110) return flat;
    var cut = flat.slice(0, 110);
    var stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' — '), cut.lastIndexOf(', '));
    var end = stop > 45 ? stop : cut.lastIndexOf(' ');
    var out = flat.slice(0, end > 0 ? end : 110).replace(/[\s,—–-]+$/, '');
    while (DANGLING.test(out)) out = out.replace(DANGLING, '');
    return out;
  }

  // Enquiry form
  var form = document.getElementById('enquiryForm');
  if (form) {
    var status = document.getElementById('formStatus');
    form.addEventListener('submit', function (ev) {
      var action = form.getAttribute('action') || '';
      // Validate first regardless of how the form is wired up
      if (!form.checkValidity()) { ev.preventDefault(); form.reportValidity(); return; }
      if (action.indexOf('mailto:') === 0) {
        // Let the browser open the visitor's email app; just confirm on screen
        if (status) {
          status.className = 'form-status ok';
          status.textContent = 'Opening your email app to send this enquiry to gajan@stablestructure.co.nz — if nothing opens, email us directly or call 021 148 8984.';
        }
      } else if (action === '#') {
        ev.preventDefault();
        if (status) {
          status.className = 'form-status ok';
          status.textContent = 'Thanks — your enquiry is ready. Connect a form endpoint to receive it, or call/WhatsApp/email us to reach us right away.';
        }
        var btn = form.querySelector('button[type=submit]');
        if (btn) btn.textContent = 'Enquiry received ✓';
      }
    });
  }
})();
