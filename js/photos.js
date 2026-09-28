/* ==============================================
   Real photos (QC) — window opened from the camera badge on product cards
   (Men / Women pages). Photos taken at Lovegobuy's warehouse on previous
   orders, from data/qc/<last 2 digits of the item id>.json.
   - Opens above the catalog, so closing it leaves the page exactly as it was.
   - Link to share: /#p=<item id> (also works on /women and creator links).
   - The QC pictures are heavy (400-800 KB): only the one shown and the next
     one are loaded.
============================================== */

(function () {
  const LINK_TPL  = 'https://www.lovegobuy.com/product?id={id}&shop_type=weidian&invite_code=500EUROSOFFERED';
  const IMAGE_TPL = 'https://img.theqcbook.com/products/{id}.webp?v5';
  const HASH_RE = /^#p=(\d+)$/;

  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_PREV  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  const ICON_NEXT  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  const shards = {};
  let modal = null, item = null, itemId = null, index = 0, pushedHash = false, lastFocus = null;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function gaEvent(name, params) {
    if (typeof gtag === 'function') gtag('event', name, { transport_type: 'beacon', ...(params || {}) });
  }

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
    modal.innerHTML = `
      <div class="photos-sheet" role="dialog" aria-modal="true" aria-labelledby="photosTitle">
        <button type="button" class="photos-sheet__close">${ICON_CLOSE}</button>
        <div class="photos-gallery">
          <div class="photos-stage is-loading">
            <img class="photos-stage__img" alt="" decoding="async">
            <span class="photos-stage__error" hidden></span>
          </div>
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

    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('.photos-sheet__close').addEventListener('click', close);
    modal.querySelector('.photos-nav--prev').addEventListener('click', () => show(index - 1));
    modal.querySelector('.photos-nav--next').addEventListener('click', () => show(index + 1));
    modal.querySelector('.photos-buy').addEventListener('click', () => {
      gaEvent('click_product', { item_name: item && item.n, source: 'real_photos' });
    });

    const img = modal.querySelector('.photos-stage__img');
    const stage = modal.querySelector('.photos-stage');
    img.addEventListener('load', () => stage.classList.remove('is-loading'));
    img.addEventListener('error', () => {
      stage.classList.remove('is-loading');
      const err = modal.querySelector('.photos-stage__error');
      err.textContent = t("This photo couldn't be loaded.");
      err.hidden = false;
    });

    // Swipe between photos on phones
    let x0 = null;
    stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 40) return;
      const rtl = document.documentElement.dir === 'rtl';
      show(index + ((dx < 0) !== rtl ? 1 : -1));
    });

    document.body.append(modal);
  }

  function renderTexts() {
    if (!modal || !item) return;
    const q = s => modal.querySelector(s);
    q('.photos-sheet__close').setAttribute('aria-label', t('Close'));
    q('.photos-nav--prev').setAttribute('aria-label', t('Previous photo'));
    q('.photos-nav--next').setAttribute('aria-label', t('Next photo'));
    q('.photos-label__main').textContent = t('Real photos');
    q('.photos-caption').textContent = t("Real photos of this item, taken at Lovegobuy's warehouse on previous orders.");
    q('.photos-product__img').src = IMAGE_TPL.replace('{id}', item.i);
    q('.photos-product__name').textContent = niceName(item.n);
    q('.photos-product__meta').textContent = [item.b, catLabel(item.c)].filter(Boolean).join(' · ');
    q('.photos-product__price').textContent = Prices.format(item.p);
    const jersey = q('.photos-jersey');
    jersey.hidden = item.c.toLowerCase() !== 'jersey';
    jersey.textContent = t('Minimum 4 jerseys per order.');
    const buy = q('.photos-buy');
    buy.textContent = t('Buy on Lovegobuy →');
    buy.href = buyLink(itemId);
    q('.photos-note').textContent = t('Size and colour are chosen on Lovegobuy.');
  }

  function show(i) {
    if (!item) return;
    const n = item.q.length;
    index = (i + n) % n;
    const stage = modal.querySelector('.photos-stage');
    const img = modal.querySelector('.photos-stage__img');
    modal.querySelector('.photos-stage__error').hidden = true;
    if (img.getAttribute('src') !== item.q[index]) {
      stage.classList.add('is-loading');
      img.src = item.q[index];
    }
    img.alt = t('Real photos') + ' ' + (index + 1) + '/' + n;
    modal.querySelector('.photos-counter').textContent = (index + 1) + ' / ' + n;
    modal.querySelectorAll('.photos-nav').forEach(b => { b.hidden = n < 2; });
    // Get the next photo ready (only that one: they are heavy)
    if (n > 1) new Image().src = item.q[(index + 1) % n];
  }

  async function open(id, { fromHash = false } = {}) {
    let data;
    try { data = await loadItem(String(id)); } catch (e) { data = null; }
    if (!data) { if (fromHash) clearHash(); return; }
    if (!modal) build();
    item = data;
    itemId = String(id);
    lastFocus = document.activeElement;
    renderTexts();
    modal.querySelector('.photos-stage__img').removeAttribute('src');
    show(0);
    modal.hidden = false;
    document.documentElement.classList.add('photos-open');
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('is-open')));
    modal.querySelector('.photos-sheet__close').focus({ preventScroll: true });
    if (!fromHash && location.hash !== '#p=' + itemId) {
      // Full path: the pages have <base href="/">, a bare "#p=" would point to the home page
      history.pushState({ realPhotos: itemId }, '', location.pathname + location.search + '#p=' + itemId);
      pushedHash = true;
    }
    gaEvent('open_real_photos', { item_name: item.n, photos: item.q.length });
  }

  function hide() {
    if (!modal || modal.hidden) return;
    modal.classList.remove('is-open');
    document.documentElement.classList.remove('photos-open');
    setTimeout(() => { if (!modal.classList.contains('is-open')) modal.hidden = true; }, 250);
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

  window.addEventListener('popstate', () => {
    const m = location.hash.match(HASH_RE);
    if (m) open(m[1], { fromHash: true });
    else { pushedHash = false; hide(); }
  });

  document.addEventListener('keydown', e => {
    if (!modal || modal.hidden || !item) return;
    if (e.key === 'Escape') close();
    const rtl = document.documentElement.dir === 'rtl';
    if (e.key === 'ArrowRight') show(index + (rtl ? -1 : 1));
    if (e.key === 'ArrowLeft') show(index + (rtl ? 1 : -1));
  });

  document.addEventListener('localechange', () => { renderTexts(); if (item) show(index); });

  // Shared link (/#p=123)
  document.addEventListener('DOMContentLoaded', () => {
    const m = location.hash.match(HASH_RE);
    if (m) open(m[1], { fromHash: true });
  });

  window.RealPhotos = { open };
})();
