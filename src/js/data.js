/* ══════════════════════════════════════
   INKVAULT — Données de la bibliothèque
   ══════════════════════════════════════ */

const PALETTE = [
  "#7c5cff", "#ff4d8d", "#00e0c6", "#ff8a3d",
  "#3da5ff", "#f5c518", "#e8437a", "#43d17c",
  "#9d5cff", "#ff5c5c", "#1fb6c9", "#c14bff"
];

const LIBRARY = [
  {
    id: 1, title: "One Piece", author: "Eiichiro Oda",
    format: "Manga", year: 1997, volumes: 108, read: 108,
    rating: 5, status: "Terminé", color: "#ff4d8d",
    desc: "Monkey D. Luffy part en mer pour devenir le roi des pirates et trouver le légendaire trésor One Piece. Une aventure colossale, un monde entier de personnages mémorables."
  },
  {
    id: 2, title: "Berserk", author: "Kentaro Miura",
    format: "Manga", year: 1989, volumes: 42, read: 34,
    rating: 5, status: "En cours", color: "#8b1e2d",
    desc: "Guts, le Guerrier Noir, traverse un monde de dark fantasy déchiré par la guerre et le démoniaque. Un chef-d'œuvre sombre, d'une intensité rare."
  },
  {
    id: 3, title: "Watchmen", author: "Alan Moore",
    format: "Graphic Novel", year: 1986, volumes: 1, read: 1,
    rating: 5, status: "Terminé", color: "#f5c518",
    desc: "Dans une Amérique alternative où les super-héros existent, le meurtre d'un ancien costumé déclenche une enquête qui révèle les fissures du pouvoir."
  },
  {
    id: 4, title: "Saga", author: "Brian K. Vaughan",
    format: "Comic", year: 2012, volumes: 66, read: 41,
    rating: 4.5, status: "En cours", color: "#3da5ff",
    desc: "Deux amants d'espèces ennemies fuient une guerre galactique pour protéger leur fille. Une space opera visuelle, tendre et impitoyable."
  },
  {
    id: 5, title: "Vinland Saga", author: "Makoto Yukimura",
    format: "Manga", year: 2005, volumes: 27, read: 12,
    rating: 4.5, status: "En cours", color: "#1fb6c9",
    desc: "Thorfinn grandit dans la rage de la vengeance viking avant de chercher une terre sans guerre. Une épopée sur la violence et la rédemption."
  },
  {
    id: 6, title: "Batman: Year One", author: "Frank Miller",
    format: "Comic", year: 1987, volumes: 4, read: 4,
    rating: 4.5, status: "Terminé", color: "#2c3e6b",
    desc: "Les origines de Bruce Wayne en tant que Batman, et la montée du lieutenant Gordon dans une Gotham corrompue. Sobre et fondateur."
  },
  {
    id: 7, title: "Chainsaw Man", author: "Tatsuki Fujimoto",
    format: "Manga", year: 2018, volumes: 17, read: 17,
    rating: 4.5, status: "Terminé", color: "#43d17c",
    desc: "Denji, jeune chasseur de démons endetté, fusionne avec son chien-scie et rejoint la police. Chaotique, drôle, brutal, inattendu."
  },
  {
    id: 8, title: "Spawn", author: "Todd McFarlane",
    format: "Comic", year: 1992, volumes: 32, read: 19,
    rating: 4, status: "En cours", color: "#6b7280",
    desc: "Al Simmons, agent fédéral trahi et assassiné, revient de l'enfer en Hellspawn : une cape vivante, des pouvoirs liés au péché, et un Enfer qui le réclame. Le grand succès indépendant des années 90."
  },
  {
    id: 9, title: "Monster", author: "Naoki Urasawa",
    format: "Manga", year: 1994, volumes: 18, read: 18,
    rating: 5, status: "Terminé", color: "#9d5cff",
    desc: "Un chirurgien sauve un garçon qui devient l'un des plus grands monstres de la littérature. Un thriller psychologique sans faille."
  },
  {
    id: 10, title: "Lore Olympus", author: "Rachel Smythe",
    format: "Webtoon", year: 2018, volumes: 3, read: 2,
    rating: 4, status: "En cours", color: "#e8437a",
    desc: "Perséphone et Hadès réinterprétés dans un univers coloré et contemporain. Une romance grecque moderne au visuel saisissant."
  },
  {
    id: 11, title: "Vagabond", author: "Takehiko Inoue",
    format: "Manga", year: 1998, volumes: 37, read: 8,
    rating: 5, status: "En cours", color: "#c14bff",
    desc: "La vie de Miyamoto Musashi, épéiste légendaire, dessinée avec une maîtrise de l'encre exceptionnelle. Une quête de soi."
  },
  {
    id: 12, title: "Sandman", author: "Neil Gaiman",
    format: "Graphic Novel", year: 1989, volumes: 10, read: 6,
    rating: 4.5, status: "En cours", color: "#3b4fd8",
    desc: "Rêve, le Seigneur des Rêves, s'échappe d'une captivité de décennies et reconstruit son royaume. Mythologie, horreur et poésie."
  },
  {
    id: 13, title: "Attack on Titan", author: "Hajime Isayama",
    format: "Manga", year: 2009, volumes: 34, read: 34,
    rating: 4.5, status: "Terminé", color: "#8a5a2b",
    desc: "L'humanité vit retranchée derrière d'immenses murs face aux Titans. Une histoire qui ne cesse de retourner ses propres certitudes."
  },
  {
    id: 14, title: "Spider-Man: Blue", author: "Jeph Loeb",
    format: "Comic", year: 2002, volumes: 1, read: 0,
    rating: 4, status: "Planifié", color: "#d92b2b", isbn: "9780785110712",
    desc: "Peter Parker enregistre un message pour Gwen, disparue, en revivant leurs premiers jours. Un récit nostalgique et lumineux."
  },
  {
    id: 15, title: "Solo Leveling", author: "Chugong",
    format: "Webtoon", year: 2018, volumes: 5, read: 5,
    rating: 4, status: "Terminé", color: "#6d28d9",
    desc: "Le chasseur le plus faible du monde reçoit le pouvoir de monter seul de niveau. Un enchaînement visuel dévastateur."
  },
  {
    id: 16, title: "Blame!", author: "Tsutomu Nihei",
    format: "Manga", year: 1997, volumes: 6, read: 0,
    rating: 4, status: "Planifié", color: "#4b5563",
    desc: "Killy traverse une mégastucture vertigineuse à la recherche d'un gène. Du cyberpunk architectural, presque sans paroles."
  },
  {
    id: 17, title: "Y: The Last Man", author: "Brian K. Vaughan",
    format: "Comic", year: 2002, volumes: 60, read: 23,
    rating: 4.5, status: "En cours", color: "#16a34a",
    desc: "Tous les êtres dotés d'un chromosome Y meurent simultanément. Sauf un. Une fable politique brillante."
  },
  {
    id: 18, title: "Pluto", author: "Naoki Urasawa",
    format: "Manga", year: 2003, volumes: 8, read: 8,
    rating: 5, status: "Terminé", color: "#0891b2",
    desc: "Un inspecteur enquête sur la destruction des sept robots les plus avancés du monde. Astro Boy revisité en thriller mature."
  },
  {
    id: 19, title: "The Walking Dead", author: "Robert Kirkman",
    format: "Comic", year: 2010, volumes: 19, read: 19,
    rating: 4, status: "Terminé", color: "#78716c",
    desc: "La version comic complète de l'épopée zombie, en noir et blanc, jusqu'à une finale aussi brutale qu'inattendue."
  },
  {
    id: 20, title: "Tower of God", author: "SIU",
    format: "Webtoon", year: 2010, volumes: 6, read: 3,
    rating: 4, status: "En cours", color: "#eab308",
    desc: "Bam gravit une tour infinie pour retrouver son amie Rachel. Un univers de règles, d'alliances et de trahisons."
  },
  {
    id: 21, title: "Death Note", author: "Tsugumi Ohba",
    format: "Manga", year: 2003, volumes: 12, read: 12,
    rating: 4.5, status: "Terminé", color: "#111827",
    desc: "Un cahier permet de tuer quiconque dont on connaît le nom. Light Yagami et L s'affrontent dans un duel d'intelligence légendaire."
  },
  {
    id: 22, title: "Preacher", author: "Garth Ennis",
    format: "Comic", year: 1995, volumes: 66, read: 11,
    rating: 4, status: "En cours", color: "#b45309",
    desc: "Un prédicateur doté d'un pouvoir divin part retrouver Dieu, qui a quitté le paradis. Scandaleux, drôle, tendre."
  },
  {
    id: 23, title: "20th Century Boys", author: "Naoki Urasawa",
    format: "Manga", year: 1999, volumes: 22, read: 0,
    rating: 4.5, status: "Planifié", color: "#dc2626",
    desc: "Enfants, ils inventaient des games de prophéties. Adultes, ils découvrent que quelqu'un les met réellement à exécution."
  },
  {
    id: 24, title: "Invincible", author: "Robert Kirkman",
    format: "Comic", year: 2003, volumes: 144, read: 88,
    rating: 4.5, status: "En cours", color: "#22d3ee",
    desc: "Mark Grayson hérite des pouvoirs de son père… et d'un secret qui redéfinit tout ce qu'il croyait. Super-héroïque sans filtre."
  },
  {
    id: 25, title: "Infinity Gauntlet", author: "Jim Starlin",
    format: "Comic", year: 1991, volumes: 6, read: 0,
    rating: 4.5, status: "Planifié", color: "#6d28d9",
    desc: "Thanos collectionne les six Gemmes de l'Infinité pour effacer la moitié de la vie de l'univers. Le grand crossover cosmique de Marvel, sombre et démesuré."
  },
  {
    id: 26, title: "Annihilation", author: "Dan Abnett",
    format: "Comic", year: 2006, volumes: 6, read: 0,
    rating: 4, status: "Planifié", color: "#0ea5e9",
    desc: "Une vague d'annihilation traverse la Zone Négative et dévore l'espace Marvel : Nova, la Flotte Kree et les Vengeurs cosmiques sur une seule ligne de front."
  },
  {
    id: 27, title: "Fantastic Four", author: "Jonathan Hickman",
    format: "Comic", year: 2009, volumes: 18, read: 0,
    rating: 5, status: "Planifié", color: "#3da5ff",
    desc: "La famille Richards affronte l'héritage du Docteur Fatalis et la fin du multivers. Le run qui a fait d'Hickman le bâtisseur d'arcs longs de Marvel."
  },
  {
    id: 28, title: "New Avengers", author: "Jonathan Hickman",
    format: "Comic", year: 2013, volumes: 33, read: 0,
    rating: 4.5, status: "Planifié", color: "#111827",
    desc: "Les Illuminati doivent détruire des Terres jumelles pour empêcher une collision de univers. La face sombre et mathématique du grand run Vengeurs d'Hickman."
  },
  {
    id: 29, title: "House of X / Powers of X", author: "Jonathan Hickman",
    format: "Comic", year: 2019, volumes: 12, read: 0,
    rating: 4.5, status: "Planifié", color: "#9d5cff",
    desc: "Le relaunch des X-Men : la naissance de la nation mutante de Krakoa, racontée par deux séries parallèles qui se répondent. Point de départ de l'ère Krakoa."
  },
  {
    id: 30, title: "Crisis on Infinite Earths", author: "Marv Wolfman",
    format: "Comic", year: 1985, volumes: 12, read: 12,
    rating: 5, status: "Terminé", color: "#dc2626",
    desc: "L'Anti-Voyageur efface les univers parallèles de DC un à un. Le crossover qui a redessiné le multivers et coûté la vie à Flash et Supergirl."
  },
  {
    id: 31, title: "Batman: Court of Owls", author: "Scott Snyder",
    format: "Comic", year: 2011, volumes: 6, read: 3,
    rating: 4.5, status: "En cours", color: "#1f2937",
    desc: "Une société secrète a toujours gouverné Gotham depuis l'ombre — et Bruce Wayne croyait connaître sa ville. Le New 52 de Snyder, tendu et urbain."
  },
  {
    id: 32, title: "Hellboy", author: "Mike Mignola",
    format: "Comic", year: 1994, volumes: 12, read: 0,
    rating: 4.5, status: "Planifié", color: "#b91c1c",
    desc: "L'Antéchrist invoqué en 1944 pour servir les Alliés enquête sur le surnaturel. Un trait d'encre massif, des ombres plates et du folklore mondial."
  }
];
