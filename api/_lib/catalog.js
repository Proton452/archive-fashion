/* ==============================================
   Product catalog for the chatbot.
   Reads the same catalog files as the site (data/men.json and
   data/women.json, built from the partner CSV).
============================================== */

const CATALOGS = [
  { gender: 'men',   data: require('../../data/men.json') },
  { gender: 'women', data: require('../../data/women.json') },
];

let cache = null;

// ─── Helpers ─────────────────────────────────────
const KEEP_UPPER = new Set(['ac','adv','amg','ap','bape','cp','dn','erd','fc','ig','jfk','led','lv','mcm','nyc','og','om','psg','rb','sb','sv','tn','uefa','ufc','ugg','uk','us','usa','ysl','wrld','nba','nfl','ii','iii','xl','xxl','xs']);
const KEEP_LOWER = new Set(['and','with','the','of','to','in','on','for','x']);

function formatName(str) {
  return String(str || '').trim().split(/\s+/).map((word, i) => word.split('-').map(part => {
    const [, pre, core, post] = part.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
    const low = core.toLowerCase();
    let out;
    if (!core || /\d/.test(core)) out = core;
    else if (KEEP_UPPER.has(low)) out = core.toUpperCase();
    else if (i > 0 && KEEP_LOWER.has(low)) out = low;
    else out = low.charAt(0).toUpperCase() + low.slice(1);
    return pre + out + post;
  }).join('-')).join(' ');
}

function normalize(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function shortId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ─── Load ────────────────────────────────────────
async function getCatalog() {
  if (cache) return cache;
  cache = CATALOGS.flatMap(({ gender, data }) =>
    data.items.map(([name, brand, type, priceCny, itemId, imageId]) => {
      const link = data.link.replace('{id}', itemId);
      return {
        id:       shortId(name + '|' + link),
        gender,
        name:     formatName(name),
        brand,
        type:     type.toLowerCase(),
        price:    `¥${priceCny}`,
        image:    data.image.replace('{id}', imageId),
        link,
        bestSeller: false,
      };
    }));
  return cache;
}

// ─── Search ──────────────────────────────────────
// French / everyday words → words used in the catalog
const SYNONYMS = {
  maillot: ['jersey'], maillots: ['jersey'], foot: ['jersey'], football: ['jersey'], kit: ['jersey'],
  sac: ['bag'], sacs: ['bag'], chaussure: ['shoe', 'sneaker'], chaussures: ['shoe', 'sneaker'], basket: ['shoe', 'sneaker'], baskets: ['shoe', 'sneaker'], sneakers: ['sneaker', 'shoe'],
  pull: ['sweater', 'hoodie'], sweat: ['hoodie', 'sweater'], veste: ['jacket'], doudoune: ['puffer'], manteau: ['coat', 'puffer'],
  robe: ['dress'], robes: ['dress'], jupe: ['skirt'], montre: ['watch'], montres: ['watch'], lunettes: ['sunglasses'],
  casquette: ['cap'], bonnet: ['beanie'], ceinture: ['belt'], jean: ['jeans'], pantalon: ['pants'], short: ['short'], claquette: ['slide'], claquettes: ['slide'],
  tshirt: ['t shirt', 't-shirt'], 'tee': ['t shirt', 't-shirt'], domicile: ['home'], exterieur: ['away'],
};
const STOP = new Set(['the','a','an','for','of','de','du','des','le','la','les','un','une','et','and','to','pour','je','veux','want','looking','cherche','avez','vous','have','you','any','do','est','ce','que','qui','in','en','avec','with','please','stp','svp']);

// Whole-word match that tolerates plurals ("slides" ↔ "slide"), so "bag" doesn't match "baggy"
function hasWord(text, w) {
  if (w.includes(' ')) return text.includes(w);
  return text.split(/[^a-z0-9]+/).some(x => x === w || x === w + 's' || x === w + 'es' || x + 's' === w || x + 'es' === w);
}

function searchProducts(products, { query = '', gender, maxPrice } = {}) {
  const terms = normalize(query).split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !STOP.has(t));
  const groups = terms.map(t => [t, ...(SYNONYMS[t] || [])]);

  const scored = [];
  for (const p of products) {
    if (gender && gender !== 'any' && p.gender !== gender) continue;
    const priceNum = parseFloat(String(p.price).replace(',', '.').replace(/[^\d.]/g, ''));
    if (maxPrice && !isNaN(priceNum) && priceNum > maxPrice) continue;

    const fields = [[normalize(p.name), 3], [normalize(p.brand), 3], [normalize(p.type), 2]];
    let score = 0, matched = 0;
    for (const group of groups) {
      let best = 0;
      for (const w of group) {
        for (const [text, weight] of fields) {
          if (hasWord(text, w)) best = Math.max(best, weight);
        }
      }
      if (best) { score += best; matched++; }
    }
    if (!groups.length) score = p.bestSeller ? 1 : 0;
    if (groups.length && matched === 0) continue;
    score += matched === groups.length ? 5 : 0;   // all words matched
    if (p.bestSeller) score += 1;
    scored.push({ p, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map(s => s.p);
}

module.exports = { getCatalog, searchProducts };
