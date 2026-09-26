# LovegoFinds (repo archive-fashion) — CLAUDE.md

Référence pour toutes les sessions futures sur ce projet.

Site : https://lovegofinds.com — hébergé sur Vercel, déployé automatiquement à chaque push sur `main`.

## Stack

- **HTML / CSS / JS vanilla** — zéro dépendance, zéro framework
- **Polices** : Poppins (sans, tout le site) + DM Serif Display via Google Fonts
- **Données produits** : Google Sheets → `gviz/tq` en JSONP (contourne CORS)
- **Images produits** : Bunny CDN (`archivefashion.b-cdn.net`), redimensionnées via `?width=400&quality=75&format=auto`
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
│   ├── main.js         Page Men : chargement Sheet, onglets, filtres, recherche, tri, scroll infini
│   ├── women.js        Même logique pour la page Women
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

## Conventions CSS

- BEM : `.block__element--modifier`
- État actif : `.is-active`, `.is-visible`, `.is-scrolled`, `.has-more`
- Animations : CSS pur uniquement (`transition`, `@keyframes`)
- Responsive : breakpoints `768px` et `1200px`

## Logique JS (main.js / women.js)

- **Chargement** : `fetchSheetJSONP()` → `parseSheetData()` → `deduplicateProducts()` → `deterministicShuffle()`
- **Onglets catégories** : `CATEGORY_MAP` associe chaque onglet à des mots-clés de la colonne ARTICLE
- **Filtres / recherche / tri** : en mémoire sur `allProducts[]` (`applyFilters()`), recherche multilingue via dictionnaire de synonymes
- **Affichage** : scroll infini par lots de 30 (`PAGE_SIZE`)
- **Fade-in** : `IntersectionObserver` ajoute `.is-visible` sur `.fade-in`
- **Popup maillots** : rappel « minimum 4 jerseys » avant d'ouvrir un lien foot

## Google Sheets — Configuration

Sheet ID : `1w2N8A0f_xnmU3O1l-tFTiaC3Kp6GyjVBpjVscvCDk8M`

| Feuille     | Utilisée par  |
|-------------|---------------|
| 1re feuille | Men (`main.js`) |
| `Feuille 2` | Women (`women.js`) |
| `Codes`     | Slugs partenaires → codes d'invitation (`partner.js`) |

Colonnes détectées par mot-clé (ordre libre) : NAME, BRAND, ARTICLE/TYPE, PRICE, IMAGE, LIEN, Best seller.

Le sheet doit être partagé en « Lecture pour tous avec le lien ».

## Ce qu'il NE FAUT PAS toucher sans discussion

- `fetchSheetJSONP()`, `parseSheetData()`, `loadProducts()` — fonctionnels, branchés sur le vrai sheet
- `partner.js` et les routes de `vercel.json` — les liens partenaires en dépendent
- Le code Google Analytics (`gtag.js`, `G-H85B12JS2Y`) dans le `<head>` de chaque page — il sert aussi à valider le site dans Google Search Console
- Les design tokens `:root` — toute modification impacte l'ensemble du site
- La structure BEM des classes CSS

## Préférences utilisateur

- Commit + push après chaque modification, sans demander
- Proposer d'abord les idées (surtout design), attendre validation avant de coder
- Animations subtiles uniquement (CSS pur, performance prioritaire)
- Aucune librairie UI, aucun framework
