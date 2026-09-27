/* ==============================================
   17TRACK proxy — GET /api/track?number=XXX
   Lookup logic lives in _lib/track17.js (shared with /api/chat).
============================================== */

const { lookup, cleanNumber, isValidNumber } = require('./_lib/track17');

module.exports = async (req, res) => {
  const number = cleanNumber(req.query && req.query.number);

  if (!isValidNumber(number)) {
    return res.status(400).json({ state: 'error', message: 'Please enter a valid tracking number.' });
  }

  try {
    const result = await lookup(number);
    if (result.state === 'error' && result.message === 'Tracking is not configured yet.') {
      return res.status(500).json(result);
    }
    if (result.state === 'tracking') {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(502).json({ state: 'error', message: 'Tracking service unavailable. Please try again later.' });
  }
};
