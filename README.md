<div align="center">

# InkVault

### Votre bibliothèque de comics, mangas et webtoons, vraiment personnelle.

Catalogue, progression, statistiques et recommandations locales dans une application desktop conçue pour Linux.

[![Release Linux](https://github.com/DmzGamingYT/InkVault/actions/workflows/release.yml/badge.svg)](https://github.com/DmzGamingYT/InkVault/actions/workflows/release.yml)
[![Dernière version](https://img.shields.io/github/v/release/DmzGamingYT/InkVault?display_name=tag&sort=semver)](https://github.com/DmzGamingYT/InkVault/releases/latest)
[![Téléchargements](https://img.shields.io/github/downloads/DmzGamingYT/InkVault/total)](https://github.com/DmzGamingYT/InkVault/releases)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Linux](https://img.shields.io/badge/Linux-x86__64%20%7C%20arm64-2ea44f?logo=linux&logoColor=white)](https://github.com/DmzGamingYT/InkVault/releases/latest)

[**Télécharger InkVault**](https://github.com/DmzGamingYT/InkVault/releases/latest) · [Fonctionnalités](#-fonctionnalités) · [Installation](#-installation) · [Développement](#-développement)

</div>

![Aperçu du thème Gotham d’InkVault](docs/screenshots/theme-gotham.jpg)

## Pourquoi InkVault ?

InkVault rassemble votre collection et votre suivi de lecture dans une interface rapide, visuelle et personnalisable. L’application fonctionne sans compte : la bibliothèque, les notes et les recommandations restent enregistrées localement sur votre machine.

| Une collection claire | Une aide à la découverte | Vos données, chez vous |
|---|---|---|
| Recherche, filtres, favoris, notes et progression par tome. | Ambiances, ordres de lecture, profils et suggestions contextualisées. | Stockage local, sauvegarde JSON et aucun compte obligatoire. |

> InkVault est une application **HTML/CSS/JavaScript sans framework**, distribuée avec **Electron pour Linux**. Certaines fonctions d’enrichissement utilisent des services publics lorsqu’une connexion est disponible.

## ✨ Fonctionnalités

### Organiser sa bibliothèque

- Affichage en **grille ou liste**, recherche instantanée et filtres par format ou statut.
- Suivi des **tomes lus**, de la progression, des notes, des favoris et des critiques.
- Ajout et retrait rapides depuis les fiches ou les bibliographies d’auteurs.
- Variantes d’édition persistantes et galerie de couvertures avec visionneuse.
- Sauvegarde complète en **JSON** et export de la collection en **Markdown ou PDF**.

### Découvrir sa prochaine lecture

- **Recherche par ambiance** : une phrase libre est transformée en critères puis comparée à la collection.
- **Ordres de lecture hybrides** : parcours structurés à partir de la bibliothèque et enrichis par Open Library et AniList.
- **Profil de lecture** : synthèses mensuelles, tendances et suggestions de relecture calculées localement.
- **Smart Buy** : sélection optimale de tomes en fonction d’un budget donné.
- **Fiches auteurs 360°** : biographies, œuvres, rôles, thèmes, collaborations et auteurs similaires.
- **Double timeline** : ordre de publication et chronologie interne d’un univers.

### Acheter et exporter

- Liens de recherche vers Fnac, Amazon, BDFugue, Place des Libraires, Canal BD, Vinted, Rakuten et momox.
- Export natif en PDF sur desktop, impression depuis le navigateur et copie des parcours en Markdown.
- Cache local et repli hors ligne pour conserver une expérience utile sans connexion.

## 🎨 Six identités visuelles

Le sélecteur de thème applique instantanément l’apparence choisie à toute l’interface et mémorise la préférence.

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/screenshots/theme-gotham.jpg" alt="Thème Gotham" width="100%"><br>
      <strong>Gotham</strong><br><sub>Sombre et néons discrets</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/theme-ink.jpg" alt="Thème Manga Ink" width="100%"><br>
      <strong>Manga Ink</strong><br><sub>Noir, blanc et trames</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/theme-vintage.jpg" alt="Thème Comics Vintage" width="100%"><br>
      <strong>Comics Vintage</strong><br><sub>Papier et points Ben-Day</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/theme-claire.jpg" alt="Thème Ligne Claire" width="100%"><br>
      <strong>Ligne Claire</strong><br><sub>Pastel franco-belge</sub>
    </td>
    <td align="center">
      <img src="docs/screenshots/theme-batman.jpg" alt="Thème Batman" width="100%"><br>
      <strong>Batman</strong><br><sub>Bleu nuit et or</sub>
    </td>
    <td align="center">
      <img src="docs/screenshots/theme-onepiece.jpg" alt="Thème One Piece" width="100%"><br>
      <strong>One Piece</strong><br><sub>Paille, marine et soleil</sub>
    </td>
  </tr>
</table>

## 📦 Installation

Les paquets officiels sont disponibles sur la page **[Releases](https://github.com/DmzGamingYT/InkVault/releases/latest)** pour Linux `x86_64` et `arm64`.

| Format | Idéal pour | Installation |
|---|---|---|
| **AppImage** | Utilisation portable et mises à jour automatiques | Rendre le fichier exécutable puis le lancer |
| **`.deb`** | Debian, Ubuntu et distributions dérivées | `sudo apt install ./inkvault-*.deb` |
| **`.tar.gz`** | Installation portable manuelle | Extraire l’archive puis lancer InkVault |

### AppImage

```bash
chmod +x InkVault-*-linux-*.AppImage
./InkVault-*-linux-*.AppImage
```

Placez de préférence l’AppImage dans un dossier accessible en écriture, par exemple `~/Applications`, afin de permettre les mises à jour automatiques.

<details>
<summary><strong>Comment fonctionnent les mises à jour ?</strong></summary>

L’AppImage vérifie les nouvelles versions au lancement, puis toutes les six heures tant que l’application reste ouverte. Une version disponible est téléchargée en arrière-plan avant le redémarrage automatique de l’application.

- Enregistrez les modifications en cours pour éviter de perdre une saisie lors du redémarrage.
- Les erreurs de mise à jour sont consignées dans `update-errors.log`, dans le dossier de données de l’application.
- Les paquets `.deb` et `.tar.gz` ne se mettent pas à jour automatiquement ; installez la nouvelle version depuis les Releases.

</details>

## 🔒 Données et confidentialité

| Reste local | Peut utiliser Internet |
|---|---|
| Bibliothèque, notes, progression, favoris, variantes et calculs de recommandation. | Couvertures, biographies, bibliographies, ordres de lecture enrichis, polices et vérification des mises à jour. |

InkVault ne nécessite aucun compte et n’intègre pas de télémétrie applicative. Les recherches en ligne peuvent transmettre les titres ou auteurs demandés, ainsi que les informations réseau habituelles, aux services concernés : Wikipédia, Open Library, AniList, Google Books, MangaDex, Jikan, Google Fonts et GitHub.

Les parcours enrichis sont mis en cache pendant 6 heures et les fiches auteurs pendant 7 jours. MangaDex est utilisé uniquement pour les métadonnées et les couvertures de mangas, avec attribution dans l’interface.

## 🛠 Développement

### Prérequis

- [Node.js](https://nodejs.org/) 22 ou version compatible
- npm
- Linux, macOS ou Windows pour le développement ; les releases distribuées actuellement ciblent Linux

### Lancer le projet

```bash
git clone https://github.com/DmzGamingYT/InkVault.git
cd InkVault
npm ci
npm start
```

### Vérifier les changements

```bash
npm test       # tests automatisés Node.js
npm run check  # vérification syntaxique des scripts
```

### Construire les paquets Linux

```bash
npm run dist:linux        # x86_64 : AppImage, tar.gz et .deb
npm run dist:linux:arm64  # arm64 : AppImage, tar.gz et .deb
```

Chaque tag `v*` déclenche également le workflow [Release Linux](.github/workflows/release.yml), qui exécute les tests, construit les six paquets et publie automatiquement une GitHub Release.

```bash
npm version patch
git push --follow-tags
```

## 🗂️ Architecture

```text
InkVault/
├── src/
│   ├── index.html          # interface
│   ├── styles/
│   │   └── styles.css      # design system et thèmes
│   └── js/
│       ├── app.js          # contrôleur de l’interface
│       ├── ai.js           # recommandations et enrichissements
│       ├── covers.js       # résolution des couvertures
│       ├── data.js         # données de démonstration
│       └── store.js        # validation et persistance locale
├── electron/
│   ├── main.js             # fenêtre, exports et mises à jour
│   └── preload.js          # pont sécurisé vers Electron
├── tests/                  # tests automatisés
├── scripts/                # fabrication des paquets .deb
├── docs/screenshots/       # captures de la documentation
└── .github/workflows/      # intégration et publication continues
```

## 🤝 Contribuer

Les rapports de bugs et propositions sont les bienvenus dans les **[Issues GitHub](https://github.com/DmzGamingYT/InkVault/issues)**. Avant une contribution, lancez `npm test` et `npm run check` afin de vérifier que le comportement existant est conservé.

## Licence

InkVault est distribué sous licence [MIT](LICENSE).
