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
│   ├── photos.js       Vraies photos (QC) : pastille 📷 sur les cartes + fenêtre (Men / Women)
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
- Carte : le clic reste direct vers Lovegobuy ; la pastille appareil photo + nombre ouvre la fenêtre (pas de page séparée : `partner.js` prendrait `/p/...` pour un code créateur).
- Lien partageable : `/#p=<id Lovegobuy>` (ou `/women#p=...`) ; Retour/✕/Échap ferment la fenêtre sans bouger la page.
- Photos lourdes (400–800 Ko, pas de redimensionnement chez le partenaire) : seules la photo affichée et la suivante sont chargées.
- Photos des modèles (`model_images`) : pas encore utilisées.

## Langues (js/i18n.js)

- Anglais = langue source. Traductions : `i18n/<lang>.js` (`window.I18N_DICT = { "texte anglais": "traduction" }`), chargées seulement si une autre langue est choisie. Langues : fr, es, pt, de, it, nl, ar (arabe en RTL, correctifs `[dir="rtl"]` en fin de `style.css`).
- Le texte des pages est traduit automatiquement en retrouvant son texte anglais (aucun attribut à ajouter dans le HTML). Un élément qui mélange texte et balises inline (`<strong>`…) peut être traduit en bloc : clé = son texte, valeur = HTML.
- Dans le JS : `t('English text')` (les noms de catégories passent aussi par `t()`).
- Bouton texte « EN · € ▾ » (sans cadre ni drapeau, fond gris au survol) ajouté dans `.nav__right`, qui ouvre une fenêtre de cartes (panneau qui monte du bas sur mobile ; fermeture par ✕, Échap, clic à côté ou glissement vers le bas). **Un choix s'applique sans recharger** : `I18N.setLanguage()` remet le texte anglais d'origine puis applique la nouvelle langue, et l'événement `localechange` fait redessiner aux scripts leurs parties (prix des cartes, pastilles/menu Catégorie, chat, suivi de colis). Tout nouveau texte dessiné en JS doit passer par `t()` et se redessiner sur `localechange`. Choix gardés dans `localStorage` (`lang`, `currency`).
- **Devise à la 1re visite** : devinée d'après le fuseau horaire (`Prices.detect()` : Pologne → PLN, Royaume-Uni → GBP, Amériques → USD, Chine → CNY, sinon EUR), non enregistrée tant que le visiteur ne choisit pas. La langue, elle, reste l'anglais par défaut (choix de l'utilisateur).
- **Après avoir modifié un texte du site** : `python scripts/i18n_check.py` liste les traductions manquantes par langue (`--source` exporte tous les textes).
- Les noms de produits (titres du partenaire) ne sont pas traduits.

## Conventions CSS

- BEM : `.block__element--modifier`
- État actif : `.is-active`, `.is-visible`, `.is-scrolled`, `.has-more`
- Animations : CSS pur uniquement (`transition`, `@keyframes`)
- Responsive : breakpoints `768px` et `1200px` ; sous `1279px` les liens du menu passent dans le burger (place pour le bouton langue + le CTA dans les langues longues)

## Logique JS (main.js / women.js)

- **Chargement** : `fetchCatalog()` (JSON, préchargé dans le `<head>`) + `fetchSheetJerseys()` (Men seulement, `/api/jerseys`, abandonné après 3 s) → `mixIn()` (maillots insérés à des places aléatoires fixes ; marqués `fromSheet`, ils n'apparaissent **que dans Football et Best Sellers, jamais dans All**) → `deduplicateProducts()`. L'ordre est aléatoire mais fixe (graine), identique pour tous, non-mode à la fin (`end` dans le JSON)
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
