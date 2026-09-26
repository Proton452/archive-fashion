/* Package tracking widget (How to order, step 6) — talks to /api/track */

(function () {
  const form   = document.getElementById('trackForm');
  const input  = document.getElementById('trackInput');
  const result = document.getElementById('trackResult');
  if (!form) return;

  const STATUS = {
    NotFound:           { label: 'No info yet',       tone: 'muted' },
    InfoReceived:       { label: 'Info received',     tone: 'muted' },
    InTransit:          { label: 'In transit',        tone: 'accent' },
    AvailableForPickup: { label: 'Ready for pickup',  tone: 'accent' },
    OutForDelivery:     { label: 'Out for delivery',  tone: 'accent' },
    Delivered:          { label: 'Delivered',         tone: 'success' },
    DeliveryFailure:    { label: 'Delivery failed',   tone: 'warn' },
    Exception:          { label: 'Alert',             tone: 'warn' },
    Expired:            { label: 'Expired',           tone: 'muted' },
  };

  const EVENTS_PREVIEW = 5;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function formatTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function showMessage(text, tone) {
    result.replaceChildren(el('p', 'track-box__msg' + (tone ? ' track-box__msg--' + tone : ''), text));
    result.hidden = false;
  }

  function renderTracking(data) {
    const s = STATUS[data.status] || STATUS.NotFound;
    const head = el('div', 'track-box__head');
    head.append(el('span', 'track-box__status track-box__status--' + s.tone, s.label));
    if (data.carrier) head.append(el('span', 'track-box__carrier', data.carrier));

    const nodes = [head];

    if (!data.events.length) {
      nodes.push(el('p', 'track-box__msg', 'No scan yet. Updates usually appear once the carrier picks up the package.'));
    } else {
      const list = el('ol', 'track-box__events');
      data.events.forEach((e, i) => {
        const li = el('li', 'track-box__event' + (i >= EVENTS_PREVIEW ? ' is-extra' : ''));
        li.append(el('span', 'track-box__time', formatTime(e.time)));
        li.append(el('span', 'track-box__desc', e.description));
        if (e.location) li.append(el('span', 'track-box__loc', e.location));
        list.append(li);
      });
      nodes.push(list);

      if (data.events.length > EVENTS_PREVIEW) {
        const more = el('button', 'track-box__more', `Show all ${data.events.length} updates`);
        more.type = 'button';
        more.addEventListener('click', () => {
          list.classList.add('is-expanded');
          more.remove();
        });
        nodes.push(more);
      }
    }

    result.replaceChildren(...nodes);
    result.hidden = false;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const number = input.value.replace(/[\s-]/g, '');
    if (!number) return;

    const btn = form.querySelector('button');
    btn.disabled = true;
    form.classList.add('is-loading');
    showMessage('Looking up your package…');

    if (typeof gtag === 'function') gtag('event', 'track_package');

    try {
      const r = await fetch('/api/track?number=' + encodeURIComponent(number));
      const data = await r.json();
      if (data.state === 'tracking') renderTracking(data);
      else if (data.state === 'registered') showMessage(data.message, 'accent');
      else showMessage(data.message || 'Something went wrong. Please try again.', 'warn');
    } catch (err) {
      showMessage('Connection failed. Please try again.', 'warn');
    } finally {
      btn.disabled = false;
      form.classList.remove('is-loading');
    }
  });
})();
