"""
Real (QC) photos → Bunny.net

Downloads every QC photo listed in data/qc/*.json, turns it into a lighter WebP
(max 1400 px on the long side), uploads it to the Bunny storage zone (settings in
.env, never committed) and rewrites data/qc/*.json with the Bunny addresses.

Why: the partner's image server (img.theqcbook.com) refuses bursts (HTTP 429) and
its photos weigh ~600 KB each; on Bunny they load fast and never get refused.

Resumable: scripts/qc_bunny.json keeps {original address: Bunny address}; photos
already in it are skipped. build_catalog.py uses it too, so a new CSV keeps the
Bunny addresses (then run this script again for the new photos only).

Usage:  python scripts/qc_to_bunny.py            (all photos)
        python scripts/qc_to_bunny.py --limit 5  (a quick test)
"""

import hashlib, io, json, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from PIL import Image

ROOT     = Path(__file__).resolve().parent.parent
QC_DIR   = ROOT / 'data' / 'qc'
MAP_FILE = ROOT / 'scripts' / 'qc_bunny.json'

MAX_SIDE = 1400    # px: sharp on phones (3x) and in the computer window
QUALITY  = 78      # WebP
WORKERS  = 3       # few at once: the partner's server refuses bursts
FOLDER   = 'qc'    # in the storage zone


def load_env():
    env = {}
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    return env


ENV = load_env()
UPLOAD_BASE = f"https://{ENV['BUNNY_REGION']}/{ENV['BUNNY_STORAGE_ZONE']}/{FOLDER}"
CDN_BASE    = f"{ENV['BUNNY_CDN_URL']}/{FOLDER}"
HEADERS_DL  = {'User-Agent': 'Mozilla/5.0 (compatible; LovegoFinds QC sync)', 'Referer': 'https://lovegofinds.com/'}


def name_for(url):
    return hashlib.sha1(url.encode()).hexdigest()[:20] + '.webp'


def download(url):
    wait = 2
    for attempt in range(8):
        try:
            r = requests.get(url, headers=HEADERS_DL, timeout=40)
            if r.status_code == 200 and r.content:
                return r.content
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(wait); wait = min(wait * 2, 60); continue
            print(f'  x {r.status_code} {url}')
            return None
        except requests.RequestException:
            time.sleep(wait); wait = min(wait * 2, 60)
    print(f'  x gave up {url}')
    return None


def to_webp(data):
    img = Image.open(io.BytesIO(data))
    img = img.convert('RGBA' if img.mode in ('RGBA', 'LA', 'P') else 'RGB')
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, 'WEBP', quality=QUALITY, method=5)
    return out.getvalue()


def upload(data, name):
    for attempt in range(4):
        try:
            r = requests.put(f'{UPLOAD_BASE}/{name}', data=data, timeout=60,
                             headers={'AccessKey': ENV['BUNNY_STORAGE_API_KEY'], 'Content-Type': 'image/webp'})
            if r.status_code in (200, 201):
                return f'{CDN_BASE}/{name}'
            print(f'  x Bunny {r.status_code}: {r.text[:120]}')
        except requests.RequestException as e:
            print(f'  x Bunny {e}')
        time.sleep(3 * (attempt + 1))
    return None


def main():
    limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else None
    mapping = json.loads(MAP_FILE.read_text(encoding='utf-8')) if MAP_FILE.exists() else {}

    shards = {f: json.loads(f.read_text(encoding='utf-8')) for f in sorted(QC_DIR.glob('*.json'))}
    todo = []
    for data in shards.values():
        for item in data.values():
            for u in item['q']:
                if u.startswith(CDN_BASE) or u in mapping or u in todo:
                    continue
                todo.append(u)
    if limit:
        todo = todo[:limit]
    print(f'{len(mapping)} already on Bunny, {len(todo)} to do')

    lock = threading.Lock()
    stats = {'done': 0, 'failed': 0, 'before': 0, 'after': 0}
    t0 = time.time()

    def work(url):
        raw = download(url)
        if not raw:
            with lock: stats['failed'] += 1
            return
        try:
            webp = to_webp(raw)
        except Exception as e:
            print(f'  x image {e} {url}')
            with lock: stats['failed'] += 1
            return
        cdn = upload(webp, name_for(url))
        with lock:
            if not cdn:
                stats['failed'] += 1
                return
            mapping[url] = cdn
            stats['done'] += 1
            stats['before'] += len(raw)
            stats['after'] += len(webp)
            if stats['done'] % 100 == 0:
                MAP_FILE.write_text(json.dumps(mapping, indent=0), encoding='utf-8')
                rate = stats['done'] / (time.time() - t0)
                left = (len(todo) - stats['done'] - stats['failed']) / rate / 60 if rate else 0
                print(f"  {stats['done']}/{len(todo)}  ({stats['before'] / 2**20:.0f} MB -> {stats['after'] / 2**20:.0f} MB)  ~{left:.0f} min left", flush=True)

    with ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(work, todo))

    MAP_FILE.write_text(json.dumps(mapping, indent=0), encoding='utf-8')

    # Rewrite the shards with the Bunny addresses (photos that failed keep the original)
    changed = 0
    for f, data in shards.items():
        for item in data.values():
            new = [mapping.get(u, u) for u in item['q']]
            if new != item['q']:
                item['q'] = new
                changed += 1
        f.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"Done: {stats['done']} uploaded, {stats['failed']} failed, "
          f"{stats['before'] / 2**20:.0f} MB -> {stats['after'] / 2**20:.0f} MB, {changed} items updated")


if __name__ == '__main__':
    main()
