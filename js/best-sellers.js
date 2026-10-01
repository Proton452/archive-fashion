/* ==============================================
   Best sellers of the catalog (Men + Women): picked by the owner in the
   "Best sellers" tab of the Google Sheet, served as item ids by /api/best-sellers.
   BestSellers.load() never holds the grid back: after 3 s (or an error) → none.
============================================== */

const BestSellers = (() => {
  const TIMEOUT_MS = 3000;

  function load() {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return fetch('/api/best-sellers', { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(ids => new Set(ids.map(String)))
      .catch(err => { console.warn('[Lovegobuy Finds] Best sellers not loaded:', err); return new Set(); })
      .finally(() => clearTimeout(timer));
  }

  // Marks the catalog items whose id is in the list
  function mark(items, ids) {
    for (const p of items) if (p.id && ids.has(String(p.id))) p.isBestSeller = true;
    return items;
  }

  return { load, mark };
})();
