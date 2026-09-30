"""
Style photos (first 4 of each item) → Bunny.net

The catalog cards show the first styles of each item as thumbnails (js/card-styles.js):
4 on computers, 3 on phones. This copies exactly those photos from img.theqcbook.com
(which refuses bursts, HTTP 429) to the Bunny storage zone, as WebP of max 600 px
(enough for the hover preview in the card image; thumbnails ask Bunny for ?width=).

Addresses are fixed, so the site needs no list: <CDN>/styles/<imageId>/<n>.webp
Resumable: scripts/styles_bunny.json keeps the "<imageId>/<n>" already uploaded.

Usage:  python scripts/styles_to_bunny.py            (all)
        python scripts/styles_to_bunny.py --limit 5  (a quick test)
        python scripts/styles_to_bunny.py --workers 6  (more at once; watch the 429 count)
"""

import json, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qc_to_bunny as qc   # download() with retries on 429, to_webp(), .env settings

ROOT      = Path(__file__).resolve().parent.parent
DONE_FILE = ROOT / 'scripts' / 'styles_bunny.json'
FOLDER    = 'styles'
SHOWN     = 4          # same as js/card-styles.js
qc.MAX_SIDE = 600

# Count the partner's refusals (HTTP 429), shown with the progress
REFUSED = [0]
_get = requests.get
def _counting_get(*a, **k):
    r = _get(*a, **k)
    if r.status_code == 429:
        REFUSED[0] += 1
    return r
qc.requests.get = _counting_get
UPLOAD_BASE = f"https://{qc.ENV['BUNNY_REGION']}/{qc.ENV['BUNNY_STORAGE_ZONE']}/{FOLDER}"
SOURCE = 'https://img.theqcbook.com/products/{id}/{n}.webp?v5'


def wanted():
    keys = []
    for f in ('men.json', 'women.json'):
        for it in json.loads((ROOT / 'data' / f).read_text(encoding='utf-8'))['items']:
            count = it[7] if len(it) > 7 else 0
            if not count or not it[5]:
                continue
            first = (it[8] if len(it) > 8 and it[8] else [0, 1, 2, 3])[:min(SHOWN, count)]
            keys += [f'{it[5]}/{n}' for n in first]
    return list(dict.fromkeys(keys))


def upload(data, key):
    for attempt in range(4):
        try:
            r = requests.put(f'{UPLOAD_BASE}/{key}.webp', data=data, timeout=60,
                             headers={'AccessKey': qc.ENV['BUNNY_STORAGE_API_KEY'], 'Content-Type': 'image/webp'})
            if r.status_code in (200, 201):
                return True
            print(f'  x Bunny {r.status_code}: {r.text[:120]}')
        except requests.RequestException as e:
            print(f'  x Bunny {e}')
        time.sleep(3 * (attempt + 1))
    return False


def main():
    limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else None
    workers = int(sys.argv[sys.argv.index('--workers') + 1]) if '--workers' in sys.argv else qc.WORKERS
    done = set(json.loads(DONE_FILE.read_text(encoding='utf-8'))) if DONE_FILE.exists() else set()
    todo = [k for k in wanted() if k not in done]
    if limit:
        todo = todo[:limit]
    print(f'{len(done)} already on Bunny, {len(todo)} to do', flush=True)

    lock = threading.Lock()
    stats = {'done': 0, 'failed': 0, 'before': 0, 'after': 0}
    t0 = time.time()

    def save():
        DONE_FILE.write_text(json.dumps(sorted(done), indent=0), encoding='utf-8')

    def work(key):
        image_id, n = key.split('/')
        raw = qc.download(SOURCE.format(id=image_id, n=n))
        try:
            webp = qc.to_webp(raw) if raw else None
        except Exception as e:
            print(f'  x image {e} {key}')
            webp = None
        ok = bool(webp) and upload(webp, key)
        with lock:
            if not ok:
                stats['failed'] += 1
                return
            done.add(key)
            stats['done'] += 1
            stats['before'] += len(raw)
            stats['after'] += len(webp)
            if stats['done'] % 100 == 0:
                save()
                rate = stats['done'] / (time.time() - t0)
                left = (len(todo) - stats['done'] - stats['failed']) / rate / 60 if rate else 0
                print(f"  {stats['done']}/{len(todo)}  ({stats['before'] / 2**20:.0f} MB -> {stats['after'] / 2**20:.0f} MB)  ~{left:.0f} min left, {REFUSED[0]} refused (429)", flush=True)

    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(work, todo))
    save()
    print(f"Done: {stats['done']} uploaded, {stats['failed']} failed, "
          f"{stats['before'] / 2**20:.0f} MB -> {stats['after'] / 2**20:.0f} MB", flush=True)


if __name__ == '__main__':
    main()
