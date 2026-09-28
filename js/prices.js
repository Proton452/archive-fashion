/* ==============================================
   Prices — shared by the site and /api/chat.
   Catalog prices are in Chinese yuan; Lovegobuy converts them at its own
   rate (margin included). Shown in the visitor's currency, rounded DOWN
   to whole units (12.98 € → 12 €).
============================================== */

(function (root) {
  // Value of 1 CNY on Lovegobuy, read from its product pages on 2026-09-28
  // (88 ¥ = 12.43 €, 544 ¥ = 87.47 $, 680 ¥ = 82.55 £). Update when Lovegobuy's rates move.
  const RATES = { EUR: 0.1413, USD: 0.1608, GBP: 0.1214 };
  const CURRENCIES = {
    EUR: { symbol: '€', name: 'Euro' },
    USD: { symbol: '$', name: 'US Dollar' },
    GBP: { symbol: '£', name: 'British Pound' },
  };
  const DEFAULT = 'EUR';
  const STORE_KEY = 'currency';

  function current() {
    try {
      const c = localStorage.getItem(STORE_KEY);
      if (RATES[c]) return c;
    } catch (e) {}
    return DEFAULT;
  }

  function set(code) {
    try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
  }

  // Whole units in `cur`; the epsilon keeps 4 € → CNY → 4 € from landing on 3.9999
  function fromCny(cny, cur) {
    return Math.floor(cny * RATES[cur || current()] + 1e-6);
  }

  function toCny(amount, cur) {
    return amount / RATES[cur || current()];
  }

  function format(cny, cur) {
    if (cny == null || isNaN(cny)) return '';
    cur = cur || current();
    const n = fromCny(cny, cur);
    return cur === 'EUR' ? `${n}€` : `${CURRENCIES[cur].symbol}${n}`;
  }

  // Price text from the Google Sheet ("4€", "4,50 €", "$5", "¥30") → CNY
  function parseToCny(str) {
    if (!str) return null;
    const s = String(str);
    const cur = /\$|usd/i.test(s) ? 'USD' : /£|gbp/i.test(s) ? 'GBP' : /¥|cny|rmb|yuan/i.test(s) ? 'CNY' : 'EUR';
    const val = parseFloat(s.replace(',', '.').replace(/[^\d.]/g, ''));
    if (isNaN(val)) return null;
    return cur === 'CNY' ? val : val / RATES[cur];
  }

  const api = { RATES, CURRENCIES, DEFAULT, current, set, fromCny, toCny, format, parseToCny };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Prices = api;
})(typeof window !== 'undefined' ? window : globalThis);
