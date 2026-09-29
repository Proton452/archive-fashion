/* ==============================================
   Seasonal order — the catalogue stays in random order, but in-season clothes
   are more likely to come first: winter from 15 September to 31 March, summer
   from 1 April to 14 September. Only the fashion items are reordered; the
   non-fashion tail (after `end`) stays at the end.
   Target mix while scrolling: winter 40 % / summer 5 % / all-year 55 % in winter,
   winter 5 % / summer 30 % / all-year 65 % in summer.
   No off-season item in the first 12 cards. Same order for every visit
   during a season (fixed seed per season).
============================================== */

(function () {
  const WINTER = ['coats & puffers', 'jackets', 'hoodies & sweats', 'sweater', 'boots', 'scarves', 'long sleeves'];
  const SUMMER = ['shorts', 'denim shorts', 'slides & sandals', 'hats & caps', 'sunglasses', 'polo'];
  const TARGET = {
    winter: { winter: 0.40, summer: 0.05, all: 0.55 },
    summer: { winter: 0.05, summer: 0.30, all: 0.65 },
  };
  const FIRST_SCREEN = 12;   // no off-season item in the first 12 cards
  const MAX_WEIGHT = 3;   // a small group (e.g. Women summer) doesn't all pile up at the top

  const now = new Date();
  const m = now.getMonth() + 1, d = now.getDate();
  const season = (m >= 4 && m <= 8) || (m === 9 && d < 15) ? 'summer' : 'winter';
  // Winter spans two years (Sept → March): name it after the year it starts in
  const seasonYear = season === 'winter' && m <= 3 ? now.getFullYear() - 1 : now.getFullYear();

  const group = p => {
    const a = (p.article || '').toLowerCase().trim();
    return WINTER.includes(a) ? 'winter' : SUMMER.includes(a) ? 'summer' : 'all';
  };

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Weighted shuffle (each item's key = random^(1/weight), highest first)
  function order(items, end) {
    const head = items.slice(0, end), tail = items.slice(end);
    const count = { winter: 0, summer: 0, all: 0 };
    head.forEach(p => count[group(p)]++);
    const weight = {};
    Object.keys(count).forEach(g => {
      const share = count[g] / (head.length || 1);
      weight[g] = share ? Math.min(MAX_WEIGHT, TARGET[season][g] / share) : 1;
    });
    const rng = mulberry32(seasonYear * 2 + (season === 'summer' ? 1 : 0));
    const sorted = head
      .map(p => ({ p, k: Math.pow(rng(), 1 / weight[group(p)]) }))
      .sort((a, b) => b.k - a.k)
      .map(x => x.p);
    // First screen: no off-season item at all (they move just below it)
    const off = season === 'winter' ? 'summer' : 'winter';
    const top = sorted.slice(0, FIRST_SCREEN), rest = sorted.slice(FIRST_SCREEN);
    const inSeason = top.filter(p => group(p) !== off), moved = top.filter(p => group(p) === off);
    while (inSeason.length < FIRST_SCREEN && rest.length) {
      const i = rest.findIndex(p => group(p) !== off);
      if (i < 0) break;
      inSeason.push(rest.splice(i, 1)[0]);
    }
    return inSeason.concat(moved, rest, tail);
  }

  window.Season = { season, order };
})();
