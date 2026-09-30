/* ==============================================
   Style thumbnails on the catalog cards (Men / Women): a row under the image with the
   first styles (colours / designs) — 4 on computers, 3 on phones — then "+N".
   - A tap opens the photos window on that style (js/photos.js); "+N" on the next one.
   - Computers: hovering a thumbnail shows that style in the card's image.
   - Every card has the row (empty without styles), so the cards stay aligned.
   - The style photos still come from img.theqcbook.com, which refuses bursts (HTTP 429):
     a card's thumbnails load only once it's on screen and its own image is there, 2 at a
     time for the whole page, and one that's refused stays an empty grey square (no retry).
     When they're copied to Bunny, only url() changes.
============================================== */

(function () {
  const SHOWN = 4;          // computers; phones hide the 4th (CSS) and show their own "+N"
  const MAX_AT_ONCE = 2;

  const url = (imageId, n) => `https://img.theqcbook.com/products/${imageId}/${n}.webp?v5`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Numbers of the first styles: 0, 1, 2, 3 unless the catalog says otherwise (9th field)
  const firstStyles = p => p.firstStyles || [0, 1, 2, 3].slice(0, Math.min(SHOWN, p.styles));

  function html(p) {
    if (!p.styles || !p.imageId) return '<div class="card-styles" aria-hidden="true"></div>';
    const nums = firstStyles(p);
    const thumbs = nums.map((n, i) =>
      `<span class="card-style" role="button" tabindex="0" data-style="${i}" aria-label="${esc(t('Style'))} ${i + 1}">` +
      `<img alt="" decoding="async" data-noretry data-src="${url(p.imageId, n)}"></span>`).join('');
    // "+N" counts what isn't shown: one more on phones (3 thumbnails)
    const more = (shown, cls) => p.styles > shown
      ? `<span class="card-styles__more ${cls}" role="button" tabindex="0" data-style="${shown}" aria-label="${esc(t('See the styles'))}">+${p.styles - shown}</span>`
      : '';
    return `<div class="card-styles">${thumbs}${more(nums.length, 'card-styles__more--wide')}${more(Math.min(3, nums.length), 'card-styles__more--phone')}</div>`;
  }

  // ─── Loading: on screen, after the card's image, 2 at a time ───
  const queue = [];
  let active = 0;

  function pump() {
    while (active < MAX_AT_ONCE && queue.length) {
      const img = queue.shift();
      if (!img.isConnected) continue;   // the grid was redrawn (filter, tab...)
      if (!img.offsetParent) continue;  // hidden (4th thumbnail on phones)
      active++;
      const done = ok => {
        img.onload = img.onerror = null;
        active--;
        img.parentElement.classList.toggle('is-loaded', ok);
        pump();
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = img.dataset.src;
    }
  }

  const seen = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const card = entry.target;
    seen.unobserve(card);
    const main = card.querySelector('.product-card__image > img');
    const start = () => {
      card.querySelectorAll('.card-style img[data-src]:not([src])').forEach(img => queue.push(img));
      pump();
    };
    if (!main || main.complete) start();
    else {
      main.addEventListener('load', start, { once: true });
      main.addEventListener('error', start, { once: true });
    }
  }), { rootMargin: '100px 0px' });

  function observe(card) {
    if (card.querySelector('.card-style')) seen.observe(card);
  }

  // ─── Computers: hovering a thumbnail shows that style in the card's image ───
  if (window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('mouseover', e => {
      const thumb = e.target.closest && e.target.closest('.card-style');
      if (!thumb || !thumb.classList.contains('is-loaded')) return;
      const box = thumb.closest('.product-card').querySelector('.product-card__image');
      let preview = box.querySelector('.card-style-preview');
      if (!preview) {
        preview = document.createElement('img');
        preview.className = 'card-style-preview';
        preview.alt = '';
        preview.dataset.noretry = '';
        box.append(preview);
      }
      preview.src = thumb.querySelector('img').src;
      box.classList.add('is-previewing');
    });
    document.addEventListener('mouseout', e => {
      const thumb = e.target.closest && e.target.closest('.card-style');
      if (!thumb || (e.relatedTarget && thumb.contains(e.relatedTarget))) return;
      thumb.closest('.product-card').querySelector('.product-card__image').classList.remove('is-previewing');
    });
  }

  window.CardStyles = { html, observe };
})();
