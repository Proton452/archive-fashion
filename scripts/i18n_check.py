"""
Lists the English texts of the site and checks the translations in i18n/<lang>.js.

Usage:
  python scripts/i18n_check.py            -> missing / unused keys per language
  python scripts/i18n_check.py --source   -> writes i18n/_source.json (every key, with its HTML
                                             for texts that mix inline tags) to translate from

Mirrors js/i18n.js: text nodes are keys; an element mixing text with inline tags (no id)
can also be translated as a whole, keyed by its text content, with an HTML translation.
JS strings are the literals passed to t('...').
"""
import html, json, re, sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ['index.html', 'women.html', 'faq.html', 'how-to-order.html', 'reviews.html', 'legal.html']
LANGS = ['fr', 'es', 'pt', 'de', 'it', 'nl', 'ar']
INLINE = {'strong', 'em', 'b', 'i', 'a', 'br', 'span', 'small', 'u'}
SKIP = {'script', 'style', 'svg', 'noscript', 'head'}
VOID = {'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'track'}
ATTRS = ['placeholder', 'aria-label', 'title', 'alt']


def norm(s):
    return re.sub(r'\s+', ' ', s).strip()


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.kids = tag, dict(attrs), parent, []

    def text(self):
        return ''.join(k if isinstance(k, str) else k.text() for k in self.kids)

    def html(self):
        out = []
        for k in self.kids:
            if isinstance(k, str):
                out.append(k.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))
            else:
                attrs = ''.join(f' {a}="{v}"' if v is not None else f' {a}' for a, v in k.attrs.items())
                out.append(f'<{k.tag}{attrs}>' + ('' if k.tag in VOID else k.html() + f'</{k.tag}>'))
        return ''.join(out)


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('root', [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.cur)
        self.cur.kids.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


PARTS = {}   # text inside a mixed element -> that element's key


def page_keys(path, keys):
    tree = Tree()
    tree.feed(path.read_text(encoding='utf-8'))
    title = re.search(r'<title>(.*?)</title>', path.read_text(encoding='utf-8'), re.S)
    if title:
        keys.setdefault(norm(html.unescape(title.group(1))), None)   # "&amp;" in the source, "&" in document.title

    def walk(node):
        if isinstance(node, str):
            if norm(node) and re.search(r'[A-Za-z]', node):
                keys.setdefault(norm(node), None)
            return
        if node.tag in SKIP or node.attrs.get('translate') == 'no' or node.attrs.get('id') == 'productsGrid' \
                or re.search(r'(^|\s)chat-', node.attrs.get('class') or ''):
            return
        for a in ATTRS:
            v = node.attrs.get(a)
            if v and re.search(r'[A-Za-z]', v):
                keys.setdefault(norm(v), None)
        kids = node.kids
        mixed = any(isinstance(k, str) and k.strip() for k in kids) and any(not isinstance(k, str) for k in kids) \
            and all(isinstance(k, str) or (k.tag in INLINE and 'id' not in k.attrs) for k in kids)
        if mixed:
            whole = norm(node.text())
            keys[whole] = norm(node.html())
            for k in kids:
                for part in ([k] if isinstance(k, str) else [k.text()]):
                    if norm(part):
                        PARTS.setdefault(norm(part), set()).add(whole)
        for k in kids:
            walk(k)

    body = next((k for k in tree.root.kids if not isinstance(k, str) and k.tag == 'html'), tree.root)
    walk(body)


def js_keys(keys):
    for f in sorted((ROOT / 'js').glob('*.js')):
        src = f.read_text(encoding='utf-8')
        for m in re.finditer(r"""\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1\s*\)""", src):
            keys.setdefault(norm(m.group(2).replace("\\'", "'").replace('\\"', '"')), None)


# Texts shown through t() on a variable: server messages and English label tables
SERVER_KEYS = [
    'Tracking is not configured yet.',
    'This tracking number could not be found.',
    'We started tracking your package. Check back in a few minutes for the first updates.',
    'This tracking number could not be recognised by any carrier.',
    'Please enter a valid tracking number.',
    'Tracking service unavailable. Please try again later.',
    'Too many messages. Please wait a few minutes.',
    'The assistant is busy right now. Please try again in a minute.',
    'The assistant is unavailable right now. Please try again later.',
    'Chat is not configured yet.',
    'Missing message.',
    'Something went wrong. Please try again.',
    # English labels kept in tables and shown through t(variable)
    'Sign up & get 500€ coupons →', 'Ask on Discord →', 'See the full ordering guide →', 'Read the FAQ →',   # chat.js BUTTON_LABELS
    'Stuck? Ask me, I reply instantly 👋', 'Need help ordering? 👋', 'Stuck on Lovegobuy? Ask me 👋',          # chat.js TEASER_TEXT
    'No info yet', 'Info received', 'In transit', 'Ready for pickup', 'Out for delivery', 'Delivered',       # track.js STATUS
    'Delivery failed', 'Alert', 'Expired',
    # Currency names in the language / currency picker (js/i18n.js CURRENCY_NAMES)
    'Euro', 'Dollar', 'Pound', 'Złoty', 'Yuan',
]

# Never translated: brand names, sizes, weights, heights, reviewer names/initials
KEEP = {'Trustpilot', 'Discord', '17track', '★★★★★'}
NOT_TEXT = re.compile(r'^(\d+ ?kg|\d?m\d+|\d?X*[SML]|[A-Z]{2}|[A-Z][a-zé]+ [A-Z]\.)$')


def category_keys(keys):
    # Sub-category chips / Category menu labels: "Hoodies & sweats"
    for g in ['men', 'women']:
        data = json.loads((ROOT / 'data' / f'{g}.json').read_text(encoding='utf-8'))
        for item in data['items']:
            cat = item[2].lower()
            keys.setdefault(cat[:1].upper() + cat[1:], None)
    keys.setdefault('Jersey', None)


def load_dict(lang):
    f = ROOT / 'i18n' / f'{lang}.js'
    if not f.exists():
        return None
    src = f.read_text(encoding='utf-8')
    return json.loads(src[src.index('{'):src.rindex('}') + 1])


def main():
    keys = {}
    for p in PAGES:
        page_keys(ROOT / p, keys)
    js_keys(keys)
    for k in SERVER_KEYS:
        keys.setdefault(k, None)
    category_keys(keys)

    if '--source' in sys.argv:
        out = ROOT / 'i18n' / '_source.json'
        out.parent.mkdir(exist_ok=True)
        out.write_text(json.dumps(keys, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'{len(keys)} keys -> {out.relative_to(ROOT)}')
        return

    # Text nodes inside a mixed element are covered when the whole element is translated
    for lang in LANGS:
        d = load_dict(lang)
        if d is None:
            print(f'{lang}: no dictionary')
            continue
        # Mixed texts are optional: their text nodes are translated one by one otherwise
        missing = [k for k, v in keys.items()
                   if k not in d and v is None and k not in KEEP and not NOT_TEXT.match(k)
                   and not (k in PARTS and all(w in d for w in PARTS[k]))]
        unused = [k for k in d if k not in keys]
        print(f'{lang}: {len(d)} entries, {len(missing)} missing, {len(unused)} unused')
        for k in missing[:40]:
            print('   missing:', k)
        for k in unused[:10]:
            print('   unused :', k)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
