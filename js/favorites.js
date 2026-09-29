/* ==============================================
   Favorites — heart on product cards + in the real photos window,
   "♥ Favorites" tab (first tab, shown once there is at least one).
   Kept in this browser only (localStorage), one list per page (Men / Women).
   Key: the Lovegobuy item id (sheet jerseys have none: their link).
============================================== */

(function () {
  const STORE = /women/.test(location.pathname) ? 'favs-women' : 'favs-men';
  const HEART = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.6 3.8 4.5 7 4.5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.2 0 5.3 3.1 4.2 6.2C19.5 15.4 12 20 12 20z"/></svg>';

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

  // "♥ Favorites" tab: hidden while empty (unless it is the one open)
  function updateTab() {
    const tab = document.querySelector('.cat-tab[data-cat="favorites"]');
    if (!tab) return;
    tab.hidden = favs.size === 0 && !tab.classList.contains('is-active');
    tab.querySelector('.cat-tab__count').textContent = favs.size || '';
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateTab);
  else updateTab();

  window.Favs = { key, has, toggle, badge, HEART };
})();
