/* ==============================================
   Styles on the catalog cards (Men / Women)
   - Every card has a quiet line under the name: its category, then "· 13 styles" when it
     has styles (official photos of each colour / design). A tap on "13 styles" opens the
     photos window on the Styles side (js/photos.js).
   - Computers only, while the mouse is on the card: the first 3 styles appear as thumbnails
     at the bottom of the image ("+N" after), hovering one shows it in the card's image, a
     click opens the window on it. Nothing over the image otherwise, and nothing on phones:
     the photos still come from img.theqcbook.com (heavy, refuses bursts), so they load only
     then, 2 at a time. When they're copied to Bunny, only url() changes.
============================================== */

(function () {
  const SHOWN = 3;
  const MAX_AT_ONCE = 2;
  const hover = window.matchMedia('(hover: hover)');

  const url = (imageId, n) => `https://img.theqcbook.com/products/${imageId}/${n}.webp?v5`;
  const firstStyles = p => p.firstStyles || [0, 1, 2].slice(0, Math.min(SHOWN, p.styles));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // "Sneakers · 13 styles" (the category alone when the item has no styles)
  function meta(p, category) {
    const count = p.styles === 1 ? t('1 style') : t('{n} styles').replace('{n}', p.styles);
    const styles = p.styles
      ? ` · <span class="product-card__styles" role="button" tabindex="0" data-style="0">${esc(count)}</span>`
      : '';
    return `<p class="product-card__meta">${esc(category)}${styles}</p>`;
  }

  // ─── Computers: thumbnails while hovering the card ───
  const queue = [];
  let active = 0;

  function pump() {
    while (active < MAX_AT_ONCE && queue.length) {
      const img = queue.shift();
      if (!img.isConnected) continue;   // the grid was redrawn (filter, tab...)
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

  function thumbs(card) {
    const p = card._product;
    const box = card.querySelector('.product-card__image');
    if (!p || !p.styles || !p.imageId || !box || box.querySelector('.card-styles')) return;
    const nums = firstStyles(p);
    const more = p.styles - nums.length;
    const row = document.createElement('div');
    row.className = 'card-styles';
    row.innerHTML = nums.map((n, i) =>
      `<span class="card-style" role="button" data-style="${i}" aria-label="${esc(t('Style'))} ${i + 1}">` +
      `<img alt="" decoding="async" data-noretry data-src="${url(p.imageId, n)}"></span>`).join('') +
      (more > 0 ? `<span class="card-style card-style--more" role="button" data-style="${nums.length}" aria-label="${esc(t('See the styles'))}">+${more}</span>` : '');
    box.append(row);
    row.querySelectorAll('img').forEach(img => queue.push(img));
    pump();
  }

  document.addEventListener('mouseover', e => {
    if (!hover.matches || !e.target.closest) return;
    const card = e.target.closest('.product-card');
    if (card) thumbs(card);
    // Hovering a thumbnail: that style over the card's image
    const thumb = e.target.closest('.card-style:not(.card-style--more)');
    if (!thumb || !thumb.classList.contains('is-loaded')) return;
    const box = thumb.closest('.product-card__image');
    let preview = box.querySelector('.card-style-preview');
    if (!preview) {
      preview = document.createElement('img');
      preview.className = 'card-style-preview';
      preview.alt = '';
      preview.dataset.noretry = '';
      box.insertBefore(preview, thumb.parentElement);
    }
    preview.src = thumb.querySelector('img').src;
    box.classList.add('is-previewing');
  });
  document.addEventListener('mouseout', e => {
    const thumb = e.target.closest && e.target.closest('.card-style');
    if (!thumb || (e.relatedTarget && thumb.contains(e.relatedTarget))) return;
    const box = thumb.closest('.product-card__image');
    if (box) box.classList.remove('is-previewing');
  });

  window.CardStyles = { meta };
})();
