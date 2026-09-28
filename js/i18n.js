/* ==============================================
   Language + currency — loaded in the <head> of every page.
   - English is the source language: translations live in i18n/<lang>.js
     (window.I18N_DICT = { English text: translation }), loaded only
     when another language is chosen.
   - Static page text is translated by matching its English text; JS
     strings go through t() with the English text. Missing entries stay English.
   - The 🌐 button in the nav picks the language and the currency
     (see js/prices.js); a choice reloads the page.
============================================== */

(function () {
  const LANGS = [
    { code: 'en', name: 'English',    flag: 'gb' },
    { code: 'fr', name: 'Français',   flag: 'fr' },
    { code: 'es', name: 'Español',    flag: 'es' },
    { code: 'pt', name: 'Português',  flag: 'pt' },
    { code: 'de', name: 'Deutsch',    flag: 'de' },
    { code: 'it', name: 'Italiano',   flag: 'it' },
    { code: 'nl', name: 'Nederlands', flag: 'nl' },
    { code: 'ar', name: 'العربية', rtl: true },   // no single country: a letter badge instead of a flag
  ];
  const STORE_KEY = 'lang';

  let lang = 'en';
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (LANGS.some(l => l.code === saved)) lang = saved;
  } catch (e) {}
  const langInfo = LANGS.find(l => l.code === lang);

  const html = document.documentElement;
  html.lang = lang;
  if (langInfo.rtl) html.dir = 'rtl';

  // Parser-blocking on purpose: the dictionary must be there before the page is shown
  if (lang !== 'en') document.write('<script src="/i18n/' + lang + '.js"><\/script>');

  const norm = s => String(s).replace(/\s+/g, ' ').trim();

  function t(text) {
    const dict = window.I18N_DICT;
    return (dict && dict[norm(text)]) || text;
  }

  // ─── Static page text ─────────────────────────
  // Text nodes are matched one by one. An element mixing text with inline tags
  // ("<strong>Minimum 4 jerseys</strong> required…") can also be translated as a
  // whole: its key is its text content and the translation is HTML.
  const INLINE = new Set(['STRONG', 'EM', 'B', 'I', 'A', 'BR', 'SPAN', 'SMALL', 'U']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT']);
  const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);   // attributes only
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  function translateNode(node, dict) {
    if (node.nodeType === 3) {
      const key = norm(node.data);
      if (key && dict[key]) {
        const lead = node.data.match(/^\s*/)[0], trail = node.data.match(/\s*$/)[0];
        node.data = lead + dict[key] + trail;
      }
      return;
    }
    if (node.nodeType !== 1 || SKIP.has(node.tagName.toUpperCase())) return;
    if (node.getAttribute('translate') === 'no' || node.id === 'productsGrid' || /(^|\s)chat-/.test(node.getAttribute('class') || '')) return;

    ATTRS.forEach(a => {
      const v = node.getAttribute(a);
      if (v && dict[norm(v)]) node.setAttribute(a, dict[norm(v)]);
    });
    if (FIELDS.has(node.tagName)) return;

    const kids = [...node.childNodes];
    const mixed = kids.some(k => k.nodeType === 3 && k.data.trim()) &&
                  kids.some(k => k.nodeType === 1) &&
                  kids.every(k => k.nodeType !== 1 || (INLINE.has(k.tagName) && !k.id));
    if (mixed) {
      const whole = dict[norm(node.textContent)];
      if (whole) { node.innerHTML = whole; return; }
    }
    kids.forEach(k => translateNode(k, dict));
  }

  function translatePage() {
    const dict = window.I18N_DICT;
    if (!dict) return;
    translateNode(document.body, dict);
    if (dict[norm(document.title)]) document.title = dict[norm(document.title)];
  }

  // ─── Language / currency picker ───────────────
  // Nav button (flag + currency symbol) opening a dialog of cards;
  // a bottom sheet on phones. A choice reloads the page.
  const CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const CURRENCY_NAMES = { EUR: 'Euro', USD: 'Dollar', GBP: 'Pound', PLN: 'Złoty', CNY: 'Yuan' };   // short: the code is shown below

  function flagHTML(l) {
    return l.flag
      ? '<span class="flag locale__flag flag--' + l.flag + '" aria-hidden="true"></span>'
      : '<span class="locale__flag locale__flag--letter" aria-hidden="true">ع</span>';
  }

  function el(tag, cls, htmlContent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (htmlContent != null) n.innerHTML = htmlContent;
    return n;
  }

  function buildPicker() {
    const right = document.querySelector('.nav__right');
    if (!right || !window.Prices) return;
    const cur = Prices.current();

    const btn = el('button', 'locale__btn', flagHTML(langInfo) + '<span class="locale__symbol">' + Prices.CURRENCIES[cur].symbol + '</span>');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-label', t('Language and currency') + ': ' + langInfo.name + ', ' + cur);
    right.prepend(btn);

    let modal = null, lastFocus = null;

    function card(inner, active, onPick) {
      const b = el('button', 'locale-card' + (active ? ' is-active' : ''), inner + (active ? '<span class="locale-card__check">' + CHECK + '</span>' : ''));
      b.type = 'button';
      if (active) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => { if (active) close(); else onPick(); });
      return b;
    }

    function section(title, cards) {
      const sec = el('section', 'locale-sheet__section');
      sec.append(el('h3', 'locale-sheet__label', title));
      const grid = el('div', 'locale-sheet__grid');
      cards.forEach(c => grid.append(c));
      sec.append(grid);
      return sec;
    }

    function build() {
      modal = el('div', 'locale-modal');
      modal.hidden = true;
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
        section(t('Language'), LANGS.map(l => card(
          flagHTML(l) + '<span class="locale-card__name">' + l.name + '</span>',
          l.code === lang,
          () => {
            try { localStorage.setItem(STORE_KEY, l.code); } catch (e) {}
            if (typeof gtag === 'function') gtag('event', 'change_language', { language: l.code });
            location.reload();
          }))),
        section(t('Currency'), Object.keys(Prices.CURRENCIES).map(code => card(
          '<span class="locale-card__symbol">' + Prices.CURRENCIES[code].symbol + '</span>' +
          '<span class="locale-card__text"><span class="locale-card__name">' + t(CURRENCY_NAMES[code]) + '</span>' +
          '<span class="locale-card__code">' + code + '</span></span>',
          code === cur,
          () => {
            Prices.set(code);
            if (typeof gtag === 'function') gtag('event', 'change_currency', { currency: code });
            location.reload();
          }))),
      );

      sheet.append(head, body);
      modal.append(sheet);
      modal.addEventListener('click', e => { if (e.target === modal) close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal && !modal.hidden) close(); });

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
      if (!modal) build();
      lastFocus = document.activeElement;
      modal.hidden = false;
      document.documentElement.classList.add('locale-open');
      requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('is-open')));
      const active = modal.querySelector('.locale-card.is-active');
      if (active) active.focus({ preventScroll: true });
      if (typeof gtag === 'function') gtag('event', 'open_locale_picker');
    }

    function close() {
      if (!modal || modal.hidden) return;
      modal.classList.remove('is-open');
      document.documentElement.classList.remove('locale-open');
      setTimeout(() => { modal.hidden = true; }, 250);
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    }

    btn.addEventListener('click', open);
  }

  window.I18N = { lang, langs: LANGS, t, translatePage };
  window.t = t;

  document.addEventListener('DOMContentLoaded', () => {
    translatePage();
    buildPicker();
  });
})();
