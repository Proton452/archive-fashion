/* ==============================================
   Best sellers picked in the "Best sellers" tab of the Google Sheet — GET /api/best-sellers
   Answers the item ids (the id= of the Lovegobuy links); the pages mark those products.
   Cached by Vercel's CDN for 30 s only (Google is still asked at most twice a minute,
   whatever the traffic), so a change in the sheet shows almost at once.
============================================== */

const { loadBestSellerIds } = require('./_lib/catalog');

module.exports = async (req, res) => {
  try {
    const ids = await loadBestSellerIds();
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=86400');
    return res.status(200).json([...ids]);
  } catch (err) {
    return res.status(502).json({ error: 'Sheet unavailable' });
  }
};
