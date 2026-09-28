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

  // ─── Language / currency picker in the nav ────
  const GLOBE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';

  function buildPicker() {
    const right = document.querySelector('.nav__right');
    if (!right || !window.Prices) return;
    const cur = Prices.current();

    const wrap = document.createElement('div');
    wrap.className = 'locale';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'locale__btn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', t('Language and currency'));
    btn.innerHTML = GLOBE + '<span class="locale__current">' + lang.toUpperCase() + ' · ' + Prices.CURRENCIES[cur].symbol + '</span>';

    const panel = document.createElement('div');
    panel.className = 'locale__panel';
    panel.hidden = true;

    function group(title, items) {
      const g = document.createElement('div');
      g.className = 'locale__group';
      const h = document.createElement('p');
      h.className = 'locale__title';
      h.textContent = title;
      g.append(h);
      items.forEach(({ label, active, onPick }) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'locale__option' + (active ? ' is-active' : '');
        b.textContent = label;
        b.addEventListener('click', () => { if (!active) onPick(); else close(); });
        g.append(b);
      });
      return g;
    }

    panel.append(
      group(t('Language'), LANGS.map(l => ({
        label: l.name,
        active: l.code === lang,
        onPick: () => {
          try { localStorage.setItem(STORE_KEY, l.code); } catch (e) {}
          if (typeof gtag === 'function') gtag('event', 'change_language', { language: l.code });
          location.reload();
        },
      }))),
      group(t('Currency'), Object.keys(Prices.CURRENCIES).map(code => ({
        label: Prices.CURRENCIES[code].symbol + ' ' + code,
        active: code === cur,
        onPick: () => {
          Prices.set(code);
          if (typeof gtag === 'function') gtag('event', 'change_currency', { currency: code });
          location.reload();
        },
      }))),
    );

    function close() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', e => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    wrap.append(btn, panel);
    right.prepend(wrap);
  }

  window.I18N = { lang, langs: LANGS, t, translatePage };
  window.t = t;

  document.addEventListener('DOMContentLoaded', () => {
    translatePage();
    buildPicker();
  });
})();
