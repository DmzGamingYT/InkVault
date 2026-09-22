# 📚 InkVault — Bibliothèque Comics & Mangas

Bibliothèque personnelle de comics, mangas et webtoons : catalogue, notes,
progression, statistiques — et **une IA 100 % locale** (aucune clé API, aucun backend).
Site statique en HTML/CSS/JS pur, plus une coquille **desktop Electron** pour Linux.

## ✨ Fonctionnalités

- **Catalogue** : grille/liste, filtres, favoris, recherche floue, notes, progression par tome.
- **✦ Recherche par ambiance** : « un seinen sombre avec de la philosophie et de l'encre détaillée » → décomposition en facets + classement par affinité (%).
- **✦ Ordres de lecture** : fils conducteurs pas-à-pas (Hickman, Marvel Cosmic, DC Crises…), croisés avec ta bibliothèque, copiables.
- **✦ Insights & Profil de lecture** : résumés mensuels générés localement, penchants, suggestion de relecture.
- **✦ Smart Buy** : optimiseur de panier sous budget (knapsack) — « J'ai 50 € » → la meilleure combinaison de tomes.
- **Thèmes graphiques** : Manga Ink, Comics Vintage, Gotham, 🦇 Batman, ☀️ One Piece, Ligne Claire.
- **Fiches Auteurs 360°** : rôles (scénario/dessin), bio & style, jauge de bibliographie, auteurs similaires, binômes célèbres.
- **Fiche livre immersive** : galerie de planches (maquettes + extraits légaux externes), éditions/variantes, **timeline publication vs chronologie d'univers**.
- **Où l'acheter ?** : liens multi-enseignes (neuf + occasion) avec recherche pré-remplie, prêts pour l'affiliation.

## 🖥️ Desktop (Linux)

```bash
npm install
npm start              # lance l'app en développement
npm run dist:linux     # AppImage + .deb + .tar.gz dans dist/ (x64)
./scripts/make-deb.sh x64    # .deb seul (contourne fpm, cassé sous macOS)
./scripts/make-deb.sh arm64  # .deb ARM64 (Raspberry Pi, graviteurs…)
```

> Les **releases GitHub** contiennent les builds prêts à l'emploi :
> AppImage / .deb / .tar.gz en **x64 et arm64**.
> Sur Debian/Ubuntu : `sudo dpkg -i inkvault_*.deb` — ailleurs, chmod +x l'AppImage.

## 📁 Structure

| Fichier | Rôle |
|---|---|
| `index.html` / `styles.css` | Interface + design system (thèmes via `data-skin`) |
| `data.js` | Bibliothèque de démonstration |
| `store.js` | Persistance localStorage |
| `ai.js` | **Moteur d'IA local** (vibe, reading orders, insights, smart buy, auteurs, timelines) |
| `covers.js` | Résolution des couvertures (AniList / Open Library / Google Books) |
| `app.js` | Câblage de l'interface |
| `electron/` | Coquille desktop |

Aucune donnée ne quitte ton navigateur.
