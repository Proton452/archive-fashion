/* ==============================================
   LOVEGOBUY FINDS — Main Script
   Data: /data/men.json (built from the partner CSV by scripts/build_catalog.py)
         + the jerseys of the Google Sheet (/api/jerseys, cached by Vercel)
         + the best sellers picked in the sheet (/api/best-sellers, js/best-sellers.js)
         + the places chosen in the sheet (/api/positions, js/positions.js)
============================================== */

const CATALOG_URL = '/data/men.json';
// The Google Sheet still provides the football jerseys (with their best seller marks)
const JERSEYS_URL = '/api/jerseys';
const JERSEYS_TIMEOUT_MS = 3000;   // never hold the grid back longer than this for them
// Teams of the CSV jerseys, for the Football tab's league / club chips (scripts/jersey_skus.js, js/football.js)
const FOOTBALL_URL = '/data/football.json';

// ─── Category Tab → partner categories (exact names, lowercase) ────────
const CATEGORY_MAP = {
  football:    ['jersey'],
  summer:      ['shorts', 'denim shorts', 'slides & sandals', 'hats & caps', 'sunglasses'],
  tops:        ['t-shirts', 'hoodies & sweats', 'long sleeves', 'polo', 'shirts', 'sweater', 'tracksuits & sets'],
  winter:      ['coats & puffers', 'jackets'],
  pants:       ['pants', 'jeans', 'sweatpants', 'shorts', 'denim shorts'],
  sport:       ['running'],   // partner's "Running" is mostly sportswear (Alo, Under Armour…)
  shoes:       ['sneakers', 'boots', 'slides & sandals', 'dress shoes'],
  bags:        ['backpacks', 'crossbody & shoulder', 'handbags', 'duffels', 'cosmetic bags'],
  accessories: ['belts', 'wallets', 'socks', 'scarves', 'ties', 'hats & caps', 'sunglasses', 'jewelry', 'bracelets', 'necklaces', 'rings', 'earrings', 'watches', 'accessories', 'underwear'],
};

// ─── State ──────────────────────────────────────
let allProducts      = [];
let currentCategoryTab = 'all';
let selectedFilters  = new Set();
let footballLeague   = null;   // Football tab: chosen league chip, then club chip
let footballTeam     = null;
let searchQuery      = '';
let sortOrder        = null;
const MIN_CATEGORY_COUNT = 5;   // smallest category listed in "All"
const PAGE_SIZE      = 30;

// Loading placeholders: as many as the first batch, so the page (and its scrollbar)
// doesn't jump when the products arrive
(function () {
  const skel = document.querySelector('#loading .skeleton-card');
  if (!skel) return;
  const box = skel.parentNode;
  while (box.children.length < PAGE_SIZE) box.append(skel.cloneNode(true));
})();
let visibleProducts  = [];
let displayedCount   = 0;

// ─── DOM ────────────────────────────────────────
const nav         = document.getElementById('nav');
const grid        = document.getElementById('productsGrid');
const loading     = document.getElementById('loading');
const emptyState  = document.getElementById('emptyState');
const countEl     = document.getElementById('collectionCount') || { textContent: '' };
const searchInput = document.getElementById('searchInput');
const filterDropdown = document.getElementById('filterDropdown');
const sortBtn     = document.getElementById('sortBtn');
const backToTop   = document.getElementById('backToTop');

// ─── Global touch-scroll detection (mobile tap vs scroll) ───
let _docTouchY = 0;
let _docScrolled = false;
document.addEventListener('touchstart', e => {
  _docTouchY = e.touches[0].clientY;
  _docScrolled = false;
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (Math.abs(e.touches[0].clientY - _docTouchY) > 8) _docScrolled = true;
}, { passive: true });

// ─── Navbar scroll + back to top ────────────────
window.addEventListener('scroll', () => {
  nav.classList.toggle('is-scrolled', window.scrollY > 20);
  if (backToTop) backToTop.classList.toggle('is-visible', window.scrollY > 600);
}, { passive: true });

// ─── Highlight active nav page ───────────────────
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(link => {
    if ((link.getAttribute('href') || '') === page) link.classList.add('is-active-page');
  });
})();

// ─── Nav pill spring animation ───────────────────
document.querySelectorAll('.nav__link').forEach(link => {
  link.addEventListener('click', function () {
    this.classList.remove('is-pressed');
    void this.offsetWidth;
    this.classList.add('is-pressed');
    this.addEventListener('animationend', function () {
      this.classList.remove('is-pressed');
    }, { once: true });
  });
});

if (backToTop) {
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ─── Hamburger Menu ──────────────────────────────
const burger    = document.getElementById('navBurger');
const mobileNav = document.getElementById('navMobile');

if (burger && mobileNav) {
  function closeMobileMenu() {
    burger.classList.remove('is-open');
    mobileNav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
  }

  burger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = !mobileNav.classList.contains('is-open');
    burger.classList.toggle('is-open', isOpen);
    mobileNav.classList.toggle('is-open', isOpen);
    burger.setAttribute('aria-expanded', String(isOpen));
  });

  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });

  document.addEventListener('click', e => {
    if (mobileNav.classList.contains('is-open') &&
        !e.target.closest('#navMobile') &&
        !e.target.closest('#navBurger')) {
      closeMobileMenu();
    }
  });
}

// ─── Category Tabs ───────────────────────────────
document.querySelectorAll('.cat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const chosen = tab.dataset.cat;
    if (chosen === currentCategoryTab) return;

    currentCategoryTab = chosen;
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('is-active'));
    tab.classList.add('is-active');

    selectedFilters.clear();
    footballLeague = footballTeam = null;
    searchQuery = '';
    searchInput.value = '';
    sortOrder = null;
    sortBtn.classList.remove('is-asc', 'is-desc');
    sortBtn.querySelector('.toolbar__sort-chevron').textContent = '↕︎';

    gaEvent('click_category', { category: chosen });
    document.getElementById('footballNotice').classList.toggle('is-visible', chosen === 'football');
    generateFilterDropdown();
    applyFilters();
  });
});

// ─── Category tabs: right-edge fade while more tabs are off-screen ───
(function () {
  const wrapper = document.getElementById('catTabsWrapper');
  const tabs = document.getElementById('catTabs');
  if (!wrapper || !tabs) return;
  const update = () => wrapper.classList.toggle('has-more',
    Math.abs(tabs.scrollLeft) + tabs.clientWidth < tabs.scrollWidth - 4);   // scrollLeft is negative in RTL (Arabic)
  tabs.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
})();

// Product images (Bunny; theqcbook refuses bursts, HTTP 429) — try again a little later
const IMG_RETRY_MS = [800, 2000, 4000];
grid.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || 'noretry' in img.dataset) return;   // style thumbnails: no retry (js/card-styles.js)
  // Not on Bunny yet (new CSV, scripts/products_to_bunny.py not run): the partner's photo
  const onBunny = img.src.match(/^https:\/\/archivefashion\.b-cdn\.net\/products\/(\d+)\.webp/);
  if (onBunny) { img.src = `https://img.theqcbook.com/products/${onBunny[1]}.webp?v5`; return; }
  const tries = +(img.dataset.tries || 0);
  if (tries >= IMG_RETRY_MS.length) return;
  img.dataset.tries = tries + 1;
  const base = img.dataset.base || (img.dataset.base = img.src);
  setTimeout(() => { img.src = base + (base.includes('?') ? '&' : '?') + 'retry=' + (tries + 1); }, IMG_RETRY_MS[tries]);
}, true);   // capture: error events don't bubble

// Clear the stagger delay once a card has faded in, so press feedback isn't delayed
grid.addEventListener('transitionend', e => {
  if (e.propertyName === 'opacity' && e.target.classList.contains('product-card')) {
    e.target.style.transitionDelay = '';
  }
});

// ─── Search ─────────────────────────────────────
let searchTrackTimer  = null;
let lastTrackedSearch = '';

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.toLowerCase().trim();
  applyFilters();

  // Track what people search for once they stop typing (GA4 "search" event)
  clearTimeout(searchTrackTimer);
  searchTrackTimer = setTimeout(() => {
    if (searchQuery.length < 2 || searchQuery === lastTrackedSearch) return;
    lastTrackedSearch = searchQuery;
    gaEvent('search', { search_term: searchQuery });
    if (!visibleProducts.length) gaEvent('search_no_results', { search_term: searchQuery });
  }, 1200);
});

// ─── Sort by Price ───────────────────────────────
sortBtn.addEventListener('click', () => {
  const chevron = sortBtn.querySelector('.toolbar__sort-chevron');
  if (sortOrder === null) {
    sortOrder = 'asc';
    sortBtn.classList.add('is-asc');
    sortBtn.classList.remove('is-desc');
    chevron.textContent = '↓︎';
  } else if (sortOrder === 'asc') {
    sortOrder = 'desc';
    sortBtn.classList.remove('is-asc');
    sortBtn.classList.add('is-desc');
    chevron.textContent = '↓︎';
  } else {
    sortOrder = null;
    sortBtn.classList.remove('is-asc', 'is-desc');
    chevron.textContent = '↕︎';
  }
  applyFilters();
});

// ─── IntersectionObserver: fade-in on scroll ────
const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

// ─── IntersectionObserver: preload images ───────
const preloadObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target.querySelector('img[loading="lazy"]');
      if (img) img.removeAttribute('loading');
      preloadObserver.unobserve(entry.target);
    }
  });
}, { rootMargin: '1200px 0px', threshold: 0 });

// ─── Sentinel: infinite scroll ───────────────────
const sentinel = document.createElement('div');
sentinel.className = 'products-sentinel';

const infiniteScrollObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    infiniteScrollObserver.unobserve(sentinel);
    appendNextBatch();
  }
}, { rootMargin: '400px 0px' });

document.querySelectorAll('.fade-in').forEach(el => fadeObserver.observe(el));

// ─── Load the catalog JSON → product objects ─────
async function fetchCatalog(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Catalog HTTP ${r.status}`);
  const data = await r.json();
  const items = data.items.map(([name, brand, article, priceCny, itemId, imageId, qcCount, stylesCount, firstStyles]) => ({
    id:    itemId,
    qc:    qcCount || 0,       // real (QC) photos, shown by js/photos.js
    styles: stylesCount || 0,  // official photos of each colour / design, same window
    firstStyles,               // first 3 style numbers when not 0, 1, 2 (js/card-styles.js)
    imageId,
    name,
    brand,
    article,
    cny:   priceCny,
    price: Prices.format(priceCny),
    image: data.covers && data.covers[itemId] != null   // a style picked by hand (COVERS in build_catalog.py)
      ? `https://archivefashion.b-cdn.net/styles/${imageId}/${data.covers[itemId]}.webp`
      : data.image.replace('{id}', imageId),
    lien:  data.link.replace('{id}', itemId),
    isBestSeller: false,
  }));
  return { items, end: data.end };
}

// Sheet jerseys only; the site still loads if they are slow or unavailable
function fetchSheetJerseys() {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), JERSEYS_TIMEOUT_MS);
  return fetch(JERSEYS_URL, { signal: ctrl.signal })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(items => items.map(p => ({
      name:  p.name,
      brand: p.brand,
      article: p.article,
      cny:   Prices.parseToCny(p.price),
      price: Prices.format(Prices.parseToCny(p.price)),
      image: p.image,
      lien:  p.lien,
      isBestSeller: !!p.best,
      fromSheet: true,   // shown in Football (and Best Sellers) only, not in All
    })))
    .catch(err => { console.warn('[Lovegobuy Finds] Sheet jerseys not loaded:', err); return []; })
    .finally(() => clearTimeout(timer));
}

// Insert extra items at random (but fixed) positions before the non-fashion tail
function mixIn(items, extra, end) {
  const rng  = mulberry32(0xAF2025);
  const head = items.slice(0, end);
  extra.forEach(p => head.splice(Math.floor(rng() * (head.length + 1)), 0, p));
  return head.concat(items.slice(end));
}

// ─── PRNG: mulberry32 (deterministic) ────────────
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}


// ─── Deduplication ───────────────────────────────
function deduplicateProducts(products) {
  const seen = new Set();
  return products.filter(p => {
    const key = `${p.name.toLowerCase()}|||${p.lien}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Synonyms dictionary (multilingual search) ───
const SYNONYM_GROUPS = [
  ['pull','pullover','sweater','sweatshirt','hoodie','knit','knitwear','jumper','sudadera','jersey','chandail','sweat'],
  ['tshirt','t-shirt','tee','top','camiseta','maglia','camisa','maglietta'],
  ['chemise','shirt','blouse','camisa','hemd','camicia','blusa'],
  ['polo','polo shirt'],
  ['veste','jacket','chaqueta','jacke','giacca','jaqueta','blouson','blazer'],
  ['manteau','coat','abrigo','mantel','cappotto','casaco','overcoat'],
  ['puffer','doudoune','down jacket','acolchado','steppjacke','piumino','padded jacket'],
  ['bomber','varsity','teddy jacket','college jacket'],
  ['cardigan','gilet','vest','chaleco'],
  ['windbreaker','coupe-vent','cortavientos','k-way'],
  ['pantalon','pants','trousers','pantalón','hose','pantaloni','calça'],
  ['jean','jeans','denim','vaqueros'],
  ['jogging','jogger','sweatpants','trackpants','track pants'],
  ['short','shorts','bermuda','pantaloncini'],
  ['legging','leggings','collant','mallas'],
  ['cargo','cargo pants','pantalon cargo'],
  ['robe','dress','vestido','kleid','abito'],
  ['jupe','skirt','falda','rock','gonna'],
  ['ensemble','set','conjunto','matching set','co-ord'],
  ['chaussures','shoes','zapatos','schuhe','scarpe'],
  ['sneakers','baskets','trainers','tennis','zapatillas','scarpe da ginnastica'],
  ['boots','bottes','botines','stiefel','stivali'],
  ['casquette','cap','hat','gorra'],
  ['bonnet','beanie','gorro'],
  ['bucket hat','bob'],
  ['sac','bag','bolso','tasche','borsa'],
  ['sac à dos','backpack','mochila','rucksack','zaino'],
  ['tote','tote bag','cabas','shopper'],
  ['ceinture','belt','cinturón','gürtel','cintura'],
  ['maillot','jersey','trikot','football shirt','kit'],
  ['maillot de bain','swimwear','swimsuit','bañador'],
  ['cuir','leather','cuero','leder','pelle'],
  ['vintage','retro','rétro','used'],
  ['streetwear','street','urban','urbain'],
  ['sport','sportswear','athletic','deportivo'],
  // Brand nicknames people type
  ['lv','louis vuitton'],
  ['ysl','saint laurent'],
  ['tnf','north face'],
  ['cdg','comme des garcons'],
  ['rl','ralph lauren'],
  ['ow','off white'],
  ['ch','chrome hearts'],
  ['gd','gallery dept'],
  ['mm6','margiela'],
  ['nb','new balance'],
  ['af1','air force 1'],
  ['aj','air jordan'],
  ['fog','fear of god'],
];

const SYNONYM_MAP = new Map();
SYNONYM_GROUPS.forEach(group => {
  group.forEach(term => {
    SYNONYM_MAP.set(term.toLowerCase(), group.map(t => t.toLowerCase()));
  });
});

function normalizeTerm(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function normalizeBrand(str) {
  return normalizeTerm(str).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Search: every item gets a score, results come best first ("stone island jacket" → the
// Stone Island jackets, then other Stone Island items and other jackets). Each word typed
// counts as found when it (or a translation, SYNONYM_GROUPS) is in the name or the brand.
function searchScorer(query) {
  const normQuery = normalizeBrand(query);
  const words     = normQuery.split(' ').filter(w => w.length >= 2);
  const groups    = words.map(w => {
    const synonyms = SYNONYM_MAP.get(w) || [];
    return [...new Set([w, ...synonyms.map(normalizeBrand)])];
  });
  const compact = normQuery.replace(/\s+/g, '');
  // Short words (lv, cp...) must be whole words, longer ones can be part of a word
  const found = (text, padded, term) => term.length >= 3 ? text.includes(term) : padded.includes(' ' + term + ' ');

  return p => {
    const text   = normalizeBrand((p.name || '') + ' ' + (p.brand || '') + ' ' + (p.teamNames || ''));
    const padded = ' ' + text + ' ';
    let hits = 0;
    groups.forEach(g => { if (g.some(t => found(text, padded, t))) hits++; });
    // "offwhite" for Off-White, "stoneisland" for Stone Island
    const glued = compact.length >= 4 && text.replace(/\s+/g, '').includes(compact);
    if (!hits && !glued) return 0;
    let score = hits * 10;
    if (glued || hits === groups.length) score += 100;                   // every word found
    if (normQuery.length >= 3 && padded.includes(' ' + normQuery)) score += 50;   // the exact phrase
    return score;
  };
}

// ─── Load Products ───────────────────────────────
async function loadProducts() {
  document.getElementById('footballNotice').classList.toggle('is-visible', currentCategoryTab === 'football');
  loading.style.display = 'block';
  emptyState.hidden = true;
  grid.innerHTML = '';

  try {
    const footballTeams = fetch(FOOTBALL_URL).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const [catalog, jerseys, best, pins, teams] = await Promise.all([fetchCatalog(CATALOG_URL), fetchSheetJerseys(), BestSellers.load(), Positions.load(), footballTeams]);
    BestSellers.mark(catalog.items, best);   // picked in the sheet (js/best-sellers.js)
    catalog.items.forEach(p => { if (teams[p.id]) p.teams = teams[p.id]; });
    jerseys.forEach(p => { p.teams = Football.classify(p.name); });
    // Search: "chelsea" also finds the CSV jerseys only called "Adidas Jersey"
    [...catalog.items, ...jerseys].forEach(p => { if (p.teams) p.teamNames = p.teams.map(id => Football.team(id).name).join(' '); });
    const ordered = Positions.apply(Season.order(catalog.items, catalog.end), pins, catalog.end);   // places chosen in the sheet (js/positions.js)
    allProducts = deduplicateProducts(mixIn(ordered, jerseys, catalog.end));

    loading.style.display = 'none';
    generateFilterDropdown();
    applyFilters();

  } catch (err) {
    console.error('[Lovegobuy Finds] Failed to load products:', err);
    loading.style.display = 'none';
    emptyText.textContent = t("Couldn't load the items. Please refresh the page.");
    emptyReset.hidden = true;
    emptyState.hidden = false;
    countEl.textContent = '— Error loading items';
  }
}

// ─── Generate Filter Dropdown ────────────────────
// Is this product in the selected tab?
function inCurrentTab(p) {
  if (currentCategoryTab === 'favorites') return Favs.has(Favs.key(p));
  if (currentCategoryTab === 'recent') return Recent.has(Favs.key(p));
  if (currentCategoryTab === 'best-sellers') return p.isBestSeller;
  if (currentCategoryTab === 'all') return !p.fromSheet;
  return (CATEGORY_MAP[currentCategoryTab] || []).includes((p.article || '').toLowerCase().trim());
}

// ─── Category pickers: chips under the tabs + "Category" dropdown ───
// Both list the categories of the current tab and share selectedFilters.
function generateFilterDropdown() {
  const categoryCounts = {};
  allProducts.forEach(p => {
    if (!inCurrentTab(p)) return;
    const cat = (p.article || '').toLowerCase().trim();
    if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  // "All" has every category, so keep only the bigger ones there
  const minCount = currentCategoryTab === 'all' ? MIN_CATEGORY_COUNT : 1;
  const categories = Object.entries(categoryCounts)
    .filter(([, count]) => count >= minCount)
    .map(([cat]) => cat)
    .sort();
  const label = cat => t(cat.charAt(0).toUpperCase() + cat.slice(1));

  function toggle(cat) {
    if (cat === null) selectedFilters.clear();
    else if (selectedFilters.has(cat)) selectedFilters.delete(cat);
    else selectedFilters.add(cat);
    if (cat !== null) gaEvent('click_subcategory', { category: cat });
    generateFilterDropdown();
    applyFilters();
  }

  // Dropdown
  filterDropdown.innerHTML = '';
  const allItem = document.createElement('div');
  allItem.className = 'toolbar__filter-item toolbar__filter-item--all' + (selectedFilters.size === 0 ? ' is-active' : '');
  allItem.textContent = t('ALL');
  // stopPropagation: the item is re-rendered, so the outside-click handler would close the menu
  allItem.addEventListener('click', e => { e.stopPropagation(); toggle(null); });
  filterDropdown.appendChild(allItem);

  categories.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'toolbar__filter-item' + (selectedFilters.has(cat) ? ' is-active' : '');
    div.dataset.category = cat;
    div.textContent = label(cat);
    div.addEventListener('click', e => { e.stopPropagation(); toggle(cat); });
    filterDropdown.appendChild(div);
  });

  // Best Sellers (a short hand-picked list) and Recently viewed: no category to choose
  const hidePicker = currentCategoryTab === 'best-sellers' || currentCategoryTab === 'recent';
  filterDropdown.parentElement.hidden = hidePicker;

  const filterBtn = document.getElementById('filterBtn');
  const filterCount = document.getElementById('filterCount');
  if (filterCount) filterCount.textContent = selectedFilters.size ? `(${selectedFilters.size})` : '';
  if (filterBtn) filterBtn.classList.toggle('is-active', selectedFilters.size > 0);

  // Chips: only inside a tab, and only when there is a choice to make
  const chips = document.getElementById('catChips');
  if (currentCategoryTab === 'football') renderFootballChips(chips);
  else showChipRow(document.getElementById('clubChips'), false);
  if (chips && currentCategoryTab !== 'football') {
    const show = currentCategoryTab !== 'all' && !hidePicker && categories.length >= 2;
    const scrollLeft = chips.scrollLeft;
    chips.innerHTML = '';
    if (show) {
      const make = (cat, text) => {
        const btn = document.createElement('button');
        btn.className = 'cat-chip' + ((cat === null ? selectedFilters.size === 0 : selectedFilters.has(cat)) ? ' is-active' : '');
        btn.textContent = text;
        btn.addEventListener('click', () => toggle(cat));
        chips.appendChild(btn);
      };
      make(null, t('All'));
      categories.forEach(cat => make(cat, label(cat)));
    }
    chips.scrollLeft = scrollLeft;
    if (chips.hidden === show) {
      chips.hidden = !show;
      window.dispatchEvent(new Event('resize'));   // the sticky bar changed height
    }
  }

  if (filterBtn && !filterBtn._attached) {
    filterBtn.addEventListener('click', e => {
      e.stopPropagation();
      filterDropdown.classList.toggle('is-open');
    });
    filterBtn._attached = true;
  }

  if (!document._dropdownClose) {
    document.addEventListener('click', e => {
      if (!e.target.closest('.toolbar__filter-wrapper')) {
        filterDropdown.classList.remove('is-open');
      }
    });
    document._dropdownClose = true;
  }
}

// ─── Football tab: league chips, then the clubs of the chosen league ───
// Only here, not in the "Category" menu. Teams come from js/football.js.
const leaguesOf = p => new Set((p.teams || []).map(id => Football.team(id).league));

function showChipRow(row, show) {
  if (!row || row.hidden === !show) return;
  row.hidden = !show;
  window.dispatchEvent(new Event('resize'));   // the sticky bar changed height
}

function fillChipRow(row, entries, isActive, onPick) {
  const scrollLeft = row.scrollLeft;
  row.innerHTML = '';
  entries.forEach(([value, text]) => {
    const btn = document.createElement('button');
    btn.className = 'cat-chip' + (isActive(value) ? ' is-active' : '');
    btn.textContent = text;
    btn.addEventListener('click', () => onPick(value));
    row.appendChild(btn);
  });
  row.scrollLeft = scrollLeft;
}

function renderFootballChips(leagueRow) {
  const clubRow = document.getElementById('clubChips');
  if (!leagueRow || !clubRow) return;
  const jerseys = allProducts.filter(inCurrentTab);

  const leagueCounts = {};
  jerseys.forEach(p => leaguesOf(p).forEach(l => { leagueCounts[l] = (leagueCounts[l] || 0) + 1; }));
  const leagues = Football.LEAGUES.filter(([id]) => leagueCounts[id]);
  if (footballLeague && !leagueCounts[footballLeague]) footballLeague = footballTeam = null;

  const pick = (league, team) => {
    footballLeague = league;
    footballTeam = team;
    if (team) gaEvent('click_football_club', { club: team });
    else if (league) gaEvent('click_football_league', { league });
    generateFilterDropdown();
    applyFilters();
  };

  fillChipRow(leagueRow, [[null, t('All')], ...leagues.map(([id, name]) => [id, t(name)])],
    id => id === footballLeague, id => pick(id === footballLeague ? null : id, null));
  showChipRow(leagueRow, leagues.length >= 2);

  // Clubs of the chosen league, the most stocked first
  const teamCounts = {};
  if (footballLeague) {
    jerseys.forEach(p => (p.teams || []).forEach(id => {
      if (Football.team(id).league === footballLeague) teamCounts[id] = (teamCounts[id] || 0) + 1;
    }));
  }
  const teams = Object.keys(teamCounts).sort((a, b) => teamCounts[b] - teamCounts[a]);
  const leagueName = (Football.LEAGUES.find(([id]) => id === footballLeague) || [])[1];
  fillChipRow(clubRow, [[null, t('All') + (leagueName ? ' · ' + t(leagueName) : '')], ...teams.map(id => [id, Football.team(id).name])],
    id => id === footballTeam, id => pick(footballLeague, id === footballTeam ? null : id));
  showChipRow(clubRow, teams.length >= 2);
}

// Football chips: keep the jerseys of the chosen league / club; the ones that are
// only that club (or league) come before the listings with many teams
function filterFootball(products) {
  if (currentCategoryTab !== 'football' || !footballLeague) return products;
  const only = footballTeam
    ? p => p.teams.every(id => id === footballTeam)
    : p => leaguesOf(p).size === 1;
  const kept = products.filter(p => footballTeam ? (p.teams || []).includes(footballTeam) : leaguesOf(p).has(footballLeague));
  return [...kept.filter(only), ...kept.filter(p => !only(p))];
}

// ─── Apply All Filters ───────────────────────────
function applyFilters() {
  let filtered = allProducts;

  // 1. Category tab filter
  filtered = filtered.filter(inCurrentTab);

  // 2. Sub-type filter (dropdown)
  if (selectedFilters.size > 0) {
    filtered = filtered.filter(p =>
      selectedFilters.has((p.article || '').toLowerCase().trim())
    );
  }
  filtered = filterFootball(filtered);

  // Best Sellers: in the order of the sheet (a search or price sort still applies on top)
  if (currentCategoryTab === 'best-sellers') filtered = BestSellers.order(filtered);

  // 3. Search
  if (searchQuery) {
    const score = searchScorer(searchQuery);
    const scores = new Map();
    filtered = filtered.filter(p => {
      const s = score(p);
      if (s) scores.set(p, s);
      return s > 0;
    });
    // Best matches first; equal scores keep the catalog's order (stable sort)
    filtered.sort((a, b) => scores.get(b) - scores.get(a));
  }

  // 4. Sort by price
  // Recently viewed: newest first (a price sort still applies on top)
  if (currentCategoryTab === 'recent') filtered = Recent.order(filtered);

  if (sortOrder) {
    const withPrice = [];
    const noPrice   = [];

    filtered.forEach(p => {
      p.cny != null ? withPrice.push(p) : noPrice.push(p);
    });

    withPrice.sort((a, b) => sortOrder === 'asc' ? a.cny - b.cny : b.cny - a.cny);

    filtered = [...withPrice, ...noPrice];
  }

  // Decide before re-rendering: emptying the grid briefly shortens the page and resets the scroll
  const prevY = window.scrollY;
  const stickAt = shopBarStickPoint();
  renderProducts(filtered);
  const targetY = (stickAt !== null && prevY > stickAt) ? stickAt : prevY;
  if (window.scrollY !== targetY) window.scrollTo({ top: targetY, behavior: 'instant' });
}

// Scroll position at which the shop bar sticks under the nav (start of the results)
function shopBarStickPoint() {
  const hero = document.getElementById('hero');
  if (!hero) return null;
  return hero.getBoundingClientRect().bottom + window.scrollY - nav.offsetHeight;
}

// ─── Display name: "PSG 2026 HOME JERSEY" → "PSG 2026 Home Jersey" ───
const KEEP_UPPER = new Set(['ac','adv','amg','ap','bape','cp','dn','erd','fc','ig','jfk','led','lv','mcm','nyc','og','om','psg','rb','sb','sv','tn','uefa','ufc','ugg','uk','us','usa','ysl','wrld','nba','nfl','ii','iii','xl','xxl','xs']);
const KEEP_LOWER = new Set(['and','with','the','of','to','in','on','for','x']);

function formatName(str) {
  if (!str) return '';
  return str.trim().split(/\s+/).map((word, i) => {
    return word.split('-').map(part => {
      const m = part.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
      const [, pre, core, post] = m;
      const low = core.toLowerCase();
      let out;
      if (!core || /\d/.test(core)) out = core;
      else if (KEEP_UPPER.has(low)) out = core.toUpperCase();
      else if (i > 0 && KEEP_LOWER.has(low)) out = low;
      else out = low.charAt(0).toUpperCase() + low.slice(1);
      return pre + out + post;
    }).join('-');
  }).join(' ');
}

// ─── Empty state ─────────────────────────────────
const emptyText  = document.getElementById('emptyText');
const emptyReset = document.getElementById('emptyReset');

function showEmptyState() {
  const raw = searchInput.value.trim();
  const isFiltered = raw || selectedFilters.size > 0 || currentCategoryTab !== 'all';
  emptyText.textContent = raw
    ? t('Nothing found for "{query}".').replace('{query}', raw) + '\n' + t('Try another word or browse all items.')
    : currentCategoryTab === 'favorites'
      ? t('No favorites yet. Tap the heart on an item to save it here.')
      : t('Nothing here yet. Browse all items instead.');
  emptyReset.hidden = !isFiltered;
  emptyState.hidden = false;
}

emptyReset.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  selectedFilters.clear();
  const allTab = document.querySelector('.cat-tab[data-cat="all"]');
  if (currentCategoryTab !== 'all' && allTab) {
    allTab.click();
  } else {
    applyFilters();
  }
  generateFilterDropdown();
});

// ─── Render Products ─────────────────────────────
function renderProducts(products) {
  infiniteScrollObserver.unobserve(sentinel);
  if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);

  grid.innerHTML = '';
  visibleProducts = products;
  displayedCount  = 0;

  if (!products.length) {
    showEmptyState();
    countEl.textContent = '— 0 items';
    return;
  }

  emptyState.hidden = true;
  countEl.textContent = `— ${products.length} item${products.length > 1 ? 's' : ''}`;
  appendNextBatch();
}

// ─── Append Next Batch (infinite scroll) ─────────
function appendNextBatch() {
  const batch = visibleProducts.slice(displayedCount, displayedCount + PAGE_SIZE);
  if (!batch.length) return;

  const batchStart = displayedCount;
  const numColumns = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
  const fragment   = document.createDocumentFragment();
  const newCards   = [];

  batch.forEach((p, i) => {
    const globalIdx = batchStart + i;
    const name    = p.name    || '';
    const displayName = formatName(name);
    const brand   = p.brand   || '';
    const price   = p.price   || '';
    const image   = cloudinaryOptimize(
      (p.imageDetoured && p.imageDetoured.toUpperCase() !== 'SKIP')
        ? p.imageDetoured
        : (p.image || '')
    );
    const link = p.lien || '';

    const isFootball = CATEGORY_MAP.football.some(k => (p.article || '').toLowerCase().includes(k));

    const card = link ? document.createElement('a') : document.createElement('article');
    card.className = 'product-card fade-in';
    card._product = p;   // for price updates on a currency switch
    card.style.transitionDelay = `${((batchStart + i) % numColumns) * 60}ms`;

    var cardHref = link;
    if (link) {
      if (window.PARTNER_CODE) cardHref = cardHref.replace(/invite_code=[^&\s]+/, 'invite_code=' + window.PARTNER_CODE);
      card.href   = cardHref;
      card.target = '_blank';
      card.rel    = 'noopener noreferrer';
    }

    card.addEventListener('click', e => {
      if (_docScrolled) { e.preventDefault(); return; }
      // Heart: add to / remove from favorites instead of opening Lovegobuy
      if (e.target.closest('.product-card__fav')) {
        e.preventDefault();
        Favs.toggle(Favs.key(p));
        return;
      }
      // Style thumbnails, "+N" or the space between them: open the photos window on that
      // style (never Lovegobuy by a near miss)
      if (e.target.closest('.card-styles')) {
        e.preventDefault();
        const style = e.target.closest('.card-style, .card-styles__more');
        // Are the thumbnails used? (thumbnail / "+N" / space around them, phone or computer)
        gaEvent('click_card_style', {
          item_name: name,
          target: !style ? 'around' : style.classList.contains('card-styles__more') ? 'more' : 'thumbnail',
          device: window.matchMedia('(hover: hover)').matches ? 'computer' : 'phone',
        });
        card.classList.add('is-held');
        if (window.RealPhotos) RealPhotos.open(p.id, { style: style ? +style.dataset.style : 0 });
        return;
      }
      // Camera badge: open the real photos instead of Lovegobuy
      if (e.target.closest('.product-card__photos')) {
        e.preventDefault();
        card.classList.add('is-held');   // stays zoomed behind the window (the mouse is now on the window)
        if (window.RealPhotos) RealPhotos.open(p.id, { tab: 'qc' });   // Photos pill: straight to the real photos
        return;
      }
      gaEvent('click_product', { item_name: name, price, item_type: p.article });
      Recent.add(Favs.key(p));
      if (isFootball && link && currentCategoryTab === 'football' && !jerseyPopupDismissed) {
        e.preventDefault();
        const popup = document.getElementById('jerseyPopup');
        const confirm = document.getElementById('jerseyPopupConfirm');
        confirm.href = cardHref;
        popup.hidden = false;
        rememberJerseyPopup();
      }
    });

    card.innerHTML = `
      <div class="product-card__image">
        ${image
          ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(displayName)}" decoding="async"${globalIdx >= 8 ? ' loading="lazy"' : ''}>`
          : `<div class="product-card__image-placeholder">No image</div>`
        }
        ${Favs.badge(p)}
        ${p.qc ? `<span class="product-card__photos" role="button" tabindex="0" aria-label="${escapeAttr(t('See real photos'))}">${GALLERY_ICON}<span>${escapeHTML(t('Photos'))}</span></span>` : ''}
      </div>
      <div class="product-card__info">
        <h3 class="product-card__name" data-tooltip="${escapeAttr(displayName)}">${escapeHTML(displayName)}</h3>
        <div class="product-card__row">
          ${price ? `<span class="product-card__price">${escapeHTML(price)}</span>` : ''}
          ${window.CardStyles ? CardStyles.html(p) : ''}
        </div>
      </div>
    `;

    fragment.appendChild(card);
    newCards.push(card);
  });

  grid.appendChild(fragment);
  displayedCount += batch.length;

  newCards.forEach((el, i) => {
    if (batchStart > 0 && el.getBoundingClientRect().top < window.innerHeight) {
      el.style.transitionDelay = '0ms';
      el.classList.add('is-visible');
    } else {
      fadeObserver.observe(el);
    }
    if (batchStart + i >= 8) preloadObserver.observe(el);
    if (window.CardStyles) CardStyles.observe(el);
  });

  if (displayedCount < visibleProducts.length) {
    grid.after(sentinel);
    infiniteScrollObserver.observe(sentinel);
  }
}

// ─── Helpers ─────────────────────────────────────
function cloudinaryOptimize(url) {
  if (!url) return url;
  if (url.includes('res.cloudinary.com')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_400/');
  }
  if (url.includes('b-cdn.net')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}width=400&quality=75&format=auto`;
  }
  return url;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Analytics (GA4) ────────────────────────────
function gaEvent(name, params) {
  if (typeof gtag === 'function') gtag('event', name, { transport_type: 'beacon', ...(params || {}) });
}

document.querySelectorAll('.nav__cta, .btn--primary').forEach(el => {
  el.addEventListener('click', () => gaEvent('click_signup'));
});

// Men / Women links on phones and tablets (hero switch, first link of the tabs row): are they used?
document.querySelectorAll('[data-gender-link]').forEach(el => {
  el.addEventListener('click', () => gaEvent('click_gender_switch', {
    to: /women/.test(el.getAttribute('href')) ? 'women' : 'men',
    from: el.dataset.genderLink,
  }));
});

document.querySelectorAll('.nav__link--discord').forEach(el => {
  el.addEventListener('click', () => gaEvent('click_discord'));
});

document.querySelectorAll('a[href="#how-to-order"]').forEach(el => {
  el.addEventListener('click', () => gaEvent('click_how_to_order'));
});

// ─── FAQ Accordion ───────────────────────────────
document.querySelectorAll('.faq-item__q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item    = btn.closest('.faq-item');
    const isOpen  = item.classList.contains('is-open');

    document.querySelectorAll('.faq-item.is-open').forEach(open => open.classList.remove('is-open'));

    if (!isOpen) item.classList.add('is-open');
  });
});

const GALLERY_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="14" height="14" rx="2.5"/><path d="M3 7.5V18a3 3 0 0 0 3 3h10.5"/><circle cx="11.5" cy="7.5" r="1.5"/><path d="m21 13-3.2-3.2a1.5 1.5 0 0 0-2.1 0L10 15.5"/></svg>';
grid.addEventListener('keydown', e => {
  const fav = e.target.closest('.product-card__fav');
  if (fav && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    Favs.toggle(fav.dataset.fav);
    return;
  }
  const style = e.target.closest('.card-style, .card-styles__more');
  if (style && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    const card = style.closest('.product-card');
    if (card && card._product && window.RealPhotos) { card.classList.add('is-held'); RealPhotos.open(card._product.id, { style: +style.dataset.style }); }
    return;
  }
  const badge = e.target.closest('.product-card__photos');
  if (!badge || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  const card = badge.closest('.product-card');
  if (card && card._product && window.RealPhotos) { card.classList.add('is-held'); RealPhotos.open(card._product.id, { tab: 'qc' }); }
});

// ─── Football minimum spend, in the visitor's currency ─
// <bdi>: the amount keeps its Latin order inside Arabic text
function renderFootballMinimum() {
  const amount = `<bdi>${Prices.formatMinimum(Prices.FOOTBALL_MIN_EUR)}</bdi>`;
  const text = t('Minimum order for football items: <strong>{amount}</strong>').replace('{amount}', amount);
  document.getElementById('footballNoticeTitle').innerHTML = text;
  document.getElementById('jerseyPopupText').innerHTML = text;   // same sentence in the "Before you go" popup
}
renderFootballMinimum();

// ─── Language / currency switch (no reload) ─────
document.addEventListener('localechange', () => {
  renderFootballMinimum();
  allProducts.forEach(p => { p.price = Prices.format(p.cny); });
  grid.querySelectorAll('.product-card').forEach(card => {
    const priceEl = card.querySelector('.product-card__price');
    if (priceEl && card._product) priceEl.textContent = card._product.price;
  });
  generateFilterDropdown();   // chips + Category menu labels
  if (!emptyState.hidden && allProducts.length) showEmptyState();
});

// ─── Tooltip ─────────────────────────────────────
const tooltip = document.createElement('div');
tooltip.className = 'product-tooltip';
document.body.appendChild(tooltip);

let tooltipTimer = null;

document.addEventListener('mouseover', e => {
  const el = e.target.closest('.product-card__name');
  if (!el || !el.dataset.tooltip) return;
  if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
  tooltipTimer = setTimeout(() => {
    tooltip.textContent = el.dataset.tooltip;
    tooltip.style.opacity = '1';
  }, 600);
});

document.addEventListener('mousemove', e => {
  if (tooltip.style.opacity !== '1') return;
  tooltip.style.left = (e.clientX + 12) + 'px';
  tooltip.style.top  = (e.clientY - 28) + 'px';
});

document.addEventListener('mouseout', e => {
  if (!e.target.closest('.product-card__name')) return;
  clearTimeout(tooltipTimer);
  tooltip.style.opacity = '0';
});

// ─── Jersey Popup ────────────────────────────────
// Shown once, then not again for a day (remembered in the browser)
const JERSEY_POPUP_KEY  = 'jerseyPopupSeen';
const JERSEY_POPUP_DAYS = 1;
let jerseyPopupDismissed = false;
try {
  const seen = Number(localStorage.getItem(JERSEY_POPUP_KEY));
  jerseyPopupDismissed = seen > 0 && Date.now() - seen < JERSEY_POPUP_DAYS * 864e5;
} catch (e) {}

function rememberJerseyPopup() {
  jerseyPopupDismissed = true;
  try { localStorage.setItem(JERSEY_POPUP_KEY, String(Date.now())); } catch (e) {}
}

function closeJerseyPopup() {
  document.getElementById('jerseyPopup').hidden = true;
}

document.getElementById('jerseyPopupCancel').addEventListener('click', closeJerseyPopup);
document.getElementById('jerseyPopupConfirm').addEventListener('click', closeJerseyPopup);
document.getElementById('jerseyPopup').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeJerseyPopup();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('jerseyPopup').hidden) closeJerseyPopup();
});

// ─── Init ────────────────────────────────────────
loadProducts();
