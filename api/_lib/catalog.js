/* ==============================================
   Product catalog for the chatbot.
   Reads the same catalog files as the site (data/men.json and
   data/women.json, built from the partner CSV) plus the football
   jerseys of the Google Sheet (cached a few minutes).
============================================== */

const Prices = require('../../js/prices.js');

const CATALOGS = [
  { gender: 'men',   data: require('../../data/men.json') },
  { gender: 'women', data: require('../../data/women.json') },
];

const SHEET_ID  = '1w2N8A0f_xnmU3O1l-tFTiaC3Kp6GyjVBpjVscvCDk8M';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;
const BEST_URL  = `${SHEET_URL}&sheet=${encodeURIComponent('Best sellers')}`;
const CACHE_MS  = 5 * 60 * 1000;
const BEST_CACHE_MS = 30 * 1000;   // same as /api/best-sellers

let fileProducts = null;
let sheetCache   = { at: 0, products: [] };
let bestCache    = { at: 0, ids: new Set() };

// ─── CSV ─────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}


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

function optimizeImage(url) {
  if (!url) return '';
  if (url.includes('b-cdn.net')) return url + (url.includes('?') ? '&' : '?') + 'width=300&quality=75&format=auto';
  if (url.includes('res.cloudinary.com')) return url.replace('/upload/', '/upload/f_auto,q_auto,w_300/');
  return url;
}

// ─── Load ────────────────────────────────────────
async function loadSheet({ gender, url }) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sheet HTTP ${r.status}`);
  const rows = parseCSV(await r.text());
  if (!rows.length) return [];

  const cols = rows[0].map(c => normalize(c).trim());
  const find = (...keys) => cols.findIndex(c => keys.some(k => c.includes(k)));
  const idx = {
    name:     find('name', 'nom'),
    brand:    find('brand', 'marque'),
    article:  find('article', 'type', 'categor'),
    price:    find('price', 'prix'),
    detoured: find('detour'),
    image:    cols.findIndex(c => c.includes('image') && !c.includes('detour')),
    link:     find('lien', 'link'),
    best:     find('best'),
  };

  return rows.slice(1).map(r => {
    const cell = i => (i >= 0 && r[i] ? r[i].trim() : '');
    const link = cell(idx.link);
    const name = cell(idx.name);
    if (!name || !link) return null;
    const detoured = cell(idx.detoured);
    const sourceImage = detoured && detoured.toUpperCase() !== 'SKIP' ? detoured : cell(idx.image);
    return {
      id:       shortId(name + '|' + link),
      gender,
      name:     formatName(name),
      brand:    cell(idx.brand),
      type:     cell(idx.article).toLowerCase(),
      price:    cell(idx.price),
      cny:      Prices.parseToCny(cell(idx.price)),
      image:    optimizeImage(sourceImage),
      sourceImage,
      link,
      bestSeller: /best/i.test(cell(idx.best)),
    };
  }).filter(Boolean);
}

function loadFiles() {
  return CATALOGS.flatMap(({ gender, data }) =>
    data.items.map(([name, brand, type, priceCny, itemId, imageId]) => {
      const link = data.link.replace('{id}', itemId);
      return {
        id:       shortId(name + '|' + link),
        itemId,
        gender,
        name:     formatName(name),
        brand,
        type:     type.toLowerCase(),
        cny:      priceCny,
        image:    optimizeImage(data.image.replace('{id}', imageId)),
        link,
        bestSeller: false,
      };
    }));
}

// Football jerseys of the Men sheet (also served to the site by /api/jerseys)
async function loadSheetJerseys() {
  return (await loadSheet({ gender: 'men', url: SHEET_URL })).filter(p => p.type === 'jersey');
}

// Item ids of the "Best sellers" tab of the sheet: one Lovegobuy link (or bare id) per row,
// any column. A row without an id (a title) is skipped.
// Google answers with the 1st sheet when the tab doesn't exist (or is renamed): no best sellers then.
async function loadBestSellerIds() {
  const [best, first] = await Promise.all([BEST_URL, SHEET_URL].map(async url => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Sheet HTTP ${r.status}`);
    return r.text();
  }));
  const ids = new Set();
  if (best === first) return ids;
  for (const row of parseCSV(best)) {
    for (const cell of row) {
      const m = cell.match(/[?&]id=(\d+)/) || cell.trim().match(/^(\d{6,})$/);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

async function getCatalog() {
  if (!fileProducts) fileProducts = loadFiles();
  if (Date.now() - sheetCache.at >= CACHE_MS) {
    try {
      const jerseys = await loadSheetJerseys();
      sheetCache = { at: Date.now(), products: jerseys };
    } catch (err) {
      console.warn('[catalog] sheet jerseys not loaded:', err.message);
    }
  }
  if (Date.now() - bestCache.at >= BEST_CACHE_MS) {
    try {
      bestCache = { at: Date.now(), ids: await loadBestSellerIds() };
      for (const p of fileProducts) p.bestSeller = bestCache.ids.has(p.itemId);
    } catch (err) {
      console.warn('[catalog] best sellers not loaded:', err.message);
    }
  }
  return sheetCache.products.concat(fileProducts);
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

// maxCny: budget already converted to CNY
function searchProducts(products, { query = '', gender, maxCny } = {}) {
  const terms = normalize(query).split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !STOP.has(t));
  const groups = terms.map(t => [t, ...(SYNONYMS[t] || [])]);

  const scored = [];
  for (const p of products) {
    if (gender && gender !== 'any' && p.gender !== gender) continue;
    if (maxCny && p.cny != null && p.cny > maxCny) continue;

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

module.exports = { getCatalog, searchProducts, loadSheetJerseys, loadBestSellerIds };
