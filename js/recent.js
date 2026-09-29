/* ==============================================
   Recently viewed — "Recently viewed" tab (after Favorites, shown once there is one):
   the last items opened on Lovegobuy or in the real photos window, newest first.
   Kept in this browser only (localStorage), one list per page (Men / Women).
   Same key as the favorites (js/favorites.js).
============================================== */

(function () {
  const STORE = /women/.test(location.pathname) ? 'recent-women' : 'recent-men';
  const MAX = 20;

  let list;
  try { list = (JSON.parse(localStorage.getItem(STORE)) || []).map(String); } catch (e) { list = []; }

  function add(k) {
    k = String(k || '');
    if (!k) return;
    list = [k, ...list.filter(x => x !== k)].slice(0, MAX);
    try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) {}
    updateTab();
  }

  const has = k => list.includes(String(k));

  // Newest first
  const order = products => products.slice().sort((a, b) => list.indexOf(Favs.key(a)) - list.indexOf(Favs.key(b)));

  function updateTab() {
    const tab = document.querySelector('.cat-tab[data-cat="recent"]');
    if (tab) tab.hidden = list.length === 0;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateTab);
  else updateTab();

  window.Recent = { add, has, order };
})();
