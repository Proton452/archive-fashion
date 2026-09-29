# LovegoFinds (repo archive-fashion) — CLAUDE.md

Référence pour toutes les sessions futures sur ce projet.

Site : https://lovegofinds.com — hébergé sur Vercel, déployé automatiquement à chaque push sur `main`.

## Stack

- **HTML / CSS / JS vanilla** — zéro dépendance, zéro framework
- **Polices** : Poppins (sans, tout le site) + DM Serif Display via Google Fonts
- **Données produits** : CSV du partenaire (My Little Shop / theqcbook) → `scripts/build_catalog.py` → `data/men.json` + `data/women.json` (statiques, servis par Vercel) **+ les maillots (ARTICLE = jersey) de la 1re feuille du Google Sheet**, servis par `/api/jerseys` (mis en cache 5 min par Vercel, donc une modif du sheet apparaît en ≤ 5 min) avec leurs marques best seller. Pour mettre à jour le CSV : `python scripts/build_catalog.py <chemin du csv>` puis commit.
- **Images produits** : `img.theqcbook.com` (fournies par le CSV)
- **Analytics** : GA4 (`G-H85B12JS2Y`) + Vercel Insights

## Structure

```
archive-fashion/
├── index.html          Page Men (homepage) — grille produits
├── women.html          Page Women — grille produits
├── reviews.html        Avis clients (photos + vidéos YouTube)
├── how-to-order.html   Guide de commande en 6 étapes
├── faq.html            FAQ (accordéon)
├── 404.html            Redirige vers /
├── css/style.css       Tous les styles (tokens, composants, responsive)
├── js/
│   ├── main.js         Page Men : chargement catalogue, onglets, filtres, recherche, tri, scroll infini
│   ├── women.js        Même logique pour la page Women
│   ├── photos.js       Vraies photos (QC) : pastille vert clair (--accent-bg) « Photos » + icône galerie verte, à droite du prix (sans nombre) sur les cartes + fenêtre (Men / Women)
│   ├── season.js       Ordre saisonnier : vêtements de saison plus souvent en haut (hiver 15/09 → 31/03)
│   ├── recent.js       Récemment consultés : onglet « Recently viewed » (localStorage)
│   ├── favorites.js    Favoris : cœur sur les cartes + fenêtre QC, onglet « Favorites » (localStorage)
│   ├── nav.js          Navbar + FAQ pour les pages secondaires
│   └── partner.js      Liens partenaires (/slug → code d'invitation, feuille "Codes")
├── assets/
│   ├── logo.png
│   └── reviews/        Photos et miniatures vidéo des avis (WebP compressé)
├── og-image.jpg        Image d'aperçu des liens partagés (1200×630)
├── robots.txt / sitemap.xml
├── vercel.json         Routes (URLs propres + slugs partenaires)
└── logo.svg            Favicon
```

## Design Tokens (css/style.css :root)

| Variable       | Valeur    | Usage                      |
|----------------|-----------|----------------------------|
| `--bg`         | `#FFFFFF` | Fond principal             |
| `--bg-hover`   | `#F2F2F2` | Survol                     |
| `--text`       | `#0D0D0D` | Texte principal            |
| `--text-muted` | `#6B7280` | Texte secondaire           |
| `--border`     | `#E5E5E5` | Séparateurs                |
| `--accent`     | `#00A86B` | Vert — accent unique, CTA  |
| `--accent-dark`| `#008F5A` | Survol accent              |
| `--display`    | DM Serif Display | Titres display      |
| `--sans`       | Poppins   | Tout le reste              |

## Vraies photos (QC) — js/photos.js

- Les photos QC du CSV (`qc_photos`) sont écrites par `build_catalog.py` dans `data/qc/<2 derniers chiffres de l'id>.json` (chargé seulement à l'ouverture) ; le catalogue ne garde que le nombre de photos (7e champ) pour la pastille.
- Carte : le clic reste direct vers Lovegobuy ; la pastille appareil photo (sans nombre) ouvre la fenêtre (pas de page séparée : `partner.js` prendrait `/p/...` pour un code créateur).
- Lien partageable : `/#p=<id Lovegobuy>` (ou `/women#p=...`) ouvre la fenêtre. L'ouverture depuis une carte ne change PAS l'adresse (pushState sans URL) et ne met pas le focus sur mobile : sinon Safari iPhone agrandit sa barre d'adresse et affiche une bande. Retour/✕/Échap ferment la fenêtre sans bouger la page.
- Photos lourdes (400–800 Ko, pas de redimensionnement chez le partenaire) : seules la photo affichée et ses voisines sont chargées. Défilement au doigt = scroll-snap natif (`.photos-track`) ; la photo est zoomée pour remplir le cadre quand sa forme est proche (écart ≤ 30 %), sinon elle reste entière avec sa copie floutée autour. Pas de double-tap zoom (`touch-action: manipulation`).
- Mobile : fenêtre à la hauteur de son contenu (max 92 %) qui monte du bas, catalogue visible au-dessus ; se ferme en la tirant vers le bas (poignée en haut). Ordinateur : simple fondu court, fond peu assombri (animations volontairement calmes, demandé par l'utilisateur).
- Ordinateur : la carte dont on ouvre les photos garde son zoom tant que la fenêtre est ouverte (classe `.is-held`, retirée dans `hide()`), sinon elle se dézoomait derrière la fenêtre. Le survol du cœur / de « Photos » n'annule plus le zoom.
- **img.theqcbook.com limite les rafales** (HTTP 429 par visiteur ; les images du catalogue viennent du même serveur). D'où : photo affichée chargée d'abord, voisines ensuite ; toute image refusée est redemandée 3 fois (après 0,8 / 2 / 4 s, avec `?retry=n`) avant « This photo couldn't be loaded » — pareil pour les images des cartes (`IMG_RETRY_MS` dans main.js / women.js).
- Photos des modèles (`model_images`) : pas encore utilisées.

## Favoris — js/favorites.js

- Cœur en haut à droite de chaque carte (cœur seul, gris clair, sans rond, vert plein quand activé ; la pastille « Photos » est à côté du prix, hors de l’image ; sur téléphone, zone de toucher agrandie de 8 px pour les deux via ::after) et dans la fenêtre QC, à côté de la fiche produit. Le clic sur le cœur n'ouvre pas Lovegobuy.
- Gardés dans le navigateur (`localStorage`) : `favs-men` / `favs-women`, une liste par page. Clé = id Lovegobuy (maillots du sheet : leur lien).
- Onglet « Favorites » (texte seul, sans cœur ni nombre) en 1re position, masqué tant qu'il n'y a aucun favori ; s'il est vidé pendant qu'on y est : message « Tap the heart… ». `inCurrentTab()` gère `favorites`. Un changement déclenche l'événement `favchange` (cartes, onglet et fenêtre QC se mettent à jour).
- Au chargement, un petit script dans le HTML (juste après les onglets) affiche Favorites / Recently viewed avant le premier rendu (pas de saut). Ensuite, apparition / disparition animée (`Favs.setTabShown` : l’onglet s’ouvre en largeur et pousse les suivants, puis son texte apparaît en fondu ; l’inverse pour disparaître), sans animation au chargement de la page.

## Ordre saisonnier — js/season.js

- Le catalogue reste aléatoire mais pondéré selon la saison (hiver du 15 septembre au 31 mars, été du 1er avril au 14 septembre). Mélange visé en scrollant : hiver 40 % / été 5 % / toute l'année 55 % en hiver ; hiver 5 % / été 30 % / toute l'année 65 % en été. Poids calculés à partir du nombre d'articles de chaque groupe (plafond ×3).
- Groupes : hiver = manteaux & doudounes, vestes, sweats & hoodies, pulls, boots, écharpes, manches longues ; été = shorts, claquettes & sandales, casquettes, lunettes, polos ; le reste (t-shirts, robes, sneakers…) = toute l'année.
- Aucun article hors saison dans les 12 premières cartes. Catégories peu demandées (`PUSH_BACK`) : cravates 95 %, électroménager 70 % (les gardés : Dyson, téléphones, Ray-Ban Meta… via `prefer`), parfums 70 % sur Women seulement. Cette part exacte passe à la fin ; les gardés sont tirés d'abord parmi les mots-clés `prefer`, et l'électroménager gardé est replacé au hasard dans le catalogue (sous le 1er écran). Seuls les articles mode sont réordonnés (avant `end`), la fin non-mode ne bouge pas. Même ordre pour toute la saison (graine fixe par saison).

## Récemment consultés — js/recent.js

- Onglet « Recently viewed » juste après « Favorites », masqué tant qu'il est vide. Les 20 derniers articles ouverts (clic vers Lovegobuy ou fenêtre QC), du plus récent au plus ancien (`Recent.order()` dans `applyFilters`, le tri par prix passe par-dessus).
- `localStorage` : `recent-men` / `recent-women`, même clé que les favoris (`Favs.key`).

## Langues (js/i18n.js)

- Anglais = langue source. Traductions : `i18n/<lang>.js` (`window.I18N_DICT = { "texte anglais": "traduction" }`), chargées seulement si une autre langue est choisie. Langues : fr, es, pt, de, it, nl, ar (arabe en RTL, correctifs `[dir="rtl"]` en fin de `style.css`).
- Le texte des pages est traduit automatiquement en retrouvant son texte anglais (aucun attribut à ajouter dans le HTML). Un élément qui mélange texte et balises inline (`<strong>`…) peut être traduit en bloc : clé = son texte, valeur = HTML.
- Dans le JS : `t('English text')` (les noms de catégories passent aussi par `t()`).
- Bouton texte « EN · € ▾ » (sans cadre ni drapeau, fond gris au survol) ajouté dans `.nav__right`, qui ouvre une fenêtre de cartes (panneau qui monte du bas sur mobile ; fermeture par ✕, Échap, clic à côté ou glissement vers le bas). **Un choix s'applique sans recharger** : `I18N.setLanguage()` remet le texte anglais d'origine puis applique la nouvelle langue, et l'événement `localechange` fait redessiner aux scripts leurs parties (prix des cartes, pastilles/menu Catégorie, chat, suivi de colis). Tout nouveau texte dessiné en JS doit passer par `t()` et se redessiner sur `localechange`. Choix gardés dans `localStorage` (`lang`, `currency`).
- **Changement calme** : après un choix, on attend la fin de la fermeture de la fenêtre (250 ms, `pickerClosed()`), puis le changement est appliqué et seule la couleur des textes visibles qui ont changé apparaît en fondu (pas le logo ni ce qui reste identique) (`textIn` : couleur à 30 % → 100 % en 0,26 s, fonds/boutons/images intacts ; devise = seulement les prix). Jamais la page entière : estomper la page donnait un flash blanc, refusé par l'utilisateur.
- **Devise à la 1re visite** : devinée d'après le fuseau horaire (`Prices.detect()` : Pologne → PLN, Royaume-Uni → GBP, Amériques → USD, Chine → CNY, sinon EUR), non enregistrée tant que le visiteur ne choisit pas. La langue, elle, reste l'anglais par défaut (choix de l'utilisateur).
- **Après avoir modifié un texte du site** : `python scripts/i18n_check.py` liste les traductions manquantes par langue (`--source` exporte tous les textes).
- Les noms de produits (titres du partenaire) ne sont pas traduits.
- Titre de la page Men : « trending finds » reste sur une ligne en anglais seulement (`.hero__nowrap:lang(en)`) ; les traductions sont plus longues et débordaient sur mobile. Taille du titre sur mobile : `clamp(1.75rem, 9.5vw, 3.5rem)`, vérifiée de 320 à 768 px dans les 8 langues. Sur petit mobile, le bouton vert du haut peut passer sur 2 lignes ; sous 380 px, barre du haut et badge Trustpilot plus serrés (menu jamais coupé, badge sur une ligne).

## Conventions CSS

- BEM : `.block__element--modifier`
- État actif : `.is-active`, `.is-visible`, `.is-scrolled`, `.has-more`
- Animations : CSS pur uniquement (`transition`, `@keyframes`)
- Responsive : breakpoints `768px` et `1200px` ; sous `1279px` les liens du menu passent dans le burger (place pour le bouton langue + le CTA dans les langues longues)

## Logique JS (main.js / women.js)

- **Chargement** : `fetchCatalog()` (JSON, préchargé dans le `<head>`) + `fetchSheetJerseys()` (Men seulement, `/api/jerseys`, abandonné après 3 s) → `mixIn()` (maillots insérés à des places aléatoires fixes ; marqués `fromSheet`, ils n'apparaissent **que dans Football et Best Sellers, jamais dans All**) → `deduplicateProducts()`. L’ordre est aléatoire mais fixe (graine), identique pour tous, non-mode à la fin (`end` dans le JSON), puis pondéré par saison (`Season.order()`, voir js/season.js)
- **Onglets catégories** : `CATEGORY_MAP` liste les noms exacts des catégories (CSV + `jersey` du sheet) pour chaque onglet ; Best Sellers toujours affiché ; « Running » du partenaire = vêtements de sport → onglet Sport
- **Sous-catégories** : `generateFilterDropdown()` construit les pastilles sous les onglets (`#catChips`, masquées sur All ou s'il n'y a qu'une catégorie) et le menu « Category » ; les deux ne listent que les catégories de l'onglet en cours et partagent `selectedFilters`
- **Prix** : chaque produit a `cny` (prix en yuan ; maillots du sheet en € convertis) et `price` (texte affiché). `js/prices.js` (partagé avec `/api/chat`) convertit au taux Lovegobuy (`RATES`, marge incluse) dans la devise choisie (EUR par défaut, USD, GBP, PLN, CNY = prix d'origine sans conversion) et **arrondit toujours à l'unité inférieure**. Si Lovegobuy change ses taux, mettre à jour `RATES`. Le tri compare `cny`
- **Filtres / recherche / tri** : en mémoire sur `allProducts[]` (`applyFilters()`), recherche multilingue via dictionnaire de synonymes
- **Affichage** : scroll infini par lots de 30 (`PAGE_SIZE`)
- **Fade-in** : `IntersectionObserver` ajoute `.is-visible` sur `.fade-in`
- **Popup maillots** : rappel « minimum 4 jerseys » avant d'ouvrir un lien foot

## Google Sheets — Configuration (1re feuille : maillots seulement ; `Codes`)

Sheet ID : `1w2N8A0f_xnmU3O1l-tFTiaC3Kp6GyjVBpjVscvCDk8M`

| Feuille     | Utilisée par  |
|-------------|---------------|
| 1re feuille | Maillots Men (`main.js`, `api/_lib/catalog.js`) — seules les lignes ARTICLE = jersey |
| `Feuille 2` | Plus utilisée |
| `Codes`     | Slugs partenaires → codes d'invitation (`partner.js`) |

Colonnes détectées par mot-clé (ordre libre) : NAME, BRAND, ARTICLE/TYPE, PRICE, IMAGE, LIEN, Best seller.

Le sheet doit être partagé en « Lecture pour tous avec le lien ».

## Ce qu'il NE FAUT PAS toucher sans discussion

- `fetchCatalog()`, `fetchSheetJerseys()`, `loadProducts()` — branchés sur `data/*.json` et `/api/jerseys`
- `partner.js` et les routes de `vercel.json` — les liens partenaires en dépendent
- Le code Google Analytics (`gtag.js`, `G-H85B12JS2Y`) dans le `<head>` de chaque page — il sert aussi à valider le site dans Google Search Console
- Les design tokens `:root` — toute modification impacte l'ensemble du site
- La structure BEM des classes CSS

## Préférences utilisateur

- Commit + push après chaque modification, sans demander
- Proposer d'abord les idées (surtout design), attendre validation avant de coder
- Animations subtiles uniquement (CSS pur, performance prioritaire)
- Aucune librairie UI, aucun framework
