/* ==============================================
   Language + currency — loaded in the <head> of every page.
   - English is the source language: translations live in i18n/<lang>.js
     (window.I18N_DICT = { English text: translation }), loaded only
     when another language is chosen.
   - Static page text is translated by matching its English text; JS
     strings go through t() with the English text. Missing entries stay English.
   - The "EN · €" text button in the nav opens a picker (dialog of cards, bottom
     sheet on phones). A choice applies on the spot, without a reload: the page
     text is swapped and a `localechange` event lets the scripts redraw their
     own parts (prices, category chips, chat, tracking).
============================================== */

(function () {
  const LANGS = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
    { code: 'pt', name: 'Português' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'ar', name: 'العربية', rtl: true },
  ];
  const STORE_KEY = 'lang';
  const html = document.documentElement;

  let lang = 'en';
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (LANGS.some(l => l.code === saved)) lang = saved;
  } catch (e) {}
  const info = code => LANGS.find(l => l.code === code);

  function setDocLang() {
    html.lang = lang;
    if (info(lang).rtl) html.dir = 'rtl';
    else html.removeAttribute('dir');
  }
  setDocLang();

  // Parser-blocking on purpose: the saved language's dictionary must be there
  // before the page is shown (no flash of English)
  if (lang !== 'en') document.write('<script src="/i18n/' + lang + '.js"><\/script>');

  const DICTS = { en: null };   // loaded dictionaries, by language

  const norm = s => String(s).replace(/\s+/g, ' ').trim();

  function t(text) {
    const dict = window.I18N_DICT;
    return (dict && dict[norm(text)]) || text;
  }

  // ─── Static page text ─────────────────────────
  // Text nodes are matched one by one. An element mixing text with inline tags
  // ("Tap <strong>here</strong> to…") can also be translated as a
  // whole: its key is its text content and the translation is HTML.
  // The English originals are kept so another language can be applied later.
  const INLINE = new Set(['STRONG', 'EM', 'B', 'I', 'A', 'BR', 'SPAN', 'SMALL', 'U']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT']);
  const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);          // attributes only
  const SKIP_IDS = new Set(['productsGrid', 'catChips', 'filterDropdown', 'footballNoticeTitle', 'jerseyPopupText']);   // drawn by main.js / women.js
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  const originalText = new Map();   // text node → English text
  const originalHTML = new Map();   // element translated as a whole → English HTML
  const originalAttr = new Map();   // element → { attribute: English value }
  let originalTitle = null;

  function translateNode(node, dict) {
    if (node.nodeType === 3) {
      const key = norm(node.data);
      if (key && dict[key]) {
        if (!originalText.has(node)) originalText.set(node, node.data);
        const lead = node.data.match(/^\s*/)[0], trail = node.data.match(/\s*$/)[0];
        node.data = lead + dict[key] + trail;
      }
      return;
    }
    if (node.nodeType !== 1 || SKIP.has(node.tagName.toUpperCase())) return;
    if (node.getAttribute('translate') === 'no' || SKIP_IDS.has(node.id) ||
        /(^|\s)(chat-|locale)/.test(node.getAttribute('class') || '')) return;

    ATTRS.forEach(a => {
      const v = node.getAttribute(a);
      if (v && dict[norm(v)]) {
        const saved = originalAttr.get(node) || {};
        if (!(a in saved)) saved[a] = v;
        originalAttr.set(node, saved);
        node.setAttribute(a, dict[norm(v)]);
      }
    });
    if (FIELDS.has(node.tagName)) return;

    const kids = [...node.childNodes];
    const mixed = kids.some(k => k.nodeType === 3 && k.data.trim()) &&
                  kids.some(k => k.nodeType === 1) &&
                  kids.every(k => k.nodeType !== 1 || (INLINE.has(k.tagName) && !k.id));
    if (mixed) {
      const whole = dict[norm(node.textContent)];
      if (whole) {
        originalHTML.set(node, node.innerHTML);
        node.innerHTML = whole;
        return;
      }
    }
    kids.forEach(k => translateNode(k, dict));
  }

  // Back to the English page, before applying another language
  function restorePage() {
    originalHTML.forEach((h, el) => { el.innerHTML = h; });
    originalText.forEach((text, node) => { node.data = text; });
    originalAttr.forEach((attrs, el) => Object.keys(attrs).forEach(a => el.setAttribute(a, attrs[a])));
    originalHTML.clear();
    originalText.clear();
    originalAttr.clear();
    if (originalTitle !== null) document.title = originalTitle;
  }

  function translatePage() {
    const dict = window.I18N_DICT;
    if (originalTitle === null) originalTitle = document.title;
    if (!dict) return;
    translateNode(document.body, dict);
    if (dict[norm(originalTitle)]) document.title = dict[norm(originalTitle)];
  }

  // Trustpilot links (Lovegobuy's reviews) open in the visitor's language
  const TRUSTPILOT_HOSTS = { fr: 'fr', es: 'es', pt: 'pt', de: 'de', it: 'it', nl: 'nl' };
  function localizeLinks() {
    const host = (TRUSTPILOT_HOSTS[lang] || 'www') + '.trustpilot.com';
    document.querySelectorAll('a[data-trustpilot]').forEach(a => {
      a.href = 'https://' + host + '/review/lovegobuy.com';
    });
  }

  function loadDict(code) {
    if (code in DICTS) return Promise.resolve(DICTS[code]);
    return new Promise((resolve, reject) => {
      const prev = window.I18N_DICT;
      const s = document.createElement('script');
      s.src = '/i18n/' + code + '.js';
      s.onload = () => {
        DICTS[code] = window.I18N_DICT;
        window.I18N_DICT = prev;
        resolve(DICTS[code]);
      };
      s.onerror = () => reject(new Error('Could not load ' + code));
      document.head.append(s);
    });
  }

  function announce(changed) {
    document.dispatchEvent(new CustomEvent('localechange', { detail: { changed, lang, currency: window.Prices && Prices.current() } }));
    window.dispatchEvent(new Event('resize'));   // the nav, tabs and sticky bar may have changed size
  }

  // ─── Calm switch: wait for the picker to finish closing, then a short fade ───
  // (dim 0.12 s → swap → back 0.2 s), so the text doesn't jump while the window closes
  const DIM = 0.6;   // only slightly dimmed: lower turns the white page into a white flash
  const CLOSE_MS = 250;   // the picker's closing animation (see close())
  let closedAt = 0;
  const pickerClosed = () => new Promise(r => setTimeout(r, Math.max(0, closedAt + CLOSE_MS - Date.now())));

  function fadeSwap(els, swap) {
    if (!els.length || !els[0].animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { swap(); return; }
    const out = els.map(el => el.animate([{ opacity: 1 }, { opacity: DIM }], { duration: 120, easing: 'ease-out', fill: 'forwards' }));
    out[0].finished.then(() => {
      swap();
      els.forEach((el, i) => {
        el.animate([{ opacity: DIM }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
        out[i].cancel();
      });
    }, swap);
  }

  async function setLanguage(code) {
    if (code === lang || !info(code)) return;
    let dict;
    try { [dict] = await Promise.all([loadDict(code), pickerClosed()]); } catch (e) { return; }
    fadeSwap([document.body], () => {   // the whole page: every text changes (and the direction in Arabic)
      restorePage();
      lang = code;
      window.I18N_DICT = dict;
      setDocLang();
      translatePage();
      localizeLinks();
      try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
      if (typeof gtag === 'function') gtag('event', 'change_language', { language: code });
      updateButton();
      announce('lang');
    });
  }

  async function setCurrency(code) {
    if (!window.Prices || !Prices.RATES[code] || code === Prices.current()) return;
    await pickerClosed();
    // Only the prices change: fade just the ones on screen
    const prices = [...document.querySelectorAll('.product-card__price, .photos-product__price, .chat-product__price')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.width;
    });
    fadeSwap(prices, () => {
      Prices.set(code);
      if (typeof gtag === 'function') gtag('event', 'change_currency', { currency: code });
      updateButton();
      announce('currency');
    });
  }

  // ─── Language / currency picker ───────────────
  const CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const CHEVRON = '<svg class="locale__chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const CURRENCY_NAMES = { EUR: 'Euro', USD: 'Dollar', GBP: 'Pound', PLN: 'Złoty', CNY: 'Yuan' };   // short: the code is shown below

  let btn = null, modal = null, lastFocus = null;

  function el(tag, cls, htmlContent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (htmlContent != null) n.innerHTML = htmlContent;
    return n;
  }

  function updateButton() {
    if (!btn) return;
    const cur = Prices.current();
    btn.innerHTML = '<span class="locale__code">' + lang.toUpperCase() + '</span>' +
      '<span class="locale__sep" aria-hidden="true">·</span>' +
      '<span class="locale__symbol">' + Prices.CURRENCIES[cur].symbol + '</span>' + CHEVRON;
    btn.setAttribute('aria-label', t('Language and currency') + ': ' + info(lang).name + ', ' + cur);
  }

  function card(name, sub, lead, active, onPick) {
    const b = el('button', 'locale-card' + (active ? ' is-active' : ''),
      (lead || '') +
      '<span class="locale-card__text"><span class="locale-card__name"></span>' + (sub ? '<span class="locale-card__code"></span>' : '') + '</span>' +
      (active ? '<span class="locale-card__check">' + CHECK + '</span>' : ''));
    b.querySelector('.locale-card__name').textContent = name;
    if (sub) b.querySelector('.locale-card__code').textContent = sub;
    b.type = 'button';
    if (active) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => { close(); if (!active) onPick(); });
    return b;
  }

  function section(title, cards) {
    const sec = el('section', 'locale-sheet__section');
    sec.append(el('h3', 'locale-sheet__label'));
    sec.firstChild.textContent = title;
    const grid = el('div', 'locale-sheet__grid');
    cards.forEach(c => grid.append(c));
    sec.append(grid);
    return sec;
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

  // Built at each opening, so it always shows the current language and currency
  function buildModal() {
    if (modal) modal.remove();
    const cur = Prices.current();
    modal = el('div', 'locale-modal');
    const sheet = el('div', 'locale-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'localeTitle');

    const head = el('div', 'locale-sheet__head');
    head.append(el('span', 'locale-sheet__grip'));
    const title = el('h2', 'locale-sheet__title');
    title.id = 'localeTitle';
    title.textContent = t('Language and currency');
    const x = el('button', 'locale-sheet__close', CLOSE);
    x.type = 'button';
    x.setAttribute('aria-label', t('Close'));
    x.addEventListener('click', close);
    head.append(title, x);

    const body = el('div', 'locale-sheet__body');
    body.append(
      section(t('Language'), LANGS.map(l =>
        card(l.name, '', '', l.code === lang, () => setLanguage(l.code)))),   // native name is enough
      section(t('Currency'), Object.keys(Prices.CURRENCIES).map(code =>
        card(t(CURRENCY_NAMES[code]), code, '<span class="locale-card__symbol">' + Prices.CURRENCIES[code].symbol + '</span>',
          code === cur, () => setCurrency(code)))),
    );

    sheet.append(head, body);
    modal.append(sheet);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    blockTouchScroll(modal, ['.locale-sheet__body']);

    // Phones: drag the sheet down by its header to close it
    let startY = null, dy = 0;
    head.addEventListener('touchstart', e => { startY = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
    head.addEventListener('touchmove', e => {
      if (startY === null) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    head.addEventListener('touchend', () => {
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 80) close();
      startY = null;
    });

    document.body.append(modal);
  }

  function open() {
    buildModal();
    lastFocus = document.activeElement;
    html.classList.add('locale-open');
    requestAnimationFrame(() => requestAnimationFrame(() => modal && modal.classList.add('is-open')));
    const active = modal.querySelector('.locale-card.is-active');
    // Computers only: on phones a focus makes iPhone Safari expand its address bar
    if (active && window.matchMedia('(hover: hover)').matches) active.focus({ preventScroll: true });
    if (typeof gtag === 'function') gtag('event', 'open_locale_picker');
  }

  function close() {
    if (!modal) return;
    closedAt = Date.now();
    const m = modal;
    modal = null;
    m.classList.remove('is-open');
    html.classList.remove('locale-open');
    setTimeout(() => m.remove(), 250);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  function buildPicker() {
    const right = document.querySelector('.nav__right');
    if (!right || !window.Prices) return;
    btn = el('button', 'locale__btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.addEventListener('click', open);
    updateButton();
    right.prepend(btn);
  }

  window.I18N = {
    get lang() { return lang; },
    langs: LANGS,
    t,
    setLanguage,
    setCurrency,
  };
  window.t = t;

  document.addEventListener('DOMContentLoaded', () => {
    DICTS[lang] = window.I18N_DICT || null;
    translatePage();
    localizeLinks();
    buildPicker();
    document.querySelectorAll('a[data-trustpilot]').forEach(a => a.addEventListener('click', () => {
      if (typeof gtag === 'function') gtag('event', 'click_trustpilot', { transport_type: 'beacon' });
    }));
  });
})();
