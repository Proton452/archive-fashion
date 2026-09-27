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

  // Plain text → safe nodes, with **bold** and line breaks
  function richText(text) {
    const frag = document.createDocumentFragment();
    text.split('\n').forEach((line, i) => {
      if (i) frag.append(document.createElement('br'));
      line.split(/(\*\*[^*]+\*\*)/).forEach(chunk => {
        if (/^\*\*[^*]+\*\*$/.test(chunk)) frag.append(el('strong', '', chunk.slice(2, -2)));
        else if (chunk) frag.append(document.createTextNode(chunk));
      });
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
  bubble.innerHTML = ICON_CHAT;

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
  document.body.append(bubble, panel);

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

  function actionButton(kind) {
    const a = el('a', 'chat-action chat-action--' + kind, kind === 'signup' ? 'Sign up & get 500€ coupons →' : 'Ask on Discord →');
    a.href = kind === 'signup' ? withPartnerCode(SIGNUP_URL) : DISCORD_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.addEventListener('click', () => {
      if (kind === 'signup') a.href = withPartnerCode(SIGNUP_URL);
      track(kind === 'signup' ? 'click_signup' : 'click_discord', { source: 'chat' });
    });
    return a;
  }

  function renderMessage(m) {
    const row = el('div', 'chat-msg chat-msg--' + (m.role === 'user' ? 'user' : 'bot') + (m.error ? ' chat-msg--error' : ''));
    if (m.text) {
      const b = el('div', 'chat-msg__bubble');
      b.append(richText(m.text));
      row.append(b);
    }
    if (m.products && m.products.length) {
      const wrap = el('div', 'chat-msg__products');
      m.products.forEach(p => wrap.append(productCard(p)));
      row.append(wrap);
    }
    if (m.buttons && m.buttons.length) {
      const wrap = el('div', 'chat-msg__actions');
      m.buttons.forEach(b => wrap.append(actionButton(b)));
      row.append(wrap);
    }
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
    input.disabled = sending || limitReached;
    sendBtn.disabled = sending || limitReached;
    input.placeholder = limitReached ? 'Conversation limit reached, start a new chat' : 'Ask anything…';

    list.scrollTop = list.scrollHeight;
  }

  function userCount() {
    return state.messages.filter(m => m.role === 'user').length;
  }

  // ─── Open / close ─────────────────────────────
  function setOpen(open) {
    state.open = open;
    panel.hidden = !open;
    bubble.classList.toggle('is-hidden', open);
    document.documentElement.classList.toggle('chat-open', open);
    save();
    if (open) {
      render();
      if (window.matchMedia('(hover: hover)').matches) input.focus();
    }
  }

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
      state.messages.push({ role: 'model', text: data.text || '', products: data.products || [], buttons: data.buttons || [] });
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

  form.addEventListener('submit', e => {
    e.preventDefault();
    send(input.value);
  });

  if (state.open) setOpen(true);
})();
