/* ==============================================
   Favorites — heart on product cards + in the real photos window,
   "Favorites" tab (first tab, shown once there is at least one).
   Kept in this browser only (localStorage), one list per page (Men / Women).
   Key: the Lovegobuy item id (sheet jerseys have none: their link).
============================================== */

(function () {
  const STORE = /women/.test(location.pathname) ? 'favs-women' : 'favs-men';
  const HEART = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8.25c0-2.49-2.1-4.5-4.69-4.5-1.93 0-3.6 1.13-4.31 2.73-.72-1.6-2.38-2.73-4.31-2.73C5.1 3.75 3 5.76 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"/></svg>';

  let favs;
  try { favs = new Set(JSON.parse(localStorage.getItem(STORE)) || []); } catch (e) { favs = new Set(); }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify([...favs])); } catch (e) {}
  }

  const key = p => String(p.id || p.lien || '');
  const has = k => favs.has(String(k));

  function toggle(k) {
    k = String(k);
    const on = !favs.has(k);
    on ? favs.add(k) : favs.delete(k);
    save();
    if (typeof gtag === 'function') gtag('event', on ? 'add_favorite' : 'remove_favorite', { item_id: k });
    document.dispatchEvent(new CustomEvent('favchange', { detail: { key: k, on } }));
    return on;
  }

  // Heart on a card: same look as the camera badge
  function badge(p) {
    const k = key(p);
    if (!k) return '';
    const on = favs.has(k);
    return `<span class="product-card__fav${on ? ' is-on' : ''}" role="button" tabindex="0" data-fav="${k.replace(/"/g, '&quot;')}" aria-pressed="${on}" aria-label="${t('Favorites')}">${HEART}</span>`;
  }

  // Show / hide a tab calmly: it opens up (width grows from 0) and pushes the tabs after it,
  // then its text fades in (reverse to hide). Also used by js/recent.js. animate = false on page load (returning visitor)
  function setTabShown(tab, show, animate = true) {
    if (!tab || tab.hidden === !show) return;
    const refreshFade = () => tab.parentNode.dispatchEvent(new Event('scroll'));   // right-edge fade in main.js / women.js
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      tab.hidden = !show;
      refreshFade();
      return;
    }
    tab.hidden = false;
    const cs = getComputedStyle(tab);
    const open   = { width: tab.offsetWidth + 'px', paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight };
    const closed = { width: '0px', paddingLeft: '0px', paddingRight: '0px' };
    tab.style.overflow = 'hidden';
    tab.style.flexShrink = '0';   // overflow: hidden would otherwise let the tab bar squeeze it
    // Width: steady opening / closing. Text: fades in once there is room, fades out first
    const size = tab.animate(show ? [closed, open] : [open, closed],
      { duration: 260, delay: show ? 0 : 60, easing: 'ease-in-out', fill: 'both' });
    const text = tab.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: show ? 140 : 100, delay: show ? 120 : 0, direction: show ? 'normal' : 'reverse', fill: 'both' });
    size.onfinish = () => {
      tab.hidden = !show;
      tab.style.overflow = tab.style.flexShrink = '';
      size.cancel();
      text.cancel();
      refreshFade();
    };
  }

  // "Favorites" tab: hidden while empty (unless it is the one open)
  function updateTab(animate = true) {
    const tab = document.querySelector('.cat-tab[data-cat="favorites"]');
    if (tab) setTabShown(tab, favs.size > 0 || tab.classList.contains('is-active'), animate);
  }

  document.addEventListener('favchange', e => {
    document.querySelectorAll('.product-card__fav').forEach(el => {
      if (el.dataset.fav !== e.detail.key) return;
      el.classList.toggle('is-on', e.detail.on);
      el.setAttribute('aria-pressed', e.detail.on);
      if (e.detail.on) {   // small pop, only when adding
        el.classList.remove('is-popping');
        void el.offsetWidth;
        el.classList.add('is-popping');
      }
    });
    updateTab();
  });

  // Leaving an emptied Favorites tab hides it
  document.addEventListener('click', e => { if (e.target.closest('.cat-tab')) updateTab(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => updateTab(false));
  else updateTab(false);

  window.Favs = { key, has, toggle, badge, HEART, setTabShown };
})();
