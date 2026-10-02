/* ==============================================
   Items placed by hand: the "Positions" tab of the Google Sheet (a number, then the
   Lovegobuy link; Men A-B, Women C-D), served by /api/positions.
   - The chosen item takes that place in the page's order (so in "All", and first among
     its category in the other tabs).
   - The item that was there goes to a random place after the 100th — the same one at
     every visit (from its id), so it doesn't jump around.
   - Every other item keeps its order.
   Positions.load() never holds the grid back: after 3 s (or an error) → none.
============================================== */

const Positions = (() => {
  const TIMEOUT_MS = 3000;
  const PUSHED_AFTER = 100;

  function load() {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return fetch('/api/positions', { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .catch(err => { console.warn('[Lovegobuy Finds] Positions not loaded:', err); return []; })
      .finally(() => clearTimeout(timer));
  }

  // Same number for the same id at every visit
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  // items: the page's order. end: where the non-fashion tail starts (pushed items stay before it)
  function apply(items, pins, end = items.length) {
    const byId = new Map(items.map(p => [String(p.id), p]));
    const usedPos = new Set(), usedId = new Set();
    const wanted = [];
    for (const [pos, id] of pins) {   // a position or an item listed twice: the first line wins
      const p = byId.get(String(id));
      if (!p || pos > items.length || usedPos.has(pos) || usedId.has(p)) continue;
      usedPos.add(pos);
      usedId.add(p);
      wanted.push([pos, p]);
    }
    if (!wanted.length) return items;

    // The items that held those places (unless they are placed by hand themselves)
    const pushed = new Set(wanted.map(([pos]) => items[pos - 1]).filter(p => !usedId.has(p)));
    const rest = items.filter(p => !usedId.has(p) && !pushed.has(p));

    const last = Math.max(PUSHED_AFTER, Math.min(rest.length, end - wanted.length - pushed.size));
    for (const p of pushed) {
      rest.splice(PUSHED_AFTER + hash(String(p.id)) % (last - PUSHED_AFTER + 1), 0, p);
    }
    wanted.sort((a, b) => a[0] - b[0]).forEach(([pos, p]) => rest.splice(pos - 1, 0, p));
    return rest;
  }

  return { load, apply };
})();
