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
  // Texts follow the site language (js/i18n.js) and are re-read on each render,
  // so a language switch updates the open chat without a reload
  const welcomeText = () => t("Hi! 👋 I can help you find items, explain how to order, or track your package. Ask me in any language.");
  // Big one-tap questions on the empty chat: the things people get stuck on
  const suggestions = () => [t('How do I order?'), t('How do I get the 500€ coupons?'), t('Is the quality good?')];
  const placeholder = () => t('Ask your question…');

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
  // Default profile picture (Instagram-style silhouette, tinted green in CSS)
  const AVATAR = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="12.5" r="6" fill="#fff"/><path d="M4 32c0-7 5.4-11.5 12-11.5S28 25 28 32z" fill="#fff"/></svg>';
  const ICON_RESET = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
  const ICON_SEND  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ─── Build UI ─────────────────────────────────
  const bubble = el('button', 'chat-bubble');
  bubble.type = 'button';
  bubble.innerHTML = ICON_CHAT + '<span class="chat-bubble__label"></span>';

  const panel = el('section', 'chat-panel');
  panel.setAttribute('role', 'dialog');
  panel.hidden = true;

  const header = el('header', 'chat-panel__header');
  const avatar = el('span', 'chat-avatar chat-avatar--header');
  avatar.innerHTML = AVATAR;
  const titleWrap = el('div', 'chat-panel__titles');
  const titleEl = el('p', 'chat-panel__title');
  const subtitleEl = el('p', 'chat-panel__subtitle');
  titleWrap.append(titleEl, subtitleEl);
  // Icon only, so the title fits on one line
  const resetBtn = el('button', 'chat-panel__reset');
  resetBtn.type = 'button';
  resetBtn.innerHTML = ICON_RESET;
  const closeBtn = el('button', 'chat-panel__close');
  closeBtn.type = 'button';
  closeBtn.innerHTML = ICON_CLOSE;
  header.append(avatar, titleWrap, resetBtn, closeBtn);

  const list = el('div', 'chat-panel__messages');
  list.setAttribute('aria-live', 'polite');

  const form = el('form', 'chat-panel__form');
  // Grows with the text (up to a few lines, then scrolls) so a long message stays readable
  const input = el('textarea', 'chat-panel__input');
  input.rows = 1;
  input.maxLength = 500;
  input.autocomplete = 'off';
  const INPUT_MAX_H = 120;
  function fitInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight + 2, INPUT_MAX_H) + 'px';
    input.style.overflowY = input.scrollHeight + 2 > INPUT_MAX_H ? 'auto' : 'hidden';
  }
  input.addEventListener('input', fitInput);
  // Enter sends, Shift+Enter goes to a new line
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : send(input.value);
    }
  });
  const sendBtn = el('button', 'chat-panel__send');
  sendBtn.type = 'submit';
  sendBtn.innerHTML = ICON_SEND;

  // Fixed labels of the chat UI, in the site language
  function applyTexts() {
    bubble.setAttribute('aria-label', t('Open chat assistant'));
    bubble.querySelector('.chat-bubble__label').textContent = t('AI assistant');
    panel.setAttribute('aria-label', t('LovegoFinds AI assistant'));
    titleEl.textContent = t('LovegoFinds AI assistant');
    subtitleEl.textContent = t('Online · replies instantly');
    resetBtn.title = t('New chat');
    resetBtn.setAttribute('aria-label', t('New chat'));
    closeBtn.setAttribute('aria-label', t('Close chat'));
    input.setAttribute('aria-label', t('Your message'));
    sendBtn.setAttribute('aria-label', t('Send'));
  }
  applyTexts();
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
    info.append(el('span', 'chat-product__name', p.name), el('span', 'chat-product__price', p.cny != null ? Prices.format(p.cny) : p.price));
    a.append(img, info, el('span', 'chat-product__arrow', '→'));
    a.addEventListener('click', () => {
      a.href = withPartnerCode(p.link);
      track('chat_product_click', { item_name: p.name });
    });
    return a;
  }

  const BUTTON_LABELS = {   // English; shown through t()
    signup:  'Sign up & get 500€ coupons →',
    discord: 'Ask on Discord →',
    howto:   'See the full ordering guide →',
    faq:     'Read the FAQ →',
  };

  // Site pages keep the creator slug (/faq/football) like the rest of the site
  function sitePath(page) {
    let slug = null;
    try { slug = sessionStorage.getItem('partnerSlug'); } catch (e) {}
    return '/' + page + (slug ? '/' + slug : '');
  }

  function actionButton(kind) {
    const a = el('a', 'chat-action chat-action--' + kind, t(BUTTON_LABELS[kind]));
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
    // Empty chat: a welcome screen with one-tap questions; once it starts, a short greeting on top
    if (!state.messages.length && !sending) {
      const welcome = el('div', 'chat-welcome');
      welcome.append(
        el('p', 'chat-welcome__title', t('Hi 👋 How can I help?')),
        el('p', 'chat-welcome__sub', t('Instant answers.')),
      );
      const quick = el('div', 'chat-quick');
      suggestions().forEach(q => {
        const b = el('button', 'chat-quick__btn');
        b.type = 'button';
        b.append(el('span', 'chat-quick__text', q), el('span', 'chat-quick__chevron', '›'));
        b.addEventListener('click', () => send(q));
        quick.append(b);
      });
      welcome.append(quick);
      list.append(welcome);
    } else {
      list.append(renderMessage({ role: 'model', text: welcomeText() }));
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
    input.placeholder = limitReached ? t('Conversation limit reached, start a new chat') : placeholder();

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
        panel.style.top = panel.style.bottom = panel.style.height = '';
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
      panel.style.top = panel.style.bottom = panel.style.height = '';
      return;
    }
    // Placed from the top of the visible area: with Safari's floating bar, innerHeight doesn't
    // match the real bottom of the screen and a bottom offset pushed the header off screen.
    if (window.innerHeight - vv.height > 80) {
      panel.style.top = Math.round(vv.offsetTop + 8) + 'px';
      panel.style.bottom = 'auto';
      panel.style.height = Math.round(vv.height - 8) + 'px';
      list.scrollTop = list.scrollHeight;
    } else {
      panel.style.top = panel.style.bottom = panel.style.height = '';
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
    fitInput();
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
        body: JSON.stringify({ messages: history, currency: Prices.current(), lang: I18N.lang }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || 'error');
      state.messages.push({ role: 'model', text: data.text || '', blocks: data.blocks || [] });
    } catch (err) {
      const msg = err.message && err.message !== 'error' && err.message !== 'Failed to fetch'
        ? t(err.message)
        : t('Connection failed. Please try again.');
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
  // Two triggers: a timer (8s, 3s on the help pages) and coming back from Lovegobuy,
  // where people get stuck. Stays up until the chat is opened (then never again) or
  // dismissed with × (the timer one then stops for this visit).
  const OPENED_KEY    = 'lgf-chat-opened';        // localStorage: chat opened once
  const DISMISSED_KEY = 'lgf-chat-teaser-off';    // sessionStorage: × clicked this visit
  const SHOWN_KEY     = 'lgf-chat-teaser-shown';  // sessionStorage: already shown this visit
  const RETURN_KEY    = 'lgf-chat-teaser-return'; // sessionStorage: "back from Lovegobuy" shown
  const onHelpPage = /^\/(how-to-order|faq)(\/|\.html|$)/.test(location.pathname);
  const TEASER_TEXT = {   // English; shown through t()
    timer:  onHelpPage ? 'Stuck? Ask me, I reply instantly 👋' : 'Need help ordering? 👋',
    return: 'Stuck on Lovegobuy? Ask me 👋',
  };
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
    // Sits just left of the bubble, whatever its width; wraps instead of running off narrow screens
    const r = bubble.getBoundingClientRect();
    teaser.style.right = Math.round(window.innerWidth - r.left + 8) + 'px';
    teaser.style.maxWidth = Math.round(r.left - 8 - 12) + 'px';
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

  function teaserAllowed(trigger) {
    if (state.open || state.messages.length || flag(localStorage, OPENED_KEY)) return false;
    return trigger === 'return' ? !flag(sessionStorage, RETURN_KEY) : !flag(sessionStorage, DISMISSED_KEY);
  }

  function showTeaser(trigger = 'timer') {
    if (!teaserAllowed(trigger)) return;
    // The Lovegobuy text wins: a late timer never replaces it
    if (teaser && (teaser.dataset.trigger === trigger || trigger === 'timer')) return;
    // Wait until the visitor can actually see the tab
    if (document.hidden) {
      document.addEventListener('visibilitychange', () => { teaserTimer = setTimeout(showTeaser, 1500, trigger); }, { once: true });
      return;
    }
    if (teaser) teaser.remove();                  // swap the timer text for the Lovegobuy one
    clearTimeout(teaserTimer);
    flag(sessionStorage, trigger === 'return' ? RETURN_KEY : SHOWN_KEY, true);

    teaser = el('div', 'chat-teaser');
    teaser.dataset.trigger = trigger;
    const open = el('button', 'chat-teaser__text', t(TEASER_TEXT[trigger]));
    open.type = 'button';
    open.addEventListener('click', () => {
      track('chat_teaser_click', { trigger });
      setOpen(true);
      track('chat_open', { source: 'teaser', trigger });
    });
    const close = el('button', 'chat-teaser__close');
    close.type = 'button';
    close.setAttribute('aria-label', t('Dismiss'));
    close.innerHTML = ICON_CLOSE;
    close.addEventListener('click', () => {
      flag(sessionStorage, DISMISSED_KEY, true);
      track('chat_teaser_dismiss', { trigger });
      hideTeaser();
    });
    teaser.append(open, close);
    document.body.append(teaser);
    placeTeaser();
    requestAnimationFrame(() => teaser && teaser.classList.add('is-visible'));
    track('chat_teaser_show', { trigger });

    // One gentle pulse on the bubble to draw the eye to the corner
    bubble.classList.remove('is-pulsing');
    void bubble.offsetWidth;
    bubble.classList.add('is-pulsing');
  }
  bubble.addEventListener('animationend', () => bubble.classList.remove('is-pulsing'));

  document.addEventListener('localechange', () => {
    applyTexts();
    render();
    if (teaser) {
      teaser.querySelector('.chat-teaser__text').textContent = t(TEASER_TEXT[teaser.dataset.trigger]);
      teaser.querySelector('.chat-teaser__close').setAttribute('aria-label', t('Dismiss'));
      placeTeaser();
    }
  });

  // Opening the chat (bubble or teaser) retires the teaser for good; called from setOpen
  function markOpened() {
    flag(localStorage, OPENED_KEY, true);
    hideTeaser();
  }

  if (teaserAllowed('timer')) {
    // Already shown earlier this visit: bring it back quickly on the next page
    const delay = flag(sessionStorage, SHOWN_KEY) ? 1500 : onHelpPage ? 3000 : 8000;
    teaserTimer = setTimeout(showTeaser, delay, 'timer');
  }

  // Back from Lovegobuy after a few seconds there. Links open it in a new tab, but in-app
  // browsers (Instagram, TikTok) often open it in the same one and reload this page on the
  // way back, so the departure time is kept in sessionStorage.
  const LEFT_KEY = 'lgf-left-for-lovegobuy';
  function backFromLovegobuy() {
    let left = 0;
    try { left = +sessionStorage.getItem(LEFT_KEY) || 0; sessionStorage.removeItem(LEFT_KEY); } catch (e) {}
    const away = Date.now() - left;
    if (left && away > 5000 && away < 2 * 3600 * 1000) setTimeout(showTeaser, 800, 'return');
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href*="lovegobuy.com"]');
    if (!a || e.defaultPrevented) return;
    try { sessionStorage.setItem(LEFT_KEY, String(Date.now())); } catch (e) {}
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) backFromLovegobuy(); });
  window.addEventListener('pageshow', backFromLovegobuy);   // reloaded or restored from the back cache

  if (state.open) setOpen(true, false);
})();
