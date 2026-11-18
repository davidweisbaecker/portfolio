(function () {
  'use strict';

  /* ---------- Mobile menu toggle ---------- */
  const burger = document.querySelector('.topbar-burger');
  const menu   = document.getElementById('mobile-menu');
  const body   = document.body;

  function setMenu(open) {
    if (!menu || !burger) return;
    menu.classList.toggle('is-open', open);
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    menu.setAttribute('aria-hidden', String(!open));
    body.classList.toggle('menu-open', open);
  }

  if (burger && menu) {
    burger.addEventListener('click', function () {
      setMenu(!menu.classList.contains('is-open'));
    });
    // Escape → close
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        setMenu(false);
        burger.focus();
      }
    });
  }

  /* ---------- In-page anchor smooth scroll ----------
     Handle every "#section" link via JS instead of relying on the
     browser's native fragment navigation. Two reasons:

     1) RELIABILITY IN SANDBOXED PREVIEWS — when this page is loaded
        inside an iframe / in-app webview (e.g. the Claude mobile
        preview), the host's navigation delegate intercepts every
        click on a real <a href="…"> element and shows an "open URL?"
        confirmation dialog before our JS can preventDefault. By
        stripping the href at init we leave the host nothing to
        intercept. scrollIntoView() still scrolls within the document.

     2) CONSISTENT BEHAVIOUR — scrollIntoView respects the existing
        scroll-margin-top on #case-study, and closes the mobile menu
        in the same gesture.

     Accessibility is preserved: tabindex=0 keeps the elements
     focusable, role="link" keeps screen-reader semantics, and
     Enter/Space activate just like a normal anchor.
     ----------------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    const href = a.getAttribute('href');
    if (!href || href.length <= 1) return; // ignore bare "#"

    const target = document.querySelector(href);
    if (!target) return; // unknown anchor — leave it alone

    // Strip href to bypass host-webview navigation interception
    a.removeAttribute('href');
    a.setAttribute('role', 'link');
    a.setAttribute('tabindex', '0');
    a.style.cursor = 'pointer';

    function activate(e) {
      if (e) e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMenu(false); // closes mobile menu if open; no-op otherwise
    }

    a.addEventListener('click', activate);
    a.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') activate(e);
    });
  });

  /* ---------- Slide deck viewer ----------
     Buttons, arrow keys (Left/Right/Home/End) and single-finger
     horizontal swipes move through the stacked images. Pinch-zoom
     stays native: multi-touch gestures are ignored. Works for any
     number of decks on the page. */
  document.querySelectorAll('[data-deck]').forEach(function (deck) {
    const slides  = Array.prototype.slice.call(deck.querySelectorAll('.deck-slide'));
    if (!slides.length) return;
    const stage   = deck.querySelector('.deck-stage');
    const prevBtn = deck.querySelector('[data-deck-prev]');
    const nextBtn = deck.querySelector('[data-deck-next]');
    const caption = deck.querySelector('.deck-caption');
    const notes   = Array.prototype.slice.call(deck.querySelectorAll('.deck-sub-item'));
    const counter = deck.querySelector('.deck-current');
    const bar     = deck.querySelector('.deck-progress > span');
    let index = 0;

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function show(i) {
      index = Math.max(0, Math.min(slides.length - 1, i));
      slides.forEach(function (s, k) {
        const on = k === index;
        s.classList.toggle('is-current', on);
        if (on) s.removeAttribute('aria-hidden');
        else s.setAttribute('aria-hidden', 'true');
      });
      if (caption) caption.textContent = slides[index].getAttribute('data-caption') || '';
      notes.forEach(function (n, k) { n.classList.toggle('is-current', k === index); });
      if (counter) counter.textContent = pad(index + 1);
      if (bar) bar.style.transform = 'scaleX(' + ((index + 1) / slides.length) + ')';
      const atStart = index === 0;
      const atEnd   = index === slides.length - 1;
      // Keep keyboard focus alive when the focused button becomes disabled
      if (atStart && document.activeElement === prevBtn && nextBtn) nextBtn.focus();
      if (atEnd && document.activeElement === nextBtn && prevBtn) prevBtn.focus();
      if (prevBtn) prevBtn.disabled = atStart;
      if (nextBtn) nextBtn.disabled = atEnd;
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { show(index - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { show(index + 1); });

    deck.addEventListener('keydown', function (e) {
      let handled = true;
      if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === 'ArrowRight') show(index + 1);
      else if (e.key === 'Home') show(0);
      else if (e.key === 'End') show(slides.length - 1);
      else handled = false;
      if (handled) e.preventDefault();
    });

    if (stage) {
      let startX = null, startY = null;
      stage.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) { startX = null; return; }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }, { passive: true });
      stage.addEventListener('touchmove', function (e) {
        if (e.touches.length > 1) startX = null; // pinch — leave it to the browser
      }, { passive: true });
      stage.addEventListener('touchend', function (e) {
        if (startX === null) return;
        const t  = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        startX = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          show(index + (dx < 0 ? 1 : -1));
        }
      }, { passive: true });
    }

    show(0);
  });

  /* ---------- Ad video ----------
     The video is muted, so it may play on its own: it plays while at least
     half of it is on screen and pauses when scrolled away. A pause by the
     viewer sticks. The story beats beside it jump to their timestamp and
     mark the beat that is playing. On a phone the beats sit below the
     video: a tap scrolls back up to it first, and the video starts at the
     beat only once it is on screen, so nothing is missed on the way. */
  document.querySelectorAll('.ad').forEach(function (fig) {
    const video = fig.querySelector('video');
    if (!video) return;
    const player = fig.querySelector('.ad-player');
    const toggle = fig.querySelector('.ad-toggle');
    const bar = fig.querySelector('.ad-progress > span');
    const beats = Array.prototype.slice.call(fig.querySelectorAll('.ad-beat'));
    const times = beats.map(function (b) { return parseFloat(b.getAttribute('data-t')) || 0; });
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let heldByViewer = false;
    let autoPausing = false;

    function start() {
      const p = video.play();
      if (p && p.catch) p.catch(function () {});
    }

    function markBeat() {
      const t = video.currentTime;
      let current = 0;
      times.forEach(function (s, k) { if (t + 0.05 >= s) current = k; });
      beats.forEach(function (b, k) {
        const on = k === current;
        b.classList.toggle('is-current', on);
        if (on) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    }

    function showState(playing) {
      if (player) player.classList.toggle('is-playing', playing);
      if (toggle) toggle.setAttribute('aria-label', playing ? 'Pause the video' : 'Play the video');
    }

    function flip() {
      if (video.paused) { heldByViewer = false; start(); }
      else video.pause();
    }

    video.addEventListener('pause', function () {
      showState(false);
      if (autoPausing) { autoPausing = false; return; }
      heldByViewer = true;
    });
    video.addEventListener('play', function () { heldByViewer = false; showState(true); });
    video.addEventListener('timeupdate', function () {
      if (bar && video.duration) bar.style.transform = 'scaleX(' + (video.currentTime / video.duration) + ')';
      markBeat();
    });
    video.addEventListener('click', flip);
    if (toggle) toggle.addEventListener('click', flip);
    video.addEventListener('seeked', markBeat);

    function seek(s) {
      if (video.readyState >= 1) {
        video.currentTime = s;
      } else {
        video.addEventListener('loadedmetadata', function once() {
          video.removeEventListener('loadedmetadata', once);
          video.currentTime = s;
        });
      }
    }

    // Share of the video that is on screen, from 0 to 1 (the same element
    // the observer below watches).
    function shownShare() {
      const r = video.getBoundingClientRect();
      const h = window.innerHeight || document.documentElement.clientHeight;
      const seen = Math.min(r.bottom, h) - Math.max(r.top, 0);
      return r.height > 0 ? Math.max(0, seen) / r.height : 0;
    }

    const watching = !calm && 'IntersectionObserver' in window;
    let pendingStart = null;

    beats.forEach(function (b, k) {
      b.addEventListener('click', function () {
        const s = times[k];
        const shown = shownShare();
        heldByViewer = false;
        if (shown >= 0.5 || !watching) {
          // The video is (mostly) on screen, or scrolling is instant:
          // jump and play right away.
          pendingStart = null;
          if (shown < 0.9) {
            (player || video).scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: shown >= 0.5 ? 'nearest' : 'center' });
          }
          seek(s);
          start();
        } else {
          // The video is off screen (on a phone the beats sit below it):
          // scroll up to it first. The observer below starts it at the beat
          // once at least half of it is visible again.
          if (!video.paused) { autoPausing = true; video.pause(); }
          pendingStart = s;
          if (video.readyState >= 1) video.currentTime = s;
          (player || video).scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        markBeat();
      });
    });

    if (watching) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            if (pendingStart !== null) {
              seek(pendingStart);
              pendingStart = null;
              heldByViewer = false;
            }
            if (!heldByViewer && video.paused) start();
          } else if (!video.paused) {
            autoPausing = true;
            video.pause();
          }
        });
      }, { threshold: [0, 0.5] }).observe(video);
    }
    markBeat();
  });

  /* ---------- Scroll-spy active state ----------
     Targets are organised as "groups" — each group activates as a single
     unit, even if it contains multiple DOM elements. This lets stat row
     pairs light up together while still treating journey items,
     principles, case steps and flow cards individually. Tag rows have their own rule
     (see below).

     The switch is measured at the part that changes colour (a title, a
     stat label, a tag row, the button), not at the middle of the whole
     item. So every highlight starts at the same height on the screen, no
     matter how tall the item is: when that part's top edge crosses the
     middle of the screen (50 %). It stays lit until the next group
     crosses that line or it leaves the top 10 %. Exactly one group is
     active at a time.

     Tag rows don't take part in that: a tag row turns green when its first
     line crosses the middle of the screen and stays green until it reaches
     the top 10 %, even while a heading below it is lit.

     Implementation: passive scroll + resize listeners throttled via rAF,
     with read/compute/write phases batched to avoid layout thrashing.
     ----------------------------------------------------------------- */
  const groups = [];

  // Individual targets — each journey item, principle, case step, flow
  // card, menu card and the hero's LinkedIn button is its own group
  document.querySelectorAll('.btn--linkedin, .journey-item, .principle, .case-step, .flow-step, .work-card').forEach(function (el) {
    groups.push([el]);
  });

  // Stat rows — every two consecutive stats form a visual row on mobile
  // and should light up together (never all four at once)
  const stats = Array.prototype.slice.call(document.querySelectorAll('.stat'));
  for (var i = 0; i < stats.length; i += 2) {
    groups.push(stats.slice(i, i + 2));
  }

  // Tag rows — all tags inside a .tags container light up together, on
  // their own rule, independent of the single active group
  const tagRows = [];
  document.querySelectorAll('.tags').forEach(function (container) {
    const tags = Array.prototype.slice.call(container.querySelectorAll('.tag'));
    if (tags.length) tagRows.push(tags);
  });

  // Flat list of every element that can receive .is-active (for cleanup)
  const allElements = groups.reduce(function (acc, g) {
    return acc.concat(g);
  }, []);

  // The two contact buttons at the end of the page (handled on their own)
  const ctaLinks = document.querySelector('.cta-links');

  if (allElements.length || tagRows.length) {
    function groupCenter(group) {
      let sum = 0;
      group.forEach(function (el) {
        const r = el.getBoundingClientRect();
        sum += r.top + r.height / 2;
      });
      return sum / group.length;
    }

    // The part of an item that changes colour when it is active
    function litPart(el) {
      return el.querySelector('.journey-role, .principle-title, .case-step-title, .stat-lbl') || el;
    }

    // Top edge of the highest lit part in a group (a wrapped tag row
    // counts from its first line)
    function groupLine(group) {
      let top = Infinity;
      group.forEach(function (el) {
        const t = litPart(el).getBoundingClientRect().top;
        if (t < top) top = t;
      });
      return top;
    }

    function updateActive() {
      const vh = window.innerHeight;
      const topLine     = vh * 0.10;
      const triggerLine = vh * 0.50;

      // READ PHASE: where the lit part of every group and tag row sits
      const lines = groups.map(groupLine);
      const tagLines = tagRows.map(groupLine);

      // COMPUTE PHASE: pick the single best group, the lowest one between
      // the two lines (the one that crossed the trigger line last)
      let activeGroup = null;
      let lowest = -Infinity;
      lines.forEach(function (y, idx) {
        if (y >= topLine && y <= triggerLine && y > lowest) {
          lowest = y;
          activeGroup = groups[idx];
        }
      });

      // Contact buttons: the page ends below them, so they never reach the
      // band at the top. They light up while they sit in the lower part of
      // the screen instead (40–92 % of its height; at the very end of the
      // page they rest at about 50–65 % on phones, so they stay lit).
      const ctaCenter = ctaLinks ? groupCenter([ctaLinks]) : null;

      // WRITE PHASE: sync .is-active across every tracked element
      const activeSet = activeGroup ? new Set(activeGroup) : new Set();
      allElements.forEach(function (el) {
        el.classList.toggle('is-active', activeSet.has(el));
      });
      tagRows.forEach(function (row, k) {
        const on = tagLines[k] >= topLine && tagLines[k] <= triggerLine;
        row.forEach(function (tag) { tag.classList.toggle('is-active', on); });
      });
      if (ctaLinks) {
        ctaLinks.classList.toggle('is-active', ctaCenter >= vh * 0.40 && ctaCenter <= vh * 0.92);
      }
    }

    let rafId = null;
    function scheduleUpdate() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(function () {
        updateActive();
        rafId = null;
      });
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    updateActive();
  }
})();
