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
