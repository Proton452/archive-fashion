"""
Main photo of each item (the card image) → Bunny.net

The cards and the photos window load img.theqcbook.com/products/<imageId>.webp, which
refuses bursts (HTTP 429). This copies them to the Bunny storage zone as WebP (1200 px,
the original size; the cards ask Bunny for a smaller ?width=).

Addresses are fixed, so the site needs no list: <CDN>/products/<imageId>.webp
Resumable: scripts/products_bunny.json keeps the imageIds already uploaded.

Usage:  python scripts/products_to_bunny.py            (all)
        python scripts/products_to_bunny.py --limit 5  (a quick test)
        python scripts/products_to_bunny.py --workers 6  (more at once; watch the 429 count)
"""

import json, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qc_to_bunny as qc   # download() with retries on 429, to_webp(), .env settings

ROOT      = Path(__file__).resolve().parent.parent
DONE_FILE = ROOT / 'scripts' / 'products_bunny.json'
FOLDER    = 'products'
qc.MAX_SIDE = 1200

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
SOURCE = 'https://img.theqcbook.com/products/{id}.webp?v5'


def wanted():
    ids = []
    for f in ('men.json', 'women.json'):
        ids += [it[5] for it in json.loads((ROOT / 'data' / f).read_text(encoding='utf-8'))['items'] if it[5]]
    return list(dict.fromkeys(ids))


def upload(data, image_id):
    for attempt in range(4):
        try:
            r = requests.put(f'{UPLOAD_BASE}/{image_id}.webp', data=data, timeout=60,
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
    todo = [i for i in wanted() if i not in done]
    if limit:
        todo = todo[:limit]
    print(f'{len(done)} already on Bunny, {len(todo)} to do', flush=True)

    lock = threading.Lock()
    stats = {'done': 0, 'failed': 0, 'before': 0, 'after': 0}
    t0 = time.time()

    def save():
        DONE_FILE.write_text(json.dumps(sorted(done), indent=0), encoding='utf-8')

    def work(image_id):
        raw = qc.download(SOURCE.format(id=image_id))
        try:
            webp = qc.to_webp(raw) if raw else None
        except Exception as e:
            print(f'  x image {e} {image_id}')
            webp = None
        ok = bool(webp) and upload(webp, image_id)
        with lock:
            if not ok:
                stats['failed'] += 1
                return
            done.add(image_id)
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
