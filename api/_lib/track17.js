/* ==============================================
   17TRACK lookup shared by /api/track and /api/chat.
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
  // Carriers often report the same scan twice: drop exact duplicates
  const seen   = new Set();
  const events = (provider.events || [])
    .map(e => ({
      time:        e.time_iso || e.time_utc || '',
      description: e.description || '',
      location:    e.location || '',
    }))
    .filter(e => {
      const key = e.time + '|' + e.description;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40);
  return {
    state:     'tracking',
    number:    item.number,
    status:    latest.status || 'NotFound',
    carrier:   (provider.provider && provider.provider.name) || '',
    events,
  };
}

function cleanNumber(raw) {
  return String(raw || '').replace(/[\s-]/g, '').toUpperCase();
}

function isValidNumber(number) {
  return /^[A-Z0-9]{8,30}$/.test(number);
}

// Returns { state: 'tracking' | 'registered' | 'error', ... }
async function lookup(number) {
  if (!process.env.TRACK17_API_KEY) {
    return { state: 'error', message: 'Tracking is not configured yet.' };
  }

  const info = await call17('gettrackinfo', [{ number }]);
  const accepted = info.data && info.data.accepted && info.data.accepted[0];
  if (accepted) return normalize(accepted);

  const rejected = info.data && info.data.rejected && info.data.rejected[0];
  if (!rejected || rejected.error.code !== NOT_REGISTERED) {
    return { state: 'error', message: 'This tracking number could not be found.' };
  }

  const reg = await call17('register', [{ number }]);
  if (reg.data && reg.data.accepted && reg.data.accepted.length) {
    return {
      state: 'registered',
      number,
      message: 'We started tracking your package. Check back in a few minutes for the first updates.',
    };
  }
  return { state: 'error', message: 'This tracking number could not be recognised by any carrier.' };
}

module.exports = { lookup, cleanNumber, isValidNumber };
