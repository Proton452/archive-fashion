/* ==============================================
   Best sellers picked in the "Best sellers" tab of the Google Sheet — GET /api/best-sellers
   Answers the item ids (the id= of the Lovegobuy links); the pages mark those products.
   Cached by Vercel's CDN like /api/jerseys, so a change in the sheet shows in ≤ 5 min.
============================================== */

const { loadBestSellerIds } = require('./_lib/catalog');

module.exports = async (req, res) => {
  try {
    const ids = await loadBestSellerIds();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.status(200).json([...ids]);
  } catch (err) {
    return res.status(502).json({ error: 'Sheet unavailable' });
  }
};
