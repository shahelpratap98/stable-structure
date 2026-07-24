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
  if (lb && grid) {
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
      lbImg.alt = cap ? cap.slice(0, 110) : 'Project photo';
      lb.hidden = false;
      show(0);
      requestAnimationFrame(function () { lb.classList.add('open'); });
      document.body.style.overflow = 'hidden';
      lb.querySelector('.lb-close').focus();
    };

    var close = function () {
      lb.classList.remove('open');
      document.body.style.overflow = '';
      window.setTimeout(function () { lb.hidden = true; lbImg.src = ''; }, 200);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };

    grid.addEventListener('click', function (e) {
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
