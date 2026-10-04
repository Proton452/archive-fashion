/* ==============================================
   Men / Women switch at the top of the hero (phones and tablets).
   The green outline (thumb) follows the finger: past half way → the other page,
   otherwise it springs back. A tap on the other side slides it there, then changes page.
   iPhone feel: shrinks a little while pressed, stretches like elastic past the ends,
   the label under it turns bold live, springs into place (curves in style.css).
   Vertical moves still scroll the page (touch-action: pan-y in style.css).
============================================== */

(() => {
  const sw = document.querySelector('.gender-switch');
  if (!sw) return;
  const thumb   = sw.querySelector('.gender-switch__thumb');
  const opts    = [...sw.querySelectorAll('.gender-switch__opt')];
  const current = opts.findIndex(o => o.classList.contains('is-active'));
  const DRAG_START = 6;      // px sideways before it counts as a drag (a tap stays a tap)
  const STRETCH    = 0.12;   // how far past an end the elastic can pull (share of one half)

  // Signed distance between the two halves (negative in Arabic, where Men is on the right)
  const span  = () => opts[1].offsetLeft - opts[0].offsetLeft;
  const place = p => { thumb.style.translate = `${p * span()}px 0`; };
  const mark  = i => opts.forEach((o, k) => o.classList.toggle('is-active', k === i));

  // Past an end the thumb still follows, less and less (never more than STRETCH)
  const elastic = over => STRETCH * (1 - Math.exp(-over / STRETCH));
  function resist(p) {
    if (p > 1) return 1 + elastic(p - 1);
    if (p < 0) return -elastic(-p);
    return p;
  }

  // Loads the other page in the background as soon as the switch is touched
  let prefetched = false;
  function prefetch() {
    if (prefetched) return;
    prefetched = true;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = opts[1 - current].getAttribute('href');
    document.head.appendChild(link);
  }

  function go(i) {
    thumb.classList.remove('is-dragging', 'is-pressed');
    place(i);
    mark(i);
    if (i === current) return;
    const wait = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;   // let the spring land
    setTimeout(() => { location.href = opts[i].getAttribute('href'); }, wait);
  }

  let x0 = null, y0 = 0, pid = null, dragging = false, dragged = false, progress = current;

  // The halves are links: without this the browser starts dragging the link itself and cancels the swipe
  sw.addEventListener('dragstart', e => e.preventDefault());

  sw.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; pid = e.pointerId;
    dragging = dragged = false;
    thumb.classList.add('is-pressed');
    prefetch();
  });

  sw.addEventListener('pointermove', e => {
    if (x0 === null || e.pointerId !== pid) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!dragging) {
      if (Math.abs(dx) < DRAG_START || Math.abs(dx) < Math.abs(dy)) return;
      dragging = true;
      sw.setPointerCapture(pid);
      thumb.classList.add('is-dragging');
    }
    progress = current + dx / span();
    place(resist(progress));
    mark(progress > 0.5 ? 1 : 0);
  });

  sw.addEventListener('pointerup', e => {
    if (e.pointerId !== pid) return;
    x0 = null;
    if (!dragging) { thumb.classList.remove('is-pressed'); return; }
    dragged = true;   // the click that follows must not count as a tap
    const target = progress > 0.5 ? 1 : 0;
    if (target !== current && typeof gaEvent === 'function') {
      gaEvent('click_gender_switch', { to: target ? 'women' : 'men', from: 'swipe' });
    }
    go(target);
  });

  sw.addEventListener('pointercancel', () => {
    x0 = null;
    thumb.classList.remove('is-pressed');
    if (dragging) go(current);
  });

  opts.forEach((o, i) => o.addEventListener('click', e => {
    if (dragged) { e.preventDefault(); dragged = false; return; }
    if (i === current) { e.preventDefault(); return; }
    e.preventDefault();   // slide first, then change page
    go(i);
  }));

  // Back button (page restored from memory): the switch shows this page again
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    thumb.classList.remove('is-dragging', 'is-pressed');
    mark(current);
    thumb.style.translate = '';
  });
})();
