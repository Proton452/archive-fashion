# Archive Fashion — CLAUDE.md

Référence pour toutes les sessions futures sur ce projet.

## Stack

- **HTML / CSS / JS vanilla** — zéro dépendance, zéro framework
- **Polices** : Cormorant Garamond (serif) + Space Grotesk (sans) via Google Fonts
- **Données produits** : Google Sheets → CSV publié → `fetch()` en JS

## Structure

```
archive-fashion/
├── index.html          Page principale (homepage)
├── css/
│   └── style.css       Tous les styles (tokens, composants, responsive)
├── js/
│   └── main.js         Logique : Google Sheets, filtres, animations
└── assets/             Logo PNG et images statiques (à venir)
```

## Design Tokens (css/style.css :root)

| Variable       | Valeur    | Usage                     |
|----------------|-----------|---------------------------|
| `--bg`         | `#0a0a0a` | Fond principal            |
| `--bg-card`    | `#141414` | Cards / surfaces          |
| `--text`       | `#f0ede8` | Texte principal           |
| `--text-muted` | `#888888` | Texte secondaire          |
| `--border`     | `#1e1e1e` | Séparateurs / grille      |
| `--accent`     | `#1A5C47` | Vert froid — accent unique|
| `--serif`      | Cormorant | Titres, prix, brand       |
| `--sans`       | Space Grotesk | Nav, noms produits   |

## Conventions CSS

- BEM : `.block__element--modifier`
- État actif : `.is-active`, `.is-visible`, `.is-scrolled`
- Animations : CSS pur uniquement (`transition`, `@keyframes`)
- Responsive : mobile-first avec breakpoints `768px` et `1200px`

## Logique JS (main.js)

- **Hero color shift** : `requestAnimationFrame` + lerp sur `--mx` / `--my` → `radial-gradient` sur le texte
- **Fade-in scroll** : `IntersectionObserver` ajoute `.is-visible` sur `.fade-in`
- **Filtres** : filtre en mémoire sur `allProducts[]`, aucun rechargement réseau
- **Google Sheets** : `fetch(SHEET_URL)` → `parseCSV()` → `renderProducts()`
- **Fallback** : si pas d'URL ou erreur réseau → produits de démo

## Google Sheets — Configuration

Sheet ID : `1w2N8A0f_xnmU3O1l-tFTiaC3Kp6GyjVBpjVscvCDk8M`

| Feuille | Catégorie JS | URL pattern |
|---------|-------------|-------------|
| Homme   | `men`       | `gviz/tq?tqx=out:csv&sheet=Homme` |
| Femme   | `women`     | `gviz/tq?tqx=out:csv&sheet=Femme` |

**Colonnes réelles du sheet :**
```
NAME | BRAND | ARTICLE | PRICE | IMAGE | LIEN | 🔐 Softr Record ID (ignoré)
```

Pas besoin de publier la feuille — le format `gviz/tq` fonctionne
tant que le sheet est partagé en "Lecture pour tous avec le lien".

## À faire (prochaines sessions)

- [ ] Intégrer le logo PNG dans la navbar et/ou hero
- [ ] Page produit (détail au clic)
- [ ] Panier léger (localStorage)
- [ ] Page Homme / Femme dédiée

## Ce qu'il NE FAUT PAS toucher sans discussion

- La logique `parseCSV()` et `loadProducts()` — fonctionnel, branché sur les vraies URLs
- Les design tokens `:root` — toute modification impacte l'ensemble du site
- La structure BEM des classes CSS

## Préférences utilisateur

- Minimaliste, avant-garde, espace généreux
- Animations subtiles uniquement (CSS pur, performance prioritaire)
- Aucune librairie UI, aucun framework
- Typographie forte comme point de différenciation
