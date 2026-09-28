"""
Build data/men.json and data/women.json from the partner CSV (My Little Shop / theqcbook).

Usage:  python scripts/build_catalog.py [path/to/my-little-shop-produits.csv]

Output format (compact, ~8k items):
  { "link": "...{id}...", "image": "...{id}...", "end": <index where non-fashion items start>,
    "items": [[name, brand, category, price_cny, item_id, image_id], ...] }
"""
import csv, json, random, re, sys
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


def clean_category(raw):
    key = raw.strip().lower()
    if key in WATCH_BRANDS:
        return 'Watches'
    return RENAME.get(key, raw.strip())


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    rows = list(csv.DictReader(open(src, encoding='utf-8-sig')))
    out = {'men': [], 'women': []}

    for r in rows:
        link, image = LINK_RE.match(r['lien_lovegobuy'].strip()), IMAGE_RE.match(r['lien_image'].strip())
        if not link or not image:
            print('skipped (unexpected url):', r['titre'])
            continue
        gender = {'homme': 'men', 'femme': 'women'}.get(r['genre'].strip().lower())
        if not gender:
            print('skipped (no genre):', r['titre'])
            continue
        out[gender].append([
            r['titre'].strip(),
            r['brand'].strip(),
            clean_category(r['categorie']),
            int(float(r['prix_cny'])),
            link.group(1),
            image.group(1),
        ])

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


if __name__ == '__main__':
    main()
