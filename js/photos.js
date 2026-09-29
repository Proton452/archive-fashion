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
   - Styles (official photos of each colour / design, `m` in the data): a row of 4 thumbnails
     under the product (the 4th shows "+N" when there are more) opens them full screen.
     Items with styles but no real photos show the styles in the photo strip instead.
============================================== */

(function () {
  const LINK_TPL  = 'https://www.lovegobuy.com/product?id={id}&shop_type=weidian&invite_code=500EUROSOFFERED';
  const IMAGE_TPL = 'https://img.theqcbook.com/products/{id}.webp?v5';
  const STYLE_TPL = 'https://img.theqcbook.com/products/{id}/{n}.webp?v5';
  const STYLE_THUMBS = 4;   // thumbnails under the product; more = "+N" on the last one
  const HASH_RE = /^#p=(\d+)$/;
  const phone = window.matchMedia('(max-width: 700px)');

  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_PREV  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  const ICON_NEXT  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  const shards = {};
  let modal = null, sheet = null, track = null;
  let item = null, itemId = null, index = 0, pushedHash = false, lastFocus = null;
  let photos = [], styles = [], stylesOnly = false;   // photo strip, style photos, strip shows styles

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
            <button type="button" class="photos-fav"></button>
          </div>
          <div class="photos-styles" hidden>
            <p class="photos-styles__title"></p>
            <div class="photos-styles__grid"></div>
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
    modal.querySelector('.photos-fav').addEventListener('click', () => { if (window.Favs) Favs.toggle(itemId); });
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

  const RETRY_MS = [800, 2000, 4000];   // waits before each new try of a photo that didn't load

  // Tries an image again a little later when the server refuses it (see buildSlides)
  function loadWithRetry(img, url, onFail) {
    let tries = 0;
    img.addEventListener('error', () => {
      if (tries < RETRY_MS.length) {
        const wait = RETRY_MS[tries++];
        setTimeout(() => { img.src = url + (url.includes('?') ? '&' : '?') + 'retry=' + tries; }, wait);
      } else if (onFail) onFail();
    });
    img.src = url;
  }

  function buildSlides() {
    const placeholder = IMAGE_TPL.replace('{id}', item.i);   // already cached by the catalog
    track.replaceChildren(...photos.map((url, i) => {
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
      let tries = 0;
      img.addEventListener('error', () => {
        // The photo server refuses bursts (HTTP 429, often after browsing the catalogue, same
        // server): try again a little later before giving up
        if (tries < RETRY_MS.length) {
          const wait = RETRY_MS[tries++];
          setTimeout(() => { img.src = url + (url.includes('?') ? '&' : '?') + 'retry=' + tries; }, wait);
          return;
        }
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
    if (stylesOnly || !img.naturalWidth || !slide.clientHeight) return;   // styles: always whole
    const photo = img.naturalWidth / img.naturalHeight;
    const frame = slide.clientWidth / slide.clientHeight;
    slide.classList.toggle('is-cover', Math.max(photo / frame, frame / photo) <= MAX_ZOOM);
  }

  // Load the photo shown first, then its neighbours (fewer requests at once: the server limits bursts)
  function ensureLoaded(i) {
    const imgAt = j => track.children[j] && track.children[j].querySelector('.photos-slide__img');
    const load = img => { if (img && !img.getAttribute('src')) img.src = img.dataset.src; };
    const current = imgAt(i);
    load(current);
    const neighbours = () => { load(imgAt(i + 1)); load(imgAt(i - 1)); };
    if (!current || current.complete) neighbours();
    else current.addEventListener('load', neighbours, { once: true });
  }

  function setIndex(i) {
    const n = photos.length;
    index = Math.max(0, Math.min(n - 1, i));
    ensureLoaded(index);
    const label = stylesOnly ? t('Style') : t('Real photos');
    [...track.children].forEach((s, j) => {
      s.querySelector('.photos-slide__img').alt = j === index ? label + ' ' + (j + 1) + '/' + n : '';
    });
    modal.querySelector('.photos-counter').textContent = (index + 1) + ' / ' + n;
    const atStart = index === 0, atEnd = index === n - 1;
    modal.querySelector('.photos-nav--prev').hidden = n < 2 || (isRTL() ? atEnd : atStart);
    modal.querySelector('.photos-nav--next').hidden = n < 2 || (isRTL() ? atStart : atEnd);
  }

  function goTo(i, smooth = true) {
    const n = photos.length;
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
    q('.photos-label__main').textContent = stylesOnly ? t('Available styles') : t('Real photos');
    q('.photos-label__qc').hidden = stylesOnly;
    // No agent name: some photos come from other agents' warehouses (Hipobuy watermark)
    q('.photos-caption').textContent = stylesOnly
      ? t('Official photos of the styles available for this item.')
      : t('Real photos of this item, taken at the warehouse.');
    q('.photos-styles__title').textContent = t('Available styles') + ' (' + styles.length + ')';
    q('.photos-styles__grid').querySelectorAll('.photos-style').forEach((b, i) => {
      b.setAttribute('aria-label', b.classList.contains('has-more') ? t('See all styles') : t('Style') + ' ' + (i + 1));
    });
    q('.photos-product__img').src = IMAGE_TPL.replace('{id}', item.i);
    q('.photos-product__name').textContent = niceName(item.n);
    q('.photos-product__meta').textContent = [item.b, catLabel(item.c)].filter(Boolean).join(' · ');
    q('.photos-product__price').textContent = Prices.format(item.p);
    renderFav();
    const jersey = q('.photos-jersey');
    jersey.hidden = item.c.toLowerCase() !== 'jersey';
    jersey.innerHTML = t('Football items: <strong>{amount} minimum</strong> per order.')
      .replace('{amount}', `<bdi>${Prices.formatMinimum(Prices.FOOTBALL_MIN_EUR)}</bdi>`);
    const buy = q('.photos-buy');
    buy.textContent = t('Buy on Lovegobuy →');
    buy.href = buyLink(itemId);
    q('.photos-note').textContent = t('Size and colour are chosen on Lovegobuy.');
  }

  // ─── Styles: row of thumbnails under the product (items that also have real photos) ───
  function buildStyles() {
    const box = modal.querySelector('.photos-styles');
    const grid = modal.querySelector('.photos-styles__grid');
    box.hidden = stylesOnly || !styles.length;
    if (box.hidden) { grid.replaceChildren(); return; }
    const more = styles.length > STYLE_THUMBS;
    const thumbs = styles.slice(0, STYLE_THUMBS).map((url, i) => {
      const btn = el('button', 'photos-style is-loading');
      btn.type = 'button';
      const img = el('img', 'photos-style__img');
      img.alt = '';
      img.decoding = 'async';
      btn.append(img);
      if (more && i === STYLE_THUMBS - 1) {   // the last thumbnail is covered, so it counts too
        btn.classList.add('has-more');
        btn.append(el('span', 'photos-style__more', '+' + (styles.length - STYLE_THUMBS + 1)));
      }
      btn.addEventListener('click', () => {
        Viewer.open(styles, i);
        gaEvent('open_styles', { item_name: item && item.n, styles: styles.length });
      });
      return btn;
    });
    grid.replaceChildren(...thumbs);
    // One after the other: the server refuses bursts, and the real photos load at the same time.
    // A thumbnail that still fails stays an empty grey square (it opens the viewer all the same).
    const loadThumb = i => {
      const btn = thumbs[i];
      if (!btn || !btn.isConnected) return;
      const img = btn.querySelector('img');
      const done = failed => {
        btn.classList.remove('is-loading');
        btn.classList.toggle('is-failed', failed);
        loadThumb(i + 1);
      };
      img.addEventListener('load', () => done(false), { once: true });
      loadWithRetry(img, styles[i], () => done(true));
    };
    loadThumb(0);
  }

  // ─── Full-screen viewer for the styles (white: the photos have no background) ───
  const Viewer = (() => {
    let box = null, vtrack = null, urls = [], at = 0;

    function build() {
      box = el('div', 'styles-viewer');
      box.hidden = true;
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.tabIndex = -1;
      box.innerHTML = `
        <div class="styles-viewer__track"></div>
        <button type="button" class="styles-viewer__close">${ICON_CLOSE}</button>
        <button type="button" class="photos-nav photos-nav--prev">${ICON_PREV}</button>
        <button type="button" class="photos-nav photos-nav--next">${ICON_NEXT}</button>
        <span class="photos-counter" aria-live="polite"></span>`;
      vtrack = box.querySelector('.styles-viewer__track');
      box.querySelector('.styles-viewer__close').addEventListener('click', close);
      box.querySelector('.photos-nav--prev').addEventListener('click', () => go(at + (isRTL() ? 1 : -1)));
      box.querySelector('.photos-nav--next').addEventListener('click', () => go(at + (isRTL() ? -1 : 1)));
      let ticking = false;
      vtrack.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          const i = Math.round(Math.abs(vtrack.scrollLeft) / (vtrack.clientWidth || 1));
          if (i !== at) set(i);
        });
      }, { passive: true });
      blockTouchScroll(box, ['.styles-viewer__track']);
      document.body.append(box);
    }

    // Only the style shown and its neighbours are loaded (the server refuses bursts)
    function load(i) {
      const slide = vtrack.children[i];
      if (!slide || slide.dataset.loaded) return;
      slide.dataset.loaded = '1';
      const img = slide.querySelector('img');
      img.addEventListener('load', () => slide.classList.remove('is-loading'));
      loadWithRetry(img, urls[i], () => {
        slide.classList.remove('is-loading');
        img.hidden = true;
        slide.append(el('span', 'photos-slide__error', t("This photo couldn't be loaded.")));
      });
    }

    function set(i) {
      at = Math.max(0, Math.min(urls.length - 1, i));
      load(at); load(at + 1); load(at - 1);
      [...vtrack.children].forEach((s, j) => {
        s.querySelector('img').alt = j === at ? t('Style') + ' ' + (j + 1) + '/' + urls.length : '';
      });
      box.querySelector('.photos-counter').textContent = (at + 1) + ' / ' + urls.length;
      box.querySelector('.styles-viewer__close').setAttribute('aria-label', t('Close'));
      const prev = box.querySelector('.photos-nav--prev'), next = box.querySelector('.photos-nav--next');
      prev.setAttribute('aria-label', t('Previous photo'));
      next.setAttribute('aria-label', t('Next photo'));
      const atStart = at === 0, atEnd = at === urls.length - 1;
      prev.hidden = urls.length < 2 || (isRTL() ? atEnd : atStart);
      next.hidden = urls.length < 2 || (isRTL() ? atStart : atEnd);
    }

    function go(i, smooth = true) {
      i = Math.max(0, Math.min(urls.length - 1, i));
      vtrack.scrollTo({ left: i * vtrack.clientWidth * (isRTL() ? -1 : 1), behavior: smooth ? 'smooth' : 'auto' });
      set(i);
    }

    function open(list, i) {
      if (!box) build();
      urls = list;
      vtrack.replaceChildren(...list.map(() => {
        const slide = el('div', 'styles-viewer__slide is-loading');
        const img = el('img');
        img.decoding = 'async';
        slide.append(img, el('span', 'photos-slide__spinner'));
        return slide;
      }));
      box.hidden = false;
      go(i, false);
      requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('is-open')));
      if (window.matchMedia('(hover: hover)').matches) box.focus({ preventScroll: true });   // arrows / Escape work at once
    }

    const isOpen = () => !!box && box.classList.contains('is-open');

    function close() {
      if (!isOpen()) return;
      box.classList.remove('is-open');
      setTimeout(() => {
        if (box.classList.contains('is-open')) return;
        box.hidden = true;
        vtrack.replaceChildren();   // stop loading styles nobody looks at any more
      }, 200);
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(at + (isRTL() ? -1 : 1));
      if (e.key === 'ArrowLeft') go(at + (isRTL() ? 1 : -1));
    }

    // Rotation / language change: keep the current style in place (Arabic flips the strip)
    function refresh() { if (isOpen()) go(at, false); }

    return { open, close, isOpen, onKey, refresh };
  })();

  // Heart next to the product: same favorites as the cards (js/favorites.js)
  function renderFav() {
    const fav = modal.querySelector('.photos-fav');
    fav.hidden = !window.Favs;
    if (!window.Favs) return;
    const on = Favs.has(itemId);
    fav.innerHTML = Favs.HEART;
    fav.classList.toggle('is-on', on);
    fav.setAttribute('aria-pressed', on);
    fav.setAttribute('aria-label', t('Favorites'));
  }

  document.addEventListener('favchange', e => {
    if (item && e.detail.key === itemId) renderFav();
  });

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
    styles = (data.m || []).map(n => STYLE_TPL.replace('{id}', data.i).replace('{n}', n));
    stylesOnly = !data.q.length;
    photos = stylesOnly ? styles : data.q;
    if (!photos.length) { if (fromHash) clearHash(); return; }
    if (!modal) build();
    item = data;
    itemId = String(id);
    sheet.classList.toggle('is-styles', stylesOnly);
    if (window.Recent) Recent.add(itemId);
    lastFocus = document.activeElement;
    buildStyles();
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
    gaEvent('open_real_photos', { item_name: item.n, photos: item.q.length, styles: styles.length });
  }

  function hide() {
    Viewer.close();
    if (!modal || modal.hidden) return;
    document.querySelectorAll('.product-card.is-held').forEach(c => c.classList.remove('is-held'));   // back to normal: zoomed only if the mouse is still on it
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
    if (Viewer.isOpen()) { Viewer.onKey(e); return; }
    if (!modal || modal.hidden || !item) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') goTo(index + (isRTL() ? -1 : 1));
    if (e.key === 'ArrowLeft') goTo(index + (isRTL() ? 1 : -1));
  });

  // Keep the current photo in place if the window is resized (phone rotation)
  window.addEventListener('resize', () => {
    Viewer.refresh();
    if (!item) return;
    goTo(index, false);
    [...track.children].forEach(sl => fitPhoto(sl, sl.querySelector('.photos-slide__img')));
  });

  document.addEventListener('localechange', () => {
    Viewer.refresh();
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
