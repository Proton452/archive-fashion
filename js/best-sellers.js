/* ==============================================
   Best sellers of the catalog (Men + Women): picked by the owner in the
   "Best sellers" tab of the Google Sheet, served as item ids by /api/best-sellers.
   BestSellers.load() never holds the grid back: after 3 s (or an error) → none.
   The Best Sellers tab shows them in the sheet's order (BestSellers.order).
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

  // Marks the catalog items whose id is in the list, with their row in the sheet
  function mark(items, ids) {
    const rank = new Map([...ids].map((id, i) => [id, i]));
    for (const p of items) {
      if (!p.id || !rank.has(String(p.id))) continue;
      p.isBestSeller = true;
      p.bestRank = rank.get(String(p.id));
    }
    return items;
  }

  // Best Sellers tab: the sheet's order; the sheet jerseys marked "best" (no row) come after
  function order(items) {
    const r = p => p.bestRank ?? Infinity;
    return [...items].sort((a, b) => r(a) - r(b));
  }

  return { load, mark, order };
})();
