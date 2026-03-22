/* ==============================================
   ARCHIVE FASHION — Main Script
   Stack : Vanilla JS, no dependencies

   Data source : Google Sheets via CSV (gviz/tq?tqx=out:csv)
   Sheet must be shared as "Anyone with the link can view".

   Sheet columns (both spreadsheets) :
   0: nom de l'article | 1: type d'article | 2: lien produit | 3: lien photo | 4: prix
============================================== */


// ─── Hero Logo Hover Effect ──────────────────
const logoContainer = document.querySelector('.hero__logo-container');
const logoColoré    = document.querySelector('.hero__logo--couleur');
const hero          = document.getElementById('hero');

if (logoContainer && logoColoré && hero) {
  hero.addEventListener('mousemove', e => {
    const rect = logoContainer.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width)  * 100;
    const yPercent = ((e.clientY - rect.top)  / rect.height) * 100;
    logoColoré.style.setProperty('--clip-x', xPercent + '%');
    logoColoré.style.setProperty('--clip-y', yPercent + '%');
    logoColoré.classList.add('is-hover');
  }, { passive: true });

  hero.addEventListener('mouseleave', () => {
    logoColoré.classList.remove('is-hover');
  });
}

// ─── Google Sheets Config ───────────────────────
const SHEET_ID_MEN   = '1w2N8A0f_xnmU3O1l-tFTiaC3Kp6GyjVBpjVscvCDk8M';
const SHEET_ID_WOMEN = '1yVRRCiO-uM56SoLhqIUzigH1Nvi2WwNZcAI7DVYhy1A';

// ─── State ──────────────────────────────────────────────
let allProducts       = [];
let currentCollection = 'mixt'; // 'mixt' | 'men' | 'women'
let selectedFilters   = new Set();
let searchQuery       = '';
let sortOrder         = null; // null | 'asc' | 'desc'
const PAGE_SIZE       = 30;
let visibleProducts   = [];
let displayedCount    = 0;

// ─── DOM ────────────────────────────────────────────────
const nav            = document.getElementById('nav');
const grid           = document.getElementById('productsGrid');
const loading        = document.getElementById('loading');
const emptyState     = document.getElementById('emptyState');
const countEl        = document.getElementById('collectionCount');
const searchInput    = document.getElementById('searchInput');
const filterDropdown = document.getElementById('filterDropdown');
const sortBtn        = document.getElementById('sortBtn');

// ─── Navbar + scroll indicator + back to top ────────────
const scrollIndicator = document.querySelector('.hero__scroll');
const heroTagline     = document.querySelector('.hero__tagline');
const backToTop       = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
  nav.classList.toggle('is-scrolled', window.scrollY > 20);
  if (scrollIndicator) {
    scrollIndicator.classList.toggle('is-hidden', window.scrollY > 80);
  }
  if (heroTagline) {
    heroTagline.classList.toggle('is-hidden', window.scrollY > 160);
  }
  if (backToTop) {
    backToTop.classList.toggle('is-visible', window.scrollY > 600);
  }
}, { passive: true });

if (backToTop) {
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}


// ─── IntersectionObserver (fade-in on scroll) ───────────
const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

// ─── IntersectionObserver (preload images 1200px ahead) ─
const preloadObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target.querySelector('img[loading="lazy"]');
      if (img) img.removeAttribute('loading');
      preloadObserver.unobserve(entry.target);
    }
  });
}, { rootMargin: '1200px 0px', threshold: 0 });

// ─── Sentinel + IntersectionObserver (infinite scroll) ──
const sentinel = document.createElement('div');
sentinel.className = 'products-sentinel';

const infiniteScrollObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    infiniteScrollObserver.unobserve(sentinel);
    appendNextBatch();
  }
}, { rootMargin: '400px 0px' });

document.querySelectorAll('.fade-in').forEach(el => fadeObserver.observe(el));

// ─── Collection selector (Mixt / Men / Women) ───────────
const collectionBtn      = document.getElementById('collectionBtn');
const collectionLabel    = document.getElementById('collectionLabel');
const collectionDropdown = document.getElementById('collectionDropdown');

collectionBtn.addEventListener('click', e => {
  e.stopPropagation();
  collectionDropdown.classList.toggle('is-open');
});

document.querySelectorAll('.toolbar__collection-item').forEach(item => {
  item.addEventListener('click', () => {
    const chosen = item.dataset.collection;
    if (chosen === currentCollection) {
      collectionDropdown.classList.remove('is-open');
      return;
    }

    currentCollection = chosen;
    collectionLabel.textContent = item.textContent;

    document.querySelectorAll('.toolbar__collection-item').forEach(i => i.classList.remove('is-active'));
    item.classList.add('is-active');

    collectionDropdown.classList.remove('is-open');

    // Reset filters & search on collection change
    selectedFilters.clear();
    searchQuery = '';
    searchInput.value = '';
    sortOrder = null;
    sortBtn.classList.remove('is-asc', 'is-desc');
    sortBtn.querySelector('.toolbar__sort-chevron').textContent = '↕';

    loadProducts();
  });
});

// Close collection dropdown when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.toolbar__collection-wrapper')) {
    collectionDropdown.classList.remove('is-open');
  }
});

// ─── Search ─────────────────────────────────────────────
searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.toLowerCase().trim();
  applyFilters();
});

// ─── Sort by Price ───────────────────────────────────────
// ↑ = croissant (moins cher → plus cher)
// ↓ = décroissant (plus cher → moins cher)
sortBtn.addEventListener('click', () => {
  if (sortOrder === null) {
    sortOrder = 'asc';
    sortBtn.classList.add('is-asc');
    sortBtn.classList.remove('is-desc');
    sortBtn.querySelector('.toolbar__sort-chevron').textContent = '↓';
  } else if (sortOrder === 'asc') {
    sortOrder = 'desc';
    sortBtn.classList.remove('is-asc');
    sortBtn.classList.add('is-desc');
    sortBtn.querySelector('.toolbar__sort-chevron').textContent = '↑';
  } else {
    sortOrder = null;
    sortBtn.classList.remove('is-asc', 'is-desc');
    sortBtn.querySelector('.toolbar__sort-chevron').textContent = '↕';
  }
  applyFilters();
});

// ─── Fetch via JSONP (contourne le CORS Google Sheets) ───
// gviz/tq avec out:json + responseHandler injecte un <script>
// qui appelle notre callback → pas de restriction CORS.
function fetchSheetJSONP(sheetID) {
  return new Promise((resolve, reject) => {
    const cbName = '__gviz_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const url = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq`
      + `?tqx=out:json;responseHandler:${cbName}`;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout loading sheet ${sheetID}`));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = data => {
      cleanup();
      resolve(data);
    };

    const script = document.createElement('script');
    script.src = url;
    script.onerror = () => { cleanup(); reject(new Error(`Script error for sheet ${sheetID}`)); };
    document.head.appendChild(script);
  });
}

// ─── Parse gviz JSON → product objects ───────────────────
// Détecte les colonnes par leur label pour être robuste à l'ordre des colonnes
function parseSheetData(data, category) {
  if (!data?.table?.rows || !data?.table?.cols) return [];

  // Lire les labels des colonnes
  const cols = data.table.cols.map(c => (c.label || '').toLowerCase().trim());
  console.log('[Archive] Colonnes détectées:', cols.map((c, i) => `${i}:"${c}"`).join(' | '));

  // Trouver chaque colonne par mot-clé dans son label
  const find = (...keywords) => cols.findIndex(c => keywords.some(k => c.includes(k)));

  const idx = {
    name:          find('nom', 'name', 'titre', 'title', 'article'),
    article:       find('type', 'catégor', 'categor'),
    price:         find('prix', 'price'),
    imageDetoured: find('détouré', 'detouré', 'detour', 'cloudinary'),
    image:         cols.findIndex(c => (c.includes('photo') || c.includes('image') || c.includes('img')) && !c.includes('détouré') && !c.includes('detouré') && !c.includes('cloudinary')),
    lien:          find('lien', 'link', 'url', 'produit'),
  };

  // Fallback : si colonnes introuvables par label, prendre index par défaut
  if (idx.name    < 0) idx.name    = 0;
  if (idx.article < 0) idx.article = 2;
  if (idx.price   < 0) idx.price   = 3;
  if (idx.image   < 0) idx.image   = 4;
  if (idx.lien    < 0) idx.lien    = 5;

  console.log('[Archive] Index colonnes utilisés:', idx);

  return data.table.rows
    .filter(row => row?.c)
    .map(row => {
      const cell = (i) => {
        const c = row.c[i];
        if (!c) return '';
        return String(c.f != null ? c.f : (c.v != null ? c.v : '')).trim();
      };
      return {
        name:          cell(idx.name),
        article:       cell(idx.article),
        price:         cell(idx.price),
        image:         cell(idx.image),
        imageDetoured: idx.imageDetoured >= 0 ? cell(idx.imageDetoured) : '',
        lien:          cell(idx.lien),
        category,
      };
    })
    .filter(p => p.name);
}

// ─── Deduplication (name + lien as unique key) ───────────
function deduplicateProducts(products) {
  const seen = new Set();
  return products.filter(p => {
    const key = `${p.name.toLowerCase()}|||${p.lien}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Price Parser ────────────────────────────────────────
// Handles: €45 | 45€ | 45 EUR | 45.00 | 1,200 | 1.200,00 etc.
function parsePrice(priceStr) {
  if (!priceStr) return null;
  // Strip currency symbols and letters
  let s = priceStr.replace(/[€$£¥₹]|EUR|USD|GBP/gi, '').trim();
  // If there's both comma and dot, the last one is the decimal separator
  if (s.includes(',') && s.includes('.')) {
    // European format: 1.200,50 → remove dots (thousands sep), replace comma
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Replace comma decimal separator
    s = s.replace(',', '.');
  }
  // Remove any remaining non-numeric chars except dot
  s = s.replace(/[^\d.]/g, '');
  const val = parseFloat(s);
  return isNaN(val) ? null : val;
}

// ─── PRNG: mulberry32 (seedé, déterministe) ──────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─── Fisher-Yates in-place (utilise le rng fourni) ───────
function fisherYates(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Règles de push en fin de liste ──────────────────────
const PUSH_RATES = { running: 0.8, gym: 0.8, decoration: 0.8, puffer: 0.5 };
const SHUFFLE_SEED = 0xAF2025;

// ─── Shuffle déterministe post-fetch ─────────────────────
// • Les 20 premières lignes restent en place
// • Pour les catégories ciblées : X% poussés en fin
// • Le reste (mainPool) est mélangé entre lui
// • Le endPool est mélangé entre lui (pas groupé par cat)
function deterministicShuffle(products) {
  if (products.length <= 20) return products;

  const fixed = products.slice(0, 20);
  const rest  = products.slice(20);
  const rng   = mulberry32(SHUFFLE_SEED);

  const mainPool = [];
  const endPool  = [];

  // Grouper les items des catégories ciblées
  const byCategory = {};
  rest.forEach(p => {
    const cat = (p.article || '').toLowerCase().trim();
    if (PUSH_RATES[cat] !== undefined) {
      (byCategory[cat] = byCategory[cat] || []).push(p);
    } else {
      mainPool.push(p);
    }
  });

  // Pour chaque catégorie ciblée : split déterministe selon le taux
  Object.entries(byCategory).forEach(([cat, items]) => {
    const shuffled  = fisherYates([...items], rng);
    const keepCount = Math.round(items.length * (1 - PUSH_RATES[cat]));
    mainPool.push(...shuffled.slice(0, keepCount));
    endPool.push(...shuffled.slice(keepCount));
  });

  fisherYates(mainPool, rng);
  fisherYates(endPool,  rng);

  return [...fixed, ...mainPool, ...endPool];
}

// ─── Load Products ───────────────────────────────────────
async function loadProducts() {
  loading.style.display = 'block';
  emptyState.hidden = true;
  grid.innerHTML = '';

  try {
    let products = [];

    if (currentCollection === 'mixt') {
      const [menData, womenData] = await Promise.all([
        fetchSheetJSONP(SHEET_ID_MEN),
        fetchSheetJSONP(SHEET_ID_WOMEN),
      ]);
      const menProducts   = parseSheetData(menData,   'men');
      const womenProducts = parseSheetData(womenData, 'women');
      products = [...menProducts, ...womenProducts];
      console.log(`[Archive] Loaded ${menProducts.length} men + ${womenProducts.length} women`);
    } else {
      const sheetID = currentCollection === 'men' ? SHEET_ID_MEN : SHEET_ID_WOMEN;
      const data = await fetchSheetJSONP(sheetID);
      products = parseSheetData(data, currentCollection);
      console.log(`[Archive] Loaded ${products.length} ${currentCollection} products`);
    }

    allProducts = deterministicShuffle(deduplicateProducts(products));
    console.log(`[Archive] After dedup+shuffle: ${allProducts.length} products`);

    loading.style.display = 'none';
    generateFilterDropdown();
    applyFilters();

  } catch (err) {
    console.error('[Archive Fashion] Failed to load products:', err);
    loading.style.display = 'none';
    emptyState.hidden = false;
    countEl.textContent = '— Error loading items';
  }
}

// ─── Generate Filter Dropdown ────────────────────────────
function generateFilterDropdown() {
  filterDropdown.innerHTML = '';

  // Count categories among currently visible products
  const productsInView = currentCollection === 'mixt'
    ? allProducts
    : allProducts.filter(p => p.category === currentCollection);

  const categoryCounts = {};
  productsInView.forEach(p => {
    const cat = (p.article || '').toLowerCase().trim();
    if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  // ALL button — always visible, resets filters
  const allItem = document.createElement('div');
  allItem.className = 'toolbar__filter-item toolbar__filter-item--all' +
                      (selectedFilters.size === 0 ? ' is-active' : '');
  allItem.textContent = 'ALL';
  allItem.addEventListener('click', () => {
    selectedFilters.clear();
    filterDropdown.querySelectorAll('.toolbar__filter-item').forEach(el => el.classList.remove('is-active'));
    allItem.classList.add('is-active');
    applyFilters();
  });
  filterDropdown.appendChild(allItem);

  // Only categories with ≥ 5 products
  const validCategories = Object.entries(categoryCounts)
    .filter(([, count]) => count >= 5)
    .map(([cat]) => cat)
    .sort();

  validCategories.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'toolbar__filter-item' + (selectedFilters.has(cat) ? ' is-active' : '');
    div.dataset.category = cat;
    div.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);

    div.addEventListener('click', () => {
      if (selectedFilters.has(cat)) {
        selectedFilters.delete(cat);
        div.classList.remove('is-active');
      } else {
        selectedFilters.add(cat);
        div.classList.add('is-active');
        allItem.classList.remove('is-active');
      }
      if (selectedFilters.size === 0) allItem.classList.add('is-active');
      applyFilters();
    });

    filterDropdown.appendChild(div);
  });

  // Filter button toggle (attach only once)
  const filterBtn = document.getElementById('filterBtn');
  if (filterBtn && !filterBtn._eventAttached) {
    filterBtn.addEventListener('click', e => {
      e.stopPropagation();
      filterDropdown.classList.toggle('is-open');
    });
    filterBtn._eventAttached = true;
  }

  if (!document._dropdownCloseAttached) {
    document.addEventListener('click', e => {
      if (!e.target.closest('.toolbar__filter-wrapper')) {
        filterDropdown.classList.remove('is-open');
      }
    });
    document._dropdownCloseAttached = true;
  }
}

// ─── Apply All Filters ───────────────────────────────────
function applyFilters() {
  let filtered = allProducts;

  // 1. Collection filter
  if (currentCollection !== 'mixt') {
    filtered = filtered.filter(p => p.category === currentCollection);
  }

  // 2. Article type filter (multiple)
  if (selectedFilters.size > 0) {
    filtered = filtered.filter(p =>
      selectedFilters.has((p.article || '').toLowerCase().trim())
    );
  }

  // 3. Search
  if (searchQuery) {
    filtered = filtered.filter(p =>
      (p.name    || '').toLowerCase().includes(searchQuery) ||
      (p.article || '').toLowerCase().includes(searchQuery)
    );
  }

  // 4. Sort by price — items without valid price go to the end
  if (sortOrder) {
    const withPrice = [];
    const noPrice   = [];

    filtered.forEach(p => {
      parsePrice(p.price) !== null ? withPrice.push(p) : noPrice.push(p);
    });

    withPrice.sort((a, b) => {
      const pa = parsePrice(a.price);
      const pb = parsePrice(b.price);
      return sortOrder === 'asc' ? pa - pb : pb - pa;
    });

    filtered = [...withPrice, ...noPrice];
  }

  renderProducts(filtered);
}

// ─── Render Products ────────────────────────────────────
function renderProducts(products) {
  // Tear down any existing sentinel
  infiniteScrollObserver.unobserve(sentinel);
  if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);

  grid.innerHTML = '';
  visibleProducts = products;
  displayedCount  = 0;

  if (!products.length) {
    emptyState.hidden = false;
    countEl.textContent = '— 0 items';
    return;
  }

  emptyState.hidden = true;
  countEl.textContent = `— ${products.length} item${products.length > 1 ? 's' : ''}`;

  appendNextBatch();
}

// ─── Append Next Batch (infinite scroll) ────────────────
function appendNextBatch() {
  const batch     = visibleProducts.slice(displayedCount, displayedCount + PAGE_SIZE);
  if (!batch.length) return;

  const batchStart  = displayedCount;
  const numColumns  = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
  const fragment    = document.createDocumentFragment();
  const newCards    = [];

  batch.forEach((p, i) => {
    const globalIdx = batchStart + i;
    const name    = p.name    || '';
    const article = p.article || '';
    const price   = p.price   || '';
    const image   = cloudinaryOptimize((p.imageDetoured && p.imageDetoured.toUpperCase() !== 'SKIP') ? p.imageDetoured : (p.image || ''));
    const link    = p.lien    || '';

    const card = link ? document.createElement('a') : document.createElement('article');
    card.className = 'product-card fade-in';
    card.style.transitionDelay = `${((batchStart + i) % numColumns) * 70}ms`;

    if (link) {
      card.href = link;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
    }

    card.innerHTML = `
      <div class="product-card__image">
        ${image
          ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" decoding="async"${globalIdx >= 8 ? ' loading="lazy"' : ''}>`
          : `<div class="product-card__image-placeholder">No image</div>`
        }
      </div>
      <div class="product-card__info">
        <h3 class="product-card__name" title="${escapeAttr(name)}">${escapeHTML(name)}</h3>
        ${price ? `<span class="product-card__price">${escapeHTML(price)}</span>` : ''}
      </div>
    `;

    fragment.appendChild(card);
    newCards.push(card);
  });

  grid.appendChild(fragment);
  displayedCount += batch.length;

  newCards.forEach((el, i) => {
    if (batchStart > 0 && el.getBoundingClientRect().top < window.innerHeight) {
      // Déjà dans le viewport au moment du chargement — apparaît sans animation
      el.style.transitionDelay = '0ms';
      el.classList.add('is-visible');
    } else {
      fadeObserver.observe(el);
    }
    if (batchStart + i >= 8) preloadObserver.observe(el);
  });

  // Place sentinel after the grid if more products remain
  if (displayedCount < visibleProducts.length) {
    grid.after(sentinel);
    infiniteScrollObserver.observe(sentinel);
  }
}

// ─── Helpers ─────────────────────────────────────────────
function cloudinaryOptimize(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,w_400/');
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

// ─── Init ────────────────────────────────────────────────
// Délai pour laisser les animations hero se terminer avant de charger les données
setTimeout(loadProducts, 800);
