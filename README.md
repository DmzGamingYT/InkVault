# 📚 InkVault — Bibliothèque Comics & Mangas

[![📦 Release Linux](https://github.com/DmzGamingYT/InkVault/actions/workflows/release.yml/badge.svg)](https://github.com/DmzGamingYT/InkVault/actions/workflows/release.yml)
[![Dernière release](https://img.shields.io/github/v/release/DmzGamingYT/InkVault?label=release)](https://github.com/DmzGamingYT/InkVault/releases)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
![Plateforme](https://img.shields.io/badge/platform-Linux%20%C2%B7%20x64%20%7C%20arm64-2ea44f)

**Comics, mangas et webtoons : catalogue, notes, progression, statistiques — et une IA de recommandation qui tourne localement, enrichie par de vraies API publiques quand elle est en ligne.**
Site statique en HTML/CSS/JS pur + coquille **desktop Electron pour Linux**. Aucune donnée ne quitte ton appareil.

## 🎨 Les 6 thèmes graphiques

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/screenshots/theme-gotham.jpg" alt="Thème Gotham" width="100%"><br>
      <b>🌙 Gotham</b> — sombre & néons discrets, idéal la nuit
    </td>
    <td align="center" width="50%">
      <img src="docs/screenshots/theme-ink.jpg" alt="Thème Manga Ink" width="100%"><br>
      <b>🖋️ Manga Ink</b> — N&B tranché, trames de screentone
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/theme-vintage.jpg" alt="Thème Comics Vintage" width="100%"><br>
      <b>🗞️ Comics Vintage</b> — papier jauni, points Ben-Day
    </td>
    <td align="center">
      <img src="docs/screenshots/theme-claire.jpg" alt="Thème Ligne Claire" width="100%"><br>
      <b>✏️ Ligne Claire</b> — pastel franco-belge sobre
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/theme-batman.jpg" alt="Thème Batman" width="100%"><br>
      <b>🦇 Batman</b> — batsignal doré, bleu nuit
    </td>
    <td align="center">
      <img src="docs/screenshots/theme-onepiece.jpg" alt="Thème One Piece" width="100%"><br>
      <b>☀️ One Piece</b> — paille, or & bleu marine
    </td>
  </tr>
</table>

Un clic sur **🎨** dans la barre du haut — le thème s'applique partout et se souvient.

## ✨ Fonctionnalités

- **Catalogue** : grille/liste, filtres, favoris, recherche floue, notes, progression par tome.
- **✦ Recherche par ambiance** : « un seinen sombre avec de la philosophie et de l'encre détaillée » → décomposition en facets + classement par affinité (%).
- **✦ Ordres de lecture** : fils conducteurs pas-à-pas (Hickman, Marvel Cosmic, DC Crises…), croisés avec ta bibliothèque, copiables.
- **✦ Insights & Profil de lecture** : résumés mensuels générés localement, penchants, suggestion de relecture.
- **✦ Smart Buy** : optimiseur de panier sous budget (knapsack) — « J'ai 50 € » → la meilleure combinaison de tomes.
- **🌐 Fiches Auteurs 360°** : rôles par œuvre (scénario/dessin), style & thèmes, jauge de bibliographie, auteurs similaires, binômes célèbres — **bio Wikipédia et bibliographie complète enrichies en direct** (Open Library + Google Books, cache 7 jours, repli hors ligne sur la base locale).
- **🖼 Fiche livre immersive** : galerie de planches, variantes d'édition persistées, **double timeline** publication vs chronologie d'univers (9 chronologies codées).
- **🛒 Où l'acheter ?** : liens multi-enseignes (Fnac, Amazon, BDFugue, Place des Libraires, Canal BD… + occasion Vinted, Rakuten, momox) avec recherche pré-remplie, prêts pour l'affiliation.
- **🎨 6 thèmes** : Manga Ink, Comics Vintage, Gotham, Ligne Claire, Batman, One Piece.

## 📦 Installation — Linux

| Format | x86_64 | arm64 |
|---|---|---|
| **AppImage** | `InkVault-*-linux-x86_64.AppImage` | `InkVault-*-linux-arm64.AppImage` |
| **.deb** (Debian/Ubuntu) | `apt install ./inkvault-*-amd64.deb` | `apt install ./inkvault-*-arm64.deb` |
| **tar.gz** portable | `inkvault-*.tar.gz` | `inkvault-*-arm64.tar.gz` |

Tous les fichiers sont sur la **[page des releases](https://github.com/DmzGamingYT/InkVault/releases)**.

> **🚀 Releases automatiques** : chaque tag `v*` déclenche la CI ([`.github/workflows/release.yml`](.github/workflows/release.yml)) qui build les 6 paquets (x64 + arm64) et publie la release — zéro build local.

## 🛠 Développement

```bash
git clone https://github.com/DmzGamingYT/InkVault.git && cd InkVault
npm install
npm start                 # app Electron en dev
npm run dist:linux        # AppImage + tar.gz + .deb (x64)
npm run dist:linux:arm64  # idem pour ARM64
```

Versionner et publier une mouture :

```bash
npm version patch         # bump package.json + tag vX.Y.Z
git push --follow-tags    # → CI build & publie la release (~5 min)
```

## 📁 Structure

| Fichier | Rôle |
|---|---|
| `index.html` / `styles.css` | Interface + design system (thèmes via `data-skin`) |
| `data.js` | Bibliothèque de démonstration |
| `store.js` | Persistance localStorage |
| `ai.js` | **Moteur d'IA local** (vibe, reading orders, insights, smart buy, auteurs, timelines) + **enrichissements live** (Wikipédia, Open Library, Google Books, cache 7 j) |
| `covers.js` | Résolution des couvertures (AniList / Jikan / Google Books / Open Library) |
| `app.js` | Câblage de l'interface |
| `electron/` | Coquille desktop (liens externes ouverts dans le navigateur, instance unique) |
| `scripts/` | `make-deb.sh` + `mk-ar.py` — fabrique de `.deb` sans fpm (macOS & Linux) |
| `.github/workflows/` | `release.yml` — build & publication par tag |

## 🔒 Confidentialité

Aucune donnée ne quitte ton appareil : le catalogue, les notes et toute l'IA tournent en local. Seuls appels réseau facultatifs : **couvertures** (AniList, Open Library, Google Books) et **enrichissement des fiches auteurs** (Wikipédia, Open Library) — tous avec cache local de 7 jours et repli silencieux hors ligne.

## 📝 Licence

MIT — voir [LICENSE](LICENSE).
