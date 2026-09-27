/* ==============================================
   LovegoFinds chat assistant — floating bubble on every page.
   Talks to /api/chat. Conversation kept in sessionStorage so it
   survives page changes. Product / sign-up links get the partner
   invite code when the visitor came through a creator link.
============================================== */

(function () {
  const STORE_KEY  = 'lgf-chat';
  const MAX_USER_MESSAGES = 20;
  const SIGNUP_URL  = 'https://www.lovegobuy.com/login/signup/?invite_code=500EUROSOFFERED';
  const DISCORD_URL = 'https://discord.gg/5EhjDVZ2x7';
  const WELCOME = "Hi! 👋 I can help you find items, explain how to order, or track your package. Ask me in any language.";
  const SUGGESTIONS = ['How do I order?', 'Find a PSG jersey', 'Track my package'];
  // The site is English for now; switch this to the site's language mode once it exists
  const isFrench = false;

  // ─── State ────────────────────────────────────
  let state = { open: false, messages: [] };
  try { state = Object.assign(state, JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}')); } catch (e) {}
  let sending = false;

  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function track(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  }

  function withPartnerCode(url) {
    const code = window.PARTNER_CODE;
    return code ? url.replace(/invite_code=[^&\s]+/, 'invite_code=' + code) : url;
  }

  // ─── DOM helpers ──────────────────────────────
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  // Inline text → safe nodes, with **bold**
  function inline(text) {
    const frag = document.createDocumentFragment();
    text.split(/(\*\*[^*]+\*\*)/).forEach(chunk => {
      if (/^\*\*[^*]+\*\*$/.test(chunk)) frag.append(el('strong', '', chunk.slice(2, -2)));
      else if (chunk) frag.append(document.createTextNode(chunk));
    });
    return frag;
  }

  // Plain text → paragraphs and real lists ("* item", "- item", "1. item")
  function richText(text) {
    const frag = document.createDocumentFragment();
    let list = null, listType = '', para = null;

    text.split('\n').forEach(line => {
      const bullet  = line.match(/^\s*[-*•]\s+(.*)$/);
      const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      const item = bullet || numbered;

      if (item) {
        const type = bullet ? 'ul' : 'ol';
        if (!list || listType !== type) {
          list = el(type, 'chat-list');
          // Keep the model's numbering if a list resumes after a button or card
          if (numbered && +numbered[0].match(/\d+/)[0] > 1) list.start = +numbered[0].match(/\d+/)[0];
          listType = type;
          frag.append(list);
        }
        const li = el('li');
        li.append(inline(item[1]));
        list.append(li);
        para = null;
        return;
      }

      list = null;
      if (!line.trim()) { para = null; return; }
      if (para) para.append(document.createElement('br'));
      else { para = el('p', 'chat-p'); frag.append(para); }
      para.append(inline(line));
    });
    return frag;
  }

  const ICON_CHAT  = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_SEND  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ─── Build UI ─────────────────────────────────
  const bubble = el('button', 'chat-bubble');
  bubble.type = 'button';
  bubble.setAttribute('aria-label', 'Open chat assistant');
  bubble.innerHTML = ICON_CHAT + '<span class="chat-bubble__label">' + (isFrench ? 'Aide' : 'Help') + '</span>';

  const panel = el('section', 'chat-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'LovegoFinds assistant');
  panel.hidden = true;

  const header = el('header', 'chat-panel__header');
  const titleWrap = el('div', 'chat-panel__titles');
  titleWrap.append(el('p', 'chat-panel__title', 'LovegoFinds assistant'), el('p', 'chat-panel__subtitle', 'Answers in a few seconds'));
  const resetBtn = el('button', 'chat-panel__reset', 'New chat');
  resetBtn.type = 'button';
  const closeBtn = el('button', 'chat-panel__close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close chat');
  closeBtn.innerHTML = ICON_CLOSE;
  header.append(titleWrap, resetBtn, closeBtn);

  const list = el('div', 'chat-panel__messages');
  list.setAttribute('aria-live', 'polite');

  const form = el('form', 'chat-panel__form');
  const input = el('input', 'chat-panel__input');
  input.type = 'text';
  input.placeholder = 'Ask anything…';
  input.maxLength = 500;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Your message');
  const sendBtn = el('button', 'chat-panel__send');
  sendBtn.type = 'submit';
  sendBtn.setAttribute('aria-label', 'Send');
  sendBtn.innerHTML = ICON_SEND;
  form.append(input, sendBtn);

  panel.append(header, list, form);
  const backdrop = el('div', 'chat-backdrop');
  backdrop.hidden = true;

  document.body.append(bubble, backdrop, panel);

  // ─── Rendering ────────────────────────────────
  function productCard(p) {
    const a = el('a', 'chat-product');
    a.href = withPartnerCode(p.link);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const img = el('img', 'chat-product__img');
    img.src = p.image;
    img.alt = '';
    img.loading = 'lazy';
    const info = el('span', 'chat-product__info');
    info.append(el('span', 'chat-product__name', p.name), el('span', 'chat-product__price', p.price));
    a.append(img, info, el('span', 'chat-product__arrow', '→'));
    a.addEventListener('click', () => {
      a.href = withPartnerCode(p.link);
      track('chat_product_click', { item_name: p.name });
    });
    return a;
  }

  const BUTTON_LABELS = isFrench
    ? { signup: 'Créer mon compte (500€ de coupons) →', discord: 'Poser la question sur Discord →', howto: 'Voir le guide de commande →', faq: 'Voir la FAQ →' }
    : { signup: 'Sign up & get 500€ coupons →', discord: 'Ask on Discord →', howto: 'See the full ordering guide →', faq: 'Read the FAQ →' };

  // Site pages keep the creator slug (/faq/football) like the rest of the site
  function sitePath(page) {
    let slug = null;
    try { slug = sessionStorage.getItem('partnerSlug'); } catch (e) {}
    return '/' + page + (slug ? '/' + slug : '');
  }

  function actionButton(kind) {
    const a = el('a', 'chat-action chat-action--' + kind, BUTTON_LABELS[kind]);
    if (kind === 'faq' || kind === 'howto') {
      a.href = sitePath(kind === 'faq' ? 'faq' : 'how-to-order');
      a.addEventListener('click', () => track('chat_page_link', { page: kind }));
      return a;
    }
    a.href = kind === 'signup' ? withPartnerCode(SIGNUP_URL) : DISCORD_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.addEventListener('click', () => {
      if (kind === 'signup') a.href = withPartnerCode(SIGNUP_URL);
      track(kind === 'signup' ? 'click_signup' : 'click_discord', { source: 'chat' });
    });
    return a;
  }

  // Messages are rendered as ordered blocks so cards and buttons appear
  // exactly where the assistant mentions them
  function blocksOf(m) {
    if (m.blocks) return m.blocks;
    const blocks = [];                       // older saved messages
    if (m.text) blocks.push({ type: 'text', text: m.text });
    if (m.products && m.products.length) blocks.push({ type: 'products', items: m.products });
    (m.buttons || []).forEach(kind => blocks.push({ type: 'button', kind }));
    return blocks;
  }

  function renderMessage(m) {
    const row = el('div', 'chat-msg chat-msg--' + (m.role === 'user' ? 'user' : 'bot') + (m.error ? ' chat-msg--error' : ''));
    blocksOf(m).forEach(b => {
      if (b.type === 'text') {
        const bubbleEl = el('div', 'chat-msg__bubble');
        bubbleEl.append(m.role === 'user' ? document.createTextNode(b.text) : richText(b.text));
        row.append(bubbleEl);
      } else if (b.type === 'products' && b.items && b.items.length) {
        const wrap = el('div', 'chat-msg__products');
        b.items.forEach(p => wrap.append(productCard(p)));
        row.append(wrap);
      } else if (b.type === 'button' && BUTTON_LABELS[b.kind]) {
        const wrap = el('div', 'chat-msg__actions');
        wrap.append(actionButton(b.kind));
        row.append(wrap);
      }
    });
    return row;
  }

  function render() {
    list.replaceChildren();
    list.append(renderMessage({ role: 'model', text: WELCOME }));

    if (!state.messages.length) {
      const chips = el('div', 'chat-suggestions');
      SUGGESTIONS.forEach(s => {
        const c = el('button', 'chat-suggestion', s);
        c.type = 'button';
        c.addEventListener('click', () => send(s));
        chips.append(c);
      });
      list.append(chips);
    }

    state.messages.forEach(m => list.append(renderMessage(m)));

    if (sending) {
      const typing = el('div', 'chat-msg chat-msg--bot');
      const dots = el('div', 'chat-msg__bubble chat-typing');
      dots.setAttribute('aria-label', 'Assistant is typing');
      dots.append(el('span'), el('span'), el('span'));
      typing.append(dots);
      list.append(typing);
    }

    const limitReached = userCount() >= MAX_USER_MESSAGES;
    // Keep the input enabled while sending: disabling it would close the mobile keyboard
    input.disabled = limitReached;
    sendBtn.disabled = sending || limitReached;
    input.placeholder = limitReached ? 'Conversation limit reached, start a new chat' : 'Ask anything…';

    list.scrollTop = list.scrollHeight;
  }

  function userCount() {
    return state.messages.filter(m => m.role === 'user').length;
  }

  // ─── Open / close ─────────────────────────────
  // Open and close run the same transition in both directions (CSS .is-open).
  // `animate: false` restores an open chat instantly after a page change.
  const CLOSE_MS = 340;
  let closeTimer = null;

  // Freeze the page behind the mobile sheet (iOS scrolls it when the keyboard opens)
  // and put it back exactly where it was on close.
  let lockedY = null;
  function lockPage(lock) {
    const b = document.body.style;
    if (lock && lockedY === null && window.matchMedia('(max-width: 480px)').matches) {
      lockedY = window.scrollY;
      b.position = 'fixed';
      b.top = -lockedY + 'px';
      b.left = '0';
      b.right = '0';
      b.width = '100%';
    } else if (!lock && lockedY !== null) {
      b.position = b.top = b.left = b.right = b.width = '';
      window.scrollTo({ top: lockedY, behavior: 'instant' });
      lockedY = null;
    }
  }

  function setOpen(open, animate = true) {
    state.open = open;
    save();
    clearTimeout(closeTimer);
    bubble.classList.toggle('is-hidden', open);
    if (open) markOpened();
    document.documentElement.classList.toggle('chat-open', open);
    lockPage(open);

    if (open) {
      if (!animate) {                        // already in the open position before first paint
        panel.classList.add('is-open');
        backdrop.classList.add('is-open');
      }
      panel.hidden = false;
      backdrop.hidden = false;
      render();
      void panel.offsetWidth;                // start the transition from the closed position
      panel.classList.add('is-open');
      backdrop.classList.add('is-open');
      if (window.matchMedia('(hover: hover)').matches) input.focus();
    } else {
      panel.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      if (document.activeElement === input) input.blur();
      closeTimer = setTimeout(() => {
        panel.hidden = true;
        backdrop.hidden = true;
        panel.style.bottom = '';
        panel.style.height = '';
      }, CLOSE_MS);
    }
  }

  backdrop.addEventListener('click', () => setOpen(false));

  // ─── Mobile sheet: drag the handle/header down to close ───
  const isSheet = () => window.matchMedia('(max-width: 480px)').matches;

  // ─── Mobile keyboard: keep the sheet inside the visible area ───
  // When the keyboard opens, the visible viewport shrinks but the page (and 85dvh) don't,
  // so the browser scrolls things around. Pin the sheet right above the keyboard instead.
  function fitToViewport() {
    const vv = window.visualViewport;
    if (!vv || !state.open || !isSheet()) {
      panel.style.bottom = '';
      panel.style.height = '';
      return;
    }
    const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    if (keyboard > 80) {
      panel.style.bottom = keyboard + 'px';
      panel.style.height = Math.round(vv.height - 8) + 'px';
      list.scrollTop = list.scrollHeight;
    } else {
      panel.style.bottom = '';
      panel.style.height = '';
    }
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitToViewport);
    window.visualViewport.addEventListener('scroll', fitToViewport);
  }
  input.addEventListener('focus', () => setTimeout(fitToViewport, 50));
  input.addEventListener('blur', () => setTimeout(fitToViewport, 50));
  let drag = null;

  header.addEventListener('touchstart', e => {
    if (!isSheet() || e.target.closest('button')) return;
    drag = { startY: e.touches[0].clientY, startT: Date.now(), dy: 0 };
    panel.style.transition = 'none';
    backdrop.style.transition = 'none';
  }, { passive: true });

  header.addEventListener('touchmove', e => {
    if (!drag) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.startY);   // only downwards
    panel.style.transform = `translateY(${drag.dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - drag.dy / panel.offsetHeight));
  }, { passive: true });

  header.addEventListener('touchend', () => {
    if (!drag) return;
    const velocity = drag.dy / Math.max(1, Date.now() - drag.startT);   // px per ms
    const shouldClose = drag.dy > panel.offsetHeight * 0.25 || (drag.dy > 30 && velocity > 0.5);
    drag = null;
    // Clearing the inline styles lets the CSS transition run from the finger position
    panel.style.transition = '';
    backdrop.style.transition = '';
    panel.style.transform = '';
    backdrop.style.opacity = '';
    if (shouldClose) setOpen(false);
  });

  bubble.addEventListener('click', () => {
    setOpen(true);
    track('chat_open');
  });
  closeBtn.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.open) setOpen(false);
  });
  resetBtn.addEventListener('click', () => {
    state.messages = [];
    save();
    render();
  });

  // ─── Send ─────────────────────────────────────
  async function send(text) {
    text = String(text || '').trim().slice(0, 500);
    if (!text || sending || userCount() >= MAX_USER_MESSAGES) return;

    state.messages.push({ role: 'user', text });
    input.value = '';
    sending = true;
    save();
    render();
    track('chat_message');

    try {
      const history = state.messages
        .filter(m => !m.error)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text || '' }))
        .filter(m => m.text);
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || 'error');
      state.messages.push({ role: 'model', text: data.text || '', blocks: data.blocks || [] });
    } catch (err) {
      const msg = err.message && err.message !== 'error' && err.message !== 'Failed to fetch'
        ? err.message
        : 'Connection failed. Please try again.';
      state.messages.push({ role: 'model', text: msg, error: true });
    } finally {
      sending = false;
      save();
      render();
      if (window.matchMedia('(hover: hover)').matches) input.focus();
    }
  }

  // Tapping send must not take focus from the input, or the mobile keyboard closes and the sheet jumps
  sendBtn.addEventListener('pointerdown', e => {
    if (document.activeElement === input) e.preventDefault();
  });
  sendBtn.addEventListener('mousedown', e => {
    if (document.activeElement === input) e.preventDefault();
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    send(input.value);
  });

  // ─── Teaser: nudge next to the bubble until the visitor opens the chat ───
  // Stays up until the chat is opened (then never again) or dismissed with ×
  // (then not again this visit). Shows sooner on the help pages.
  const OPENED_KEY    = 'lgf-chat-opened';        // localStorage: chat opened once
  const DISMISSED_KEY = 'lgf-chat-teaser-off';    // sessionStorage: × clicked this visit
  const SHOWN_KEY     = 'lgf-chat-teaser-shown';  // sessionStorage: already shown this visit
  const onHelpPage = /^\/(how-to-order|faq)(\/|\.html|$)/.test(location.pathname);
  let teaser = null;
  let teaserTimer = null;

  function flag(storage, key, set) {
    try {
      if (set) storage.setItem(key, '1');
      return storage.getItem(key) === '1';
    } catch (e) { return false; }
  }

  function placeTeaser() {
    if (!teaser) return;
    // Sits just left of the bubble, whatever its width (pill on desktop, round on phones)
    const r = bubble.getBoundingClientRect();
    teaser.style.right = Math.round(window.innerWidth - r.left + 10) + 'px';
  }
  window.addEventListener('resize', placeTeaser);

  function hideTeaser() {
    clearTimeout(teaserTimer);
    if (!teaser) return;
    teaser.classList.remove('is-visible');
    const t = teaser;
    teaser = null;
    setTimeout(() => t.remove(), 250);
  }

  function teaserAllowed() {
    return !state.open && !state.messages.length
      && !flag(localStorage, OPENED_KEY) && !flag(sessionStorage, DISMISSED_KEY);
  }

  function showTeaser() {
    if (teaser || !teaserAllowed()) return;
    // Wait until the visitor can actually see the tab
    if (document.hidden) {
      document.addEventListener('visibilitychange', () => { teaserTimer = setTimeout(showTeaser, 1500); }, { once: true });
      return;
    }
    flag(sessionStorage, SHOWN_KEY, true);

    const text = onHelpPage
      ? (isFrench ? 'Bloqué ? Pose-moi ta question 👋' : 'Stuck? Ask me, I reply instantly 👋')
      : (isFrench ? 'Besoin d’aide pour commander ? 👋' : 'Need help ordering? 👋');
    teaser = el('div', 'chat-teaser');
    const open = el('button', 'chat-teaser__text', text);
    open.type = 'button';
    open.addEventListener('click', () => {
      track('chat_teaser_click');
      setOpen(true);
      track('chat_open', { source: 'teaser' });
    });
    const close = el('button', 'chat-teaser__close');
    close.type = 'button';
    close.setAttribute('aria-label', isFrench ? 'Fermer' : 'Dismiss');
    close.innerHTML = ICON_CLOSE;
    close.addEventListener('click', () => {
      flag(sessionStorage, DISMISSED_KEY, true);
      hideTeaser();
    });
    teaser.append(open, close);
    document.body.append(teaser);
    placeTeaser();
    requestAnimationFrame(() => teaser && teaser.classList.add('is-visible'));
  }

  // Opening the chat (bubble or teaser) retires the teaser for good; called from setOpen
  function markOpened() {
    flag(localStorage, OPENED_KEY, true);
    hideTeaser();
  }

  if (teaserAllowed()) {
    // Already shown earlier this visit: bring it back quickly on the next page
    const delay = flag(sessionStorage, SHOWN_KEY) ? 1500 : onHelpPage ? 4000 : 12000;
    teaserTimer = setTimeout(showTeaser, delay);
  }

  if (state.open) setOpen(true, false);
})();
