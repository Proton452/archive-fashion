/* ==============================================
   Items placed by hand in the "Positions" tab of the Google Sheet — GET /api/positions
   Answers [[position, item id], ...]; js/positions.js moves those items to their place.
   Cached by Vercel's CDN for 30 s (like /api/best-sellers): a change shows almost at once.
============================================== */

const { loadPositions } = require('./_lib/catalog');

module.exports = async (req, res) => {
  try {
    const pins = await loadPositions();
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=86400');
    return res.status(200).json(pins);
  } catch (err) {
    return res.status(502).json({ error: 'Sheet unavailable' });
  }
};
