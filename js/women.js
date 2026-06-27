/* ==============================================
   LOVEGOBUY FINDS — Women Script
   Data: Google Sheets via JSONP (gviz/tq)
   Sheet columns: NAME | BRAND | ARTICLE | PRICE | IMAGE | LIEN
============================================== */

const SHEET_ID_WOMEN = '1yVRRCiO-uM56SoLhqIUzigH1Nvi2WwNZcAI7DVYhy1A';

const CATEGORY_MAP = {
  'best-sellers': ['best seller', 'bestseller', 'best-seller'],
  summer:      ['cap', 'casquette', 'hat', 'short', 'shorts', 'slide', 'slides', 'claquette', 'claquettes'],
  tops:        ['hoodie', 'sweatshirt', 't-shirt', 'tshirt', 'shirt', 'polo', 'top', 'sweater', 'pull', 'crop', 'blouse', 'chemise'],
  winter:      ['puffer', 'jacket', 'coat', 'veste', 'manteau', 'doudoune', 'blouson', 'bomber', 'windbreaker'],
  pants:       ['jean', 'jeans', 'pantalon', 'cargo', 'jogger', 'jogging', 'legging', 'pants', 'skirt', 'jupe'],
  accessories: ['bag', 'sac', 'belt', 'beanie', 'wallet', 'sock', 'accessoire'],
};

let allProducts        = [];
let currentCategoryTab = 'all';
let selectedFilters    = new Set();
let searchQuery        = '';
let sortOrder          = null;
const PAGE_SIZE        = 30;
let visibleProducts    = [];
let displayedCount     = 0;

const nav          = document.getElementById('nav');
const grid         = document.getElementById('productsGrid');
const loading      = document.getElementById('loading');
const emptyState   = document.getElementById('emptyState');
const countEl      = document.getElementById('collectionCount') || { textContent: '' };
const searchInput  = document.getElementById('searchInput');
const filterDropdown = document.getElementById('filterDropdown');
const sortBtn      = document.getElementById('sortBtn');
const backToTop    = document.getElementById('backToTop');

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

window.addEventListener('scroll', () => {
  nav.classList.toggle('is-scrolled', window.scrollY > 20);
  if (backToTop) backToTop.classList.toggle('is-visible', window.scrollY > 600);
}, { passive: true });

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

document.querySelectorAll('.cat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const chosen = tab.dataset.cat;
    if (chosen === currentCategoryTab) return;

    currentCategoryTab = chosen;
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('is-active'));
    tab.classList.add('is-active');

    selectedFilters.clear();
    searchQuery = '';
    searchInput.value = '';
    sortOrder = null;
    sortBtn.classList.remove('is-asc', 'is-desc');
    sortBtn.querySelector('.toolbar__sort-chevron').textContent = '↕';
    gaEvent('click_category', { category: chosen });
    applyFilters();
  });
});

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.toLowerCase().trim();
  applyFilters();
});

sortBtn.addEventListener('click', () => {
  const chevron = sortBtn.querySelector('.toolbar__sort-chevron');
  if (sortOrder === null) {
    sortOrder = 'asc';
    sortBtn.classList.add('is-asc');
    sortBtn.classList.remove('is-desc');
    chevron.textContent = '↓';
  } else if (sortOrder === 'asc') {
    sortOrder = 'desc';
    sortBtn.classList.remove('is-asc');
    sortBtn.classList.add('is-desc');
    chevron.textContent = '↓';
  } else {
    sortOrder = null;
    sortBtn.classList.remove('is-asc', 'is-desc');
    chevron.textContent = '↕';
  }
  applyFilters();
});

const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

const preloadObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target.querySelector('img[loading="lazy"]');
      if (img) img.removeAttribute('loading');
      preloadObserver.unobserve(entry.target);
    }
  });
}, { rootMargin: '1200px 0px', threshold: 0 });

const sentinel = document.createElement('div');
sentinel.className = 'products-sentinel';

const infiniteScrollObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    infiniteScrollObserver.unobserve(sentinel);
    appendNextBatch();
  }
}, { rootMargin: '400px 0px' });

function fetchSheetJSONP(sheetID) {
  return new Promise((resolve, reject) => {
    const cbName = '__gviz_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const url = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq`
      + `?tqx=out:json;responseHandler:${cbName}`;

    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = data => { cleanup(); resolve(data); };

    const script = document.createElement('script');
    script.src = url;
    script.onerror = () => { cleanup(); reject(new Error('Script error')); };
    document.head.appendChild(script);
  });
}

function parseSheetData(data) {
  if (!data?.table?.rows || !data?.table?.cols) return [];

  const cols = data.table.cols.map(c => (c.label || '').toLowerCase().trim());
  const find = (...keywords) => cols.findIndex(c => keywords.some(k => c.includes(k)));

  const idx = {
    name:          find('nom', 'name', 'titre', 'title', 'article'),
    brand:         find('brand', 'marque'),
    article:       find('type', 'catégor', 'categor'),
    price:         find('prix', 'price'),
    imageDetoured: find('détouré', 'detouré', 'detour', 'cloudinary'),
    image:         cols.findIndex(c => (c.includes('photo') || c.includes('image') || c.includes('img')) && !c.includes('détouré') && !c.includes('detouré') && !c.includes('cloudinary')),
    lien:          find('lien', 'link', 'url', 'produit'),
    bestSeller:    find('best seller', 'bestseller', 'best-seller'),
  };

  if (idx.name    < 0) idx.name    = 0;
  if (idx.article < 0) idx.article = 2;
  if (idx.price   < 0) idx.price   = 3;
  if (idx.image   < 0) idx.image   = 4;
  if (idx.lien    < 0) idx.lien    = 5;

  return data.table.rows
    .filter(row => row?.c)
    .map(row => {
      const cell = i => {
        const c = row.c[i];
        if (!c) return '';
        return String(c.f != null ? c.f : (c.v != null ? c.v : '')).trim();
      };
      return {
        name:          cell(idx.name),
        brand:         idx.brand >= 0 ? cell(idx.brand) : '',
        article:       cell(idx.article),
        price:         cell(idx.price),
        image:         cell(idx.image),
        imageDetoured: idx.imageDetoured >= 0 ? cell(idx.imageDetoured) : '',
        lien:          cell(idx.lien),
        isBestSeller:  idx.bestSeller >= 0 && cell(idx.bestSeller).toLowerCase().includes('best seller'),
      };
    })
    .filter(p => p.name);
}

function parsePrice(priceStr) {
  if (!priceStr) return null;
  let s = priceStr.replace(/[€$£¥₹]|EUR|USD|GBP/gi, '').trim();
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  s = s.replace(/[^\d.]/g, '');
  const val = parseFloat(s);
  return isNaN(val) ? null : val;
}

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
  ['casquette','cap','hat','gorra'],
  ['bonnet','beanie','gorro'],
  ['sac','bag','bolso','tasche','borsa'],
  ['ceinture','belt','cinturón','gürtel','cintura'],
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

function expandSearchTerms(query) {
  const rawWords  = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const normWords = rawWords.map(normalizeTerm);
  const expanded  = new Set(normWords);
  rawWords.forEach((word, i) => {
    const synonyms = SYNONYM_MAP.get(word) || SYNONYM_MAP.get(normWords[i]);
    if (synonyms) synonyms.forEach(s => expanded.add(normalizeTerm(s)));
  });
  return [...expanded];
}

async function loadProducts() {
  loading.style.display = 'block';
  emptyState.hidden = true;
  grid.innerHTML = '';

  try {
    const womenData = await fetchSheetJSONP(SHEET_ID_WOMEN);
    allProducts = parseSheetData(womenData);

    loading.style.display = 'none';
    generateFilterDropdown();
    applyFilters();

  } catch (err) {
    console.error('[Lovegobuy Finds] Failed to load products:', err);
    loading.style.display = 'none';
    emptyState.hidden = false;
    countEl.textContent = '— Error loading items';
  }
}

function generateFilterDropdown() {
  filterDropdown.innerHTML = '';

  const categoryCounts = {};
  allProducts.forEach(p => {
    const cat = (p.article || '').toLowerCase().trim();
    if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

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

  const validCategories = Object.entries(categoryCounts)
    .filter(([, count]) => count >= 3)
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

  const filterBtn = document.getElementById('filterBtn');
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

function applyFilters() {
  let filtered = allProducts;

  if (currentCategoryTab === 'best-sellers') {
    filtered = filtered.filter(p => p.isBestSeller);
  } else if (currentCategoryTab !== 'all') {
    const keywords = CATEGORY_MAP[currentCategoryTab] || [];
    filtered = filtered.filter(p => {
      const art = (p.article || '').toLowerCase().trim();
      return keywords.some(k => art.includes(k));
    });
  }

  if (selectedFilters.size > 0) {
    filtered = filtered.filter(p =>
      selectedFilters.has((p.article || '').toLowerCase().trim())
    );
  }

  if (searchQuery) {
    const terms        = expandSearchTerms(searchQuery);
    const normQuery    = normalizeBrand(searchQuery);
    const queryCompact = normQuery.replace(/\s+/g, '');

    filtered = filtered.filter(p => {
      const name         = normalizeTerm(p.name);
      const brand        = normalizeBrand(p.brand);
      const brandCompact = brand.replace(/\s+/g, '');
      const queryWords   = normQuery.split(/\s+/).filter(w => w.length >= 2);

      const brandMatch = queryWords.length > 0 && (
        queryWords.every(w => brand.includes(w)) ||
        (queryCompact.length >= 2 && brandCompact.includes(queryCompact))
      );

      const meaningfulTerms = terms.filter(t => t.length >= 3);
      const termMatch = meaningfulTerms.some(t => name.includes(t));

      return brandMatch || termMatch;
    });
  }

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

function renderProducts(products) {
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
    const brand   = p.brand   || '';
    const price   = p.price   || '';
    const image   = cloudinaryOptimize(
      (p.imageDetoured && p.imageDetoured.toUpperCase() !== 'SKIP')
        ? p.imageDetoured
        : (p.image || '')
    );
    const link = p.lien || '';

    const card = link ? document.createElement('a') : document.createElement('article');
    card.className = 'product-card fade-in';
    card.style.transitionDelay = `${((batchStart + i) % numColumns) * 60}ms`;

    if (link) {
      card.href   = link;
      card.target = '_blank';
      card.rel    = 'noopener noreferrer';
    }

    card.addEventListener('click', e => {
      if (_docScrolled) { e.preventDefault(); return; }
      gaEvent('click_product', { item_name: name, price, item_type: p.article });
    });

    card.innerHTML = `
      <div class="product-card__image">
        ${image
          ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" decoding="async"${globalIdx >= 8 ? ' loading="lazy"' : ''}>`
          : `<div class="product-card__image-placeholder">No image</div>`
        }
      </div>
      <div class="product-card__info">
        <h3 class="product-card__name" data-tooltip="${escapeAttr(name)}">${escapeHTML(name)}</h3>
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
      el.style.transitionDelay = '0ms';
      el.classList.add('is-visible');
    } else {
      fadeObserver.observe(el);
    }
    if (batchStart + i >= 8) preloadObserver.observe(el);
  });

  if (displayedCount < visibleProducts.length) {
    grid.after(sentinel);
    infiniteScrollObserver.observe(sentinel);
  }
}

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

function gaEvent(name, params) {
  if (typeof gtag === 'function') gtag('event', name, { transport_type: 'beacon', ...(params || {}) });
}

document.querySelectorAll('.nav__cta, .btn--primary').forEach(el => {
  el.addEventListener('click', () => gaEvent('click_signup'));
});

// ─── Tooltip ─────────────────────────────────────
const tooltip = document.createElement('div');
tooltip.className = 'product-tooltip';
document.body.appendChild(tooltip);

let tooltipTimer = null;

document.addEventListener('mouseover', e => {
  const el = e.target.closest('.product-card__name');
  if (!el || !el.dataset.tooltip) return;
  if (el.scrollWidth <= el.clientWidth) return;
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

setTimeout(loadProducts, 800);
