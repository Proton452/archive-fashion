/* ==============================================
   Real photos (QC) — window opened from the camera badge on product cards
   (Men / Women pages). Photos taken in agents' warehouses on previous orders
   (some carry a Hipobuy watermark), from data/qc/<last 2 digits of the item id>.json.
   - Opens above the catalog, so closing it leaves the page exactly as it was.
   - Shared links /#p=<item id> open it (also on /women and creator links). Opening it from
     a card doesn't change the address (iPhone Safari would expand its bar), but Back closes it.
   - Photos slide under the finger (native scroll-snap). They are heavy
     (400-800 KB): only the one shown and its neighbours are loaded.
   - Phones: full screen, slides up from the bottom, drag it down to close.
============================================== */

(function () {
  const LINK_TPL  = 'https://www.lovegobuy.com/product?id={id}&shop_type=weidian&invite_code=500EUROSOFFERED';
  const IMAGE_TPL = 'https://img.theqcbook.com/products/{id}.webp?v5';
  const HASH_RE = /^#p=(\d+)$/;
  const phone = window.matchMedia('(max-width: 700px)');

  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_PREV  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  const ICON_NEXT  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  const shards = {};
  let modal = null, sheet = null, track = null;
  let item = null, itemId = null, index = 0, pushedHash = false, lastFocus = null;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function gaEvent(name, params) {
    if (typeof gtag === 'function') gtag('event', name, { transport_type: 'beacon', ...(params || {}) });
  }

  const isRTL = () => document.documentElement.dir === 'rtl';

  function loadItem(id) {
    const key = id.slice(-2);
    if (!shards[key]) {
      shards[key] = fetch('/data/qc/' + key + '.json')
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(err => { delete shards[key]; throw err; });
    }
    return shards[key].then(entries => entries[id] || null);
  }

  function buyLink(id) {
    let href = LINK_TPL.replace('{id}', id);
    if (window.PARTNER_CODE) href = href.replace(/invite_code=[^&\s]+/, 'invite_code=' + window.PARTNER_CODE);
    return href;
  }

  const niceName = s => (typeof formatName === 'function' ? formatName(s) : s);
  const catLabel = c => t(c.charAt(0).toUpperCase() + c.slice(1).toLowerCase());

  // ─── Window ───────────────────────────────────
  function build() {
    modal = el('div', 'photos-modal');
    modal.hidden = true;
    modal.innerHTML = `
      <div class="photos-sheet" role="dialog" aria-modal="true" aria-labelledby="photosTitle" tabindex="-1">
        <button type="button" class="photos-sheet__close">${ICON_CLOSE}</button>
        <div class="photos-gallery">
          <div class="photos-track"></div>
          <span class="photos-grip" aria-hidden="true"></span>
          <button type="button" class="photos-nav photos-nav--prev">${ICON_PREV}</button>
          <button type="button" class="photos-nav photos-nav--next">${ICON_NEXT}</button>
          <span class="photos-counter" aria-live="polite"></span>
        </div>
        <div class="photos-info">
          <p class="photos-label" id="photosTitle"><span class="photos-label__main"></span> <span class="photos-label__qc">(QC)</span></p>
          <p class="photos-caption"></p>
          <div class="photos-product">
            <img class="photos-product__img" alt="" decoding="async">
            <div class="photos-product__text">
              <p class="photos-product__name"></p>
              <p class="photos-product__meta"></p>
              <p class="photos-product__price"></p>
            </div>
          </div>
          <p class="photos-jersey" hidden></p>
          <a class="btn btn--primary photos-buy" target="_blank" rel="noopener noreferrer"></a>
          <p class="photos-note"></p>
        </div>
      </div>`;
    sheet = modal.querySelector('.photos-sheet');
    track = modal.querySelector('.photos-track');

    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('.photos-sheet__close').addEventListener('click', close);
    // Arrows follow the screen direction (reversed in Arabic)
    modal.querySelector('.photos-nav--prev').addEventListener('click', () => goTo(index + (isRTL() ? 1 : -1)));
    modal.querySelector('.photos-nav--next').addEventListener('click', () => goTo(index + (isRTL() ? -1 : 1)));
    modal.querySelector('.photos-buy').addEventListener('click', () => {
      gaEvent('click_product', { item_name: item && item.n, source: 'real_photos' });
    });

    // The photo under the finger becomes the current one
    let ticking = false;
    track.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const i = Math.round(Math.abs(track.scrollLeft) / (track.clientWidth || 1));
        if (i !== index) setIndex(i);
      });
    }, { passive: true });

    enableDragToClose();
    blockTouchScroll(modal, ['.photos-track', '.photos-sheet']);
    document.body.append(modal);
  }

  function buildSlides() {
    const placeholder = IMAGE_TPL.replace('{id}', item.i);   // already cached by the catalog
    track.replaceChildren(...item.q.map((url, i) => {
      const slide = el('div', 'photos-slide is-loading');
      const bg = el('img', 'photos-slide__bg');
      bg.alt = '';
      bg.setAttribute('aria-hidden', 'true');
      bg.src = placeholder;
      const img = el('img', 'photos-slide__img');
      img.decoding = 'async';
      img.dataset.src = url;
      img.addEventListener('load', () => {
        slide.classList.remove('is-loading');
        fitPhoto(slide, img);
        bg.src = img.src;   // for photos too different from the frame: blurred copy around them
      });
      img.addEventListener('error', () => {
        slide.classList.remove('is-loading');
        slide.append(el('span', 'photos-slide__error', t("This photo couldn't be loaded.")));
      });
      slide.append(bg, img, el('span', 'photos-slide__spinner'));
      slide.dataset.i = i;
      return slide;
    }));
  }

  // Fill the frame (zoom) when the photo's shape is close to it, so there are no bands;
  // a very different shape keeps the whole photo (with the blurred copy around it)
  const MAX_ZOOM = 1.3;
  function fitPhoto(slide, img) {
    if (!img.naturalWidth || !slide.clientHeight) return;
    const photo = img.naturalWidth / img.naturalHeight;
    const frame = slide.clientWidth / slide.clientHeight;
    slide.classList.toggle('is-cover', Math.max(photo / frame, frame / photo) <= MAX_ZOOM);
  }

  // Load the photo shown and its neighbours only
  function ensureLoaded(i) {
    [i, i + 1, i - 1].forEach(j => {
      const img = track.children[j] && track.children[j].querySelector('.photos-slide__img');
      if (img && !img.getAttribute('src')) img.src = img.dataset.src;
    });
  }

  function setIndex(i) {
    const n = item.q.length;
    index = Math.max(0, Math.min(n - 1, i));
    ensureLoaded(index);
    [...track.children].forEach((s, j) => {
      s.querySelector('.photos-slide__img').alt = j === index ? t('Real photos') + ' ' + (j + 1) + '/' + n : '';
    });
    modal.querySelector('.photos-counter').textContent = (index + 1) + ' / ' + n;
    const atStart = index === 0, atEnd = index === n - 1;
    modal.querySelector('.photos-nav--prev').hidden = n < 2 || (isRTL() ? atEnd : atStart);
    modal.querySelector('.photos-nav--next').hidden = n < 2 || (isRTL() ? atStart : atEnd);
  }

  function goTo(i, smooth = true) {
    const n = item.q.length;
    i = Math.max(0, Math.min(n - 1, i));
    const left = i * track.clientWidth * (isRTL() ? -1 : 1);
    track.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
    setIndex(i);
  }

  function renderTexts() {
    if (!modal || !item) return;
    const q = s => modal.querySelector(s);
    q('.photos-sheet__close').setAttribute('aria-label', t('Close'));
    q('.photos-nav--prev').setAttribute('aria-label', t('Previous photo'));
    q('.photos-nav--next').setAttribute('aria-label', t('Next photo'));
    q('.photos-label__main').textContent = t('Real photos');
    // No agent name: some photos come from other agents' warehouses (Hipobuy watermark)
    q('.photos-caption').textContent = t('Real photos of this item, taken at the warehouse.');
    q('.photos-product__img').src = IMAGE_TPL.replace('{id}', item.i);
    q('.photos-product__name').textContent = niceName(item.n);
    q('.photos-product__meta').textContent = [item.b, catLabel(item.c)].filter(Boolean).join(' · ');
    q('.photos-product__price').textContent = Prices.format(item.p);
    const jersey = q('.photos-jersey');
    jersey.hidden = item.c.toLowerCase() !== 'jersey';
    jersey.innerHTML = t('Football items: <strong>{amount} minimum</strong> per order.')
      .replace('{amount}', `<bdi>${Prices.formatMinimum(Prices.FOOTBALL_MIN_EUR)}</bdi>`);
    const buy = q('.photos-buy');
    buy.textContent = t('Buy on Lovegobuy →');
    buy.href = buyLink(itemId);
    q('.photos-note').textContent = t('Size and colour are chosen on Lovegobuy.');
  }

  // Phones: keep the page behind still without locking its scroll (iPhone Safari shows solid
  // bars when the page can't scroll). Swipes outside the window, or on parts of it that can't
  // scroll in that direction, are cancelled.
  function blockTouchScroll(overlay, scrollers) {
    let y0 = 0, x0 = 0;
    overlay.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener('touchmove', e => {
      if (e.defaultPrevented) return;
      const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
      for (let n = e.target; n && n !== overlay; n = n.parentElement) {
        if (!scrollers.some(sel => n.matches(sel))) continue;
        if (Math.abs(dx) > Math.abs(dy) ? n.scrollWidth > n.clientWidth
            : (dy < 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0)) return;
      }
      e.preventDefault();
    }, { passive: false });
  }

  // ─── Phones: drag the window down to close it ──
  function enableDragToClose() {
    let y0 = 0, x0 = 0, dy = 0, t0 = 0, mode = null;   // mode: null | 'drag' | 'ignore'
    sheet.addEventListener('touchstart', e => {
      if (!phone.matches) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      t0 = Date.now();
      dy = 0;
      mode = null;
    }, { passive: true });

    sheet.addEventListener('touchmove', e => {
      if (!phone.matches || mode === 'ignore') return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (mode === null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        // Only a downward pull, from the top of the window, closes it (sideways = photos)
        mode = (my > 0 && Math.abs(my) > Math.abs(mx) && sheet.scrollTop <= 0) ? 'drag' : 'ignore';
        if (mode === 'drag') sheet.classList.add('is-dragging');
      }
      if (mode !== 'drag') return;
      e.preventDefault();
      dy = Math.max(0, my);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: false });

    sheet.addEventListener('touchend', () => {
      if (mode !== 'drag') { mode = null; return; }
      mode = null;
      sheet.classList.remove('is-dragging');
      const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.5;
      if (dy > 120 || fast) close();
      else sheet.style.transform = '';
    });
  }

  // ─── Open / close ─────────────────────────────
  async function open(id, { fromHash = false } = {}) {
    let data;
    try { data = await loadItem(String(id)); } catch (e) { data = null; }
    if (!data) { if (fromHash) clearHash(); return; }
    if (!modal) build();
    item = data;
    itemId = String(id);
    lastFocus = document.activeElement;
    renderTexts();
    buildSlides();
    sheet.style.transform = '';
    sheet.scrollTop = 0;
    modal.hidden = false;
    document.documentElement.classList.add('photos-open');
    goTo(0, false);
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('is-open')));
    // Computers: focus the window (keyboard users land inside it). Not on phones: like the
    // chat, so iPhone Safari doesn't expand its address bar
    if (window.matchMedia('(hover: hover)').matches) sheet.focus({ preventScroll: true });
    // A history entry so the phone's Back button closes the window, but the address stays
    // the same: a changing URL makes iPhone Safari expand its address bar (and a band under it)
    if (!fromHash) {
      history.pushState({ realPhotos: itemId }, '');
      pushedHash = true;
    }
    gaEvent('open_real_photos', { item_name: item.n, photos: item.q.length });
  }

  function hide() {
    if (!modal || modal.hidden) return;
    modal.classList.remove('is-open');
    sheet.style.transform = '';
    document.documentElement.classList.remove('photos-open');
    setTimeout(() => {
      if (modal.classList.contains('is-open')) return;
      modal.hidden = true;
      track.replaceChildren();   // stop loading photos nobody looks at any more
    }, 300);
    item = null;
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  function clearHash() {
    history.replaceState(history.state, '', location.pathname + location.search);
  }

  // Closing goes back in history when we added the #p= entry, so Back and ✕ behave the same
  function close() {
    if (pushedHash) { pushedHash = false; history.back(); }
    else { hide(); if (HASH_RE.test(location.hash)) clearHash(); }
  }

  window.addEventListener('popstate', e => {
    const again = e.state && e.state.realPhotos;   // Forward after closing
    const m = location.hash.match(HASH_RE);
    if (again) { pushedHash = true; open(again, { fromHash: true }); }
    else if (m) open(m[1], { fromHash: true });
    else { pushedHash = false; hide(); }
  });

  document.addEventListener('keydown', e => {
    if (!modal || modal.hidden || !item) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') goTo(index + (isRTL() ? -1 : 1));
    if (e.key === 'ArrowLeft') goTo(index + (isRTL() ? 1 : -1));
  });

  // Keep the current photo in place if the window is resized (phone rotation)
  window.addEventListener('resize', () => {
    if (!item) return;
    goTo(index, false);
    [...track.children].forEach(sl => fitPhoto(sl, sl.querySelector('.photos-slide__img')));
  });

  document.addEventListener('localechange', () => {
    if (!item) return;
    renderTexts();
    goTo(index, false);   // Arabic flips the photo strip
  });

  // Shared link (/#p=123)
  document.addEventListener('DOMContentLoaded', () => {
    const m = location.hash.match(HASH_RE);
    if (m) open(m[1], { fromHash: true });
  });

  window.RealPhotos = { open };
})();
