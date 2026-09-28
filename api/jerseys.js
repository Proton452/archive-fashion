/* ==============================================
   Football jerseys of the Google Sheet for the Men page — GET /api/jerseys
   Cached by Vercel's CDN so the page doesn't wait on Google (~1 s) at each visit.
============================================== */

const { loadSheetJerseys } = require('./_lib/catalog');

module.exports = async (req, res) => {
  try {
    const jerseys = await loadSheetJerseys();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.status(200).json(jerseys.map(p => ({
      name:  p.name,
      brand: p.brand,
      article: p.type,
      price: p.price,
      image: p.sourceImage,
      lien:  p.link,
      best:  p.bestSeller,
    })));
  } catch (err) {
    return res.status(502).json({ error: 'Sheet unavailable' });
  }
};
