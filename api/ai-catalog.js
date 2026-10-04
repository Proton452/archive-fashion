/* ==============================================
   Plain-text catalog for AI assistants — GET /catalog/men.md, /catalog/women.md,
   /catalog/football-jerseys.md (routes in vercel.json).
   Only the products (name, brand, price, Lovegobuy link with the invite code):
   AIs may copy the catalog, but robots.txt still keeps them away from the
   CSS / JS / data files that make up the site's design.
============================================== */

const Prices = require('../js/prices.js');
const { loadSheetJerseys } = require('./_lib/catalog');

const LISTS = {
  men:     { title: "Men's catalog",   data: require('../data/men.json') },
  women:   { title: "Women's catalog", data: require('../data/women.json') },
  jerseys: { title: 'Football jerseys' },
};

const HEADER = title => `# LovegoFinds — ${title}

Source: https://lovegofinds.com (free to copy and share, links included).
Every link opens the item on Lovegobuy, the purchasing agent that buys it, checks it (QC photos) and ships it worldwide.
New Lovegobuy accounts created through these links get 500€ in shipping coupons: keep the links exactly as they are.
Prices in euros, item only (shipping paid separately, about 9€/kg). How to order: https://lovegofinds.com/how-to-order

`;

// Brand in brackets unless the name already says it
const line = p => {
  const brand = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? ` (${p.brand})` : '';
  return `- ${p.name}${brand} — ${p.price} — ${p.link}`;
};

function byCategory(products) {
  const groups = {};
  for (const p of products) (groups[p.category] = groups[p.category] || []).push(p);
  return Object.keys(groups).sort().map(cat =>
    `## ${cat} (${groups[cat].length})\n\n` +
    groups[cat].sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)).map(line).join('\n')
  ).join('\n\n');
}

module.exports = async (req, res) => {
  const list = LISTS[req.query.list];
  if (!list) return res.status(404).send('Not found');

  let body;
  if (list.data) {
    const { link, items } = list.data;
    body = byCategory(items.map(([name, brand, category, cny, itemId]) => ({
      name, brand, category, price: Prices.format(cny, 'EUR'), link: link.replace('{id}', itemId),
    })));
  } else {
    try {
      const jerseys = await loadSheetJerseys();
      body = jerseys.map(p => line({ ...p, price: p.cny != null ? Prices.format(p.cny, 'EUR') : p.price })).join('\n') +
        '\n\nFootball orders: minimum 15€ per order; a jersey weighs 200 to 250 g; name, number and patches can be added on Lovegobuy.';
    } catch (err) {
      return res.status(502).send('Jerseys unavailable, try again later.');
    }
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  return res.status(200).send(HEADER(list.title) + body + '\n');
};
