/* ==============================================
   17TRACK proxy — GET /api/track?number=XXX
   Keeps the API key server-side (Vercel env var TRACK17_API_KEY).
   Unknown numbers are registered once (1 quota), then 17TRACK
   keeps them updated and later lookups are free.
============================================== */

const API = 'https://api.17track.net/track/v2.4';
const NOT_REGISTERED = -18019902;

async function call17(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: {
      '17token': process.env.TRACK17_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`17TRACK HTTP ${r.status}`);
  return r.json();
}

function normalize(item) {
  const info     = item.track_info || {};
  const latest   = info.latest_status || {};
  const provider = (info.tracking && info.tracking.providers && info.tracking.providers[0]) || {};
  const events   = (provider.events || []).slice(0, 40).map(e => ({
    time:        e.time_iso || e.time_utc || '',
    description: e.description || '',
    location:    e.location || '',
  }));
  return {
    state:     'tracking',
    number:    item.number,
    status:    latest.status || 'NotFound',
    carrier:   (provider.provider && provider.provider.name) || '',
    events,
  };
}

module.exports = async (req, res) => {
  const number = String((req.query && req.query.number) || '')
    .replace(/[\s-]/g, '')
    .toUpperCase();

  if (!/^[A-Z0-9]{8,30}$/.test(number)) {
    return res.status(400).json({ state: 'error', message: 'Please enter a valid tracking number.' });
  }
  if (!process.env.TRACK17_API_KEY) {
    return res.status(500).json({ state: 'error', message: 'Tracking is not configured yet.' });
  }

  try {
    const info = await call17('gettrackinfo', [{ number }]);
    const accepted = info.data && info.data.accepted && info.data.accepted[0];
    if (accepted) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return res.status(200).json(normalize(accepted));
    }

    const rejected = info.data && info.data.rejected && info.data.rejected[0];
    if (!rejected || rejected.error.code !== NOT_REGISTERED) {
      return res.status(200).json({ state: 'error', message: 'This tracking number could not be found.' });
    }

    const reg = await call17('register', [{ number }]);
    if (reg.data && reg.data.accepted && reg.data.accepted.length) {
      return res.status(200).json({
        state: 'registered',
        number,
        message: 'We started tracking your package. Check back in a few minutes for the first updates.',
      });
    }
    return res.status(200).json({ state: 'error', message: 'This tracking number could not be recognised by any carrier.' });
  } catch (err) {
    return res.status(502).json({ state: 'error', message: 'Tracking service unavailable. Please try again later.' });
  }
};
