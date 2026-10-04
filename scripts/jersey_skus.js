/*
  Fetch the style names of every CSV jersey from Weidian (the CSV titles are just
  "Adidas Jersey"; the style names say the club, e.g. "2526巴黎二客场" = PSG away 25/26).
  Cached in scripts/jersey_skus.json: only new items are fetched.
  Then matches the teams (js/football.js) → data/football.json.

  Usage:  node scripts/jersey_skus.js     (run by build_catalog.py)
*/
const fs = require('fs');
const path = require('path');
const Football = require('../js/football.js');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'jersey_skus.json');
const API = 'https://thor.weidian.com/detail/getItemSkuInfo/1.0?param=';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchStyles(itemId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API + encodeURIComponent(JSON.stringify({ itemId })), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const json = await res.json();
      if (json.status && json.status.code === 0) {
        const attrs = (json.result && json.result.attrList) || [];
        // Every attribute except sizes (color / style / 款式…)
        return attrs.filter(a => !/size|尺码|码/i.test(a.attrTitle))
          .flatMap(a => a.attrValues.map(v => v.attrValue));
      }
      if (json.status && json.status.code !== 0) return [];   // item removed
    } catch (e) { /* network: retry */ }
    await sleep(2000 * (attempt + 1));
  }
  return null;   // still unknown: try again next run
}

(async () => {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const { items } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'men.json'), 'utf8'));
  const ids = items.filter(i => i[2] === 'Jersey').map(i => i[4]).filter(id => !cache[id]);
  console.log(`jerseys: ${ids.length} to fetch from Weidian`);
  let done = 0;
  for (const id of ids) {
    const styles = await fetchStyles(id);
    if (styles) cache[id] = styles;
    if (++done % 25 === 0) {
      console.log(`  ${done}/${ids.length}`);
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 0));
    }
    await sleep(400);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 0));
  console.log(`jersey styles: ${Object.keys(cache).length} items in scripts/jersey_skus.json`);

  // Teams of each jersey (title + style names) for the Football tab's chips
  const teams = {};
  for (const [name, , category, , id] of items) {
    if (category !== 'Jersey') continue;
    const found = Football.classify([name, ...(cache[id] || [])].join(' | '))
      .filter(team => !(Football.EXCLUDE[id] || []).includes(team));
    if (found.length) teams[id] = found;
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'football.json'), JSON.stringify(teams));
  console.log(`football teams: ${Object.keys(teams).length} jerseys with a team -> data/football.json`);
})();
