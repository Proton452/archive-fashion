"""
Build data/men.json and data/women.json from the partner CSV (My Little Shop / theqcbook).

Usage:  python scripts/build_catalog.py [path/to/my-little-shop-produits.csv]

Output format (compact, ~8k items):
  { "link": "...{id}...", "image": "...{id}...", "end": <index where non-fashion items start>,
    "items": [[name, brand, category, price_cny, item_id, image_id, qc_count], ...] }
Real (QC) photos go to data/qc/<last 2 digits of item_id>.json, loaded only when a
visitor opens them: { item_id: { g, n, b, c, p, i, q: [urls] } }
"""
import csv, json, random, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = Path.home() / 'Downloads' / 'my-little-shop-produits (1).csv'

LINK_RE  = re.compile(r'^https://www\.lovegobuy\.com/product\?id=(\d+)&shop_type=weidian&invite_code=500EUROSOFFERED$')
IMAGE_RE = re.compile(r'^https://img\.theqcbook\.com/products/(\d+)\.webp\?v5$')
LINK_TPL  = 'https://www.lovegobuy.com/product?id={id}&shop_type=weidian&invite_code=500EUROSOFFERED'
IMAGE_TPL = 'https://img.theqcbook.com/products/{id}.webp?v5'

# Partner categories that are duplicates / watch brands → one clean name
WATCH_BRANDS = {
    'rolex', 'cartier', 'tissot', 'omega', 'audemars piguet', 'ap', 'casio', 'patek philippe', 'patek',
    'longines', 'hublot', 'iwc', 'apple watch', 'vacheron constantin', 'breitling', 'richard', 'tudor',
    'e a', 'franck muller', 'chopard', 'bvlgari serpenti', 'gucci', 'panerai', 'blancpain', 'rado',
    'swarovski', 'movado', 'van cleef & arpels', 'jaeger-l', 'lola rose', 'versace', 'hermes',
    'calvin klein', 'dior', 'ulysse nardin', 'vivienne westwood', 'burberry', 'mido', 'chanel',
    'tiffany & co.', 'sevenfriday', 'tag heuer', 'diesel', 'coach',
}
RENAME = {
    'hoodies &sweater': 'Hoodies & Sweats',
    'long sleeves': 'Long Sleeves',
    'shirt': 'Shirts',
    'toys, blocks': 'Toys & Collectibles',
    'home': 'Decor',
    'personal effects': 'Perfume',
}
# Non-fashion items go after all the clothes in the default order
PUSH_TO_END = {
    'Decor', 'Toys & Collectibles', 'Household appliances', 'Books', 'Electronics', 'Speakers',
    'Beauty Tech', 'Headphones', 'Phone Cases',
}


# Real photos already copied to Bunny.net by scripts/qc_to_bunny.py: {original address: Bunny address}
_bunny_map = Path(__file__).resolve().parent / 'qc_bunny.json'
BUNNY_QC = json.loads(_bunny_map.read_text(encoding='utf-8')) if _bunny_map.exists() else {}


def clean_category(raw):
    key = raw.strip().lower()
    if key in WATCH_BRANDS:
        return 'Watches'
    return RENAME.get(key, raw.strip())


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    rows = list(csv.DictReader(open(src, encoding='utf-8-sig')))
    out = {'men': [], 'women': []}
    qc_shards = {}

    for r in rows:
        link, image = LINK_RE.match(r['lien_lovegobuy'].strip()), IMAGE_RE.match(r['lien_image'].strip())
        if not link or not image:
            print('skipped (unexpected url):', r['titre'])
            continue
        gender = {'homme': 'men', 'femme': 'women'}.get(r['genre'].strip().lower())
        if not gender:
            print('skipped (no genre):', r['titre'])
            continue
        qc = [u.strip() for u in r.get('qc_photos', '').split('|') if u.strip().startswith('https://')]
        qc = [BUNNY_QC.get(u, u) for u in qc]   # copies on Bunny (scripts/qc_to_bunny.py)
        item = [
            r['titre'].strip(),
            r['brand'].strip(),
            clean_category(r['categorie']),
            int(float(r['prix_cny'])),
            link.group(1),
            image.group(1),
            len(qc),
        ]
        out[gender].append(item)
        if qc:
            qc_shards.setdefault(link.group(1)[-2:], {})[link.group(1)] = {
                'g': gender, 'n': item[0], 'b': item[1], 'c': item[2], 'p': item[3], 'i': item[5], 'q': qc,
            }

    (ROOT / 'data').mkdir(exist_ok=True)
    for gender, items in out.items():
        rng = random.Random(0xAF2025)
        main_pool = [i for i in items if i[2] not in PUSH_TO_END]
        end_pool  = [i for i in items if i[2] in PUSH_TO_END]
        rng.shuffle(main_pool)
        rng.shuffle(end_pool)
        payload = {'link': LINK_TPL, 'image': IMAGE_TPL, 'end': len(main_pool), 'items': main_pool + end_pool}
        path = ROOT / 'data' / f'{gender}.json'
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'{gender}: {len(items)} items -> {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)')

    qc_dir = ROOT / 'data' / 'qc'
    shutil.rmtree(qc_dir, ignore_errors=True)
    qc_dir.mkdir()
    for shard, entries in qc_shards.items():
        (qc_dir / f'{shard}.json').write_text(json.dumps(entries, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    sizes = [f.stat().st_size for f in qc_dir.iterdir()]
    print(f'real photos: {sum(len(e) for e in qc_shards.values())} items in {len(sizes)} files '
          f'(largest {max(sizes) // 1024} KB) -> data/qc/')


if __name__ == '__main__':
    main()
