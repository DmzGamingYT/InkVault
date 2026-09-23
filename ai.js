/* ══════════════════════════════════════════════════════════
   INKVAULT — Moteur d'intelligence locale
   Hors-ligne, sans clé API, sans backend. Trois services :

   ✦ AI.vibe          → recherche par ambiance & style visuel
   ✦ AI.readingOrder  → générateur d'ordres de lecture
   ✦ AI.insights      → profil de lecture mensuel
   ✦ AI.shopOf        → « Où l'acheter ? » (neuf + occasion, liens affiliation)
   ✦ AI.smartBuy      → optimiseur de panier sous budget

   Le fonctionnement est déterministe : un lexique de concepts,
   une base de connaissances sur les ouvrages / auteurs, puis
   du scoring. Aucune donnée ne sort du navigateur.
   ══════════════════════════════════════════════════════════ */

const AI = (() => {
  "use strict";

  /* ═══════════════ 0. UTILITAIRES ═══════════════ */

  const norm = s => (s == null ? "" : String(s)).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const key = s => norm(s).replace(/[^a-z0-9]+/g, " ").trim();

  const STOP = new Set(("un une des le la les de du et en avec au aux pour qui que dans sur sous par ce cet " +
    "cette ces est sont etre il elle on nous vous ils elles the of and a an to with from or but my your " +
    "tres plus moins tout tous toute toutes autre autres meme quand comment pourquoi ou alors faire fait " +
    "veux vouloir chercher cherche trouve imagine un peu j l qu s c n d m y").split(" "));

  /* Coefficient de Dice sur bigrammes — autonome (ne dépend pas de Covers) */
  function sim(a, b) {
    a = key(a); b = key(b);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 88;
    const grams = s => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
    const ga = grams(a), gb = grams(b);
    if (!ga.size || !gb.size) return 0;
    let hit = 0; ga.forEach(g => { if (gb.has(g)) hit++; });
    return Math.round((200 * hit) / (ga.size + gb.size));
  }

  const iso = d => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /* ═══════════════ 1. LEXIQUE DE CONCEPTS ═══════════════
     Les regexp sont testées sur du texte « key » :
     minuscules, sans accents, sans ponctuation.            */

  const FACETS = [
    /* ── Public ── */
    { id: "seinen",   g: "Public", label: "seinen",             w: 3, re: /\bseinen\b/ },
    { id: "shonen",   g: "Public", label: "shonen",             w: 3, re: /\bshonen\b/ },
    { id: "shojo",    g: "Public", label: "shojo / josei",      w: 3, re: /\b(shojo|josei)\b/ },
    { id: "adulte",   g: "Public", label: "pour adulte",        w: 2, re: /\b(adulte|adultes|mature)\b/ },
    { id: "jeunesse", g: "Public", label: "tous les publics",   w: 2, re: /\b(tout public|tous les publics|jeunesse|tout age)\b/ },

    /* ── Ambiance ── */
    { id: "dark", g: "Ambiance", label: "ambiance sombre", w: 2,
      re: /\b(sombre|sombers|dark|obscur|noirceur|glauque|tenebreux|morbide|sinistre|funeste|hopeless|gritty)\b|\bnoir\b(?! et blanc)/ },
    { id: "epic", g: "Ambiance", label: "épopée", w: 2,
      re: /\b(epopee|epique|legendaire|grandiose|mythique|saga|colossale)\b/ },
    { id: "tense", g: "Ambiance", label: "tension & suspense", w: 2,
      re: /\b(angoissant|angoisse|tension|suspense|haletant|intense|nerveux|frisson|terrifiant)\b/ },
    { id: "funny", g: "Ambiance", label: "humour", w: 2,
      re: /\b(humour|humor|comique|drole|legere|legers|gag|parodie|irreverieux|drole)\b/ },
    { id: "tender", g: "Ambiance", label: "émotion & poésie", w: 2,
      re: /\b(tendre|touchant|emotion|emouvant|poetique|poesie|melancolie|melancolique|nostalgie|nostalgique|doux|charmante|charmant|delicat)\b/ },
    { id: "contemplatif", g: "Ambiance", label: "contemplation", w: 2,
      re: /\b(contemplatif|contemplation|meditatif|meditation|paisible|lent|lente|zen|introspectif|silencieux)\b/ },
    { id: "violent", g: "Ambiance", label: "violence graphique", w: 3,
      re: /\b(violence|violente|violents|gore|sanglant|sanglante|cruel|cruelle|brutal|brutale|explicite|massacre|cruaute)\b/ },

    /* ── Thèmes ── */
    { id: "philo", g: "Thème", label: "philosophie", w: 3,
      re: /\b(philosophie|philosophique|philosopher|existentialisme|existential|reflexion|reflechir|metaphysique|ethique|pensee)\b/ },
    { id: "politique", g: "Thème", label: "politique & société", w: 3,
      re: /\b(politique|politiques|societe|dystopie|dystopique|satirique|regime|gouvernement|ideologie)\b/ },
    { id: "historique", g: "Thème", label: "histoire & époque", w: 3,
      re: /\b(historique|viking|vikings|samourai|samourais|moyen age|antiquite|renaissance|feodal|guerre mondiale|seconde guerre|19e siecle|20e siecle)\b/ },
    { id: "sf", g: "Thème", label: "science-fiction", w: 3,
      re: /\b(science fiction|cyberpunk|robot|robots|android|futuriste|futur|spaceship|vaisseau|galaxie|galaxies|espace|interstellaire|clone|cyborg|intelligence artificielle)\b|\bsf\b/ },
    { id: "cosmic", g: "Thème", label: "cosmique", w: 3,
      re: /\b(cosmique|cosmic|space opera|kree|skrull|celestial|guardians of the galaxy|zone negative|annihilation|nebuleuse|nova)\b/ },
    { id: "fantasy", g: "Thème", label: "fantaisie & merveilleux", w: 3,
      re: /\b(fantaisie|fantasy|fantastique|magie|magique|magicien|magicienne|dragon|elfe|sorcier|sorciere|merveille|mythologie|mythologique|surnaturel|reves)\b|\breve\b/ },
    { id: "horror", g: "Thème", label: "horreur", w: 3,
      re: /\b(horreur|epouvante|zombie|zombies|demon|demons|monstre|monstres|fantome|fantomes|possession|spectre)\b/ },
    { id: "thriller", g: "Thème", label: "thriller & enquête", w: 3,
      re: /\b(thriller|enquete|meurtre|criminel|criminelle|inspecteur|detective|psychologique|assassin|kidnapping|coupable|proces|procureur)\b/ },
    { id: "super", g: "Thème", label: "super-héros", w: 3,
      re: /\b(super heros|superheros|heros|costume|capes|mutant|mutants|vengeurs|batman|spiderman|avengers|superpuissance)\b/ },
    { id: "romance", g: "Thème", label: "romance", w: 3,
      re: /\b(romance|amour|amoureux|amoureuse|couple|romantique|passion|seduction|relation)\b/ },
    { id: "postapo", g: "Thème", label: "post-apocalypse & survie", w: 3,
      re: /\b(post apo|postapo|apocalypse|apocalyptique|survie|survivant|fin du monde|ruines|civilisation effondree)\b/ },
    { id: "aventure", g: "Thème", label: "aventure & quête", w: 3,
      re: /\b(aventure|aventurier|aventuriers|pirate|pirates|piraterie|quete|exploration|tresor|escale|route)\b/ },
    { id: "mystere", g: "Thème", label: "mystère & intrigue", w: 3,
      re: /\b(mystere|enigme|secret|secrets|twist|intrigue|complot|conspiration|double jeu|revelation)\b/ },
    { id: "guerre", g: "Thème", label: "récit de guerre", w: 3,
      re: /\b(guerre|bataille|batailles|conflit|militaire|armee|front)\b/ },
    { id: "famille", g: "Thème", label: "famille & liens", w: 2,
      re: /\b(famille|familial|familiale|enfance|education|parents|fratrie|enfant|filles?)\b/ },
    { id: "mecha", g: "Thème", label: "mecha", w: 3, re: /\b(mecha|mechas|gundam)\b/ },

    /* ── Style visuel ── */
    { id: "encre", g: "Style visuel", label: "dessin à l'encre", w: 3,
      re: /\b(encre|l encre|plume|ink|hachure|hachures|gravure|detail|intricat|carre au crayon)\b/ },
    { id: "nb", g: "Style visuel", label: "noir & blanc", w: 3,
      re: /\bnoir et blanc\b|\bn b\b|\bmonochrome\b|\bbichromie\b/ },
    { id: "colore", g: "Style visuel", label: "couleur & palette", w: 3,
      re: /\b(colore|coloree|couleur|couleurs|palette|pastel|pastels|fluor|vibrant|vibrante)\b/ },
    { id: "realiste", g: "Style visuel", label: "réalisme", w: 3,
      re: /\b(realiste|realisme|anatomie|veriste)\b/ },
    { id: "minimal", g: "Style visuel", label: "minimalisme", w: 3,
      re: /\b(minimaliste|minimalisme|epure|epuree|geometrie|geometrique|silence graphique|sans paroles|parcimonie)\b/ },
    { id: "aquarelle", g: "Style visuel", label: "aquarelle", w: 3,
      re: /\b(aquarelle|aquarelles|gouache|watercolor)\b/ },
    { id: "japonais", g: "Style visuel", label: "tradition japonaise", w: 3,
      re: /\b(japonais|japonaise|nippon|mangaka)\b/ },
    { id: "americain", g: "Style visuel", label: "tradition américaine", w: 3,
      re: /\b(americain|americaine|american|us comics)\b/ },

    /* ── Formats ── */
    { id: "comic",  g: "Format", label: "comic",           w: 4, re: /\b(comics?|bande dessinee|bande dessinees|bd)\b/ },
    { id: "manga",  g: "Format", label: "manga",           w: 4, re: /\bmanga\b/ },
    { id: "webtoon",g: "Format", label: "webtoon / manhwa",w: 4, re: /\b(webtoon|manhwa|manhua)\b/ },
    { id: "gn",     g: "Format", label: "roman graphique", w: 4, re: /\b(roman graphique|graphic novel|romans graphiques)\b/ },

    /* ── Époques (jugées sur l'année de publication) ── */
    { id: "y60",  g: "Époque", label: "années 60", w: 3, dec: 1960, re: /\b(annees 60|60s|1960)\b/ },
    { id: "y70",  g: "Époque", label: "années 70", w: 3, dec: 1970, re: /\b(annees 70|70s|1970)\b/ },
    { id: "y80",  g: "Époque", label: "années 80", w: 3, dec: 1980, re: /\b(annees 80|80s|1980)\b/ },
    { id: "y90",  g: "Époque", label: "années 90", w: 3, dec: 1990, re: /\b(annees 90|90s|90 s|1990)\b/ },
    { id: "y00",  g: "Époque", label: "années 2000", w: 3, dec: 2000, re: /\b(annees 2000|annees 00|2000s|y2k)\b/ },
    { id: "y10",  g: "Époque", label: "années 2010", w: 3, dec: 2010, re: /\b(annees 2010|annees 10|2010s)\b/ },
    { id: "y20",  g: "Époque", label: "années 2020", w: 3, dec: 2020,
      re: /\b(annees 2020|annees 20|2020s|recent|recente|contemporain|contemporaine|moderne|aujourd hui)\b/ },
    { id: "yold", g: "Époque", label: "avant les années 90", w: 2, maxYear: 1989,
      re: /\b(vieux|vintage|ancien|ancienne|retro|classique|classiques)\b/ }
  ];

  /* ═══════════════ 2. BASE DE CONNAISSANCES ═══════════════ */

  const KB_TITLE = {
    "one piece":            ["aventure", "epic", "funny", "shonen", "colore", "famille"],
    "berserk":              ["dark", "violent", "fantasy", "historique", "seinen", "encre", "guerre", "horror", "tense"],
    "watchmen":             ["dark", "super", "politique", "philo", "gn", "realiste", "mystere"],
    "saga":                 ["cosmic", "sf", "romance", "guerre", "adulte", "comic", "tender"],
    "vinland saga":         ["historique", "guerre", "aventure", "seinen", "philo", "epic", "tense"],
    "batman year one":      ["super", "dark", "thriller", "realiste", "comic"],
    "chainsaw man":         ["dark", "violent", "horror", "funny", "shonen", "tense"],
    "spawn":                ["dark", "super", "violent", "comic", "encre", "horror"],
    "monster":              ["thriller", "dark", "philo", "seinen", "mystere", "realiste"],
    "lore olympus":         ["romance", "fantasy", "colore", "webtoon", "tender"],
    "vagabond":             ["historique", "philo", "encre", "contemplatif", "seinen", "aventure", "realiste"],
    "sandman":              ["fantasy", "dark", "philo", "tender", "mystere", "horror"],
    "attack on titan":      ["dark", "violent", "mystere", "tense", "shonen", "guerre", "epic"],
    "spider man blue":      ["super", "tender", "romance", "comic"],
    "solo leveling":        ["fantasy", "dark", "violent", "webtoon", "epic", "tense"],
    "blame":                ["sf", "minimal", "dark", "seinen", "encre"],
    "y the last man":       ["politique", "sf", "thriller", "postapo", "comic", "mystere"],
    "pluto":                ["sf", "thriller", "philo", "seinen", "realiste", "mystere"],
    "the walking dead":     ["postapo", "horror", "dark", "violent", "comic", "tense"],
    "tower of god":         ["aventure", "fantasy", "mystere", "webtoon", "epic"],
    "death note":           ["thriller", "dark", "mystere", "shonen", "philo"],
    "preacher":             ["dark", "funny", "violent", "comic", "politique"],
    "20th century boys":    ["mystere", "thriller", "seinen", "politique", "tense", "tender"],
    "invincible":           ["super", "violent", "epic", "comic", "funny"],
    "infinity gauntlet":    ["cosmic", "super", "epic", "dark", "comic", "guerre"],
    "annihilation":         ["cosmic", "sf", "epic", "comic", "guerre"],
    "fantastic four":       ["sf", "super", "comic", "epic"],
    "new avengers":         ["super", "dark", "sf", "comic", "tense"],
    "house of x powers of x": ["super", "sf", "mystere", "comic"],
    "crisis on infinite earths": ["super", "epic", "sf", "comic", "dark"],
    "batman court of owls": ["super", "dark", "thriller", "mystere", "comic"],
    "hellboy":              ["dark", "horror", "fantasy", "encre", "comic", "mystere"]
  };

  /* Tags d'auteur : uniquement ce qui est vrai pour TOUTE son œuvre. */
  const KB_AUTHOR = {
    "eiichiro oda":       ["shonen", "aventure", "funny", "epic"],
    "kentaro miura":      ["dark", "seinen", "encre", "violent"],
    "alan moore":         ["politique", "philo", "dark", "mystere"],
    "brian k vaughan":    ["sf", "mystere", "comic"],
    "makoto yukimura":    ["historique", "philo", "aventure"],
    "frank miller":       ["dark", "realiste", "super"],
    "tatsuki fujimoto":   ["funny", "violent", "dark"],
    "todd mcfarlane":     ["dark", "super", "encre", "violent"],
    "naoki urasawa":      ["thriller", "seinen", "philo", "realiste", "mystere"],
    "rachel smythe":      ["romance", "fantasy", "colore", "webtoon"],
    "takehiko inoue":     ["encre", "philo", "contemplatif", "seinen"],
    "neil gaiman":        ["fantasy", "philo", "dark", "tender"],
    "hajime isayama":     ["dark", "violent", "tense", "mystere"],
    "jeph loeb":          ["super", "tender"],
    "chugong":            ["fantasy", "dark", "epic", "webtoon"],
    "tsutomu nihei":      ["sf", "minimal", "dark", "seinen"],
    "robert kirkman":     ["dark", "violent", "comic"],
    "siu":                ["aventure", "fantasy", "webtoon"],
    "tsugumi ohba":       ["thriller", "dark", "mystere"],
    "garth ennis":        ["funny", "violent", "dark"],
    "jim starlin":        ["cosmic", "super", "epic", "dark"],
    "dan abnett":         ["cosmic", "sf", "epic"],
    "jonathan hickman":   ["super", "sf", "politique", "mystere", "comic"],
    "marv wolfman":       ["super", "epic", "sf"],
    "scott snyder":       ["super", "dark", "thriller", "mystere"],
    "mike mignola":       ["dark", "horror", "fantasy", "encre"]
  };

  const FMT_TAG = { "Comic": "comic", "Manga": "manga", "Webtoon": "webtoon", "Graphic Novel": "gn" };

  const tagCache = new Map();

  /* Tags d'un ouvrage = titre + auteur + texte (desc/avis) + format */
  function tagsOf(item) {
    if (!item) return new Set();
    const sig = [item.id, item.format, item.title, item.author, item.year, item.desc, item.review].join("|");
    const hit = tagCache.get(sig);
    if (hit) return hit;

    const t = new Set();
    if (FMT_TAG[item.format]) t.add(FMT_TAG[item.format]);
    if (item.format === "Manga") t.add("japonais");

    const kt = key(item.title), ka = key(item.author);
    (KB_TITLE[kt] || []).forEach(x => t.add(x));
    (KB_AUTHOR[ka] || []).forEach(x => t.add(x));

    const text = kt + " " + key(item.desc || "") + " " + key(item.review || "");
    for (const f of FACETS) {
      if (f.dec || f.maxYear || !f.re) continue;
      if (f.re.test(text)) t.add(f.id);
    }

    if (tagCache.size > 600) tagCache.clear();
    tagCache.set(sig, t);
    return t;
  }

  /* ═══════════════ 3. PARSING D'UNE DEMANDE D'AMBIANCE ═══════════════ */

  function parse(raw) {
    let q = " " + key(raw) + " ";
    const negs = [];

    /* Négation légère : « sans encre », « pas de zombie » */
    q = q.replace(/\b(sans|sauf|hors de|excepte|pas de|jamais de)\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,3})/g,
      (m, w, tail) => { tail.split(/\s+/).forEach(x => x && negs.push(x)); return " "; });

    const facets = [];
    const consumed = new Set();

    for (const f of FACETS) {
      if (!f.re) continue;
      const m = f.re.exec(q);
      if (!m) continue;
      const ws = m[0].split(/\s+/).filter(Boolean);
      if (ws.some(w => negs.includes(w))) continue;   // « sans encre » → on ignore le concept
      facets.push(f);
      ws.forEach(w => consumed.add(w));
    }

    const toks = key(q).split(" ")
      .filter(w => w && w.length > 1 && !STOP.has(w) && !consumed.has(w) && !negs.includes(w));

    return { facets, toks, negs };
  }

  /* ═══════════════ 4. RECHERCHE PAR AMBIANCE ═══════════════ */

  function facetHit(f, item) {
    if (f.dec) return Math.floor(item.year / 10) * 10 === f.dec;
    if (f.maxYear) return item.year <= f.maxYear;
    return tagsOf(item).has(f.id);
  }

  function vibe(raw, items) {
    const { facets, toks, negs } = parse(raw);
    const hasSignal = facets.length > 0 || toks.length > 0;
    const possible = facets.reduce((s, f) => s + f.w * 12, 0) + toks.length * 10;

    /* « sans violence » → on repère le concept écarté pour pénaliser les ouvrages qui le portent */
    const negFacets = [];
    const probes = negs.concat(negs.length > 1 ? [negs.join(" ")] : []);
    if (negs.length) FACETS.forEach(f => {
      if (f.re && !facets.includes(f) && probes.some(p => f.re.test(p))) negFacets.push(f);
    });

    const matches = [];

    for (const it of items || []) {
      const text = key(it.title + " " + it.author + " " + (it.desc || "") + " " + (it.review || ""));
      let score = 0;
      const why = [];

      for (const f of facets) {
        if (facetHit(f, it)) { score += f.w * 12; why.push(f.label); }
        else score -= f.w * 6;
      }
      for (const f of negFacets) if (facetHit(f, it)) score -= f.w * 12;
      for (const w of toks) {
        if (key(it.title) === w) score += 16;
        else if (text.includes(w)) score += 10;
        else if (sim(w, it.title) >= 78 || sim(w, it.author) >= 78) score += 7;
        else score -= 4;
      }
      for (const n of negs) if (text.includes(n)) score -= 30;

      if (!hasSignal || score > 0) {
        matches.push({
          item: it,
          score,
          why,
          pct: hasSignal ? Math.max(1, Math.min(99, Math.round((score / Math.max(possible, 1)) * 100))) : 0
        });
      }
    }

    matches.sort((a, b) => b.score - a.score || b.item.rating - a.item.rating || a.item.title.localeCompare(b.item.title));

    return {
      q: raw,
      facets: facets.map(f => ({ id: f.id, g: f.g, label: f.label })),
      toks, negs, hasSignal, matches
    };
  }

  /* ═══════════════ 5. ORDRES DE LECTURE ═══════════════ */

  const ORDERS = [
    {
      id: "hickman",
      keys: ["hickman", "jonathan hickman", "run de hickman", "house of x"],
      q: "Dans quel ordre lire le run de Jonathan Hickman ?",
      title: "Jonathan Hickman — le fil conducteur",
      blurb: "Du Fantastic Four à Krakoa en passant par Secret Wars : ses runs forment une seule méga-architecture. Voici la ligne à suivre.",
      note: "La règle d'Hickman : tout part lentement, tout se referme. N'interromps pas un arc pour un crossover — Avengers et New Avengers se lisent en parallèle, c'est là que se joue la tension de l'Incursion.",
      steps: [
        { t: "The Nightly News", a: "Jonathan Hickman", y: 2007, k: "optionnel",
          why: "Son premier run : la signature visuelle (infographies, plages graphiques) s'y invente." },
        { t: "Secret Warriors", a: "Jonathan Hickman", y: 2008, k: "essentiel",
          why: "Point d'entrée idéal chez Marvel : Fury contre une hydre infectée. Pose la mécanique des longues boucles narratives." },
        { t: "Fantastic Four", a: "Jonathan Hickman", y: 2009, k: "essentiel",
          why: "Le cœur de son œuvre : la famille, la science, le sacrifice. Se lit avant Future Foundation." },
        { t: "FF (Future Foundation)", a: "Jonathan Hickman", y: 2011, k: "essentiel",
          why: "La suite directe, qui prépare les personnages qui paieront le prix plus tard." },
        { t: "The Manhattan Projects", a: "Jonathan Hickman", y: 2012, k: "autonome",
          why: "Hors Marvel, en indépendant : sa démonstration la plus libre de jeux d'architecture narrative." },
        { t: "Avengers", a: "Jonathan Hickman", y: 2012, k: "essentiel",
          why: "Le Marvel Now d'Hickman : une machine à raconter l'échelle mondiale." },
        { t: "New Avengers", a: "Jonathan Hickman", y: 2013, k: "essentiel",
          why: "À enchaîner EN PARALLÈLE avec Avengers : c'est ici que naît la vraie menace (les Incursions)." },
        { t: "Infinity", a: "Jonathan Hickman", y: 2013, k: "essentiel",
          why: "Le point de jonction des deux runs : la guerre contre Thanos sur la ligne de front cosmique." },
        { t: "Secret Wars", a: "Jonathan Hickman", y: 2015, k: "essentiel",
          why: "Le grand final : effondrement du multivers, Battleworld. À lire sans rien interrompre." },
        { t: "East of West", a: "Jonathan Hickman", y: 2013, k: "autonome",
          why: "Apocalypse, Far West et politique : sa saga la plus personnelle, en sol indépendant." },
        { t: "The Black Monday Murders", a: "Jonathan Hickman", y: 2016, k: "optionnel",
          why: "Thriller occulte et financier — le meilleur de son goût pour le dossiers multipliés." },
        { t: "House of X / Powers of X", a: "Jonathan Hickman", y: 2019, k: "essentiel",
          why: "Relance des X-Men : deux séries qui se répondent et installent le plan de Krakoa." },
        { t: "X-Men (ère Krakoa)", a: "Jonathan Hickman", y: 2019, k: "essentiel",
          why: "Les séries X-Men dans l'ordre de publication, avec les événements X of Swords puis Inferno pour conclure." },
        { t: "Ultimate Invasion / Ultimate Spider-Man", a: "Jonathan Hickman", y: 2023, k: "essentiel",
          why: "Nouveau univers Ultimate : sa dernière grande ligne, et un point d'entrée propre pour un nouveau lecteur." },
        { t: "3 Worlds / 3 Moons", a: "Jonathan Hickman", y: 2023, k: "optionnel",
          why: "Son univers creator-owned en cours : à suivre si tu as aimé la méthode." }
      ]
    },

    {
      id: "cosmic",
      keys: ["annihilation", "marvel cosmic", "cosmic marvel", "saga cosmique", "guardians", "nova marvel"],
      q: "La saga cosmique Marvel (Annihilation) dans l'ordre",
      title: "Marvel Cosmic — d'Annihilation aux Gardiens",
      blurb: "Le rebranding qui a sauvé les héros de l'espace : une guerre continue de 2006 à 2010, à lire d'un bloc.",
      note: "Tout se suit : chaque événement enchaîne directement sur le suivant, sans break. Les Vengeurs de la Terre n'interviennent quasiment pas — c'est ce qui rend ce cycle aussi libre.",
      steps: [
        { t: "Annihilation Prologue", a: "Dan Abnett", y: 2006, k: "contexte",
          why: "Le déclic : la Zone Négative s'ouvre et la Horde d'Annihilation entre en scène." },
        { t: "Annihilation", a: "Dan Abnett", y: 2006, k: "essentiel",
          why: "La grande guerre d'espace : Nova, les Vaisseaux de la mort, la Flotte Kree. Le socle de tout le cycle." },
        { t: "Annihilation: Conquest", a: "Dan Abnett", y: 2007, k: "essentiel",
          why: "Suite immédiate : Phalanx et la technologie assimilatrice. Naissance de la future équipe." },
        { t: "Guardians of the Galaxy (vol. 1)", a: "Dan Abnett", y: 2008, k: "essentiel",
          why: "L'équipe se forme dans la foulée du crossover — c'est la genèse du Guardians qu'on connaît." },
        { t: "War of Kings", a: "Dan Abnett", y: 2008, k: "essentiel",
          why: "Kree contre Shi'ar, avec les Inhumains et les Frères d'étoiles. La guerre civile de l'espace." },
        { t: "Realm of Kings", a: "Dan Abnett", y: 2010, k: "essentiel",
          why: "Les conséquences : la zone négative stabilisée, et le final du grand cycle." },
        { t: "Guardians of the Galaxy (vol. 3)", a: "Dan Abnett", y: 2012, k: "contexte",
          why: "Relance post-Avengers vs X-Men : la version la plus accessible, celle du film." },
        { t: "Silver Surfer: Requiem", a: "J. Michael Straczynski", y: 2008, k: "optionnel",
          why: "Hors cycle, mais la plus belle méditation sur la puissance cosmique." }
      ]
    },

    {
      id: "thanos",
      keys: ["thanos", "infinity gauntlet", "gantelet", "gant de l infini", "gemmes"],
      q: "Thanos et l'Infinity Gauntlet dans l'ordre",
      title: "Thanos — la ligne de l'Infinity Gauntlet",
      blurb: "De la collecte des Gemmes au crossover de 1991, puis ses relectures modernes.",
      note: "Les suites de 1992-93 sont facultatives : Infinity Gauntlet reste le sommet. Pour une première lecture, Thanos Quest + Gauntlet suffisent amplement.",
      steps: [
        { t: "The Silver Surfer (contexte)", a: "Marvel", y: 1990, k: "contexte",
          why: "La genèse du personnage et du Gant se joue dans le cycle original de Silver Surfer." },
        { t: "The Thanos Quest", a: "Jim Starlin", y: 1990, k: "essentiel",
          why: "Il collecte les six Gemmes une par une. La meilleure intro : courte, élégante, redoutable." },
        { t: "Infinity Gauntlet", a: "Jim Starlin", y: 1991, k: "essentiel",
          why: "Le claquement de doigts et la guerre qui suit. Le grand crossover Marvel, sombre et démesuré." },
        { t: "Infinity War / Infinity Crusade", a: "Jim Starlin", y: 1992, k: "optionnel",
          why: "Les suites directes : plus longues et moins resserrées, à lire si l'envie reste." },
        { t: "Infinity Abyss", a: "Jim Starlin", y: 2004, k: "optionnel",
          why: "Retour de Starlin et de sa cosmologie personnelle." },
        { t: "Marvel: The End", a: "Jim Starlin", y: 2005, k: "optionnel",
          why: "La fin définitive (de Thanos, en tout cas) — clin d'œil aux lecteurs du cycle 90s." },
        { t: "The Thanos Imperative", a: "Dan Abnett", y: 2010, k: "contexte",
          why: "Le Thanos moderne, encastré dans le cycle cosmique d'Annihilation." },
        { t: "Infinity", a: "Jonathan Hickman", y: 2013, k: "contexte",
          why: "La relecture contemporaine : Thanos traque les Inhumans pendant le run Vengeurs." }
      ]
    },

    {
      id: "batman",
      keys: ["batman", "court of owls", "year one", "scott snyder", "gotham"],
      q: "Batman : de Year One à Court of Owls",
      title: "Batman — des fondations à Gotham secrète",
      blurb: "Une ligne claire : poser le policier, comprendre la ville, puis la retourner.",
      note: "Deux époques qui se répondent : Miller pose le Batman-homme, Snyder le Gotham-mythologie. Tout le reste est une variation autour de ces deux axes.",
      steps: [
        { t: "Batman: Year One", a: "Frank Miller", y: 1987, k: "essentiel",
          why: "Les origines en parallèle avec Gordon. Sobre, réaliste, fondateur : la référence absolue." },
        { t: "The Man Who Laughs", a: "Ed Brubaker", y: 1999, k: "essentiel",
          why: "La première rencontre avec le Joker — à lire juste après Year One." },
        { t: "Batman: The Long Halloween", a: "Jeph Loeb", y: 1996, k: "essentiel",
          why: "Un meurtre par mois et la chute de la famille Falcone : la transition vers l'Arkham moderne." },
        { t: "Batman: Dark Victory", a: "Jeph Loeb", y: 1999, k: "essentiel",
          why: "La suite directe : l'apparition de Dick Grayson et la fin de cette trilogie estivale." },
        { t: "Robin: Year One / Batgirl: Year One", a: "Chuck Dixon", y: 2004, k: "optionnel",
          why: "Les compléments de la famille Bat, dans le même esprit rétro." },
        { t: "Batman: Hush", a: "Jeph Loeb", y: 2002, k: "contexte",
          why: "Le tour des grandes figures de Gotham, dessiné par Jim Lee : efficace et très « classique »." },
        { t: "Batman: The Black Mirror", a: "Scott Snyder", y: 2011, k: "contexte",
          why: "Snyder avant le New 52, avec Dick Grayson en Batman — la passerelle idéale vers son run." },
        { t: "Batman: Court of Owls / City of Owls", a: "Scott Snyder", y: 2011, k: "essentiel",
          why: "Gotham a une mémoire secrète et Bruce croyait tout connaître de sa ville. Le grand retour." },
        { t: "Batman: Death of the Family", a: "Scott Snyder", y: 2013, k: "optionnel",
          why: "Le Joker s'attaque à la famille Bat entière." },
        { t: "Batman: Zero Year", a: "Scott Snyder", y: 2013, k: "optionnel",
          why: "La re-fondation New 52 des origines, si tu veux l'autre version de Year One." },
        { t: "Dark Nights: Metal", a: "Scott Snyder", y: 2017, k: "optionnel",
          why: "La bascule cosmique de Gotham — à prendre comme un bonus, pas comme une suite." }
      ]
    },

    {
      id: "crisis",
      keys: ["crisis", "multivers", "crisis on infinite earths", "dc crisis", "flashpoint"],
      q: "Les crises DC et le multivers dans l'ordre",
      title: "DC — la ligne des Crises",
      blurb: "Cinq reconfigurations du multivers, de 1985 à aujourd'hui, dans l'ordre de publication.",
      note: "Chaque Crisis efface ou réécrit la précédente. Si tu ne devais en lire qu'une : Crisis on Infinite Earths pour l'histoire, Flashpoint pour comprendre le paysage actuel.",
      steps: [
        { t: "Crisis on Infinite Earths", a: "Marv Wolfman", y: 1985, k: "essentiel",
          why: "L'Anti-Voyageur rase les univers parallèles. Le premier grand choc, et la mort de Flash et Supergirl." },
        { t: "Zero Hour", a: "Dan Jurgens", y: 1994, k: "optionnel",
          why: "Le point milieu : il rationalise les chronologies après la première Crisis." },
        { t: "Infinite Crisis", a: "Geoff Johns", y: 2005, k: "essentiel",
          why: "La réponse 40 ans plus tard : des héros du monde perdu reviennent juger la nôtre." },
        { t: "Final Crisis", a: "Grant Morrison", y: 2008, k: "essentiel",
          why: "Darkseid tombe et le temps se brise. Difficile, expérimental, incontournable." },
        { t: "Flashpoint", a: "Geoff Johns", y: 2011, k: "essentiel",
          why: "Barry Allen change une seconde et le monde bascule : c'est le déclencheur du New 52." },
        { t: "DC Rebirth", a: "Geoff Johns", y: 2016, k: "contexte",
          why: "La restauration : quelque chose — ou quelqu'un — a volé les années heureuses." },
        { t: "Doomsday Clock", a: "Geoff Johns", y: 2017, k: "essentiel",
          why: "Le pont officiel entre Watchmen et l'univers DC. À lire après Watchmen." },
        { t: "Dark Nights: Metal", a: "Scott Snyder", y: 2017, k: "optionnel",
          why: "Le multivers des versions sombres de Batman." },
        { t: "Infinite Frontier / Dark Crisis", a: "Joshua Williamson", y: 2021, k: "optionnel",
          why: "Toutes les histoires sont vraies en même temps : l'état actuel du multivers DC." }
      ]
    },

    {
      id: "watchmen",
      keys: ["watchmen", "doomsday clock", "before watchmen", "alan moore"],
      q: "Watchmen et son héritage dans l'ordre",
      title: "Watchmen — l'œuvre et ses héritages",
      blurb: "Le roman graphique de référence, puis ce que les autres en ont fait.",
      note: "Watchmen se suffit à lui-même : les préquelles sont optionnelles et inégales. En revanche, Doomsday Clock suppose d'avoir lu Watchmen intégralement.",
      steps: [
        { t: "Watchmen", a: "Alan Moore", y: 1986, k: "essentiel",
          why: "Le meurtre d'un ancien costumé et l'enquête qui fissure le pouvoir. Se lit d'un bloc, chapitre après chapitre." },
        { t: "Before Watchmen", a: "Varia", y: 2012, k: "optionnel",
          why: "Les préquelles (Rorschach, Dr Manhattan, Ozymandias…) : inégales, à prendre comme un bonus." },
        { t: "Batman / Superman: The Button", a: "Tom King", y: 2017, k: "contexte",
          why: "Le pont minimal : la bouton de complément de Dr Manhattan dans le DC." },
        { t: "Doomsday Clock", a: "Geoff Johns", y: 2017, k: "essentiel",
          why: "La seule vraie « suite » : Dr Manhattan observe l'univers DC. Se lit après Watchmen, pas avant." },
        { t: "Rorschach", a: "Tom King", y: 2020, k: "optionnel",
          why: "Une réflexion indépendante brillante sur le masque et l'Amérique — sans être une suite." }
      ]
    },

    {
      id: "berserk",
      keys: ["berserk", "miura", "guts", "griffith", "dark fantasy"],
      q: "Berserk : par quel arc commencer ?",
      title: "Berserk — les arcs dans l'ordre",
      blurb: "Une seule règle : la linéarité. Berserk se lit sans saut d'arc, sans résumé, sans chronologie recomposée.",
      note: "Ne commence PAS par l'anime des années 90 : il saute le début et termine sur l'Éclipse sans préparer le terrain. Le manga seul, dans l'ordre, est la bonne porte d'entrée.",
      steps: [
        { t: "Berserk", a: "Kentaro Miura", y: 1989, k: "essentiel", arc: "Ouverture : l'Épéiste noir & L'Âge d'Or",
          why: "Les premiers tomes posent le monde puis plongent dans le passé de Guts : le lien avec Griffith et Casca, qui porte toute la série." },
        { t: "Berserk", a: "Kentaro Miura", y: 1989, k: "essentiel", arc: "L'Éclipse (fin de l'Âge d'Or)",
          why: "Le basculement, le point de non-retour. Tout ce qui suit en découle directement." },
        { t: "Berserk", a: "Kentaro Miura", y: 1996, k: "essentiel", arc: "Arc « Conviction »",
          why: "La reconstruction : Farnese, Serpico et Isidro rejoignent la marche, et la Guerre Sainte s'ouvre." },
        { t: "Berserk", a: "Kentaro Miura", y: 2003, k: "essentiel", arc: "Arc « Millennium Falcon »",
          why: "L'échelle s'élargit vers la guerre des nations, sous l'emprise de l'armure Berserker." },
        { t: "Berserk", a: "Kentaro Miura", y: 2010, k: "essentiel", arc: "Arc « Fantasia »",
          why: "Le dernier chant dessiné par Miura — se lit au fil des chapitres, avec les suites assurées par l'équipe." },
        { t: "Films « Golden Age Arc » (Berserk)", a: "Studio 4°C", y: 2012, k: "optionnel",
          why: "Les trois films relient l'adaptation au manga : un bon complément visuel, jamais un substitut." }
      ]
    },

    {
      id: "urasawa",
      keys: ["urasawa", "monster", "20th century boys", "pluto", "trilogie"],
      q: "La trilogie d'Naoki Urasawa dans l'ordre",
      title: "Urasawa — de Monster à Pluto",
      blurb: "Trois œuvres sans lien direct, mais une montée en complexité parfaitement lisible.",
      note: "Aucun des trois n'exige les autres. L'ordre proposé suit une progression : le thriller intime, puis l'épopée générationnelle, puis la réécriture SF.",
      steps: [
        { t: "Monster", a: "Naoki Urasawa", y: 1994, k: "essentiel",
          why: "Un chirurgien a sauvé un garçon qui devient un monstre : le thriller psychologique qui pose tout son univers." },
        { t: "20th Century Boys", a: "Naoki Urasawa", y: 1999, k: "essentiel",
          why: "Même terrain, échelle démultipliée : l'enfance, les prophéties et une conjuration qui s'accomplit." },
        { t: "Pluto", a: "Naoki Urasawa", y: 2003, k: "essentiel",
          why: "Astro Boy réécrit en thriller mature — autonome, mais il se lit d'autant mieux après les deux précédents." },
        { t: "Master Keaton", a: "Naoki Urasawa", y: 1994, k: "optionnel",
          why: "En parallèle de Monster : enquêtes plus légères, même main sûre." },
        { t: "Happy!", a: "Naoki Urasawa", y: 1999, k: "optionnel",
          why: "Une courte comédie noire pour souffler entre deux sagas." }
      ]
    },

    {
      id: "sandman",
      keys: ["sandman", "gaiman", "neil gaiman", "dream", "reves"],
      q: "Sandman de Neil Gaiman dans l'ordre",
      title: "Sandman — les dix tomes, dans l'ordre",
      blurb: "Une série à la fois très linéaire et très libre : deux fils se suivent, les nouvelles se lisent comme des îles.",
      note: "Préaludes & Nocturnes puis The Doll's House donnent le ton ; si après le tome 4 l'envie est là, enchaîne jusqu'au bout. The Kindely Ones + The Wake forment le vrai final.",
      steps: [
        { t: "Sandman t.1 — Preludes & Nocturnes", a: "Neil Gaiman", y: 1989, k: "essentiel",
          why: "Rêve s'échappe d'une captivité de décennies et reconquiert son royaume. On entre par les cauchemars." },
        { t: "Sandman t.2 — The Doll's House", a: "Neil Gaiman", y: 1990, k: "essentiel",
          why: "La série prend sa véritable envergure : cauchemars en liberté et récit de famille." },
        { t: "Sandman t.3 — Dream Country", a: "Neil Gaiman", y: 1991, k: "optionnel",
          why: "Quatre nouvelles autonomes — dont le célèbre Calliope." },
        { t: "Sandman t.4 — Season of Mists", a: "Neil Gaiman", y: 1992, k: "essentiel",
          why: "Rêve au paradis : le plus beau sommet de la série, et la porte des mythologies." },
        { t: "Sandman t.5 — A Midsummer Night's Dream", a: "Neil Gaiman", y: 1991, k: "optionnel",
          why: "Shakespeare, la scène et le rêve — la structure en germe de la fin." },
        { t: "Sandman t.6 — Fables & Reflections", a: "Neil Gaiman", y: 1993, k: "optionnel",
          why: "Nouvelles et origines du Panthéon : à lire entre deux arcs si tu veux souffler." },
        { t: "Sandman t.7 — Brief Lives", a: "Neil Gaiman", y: 1994, k: "essentiel",
          why: "La quête familiale de Destruction : le tournant émotionnel de la série." },
        { t: "Sandman t.8 — Worlds' End", a: "Neil Gaiman", y: 1996, k: "optionnel",
          why: "Une auberge de récits, en préparation du final." },
        { t: "Sandman t.9 — The Kindly Ones", a: "Neil Gaiman", y: 1997, k: "essentiel",
          why: "Les Erynies viennent chercher Rêve. Tout ce qui a été semé est ramassé ici." },
        { t: "Sandman t.10 — The Wake", a: "Neil Gaiman", y: 1997, k: "essentiel",
          why: "L'adieu — à lire sans interruption, juste après le tome 9." },
        { t: "Sandman: Overture", a: "Neil Gaiman", y: 2013, k: "contexte",
          why: "La préquelle illustrée : à réserver aux lecteurs ayant terminé la série." },
        { t: "Death: The High Cost of Living", a: "Neil Gaiman", y: 1993, k: "autonome",
          why: "Le spin-off de Sœur Mort : tendre, urbain, idéal après The Wake." }
      ]
    },

    {
      id: "onepiece",
      keys: ["one piece", "oda", "grand line", "luffy"],
      q: "One Piece : par quelle saga commencer ?",
      title: "One Piece — les grandes sagas dans l'ordre",
      blurb: "La série est linéaire, mais repérer les sagas évite de se perdre dans ses 100+ tomes.",
      note: "Deux conseils : ne saute jamais une saga (les arcs « intermèdes » reviennent), et lis la Guerre de l'Apex d'un bloc — c'est le point de non-retour de toute la série.",
      steps: [
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "East Blue",
          why: "Les fondations : Luffy, Zoro, Nami, la promesse et le départ en mer. Le meilleur début de série qui soit." },
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "Alabasta",
          why: "Première guerre ouverte, première Warlord affrontée : la série prend son échelle." },
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "Jaya & Skypiea",
          why: "L'île dans le ciel : souvent sautée par les lecteurs pressés, et pourtant elle revient des années plus tard." },
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "Water 7 / Enies Lobby",
          why: "Le coup de tonnerre : Usopp, la Buster Call, et « Robin, je veux vivre ! ». Le grand moment de la première moitié." },
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "Thriller Bark",
          why: "L'arc le plus fun — et le premier aperçu sérieux des Sept Corsaires." },
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "Sabaody, Impel Down, Marineford",
          why: "La Guerre de l'Apex, à lire sans coupure : la promesse d'entrant, la défaite, et le séparé de l'équipage." },
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "Retour : Fish-Man Island → Punk Hazard → Dressrosa",
          why: "Le Nouveau Monde s'ouvre : l'équipage est reformé et la nouvelle équipe se structure." },
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "Whole Cake Island",
          why: "Sanji, le clan Vinsmoke et le pari amoureux : le développement le plus émotionnel de l'ère du Timeskip." },
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "Wano Kuni",
          why: "Kaido, les samouraïs et la plus longue préparation de la série — lue comme une épopée d'un seul tenant." },
        { t: "One Piece", a: "Eiichiro Oda", y: 1997, k: "essentiel", arc: "Egghead & la suite",
          why: "Les révélations s'accélèrent : le manga se poursuit, suis les chapitres au fil de leur parution." }
      ]
    }
  ];

  /* ─── Rapprochement demande ↔ ordre codé ─── */
  function findOrder(raw) {
    const Q = key(raw);
    if (!Q) return null;
    let best = null, bestScore = 0;

    for (const o of ORDERS) {
      for (const k of o.keys) {
        const K = key(k);
        let s = 0;
        if (Q.includes(K)) s = 100 + K.length;
        else {
          const kt = K.split(" ").filter(w => w.length > 3);
          if (kt.length) {
            const qt = new Set(Q.split(" "));
            const hit = kt.filter(w => qt.has(w)).length;
            s = (hit / kt.length) * 85;
          }
        }
        if (s > bestScore) { bestScore = s; best = o; }
      }
    }
    return bestScore >= 55 ? best : null;
  }

  /* ─── Ordre reconstruit depuis la bibliothèque ─── */
  function generatedOrder(raw, items) {
    const hits = items
      .map(it => ({ it, s: Math.max(sim(raw, it.title), Math.round(sim(raw, it.author) * 0.85)) }))
      .filter(x => x.s >= 55)
      .sort((a, b) => b.s - a.s)
      .map(x => x.it);

    if (!hits.length) return null;

    const main = hits[0];
    const steps = [];
    const seen = new Set();

    const push = (st) => {
      if (seen.has(st.t + "|" + (st.arc || ""))) return;
      seen.add(st.t + "|" + (st.arc || ""));
      steps.push(st);
    };

    if (main.read > 0 && main.read < main.volumes) {
      push({
        t: main.title, a: main.author, y: main.year, k: "reprise",
        why: `Tu es au tome ${main.read}/${main.volumes} : reprends exactement ici avant d'enchaîner la suite.`
      });
    }

    if (main.read >= main.volumes) {
      push({ t: main.title, a: main.author, y: main.year, k: "essentiel",
        why: `Déjà terminé — ${main.volumes} tomes acquis. La base est posée, passe aux étapes suivantes.` });
    } else if (main.read > 0) {
      push({ t: main.title, a: main.author, y: main.year, k: "essentiel",
        why: `Finir les ${main.volumes - main.read} tomes restants avant de changer de terrain.` });
    } else {
      push({ t: main.title, a: main.author, y: main.year, k: "essentiel",
        why: `Point de départ : ${main.volumes} tomes${main.volumes > 1 ? "s" : ""}, publié en ${main.year}.` });
    }

    const others = items
      .filter(i => i.id !== main.id && (i.author === main.author || hits.some(h => h.id === i.id)))
      .sort((a, b) => a.year - b.year);

    others.forEach((it, i) => {
      const same = it.author === main.author;
      push({
        t: it.title, a: it.author, y: it.year, k: "contexte",
        why: same
          ? `Autre œuvre de ${it.author} (${it.year}) — à lire après ${main.title} si l'envie reste.`
          : `Proche de ta demande (${it.year}) — se glisse naturellement dans le même parcours.`
      });
    });

    if (steps.length === 1 && main.status === "Terminé" && !others.length) {
      push({ t: main.title, a: main.author, y: main.year, k: "optionnel",
        why: "Série linéaire et terminée : il n'y a rien d'autre à ordonner. Branche-toi plutôt sur un autre auteur de ta collection." });
    }

    return {
      kind: "generated",
      title: `Parcours proposé — ${main.title}`,
      blurb: `Ordre reconstruit à partir de ta bibliothèque (proximité titre/auteur) et de l'ordre de publication.`,
      note: "Aucun ordre canonique n'est codé pour cette demande : voici la lecture la plus cohérente que je puisse tirer de ta collection. Ajoute les tomes manquants et je l'affinerai.",
      steps
    };
  }

  /* Rapprochement prudent entre une étape et un ouvrage de la collection :
     seules les correspondances sûres sont liées (l'étape nomme l'ouvrage,
     ou l'ouvrage est une sous-partie de l'étape). */
  function linkScore(stepTitle, itemTitle) {
    const a = key(stepTitle), b = key(itemTitle);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.startsWith(b + " ")) return 90;   // « Sandman » ↔ « Sandman t.1 — … »
    if (b.includes(a) || a.includes(b)) return 0;   // « Avengers » ↛ « New Avengers »
    const s = sim(a, b);
    return s >= 72 ? s : 0;
  }

  function attachLibrary(steps, items) {
    return steps.map(s => {
      let best = null, bs = 0;
      for (const it of items) {
        const sc = linkScore(s.t, it.title);
        if (sc > bs) { bs = sc; best = it; }
      }
      return Object.assign({}, s, { item: best });
    });
  }

  function readingOrder(raw, items) {
    items = items || [];
    const q = String(raw || "").trim();
    if (!q) return { kind: "none", q: "", steps: [], suggestions: [] };

    const curated = findOrder(q);
    if (curated) {
      return {
        kind: "curated",
        q,
        title: curated.title,
        blurb: curated.blurb,
        note: curated.note,
        steps: attachLibrary(curated.steps, items)
      };
    }

    const gen = generatedOrder(q, items);
    if (gen) {
      gen.q = q;
      gen.steps = attachLibrary(gen.steps, items);
      return gen;
    }

    return {
      kind: "none",
      q,
      steps: [],
      suggestions: ORDERS.slice(0, 6).map(o => ({ q: o.q, title: o.title }))
    };
  }

  function orderSuggestions() {
    return ORDERS.map(o => ({ q: o.q, title: o.title }));
  }

  /* ═══════════════ 6. INSIGHTS & PROFIL DE LECTURE ═══════════════ */

  const THEME_LABEL = {
    historique: "le roman historique",
    philo: "le récit philosophique",
    sf: "la science-fiction",
    cosmic: "le space opera cosmique",
    fantasy: "la fantaisie",
    horror: "l'horreur",
    thriller: "le thriller psychologique",
    super: "le super-héroïque",
    romance: "la romance",
    postapo: "la post-apocalypse",
    aventure: "l'aventure",
    mystere: "le mystère",
    guerre: "le récit de guerre",
    famille: "le récit familial",
    mecha: "le mecha",
    dark: "l'ambiance sombre",
    violent: "la violence graphique",
    tender: "l'émotion et la poésie",
    contemplatif: "la contemplation",
    funny: "l'humour",
    tense: "la tension",
    encre: "le dessin à l'encre",
    nb: "le noir & blanc",
    colore: "la couleur",
    minimal: "le minimalisme",
    realiste: "le réalisme",
    politique: "la politique et la société",
    adulte: "les récits pour adulte",
    seinen: "le seinen",
    shonen: "le shonen"
  };

  function insights(items, activity, opts) {
    opts = opts || {};
    items = items || [];
    activity = activity || {};
    const offset = Math.max(0, parseInt(opts.offset, 10) || 0);

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    const sISO = iso(start), eISO = iso(end);

    const finished = items.filter(it => it.finishedAt && it.finishedAt >= sISO && it.finishedAt < eISO);
    const added    = items.filter(it => it.addedAt && it.addedAt >= sISO && it.addedAt < eISO);

    const seen = new Set(), scope = [];
    finished.concat(added).forEach(it => { if (!seen.has(it.id)) { seen.add(it.id); scope.push(it); } });

    let sessions = 0, activeDays = 0;
    Object.keys(activity).forEach(k => {
      if (k >= sISO && k < eISO) {
        const n = activity[k] | 0;
        if (n > 0) { sessions += n; activeDays++; }
      }
    });

    const prevStart = new Date(now.getFullYear(), now.getMonth() - offset - 1, 1);
    const prevEnd   = start;
    const ps = iso(prevStart), pe = iso(prevEnd);
    const prevFinished = items.filter(it => it.finishedAt && it.finishedAt >= ps && it.finishedAt < pe).length;

    const mode = scope.length ? "month" : "global";
    const base = mode === "month" ? scope : items;

    /* ── penchants ── */
    const counts = Object.create(null);
    base.forEach(it => tagsOf(it).forEach(t => {
      if (THEME_LABEL[t]) counts[t] = (counts[t] || 0) + 1;
    }));
    const themes = Object.keys(counts)
      .map(id => ({ id, label: THEME_LABEL[id], count: counts[id], pct: Math.round((100 * counts[id]) / Math.max(1, base.length)) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 4);

    /* ── formats ── */
    const fc = Object.create(null);
    base.forEach(it => fc[it.format] = (fc[it.format] || 0) + 1);
    const formats = Object.keys(fc)
      .map(f => ({ format: f, count: fc[f], pct: Math.round((100 * fc[f]) / Math.max(1, base.length)) }))
      .sort((a, b) => b.count - a.count);

    /* ── auteur dominant du mois ── */
    const ac = Object.create(null);
    scope.forEach(it => ac[it.author] = (ac[it.author] || 0) + 1);
    const topAuthor = Object.keys(ac).map(a => ({ name: a, n: ac[a] })).sort((a, b) => b.n - a.n)[0] || null;

    /* ── notes ── */
    const ratedM = base.filter(i => i.rating > 0);
    const avg = ratedM.length ? ratedM.reduce((s, i) => s + i.rating, 0) / ratedM.length : 0;
    const allR = items.filter(i => i.rating > 0);
    const avgGlobal = allR.length ? allR.reduce((s, i) => s + i.rating, 0) / allR.length : 0;

    /* ── suggestion de prochaine lecture ── */
    let suggestion = null;
    const cands = items.filter(i => i.status !== "Terminé");
    let bs = -1;
    cands.forEach(i => {
      const t = tagsOf(i);
      let s = 0;
      themes.forEach((th, n) => { if (t.has(th.id)) s += (4 - n) * 3; });
      s += (i.rating || 0) * 2;
      if (i.status === "Planifié" && !i.read) s += 3;
      if (i.read > 0 && i.status === "En cours") s += 1;
      if (s > bs) { bs = s; suggestion = i; }
    });
    if (bs <= 0) suggestion = null;

    /* ── narratif ── */
    const label = cap(new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(start));
    const parts = [];
    const head = offset === 0 ? "Ce mois-ci" : `En ${label.toLowerCase()}`;

    if (mode === "month") {
      parts.push(`${head}, tu as ${finished.length
        ? `terminé ${finished.length} ouvrage${finished.length > 1 ? "s" : ""}`
        : "terminé aucun ouvrage"} et ${added.length
        ? `ajouté ${added.length} à ta bibliothèque`
        : "rien ajouté de nouveau"}.`);
      if (themes[0]) parts.push(`Ta lecture a penché à ${themes[0].pct}% vers ${themes[0].label}.`);
      if (formats[0]) parts.push(`${formats[0].format} domine (${formats[0].pct}% des ouvrages concernés).`);
      if (topAuthor && scope.length > 1 && topAuthor.n >= 2 && topAuthor.n >= scope.length * 0.3)
        parts.push(`${topAuthor.name} a occupé l'essentiel de tes pages.`);
      if (avg) parts.push(`Note moyenne : ${avg.toFixed(1)}/5, contre ${avgGlobal.toFixed(1)}/5 pour l'ensemble de ta collection.`);

      const df = finished.length - prevFinished;
      const delta = df === 0 ? "identique au mois précédent"
        : df > 0 ? `+${df} terminé${df > 1 ? "s" : ""} sur le mois précédent`
        : `${-df} de moins que le mois précédent`;
      parts.push(sessions > 0
        ? `${sessions} session${sessions > 1 ? "s" : ""} de lecture sur ${activeDays} jour${activeDays > 1 ? "s" : ""} actif${activeDays > 1 ? "s" : ""} — ${delta}.`
        : `Aucune session de lecture enregistrée ${offset === 0 ? "ce mois-ci" : "ce mois-là"} — ${delta}.`);
    } else {
      parts.push(`Pas encore assez de mouvement en ${label.toLowerCase()} : voici le profil global de tes ${items.length} ouvrages.`);
      if (themes[0]) parts.push(`${cap(themes[0].label)} arrive en tête, présent sur ${themes[0].pct}% de la collection.`);
      if (formats[0]) parts.push(`${formats[0].format} domine avec ${formats[0].pct}% des titres.`);
      if (avgGlobal) parts.push(`Note moyenne globale : ${avgGlobal.toFixed(1)}/5.`);
    }

    return {
      offset, label, mode,
      scopeSize: scope.length,
      finished, added, sessions, activeDays, prevFinished,
      delta: finished.length - prevFinished,
      themes, formats, topAuthor,
      avg, avgGlobal, suggestion,
      text: parts.join(" ")
    };
  }

  /* ═══════════════ 8. SHOP — ENSEIGNES, PRIX, OCCASION ═══════════════ */

  /* 💰 Monétisation : renseigne tes identifiants d'affiliation et les liens
     « Neuf » deviennent rémunérateurs (Amazon Associates, Fnac Affiliate…).
     Chaîne vide = lien 100 % normal, rien ne casse en attendant.          */
  const AFFILIATES = {
    amazon: "",   // ex. "inkvault-21" → amazon.fr/tag
    fnac:   ""    // ex. "abc123"      → programme Fnac Affiliate (4PMI)
  };

  /* Prix publics indicatifs par format (neuf, €) — base de l'estimation */
  const UNIT_PRICE = { "Manga": 6.95, "Comic": 14.99, "Graphic Novel": 21.9, "Webtoon": 12.5 };
  const unitPrice = it => UNIT_PRICE[it && it.format] || 12.9;

  /* Heuristique « rupture d'édition » (démo) : tirage d'époque ou comics
     des 80-90 → l'occasion est souvent la voie la plus sûre. */
  const oopOf = it => !!it && (it.year <= 1995 || (it.format === "Comic" && it.year <= 2005));

  /* Requête envoyée aux enseignes : titre + auteur (+ tome en cours) */
  function shopQuery(it) {
    const next = it.volumes > 1 && it.read < it.volumes ? ` tome ${it.read + 1}` : "";
    return `${it.title}${next} ${it.author}`;
  }

  function shopOf(it) {
    const q    = encodeURIComponent(shopQuery(it));
    const affA = AFFILIATES.amazon ? `&tag=${encodeURIComponent(AFFILIATES.amazon)}` : "";
    const affF = AFFILIATES.fnac   ? `&afmc=${encodeURIComponent(AFFILIATES.fnac)}` : "";
    const unit = unitPrice(it);
    const oop  = oopOf(it);
    return {
      unit, oop,
      query: shopQuery(it),
      next: it.volumes > 1 && it.read < it.volumes ? it.read + 1 : null,
      /* Grandes enseignes & en ligne */
      neuf: [
        { n: "Fnac",                u: `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${q}${affF}` },
        { n: "Amazon",              u: `https://www.amazon.fr/s?k=${q}${affA}` },
        { n: "BDFugue",             u: `https://www.bdfugue.com/catalogsearch/result/?q=${q}` },
        /* Librairies indépendantes & réseaux */
        { n: "Place des Libraires",  u: `https://www.placedeslibraires.fr/listeliv.php?base=paper&mots_recherche=${q}` },
        { n: "Canal BD",            u: `https://www.canalbd.net/?s=${q}` },
        { n: "La Librairie",        u: "https://www.lalibrairie.com/" }
      ],
      /* Seconde main — le réflexe si le tirage est épuisé */
      occasion: [
        { n: "Vinted",              u: `https://www.vinted.fr/catalog?search_text=${q}` },
        { n: "Chasse-aux-Livres",   u: `https://www.chasse-aux-livres.fr/recherche?q=${q}` },
        { n: "Rakuten",             u: `https://fr.shopping.rakuten.com/search?q=${q}` },
        { n: "momox shop",          u: "https://www.momox-shop.fr/" }
      ]
    };
  }

  /* ═══════════════ 9. SMART BUY — OPTIMISEUR DE PANIER ═══════════════ */

  /* Contrainte budgétaire, valorisation d'une « envie » :
     petit sac à dos (knapsack) en programmation dynamique.
     Chaque série incomplète propose 0 à 4 variantes (1 tome, mini-pack,
     pack de 3, compléter la série) — une seule variante retenue par série. */
  function smartBuy(budget, items) {
    const B = Math.max(0, Math.round((parseFloat(budget) || 0) * 100));
    const eur = c => (c / 100).toFixed(2).replace(".", ",") + " €";

    const pool = (items || []).filter(it =>
      it && it.volumes > 0 && it.read < it.volumes && it.status !== "Terminé");

    if (!pool.length) {
      return {
        budget: B, picks: [], spent: 0, left: B, tomes: 0, cheapest: 0,
        text: "Ta bibliothèque est à jour : rien à compléter. Prochain coup ? " +
              "Élargis ta wishlist — demande-moi un ordre de lecture pour enchaîner sur un nouveau run."
      };
    }

    const groups = pool.map(it => {
      const missing = it.volumes - it.read;
      const unit = Math.round(unitPrice(it) * 100);
      let sc = 0;
      const why = [];
      if (it.status === "En cours")  { sc += 3;   why.push("série en cours"); }
      if (it.status === "Planifié")  sc += 0.8;
      if (it.fav)                    { sc += 2;   why.push("favori"); }
      if (it.rating >= 4.5)          { sc += 1.2; why.push(`noté ${it.rating}/5`); }
      const pg = it.read / it.volumes;
      if (pg >= 0.7)                 { sc += 1.4; why.push(`déjà ${Math.round(pg * 100)} % lu`); }
      const oop = oopOf(it);
      if (oop)                       { sc += 0.4; why.push("tirage ancien → occasion"); }

      const opts = [{ n: 0, cost: 0, val: 0 }];
      const mk = n => opts.push({ n, cost: n * unit, val: sc * Math.sqrt(n) });
      mk(1);
      if (missing >= 2) mk(Math.min(3, missing));
      if (missing > 3)  mk(missing);

      return { it, missing, unit, sc, why, oop, opts };
    });

    /* ── DP groupe par groupe (variante exclusive par série) ── */
    const NEG = -1e15;
    let dp = new Float64Array(B + 1); dp.fill(NEG); dp[0] = 0;
    const pickIdx = [], pickCost = [];

    for (const g of groups) {
      const next = Float64Array.from(dp);
      const pi = new Int16Array(B + 1).fill(-2);   // -2 = variante non retenue
      const pc = new Int32Array(B + 1);
      for (let oi = 0; oi < g.opts.length; oi++) {
        const o = g.opts[oi];
        if (!o.cost) continue;
        for (let c = o.cost; c <= B; c++) {
          if (dp[c - o.cost] <= NEG / 2) continue;
          const v = dp[c - o.cost] + o.val;
          if (v > next[c] + 1e-9) { next[c] = v; pi[c] = oi; pc[c] = o.cost; }
        }
      }
      dp = next; pickIdx.push(pi); pickCost.push(pc);
    }

    /* Meilleur total : valeur max, puis le plus petit coût en cas d'égalité */
    let best = 0;
    for (let c = 1; c <= B; c++) if (dp[c] > dp[best] + 1e-9) best = c;

    /* ── Reconstruction de la solution ── */
    const picks = [];
    let c = best;
    for (let g = groups.length - 1; g >= 0; g--) {
      const oi = pickIdx[g][c];
      if (oi >= 0) {
        const o = groups[g].opts[oi];
        picks.push({
          id: groups[g].it.id, title: groups[g].it.title, author: groups[g].it.author,
          format: groups[g].it.format, status: groups[g].it.status,
          n: o.n, from: groups[g].it.read + 1, to: groups[g].it.read + o.n,
          missing: groups[g].missing, cost: o.cost, unit: groups[g].unit,
          occ: Math.round(o.cost * 0.55),
          why: groups[g].why, oop: groups[g].oop, score: groups[g].sc
        });
        c -= pickCost[g][c];
      }
    }
    picks.sort((a, b) => b.score - a.score);

    const spent   = picks.reduce((s, p) => s + p.cost, 0);
    const tomes   = picks.reduce((s, p) => s + p.n, 0);
    const left    = B - spent;
    const cheapest = Math.min(...groups.map(g => g.unit));

    let text;
    if (!picks.length) {
      text = `Avec ${eur(B)}, même le tome le plus accessible ne rentre pas ` +
             `(à partir de ${eur(cheapest)}). Monte le budget d'un cran ou vise l'occasion.`;
    } else {
      const série = picks.length;
      text = `Meilleur combo détecté : <b>${tomes} tome${tomes > 1 ? "s" : ""}</b> ` +
             `pour <b>${eur(spent)}</b>` +
             (série > 1 ? ` répartis sur ${série} séries` : "") +
             ` — il reste <b>${eur(left)}</b> sur tes ${eur(B)}. ` +
             (left >= cheapest
               ? "Il te reste de quoi ajouter un tome supplémentaire."
               : "Budget exploité au maximum.");
    }

    return { budget: B, picks, spent, left, tomes, cheapest, text };
  }

  /* ═══════════════ 10. FICHES AUTEURS — RÉSEAU ARTISTIQUE ═══════════════ */

  /* Base de connaissance locale (démo) :
     r = rôles · b = bio · s = style · t = thèmes · i = influences
     sim = auteurs proches · duos = binômes célèbres · bib = biblio majeure estimée */
  const AUTHORS = {
    "Eiichiro Oda": {
      r: ["Scénariste", "Dessinateur"], bib: 1,
      b: "Né en 1975, Eiichiro Oda dessine One Piece depuis 1997 : le mangaka le plus lu de la planète, bâtisseur d'un monde foisonnant où chaque île est un genre à part entière.",
      s: "Mise en page qui court comme une estampe décomplexée, designs exagérés, foules de silhouettes mémorables.",
      t: ["aventure", "liberté", "amitié", "piraterie"],
      i: ["Dragon Ball — Akira Toriyama", "Cobra — Tsukasa Hojo"],
      sim: ["Masashi Kishimoto", "Hiroyuki Takei"], duos: []
    },
    "Kentaro Miura": {
      r: ["Scénariste", "Dessinateur"], bib: 4,
      b: "Kentaro Miura (1966-2021) a consacré sa vie à Berserk, huit ans par tome à son apogée : le maître de la dark fantasy graphique, mort en plein travail en 2021.",
      s: "Encre noire saturée, hachures obsessionnelles, gros plans gravés comme des estampes du XIXe siècle.",
      t: ["dark fantasy", "destin", "violence", "démonie"],
      i: ["Guin Saga — Kaoru Kurimoto", "Moebius"],
      sim: ["Takehiko Inoue", "Hajime Isayama", "Makoto Yukimura"], duos: []
    },
    "Alan Moore": {
      r: ["Scénariste"], bib: 7,
      b: "Né en 1953, le romancier du comics : Watchmen, V for Vendetta, From Hell — il a prouvé que la case pouvait porter la densité d'un roman.",
      s: "Structures en boucle, notes de bas de page, déconstruction sèche des mythes héroïques.",
      t: ["super-héros déconstruit", "pouvoir", "sorcellerie", "anarchie"],
      i: ["William S. Burroughs", "Michael Moorcock"],
      sim: ["Neil Gaiman", "Frank Miller"],
      duos: [{ with: "Dave Gibbons", note: "Watchmen — le duo qui a inventé le comics moderne" }]
    },
    "Brian K. Vaughan": {
      r: ["Scénariste"], bib: 6,
      b: "Né en 1976, le scénariste US le plus polyvalent : Saga, Y: The Last Man, Ex Machina — chaque série devient un classique presque immédiat.",
      s: "Dialogue millimétré, rebondissements à chaque chapitre, humanisme même dans la science-fiction.",
      t: ["famille", "politique", "survie", "SF intime"],
      i: ["Stephen King", "Chris Claremont"],
      sim: ["Robert Kirkman", "Neil Gaiman"],
      duos: [
        { with: "Fiona Staples", note: "Saga — binôme scénariste/dessinateur récurrent" },
        { with: "Pia Guerra", note: "Y: The Last Man" }
      ]
    },
    "Makoto Yukimura": {
      r: ["Scénariste", "Dessinateur"], bib: 4,
      b: "Né en 1980, a d'abord signé Planetes (SF réaliste) avant Vinland Saga : le mangaka du pacifisme raconté à l'épée.",
      s: "Gros plans expressifs, silences, batailles chorégraphiées puis vidées de leurs corps.",
      t: ["guerre", "rédemption", "évolution", "vikings"],
      i: ["Saga des Völsungs", "Akira Kurosawa"],
      sim: ["Kentaro Miura", "Takehiko Inoue"], duos: []
    },
    "Frank Miller": {
      r: ["Scénariste", "Dessinateur"], bib: 6,
      b: "Né en 1957, a durci Daredevil puis réinventé Batman avec The Dark Knight Returns : le néo-noir américain signé d'une seule main.",
      s: "Noirs tranchés, cases vides, narrations blanches qui cognent comme des coups de poing.",
      t: ["Gotham", "justice", "mythe sombre", "émeute"],
      i: ["Will Eisner", "Mickey Spillane"],
      sim: ["Scott Snyder", "Alan Moore"],
      duos: [
        { with: "David Mazzucchelli", note: "Batman: Year One" },
        { with: "Klaus Janson", note: "The Dark Knight Returns — encrages" }
      ]
    },
    "Tatsuki Fujimoto": {
      r: ["Scénariste", "Dessinateur"], bib: 5,
      b: "Né en 1992, le magicien de la planche 20 : Chainsaw Man, Look Back — toute une génération redessine comme lui.",
      s: "Storyboards qui claquent comme de l'animation, humour sec, chaos parfaitement cadré.",
      t: ["démonie", "sacrifice", "adolescence", "horreur comique"],
      i: ["Akira — Katsuhiro Otomo", "GeGeGe no Kitaro — Shigeru Mizuki"],
      sim: ["Hajime Isayama", "Mike Mignola"], duos: []
    },
    "Todd McFarlane": {
      r: ["Scénariste", "Dessinateur"], bib: 4,
      b: "Né en 1970, a redessiné Spider-Man puis cofondé Image en 1992 : Spawn a prouvé qu'un creator pouvait se vendre comme les majors.",
      s: "Capes impossibles, détails obsessionnels, imagerie MTV des années 90.",
      t: ["enfer", "rédemption", "anti-héros", "horreur"],
      i: ["Jack Kirby", "Bernie Wrightson"],
      sim: ["Mike Mignola", "Garth Ennis"], duos: []
    },
    "Naoki Urasawa": {
      r: ["Scénariste", "Dessinateur"], bib: 6,
      b: "Né en 1957, le romancier du manga : Monster, Pluto, 20th Century Boys — le thriller au ralenti qui se lit comme une série télé.",
      s: "Plans larges, regards qui durent, réalisme sobre hérité de Tezuka.",
      t: ["identité", "morale", "mystère", "contre-enquête"],
      i: ["Astro Boy — Osamu Tezuka", "Yoshihiro Tatsumi"],
      sim: ["Takehiko Inoue", "Hirohiko Araki"], duos: []
    },
    "Rachel Smythe": {
      r: ["Scénariste", "Dessinateur"], bib: 1,
      b: "Autrice néo-zélandaise, a lancé Lore Olympus sur Webtoon en 2018 : la mythologie grecque devenue romance graphique virale.",
      s: "Couleurs saturées, dégradés vaporeux, silhouettes à la Disney mais sombres.",
      t: ["mythologie", "romance", "destin", "pouvoir"],
      i: ["Mythologie homérique", "Sailor Moon — Naoko Takeuchi"],
      sim: ["Quimchee (I Love Yoo)", "Chugong"], duos: []
    },
    "Takehiko Inoue": {
      r: ["Scénariste", "Dessinateur"], bib: 5,
      b: "Né en 1967 : Slam Dunk, puis Vagabond, puis Real — trois genres, une seule maîtrise de l'encre à la brosse.",
      s: "Trait réaliste, lavis, cases silencieuses — l'encre japonaise poussée à son sommet contemporain.",
      t: ["samouraï", "dépassement", "solitude", "éthique"],
      i: ["Musashi — Eiji Yoshikawa", "Akira Kurosawa"],
      sim: ["Naoki Urasawa", "Jirō Taniguchi"], duos: []
    },
    "Neil Gaiman": {
      r: ["Scénariste"], bib: 6,
      b: "Né en 1960, le conteur britannique : Sandman a démontré que les comics pouvaient être de la littérature pure.",
      s: "Mythologie recyclée, narrateur omniscient qui murmure, horreur douce et mélancolique.",
      t: ["rêves", "mythologie", "fée", "mort"],
      i: ["C.S. Lewis", "Ursula K. Le Guin"],
      sim: ["Alan Moore", "Mike Mignola"],
      duos: [{ with: "Dave McKean", note: "Sandman — couvertures & collages" }]
    },
    "Hajime Isayama": {
      r: ["Scénariste", "Dessinateur"], bib: 3,
      b: "Né en 1986, a signé un seul grand manga : Attack on Titan, 34 tomes d'une escalade horrifique sans filet de sécurité.",
      s: "Frontières rudes, compositions vertigineuses, budget de cases qui explose avec la terreur.",
      t: ["liberté", "horreur", "guerre", "décadence"],
      i: ["The Mist — Stephen King", "Kaiji — Nobuyuki Fukumoto"],
      sim: ["Tatsuki Fujimoto", "Kentaro Miura"], duos: []
    },
    "Jeph Loeb": {
      r: ["Scénariste"], bib: 6,
      b: "Né en 1962, moitié du duo Loeb/Sale : les Color Books (Spider-Man Blue…) et The Long Halloween — la nostalgie en voix off.",
      s: "Saisons, souvenirs en narration, romance au rythme des fêtes et des crimes.",
      t: ["nostalgie", "origines", "crime", "saisons"],
      i: ["Stan Lee", "Steve Englehart"],
      sim: ["Scott Snyder", "Frank Miller"],
      duos: [{ with: "Tim Sale", note: "Spider-Man Blue, Long Halloween — le duo des Color Books" }]
    },
    "Chugong": {
      r: ["Scénariste"], bib: 2,
      b: "Webtooniste coréen, a commencé Solo Leveling en 2016 : le fantasy-system qui a popularisé la progression RPG en scroll vertical.",
      s: "Scroll fluide, effets lumineux, niveau de puissance illustré page après page.",
      t: ["progression", "solitude", "pouvoir", "chasse"],
      i: ["Sword Art Online — Reki Kawahara"],
      sim: ["SIU", "Rachel Smythe"],
      duos: [{ with: "DUBU (REDICE Studio)", note: "Solo Leveling — le trait qui a fait exploser le webtoon" }]
    },
    "Tsutomu Nihei": {
      r: ["Scénariste", "Dessinateur"], bib: 5,
      b: "Né en 1976, architecte de la mégastucture : Blame! puis Sidonia — du cyberpunk presque sans paroles.",
      s: "Architecture vertigineuse, personnages minuscules dans le cadre, quasi-silence.",
      t: ["cyberpunk", "isolement", "technologie", "dystopie"],
      i: ["Moebius", "L'Incal — Jodorowsky & Moebius"],
      sim: ["Katsuhiro Otomo", "Tatsuki Fujimoto"], duos: []
    },
    "Robert Kirkman": {
      r: ["Scénariste"], bib: 5,
      b: "Né en 1978, a fondé Skybound chez Image et écrit deux épopées de vingt ans : The Walking Dead et Invincible.",
      s: "Noir & blanc glacial pour TWD, flat colors primaries pour Invincible, dialogues naturels façon série télé.",
      t: ["survie", "pouvoir", "famille", "apocalypse"],
      i: ["George A. Romero", "Chris Claremont"],
      sim: ["Brian K. Vaughan", "Garth Ennis"],
      duos: [{ with: "Tony Moore & Charlie Adlard", note: "The Walking Dead — les deux visages de l'apocalypse" }]
    },
    "SIU": {
      r: ["Scénariste", "Dessinateur"], bib: 2,
      b: "Webtooniste coréen, publie Tower of God depuis 2010 : un monde de règles, de niveaux et d'alliances à décoder.",
      s: "Architecture de niveaux, combats lisibles, scroll vertical comme ascension.",
      t: ["ascension", "amitié", "trahison", "jeu"],
      i: ["Hunter × Hunter — Yoshihiro Togashi"],
      sim: ["Chugong", "Hajime Isayama"], duos: []
    },
    "Tsugumi Ohba": {
      r: ["Scénariste"], bib: 3,
      b: "Scénariste jamais interviewé, signe Death Note puis Bakuman avec Takeshi Obata : le duel d'intelligence le plus populaire du manga.",
      s: "Schémas, listes, clair-obscur — tout devient échiquier mental.",
      t: ["jeu d'esprit", "justice", "orgueil", "dualité"],
      i: ["Sherlock Holmes", "Tohai — Keiichi Shirozaki"],
      sim: ["Naoki Urasawa", "Tatsuki Fujimoto"],
      duos: [{ with: "Takeshi Obata", note: "Death Note & Bakuman — le binôme scénariste/dessinateur" }]
    },
    "Garth Ennis": {
      r: ["Scénariste"], bib: 7,
      b: "Né en 1971 en Irlande du Nord : Preacher, The Boys — la violence catholique et la tendresse cachée sous les gros mots.",
      s: "Planches lisibles, punchlines, gore avec du cœur et du souvenir de guerre.",
      t: ["religion", "amitié", "violence", "anticléricalisme"],
      i: ["The Punisher — Gerry Conway", "Mad Magazine"],
      sim: ["Robert Kirkman", "Frank Miller"],
      duos: [{ with: "Steve Dillon", note: "Preacher & Punisher MAX — le duo ombre/punchline" }]
    },
    "Jim Starlin": {
      r: ["Scénariste", "Dessinateur"], bib: 5,
      b: "Né en 1948, le penseur cosmique de Marvel : Thanos et les Infinity Gems — il a fait du super-héros un mythe grec.",
      s: "Cosmos baroque, corps divinisés, narrateur omniscient et grandiloquent.",
      t: ["cosmos", "vanité", "mort", "destin"],
      i: ["2001 : L'Odyssée de l'espace", "Frank Herbert"],
      sim: ["Jonathan Hickman", "Dan Abnett"],
      duos: [{ with: "Ron Lim", note: "Infinity Gauntlet — le dessin de la fin du monde" }]
    },
    "Dan Abnett": {
      r: ["Scénariste"], bib: 6,
      b: "Né en 1965, moitié d'Abnett & Lanning : la renaissance du cosmic Marvel (Annihilation) et une œuvre Warhammer colossale.",
      s: "Chœurs de personnages, plans de bataille lisibles, humour d'équipage.",
      t: ["cosmos", "flotte", "guerre", "team"],
      i: ["Star Wars", "E. E. 'Doc' Smith"],
      sim: ["Jim Starlin", "Jonathan Hickman"],
      duos: [{ with: "Andy Lanning", note: "« Abnett & Lanning » — le duo qui a sauvé le cosmic Marvel" }]
    },
    "Jonathan Hickman": {
      r: ["Scénariste"], bib: 8,
      b: "Né en 1971, le bâtisseur : FF, New Avengers, House of X — des architectures de séries sur cinq ans et des diagrammes devenus comics.",
      s: "Design graphique (logos, chartes), voix off programmatiques, arcs longs qui se referment au millimètre.",
      t: ["multivers", "système", "pouvoir", "fin du monde"],
      i: ["Chris Claremont", "2001 : L'Odyssée de l'espace"],
      sim: ["Jim Starlin", "Dan Abnett", "Robert Kirkman"],
      duos: [{ with: "Pepe Larraz & R. B. Silva", note: "House of X / Powers of X — les architectes de Krakoa" }]
    },
    "Marv Wolfman": {
      r: ["Scénariste"], bib: 5,
      b: "Né en 1946, co-créateur de Crisis on Infinite Earths avec George Pérez : l'homme qui a tué (et sauvé) le multivers DC.",
      s: "Chœurs héroïques, soap-opera d'équipe, plans-spectacles en double page.",
      t: ["multivers", "héritage", "équipes", "sacrifice"],
      i: ["Stan Lee", "Jack Kirby"],
      sim: ["Jim Starlin", "Alan Moore"],
      duos: [{ with: "George Pérez", note: "Crisis & New Teen Titans — le duo spectaculaire" }]
    },
    "Scott Snyder": {
      r: ["Scénariste"], bib: 6,
      b: "Né en 1976, a relancé Batman avec Court of Owls et signé American Vampire : l'héritier américain du goth.",
      s: "Suspense lent, folklore urbain, idées qui deviennent des mythes en six numéros.",
      t: ["Gotham", "complot", "horreur", "héritage"],
      i: ["Stephen King", "Frank Miller"],
      sim: ["Frank Miller", "Mike Mignola"],
      duos: [{ with: "Greg Capullo", note: "Batman New 52 — dix ans de complicité case à case" }]
    },
    "Mike Mignola": {
      r: ["Scénariste", "Dessinateur"], bib: 5,
      b: "Né en 1960, a quitté Marvel pour Hellboy en 1994 : ombres plates et folklore mondial devenus une maison d'édition à lui tout seul.",
      s: "Ombres noires massives, formes simplifiées, gouache froide.",
      t: ["folklore", "démonie", "mythe", "antéchrist"],
      i: ["Prince Valiant — Hal Foster", "Jack Kirby"],
      sim: ["Frank Miller", "Tatsuki Fujimoto"],
      duos: [{ with: "Dave Stewart", note: "Hellboy — la couleur oscarisée qui sculpte ses ombres" }]
    }
  };

  /* Rôle précis par œuvre (démo) — sinon on retient le rôle typé de l'auteur */
  const CREDITS = {
    "Watchmen": "Scénariste · dessin Dave Gibbons",
    "Batman: Year One": "Scénariste & dessinateur · encrages Klaus Janson",
    "Death Note": "Scénariste · dessin Takeshi Obata",
    "Sandman": "Scénariste · artistes multiples",
    "Saga": "Scénariste · dessin Fiona Staples",
    "Y: The Last Man": "Scénariste · dessin Pia Guerra",
    "Spider-Man: Blue": "Scénariste · dessin Tim Sale",
    "The Walking Dead": "Scénariste · dessin Tony Moore / Charlie Adlard",
    "Invincible": "Scénariste · dessin Cory Walker / Ryan Ottley",
    "Preacher": "Scénariste · dessin Steve Dillon",
    "Solo Leveling": "Scénariste · dessin DUBU",
    "Crisis on Infinite Earths": "Scénariste · dessin George Pérez",
    "Infinity Gauntlet": "Scénariste · dessin George Pérez / Ron Lim",
    "Annihilation": "Scénariste (avec Andy Lanning) · artistes variés",
    "Batman: Court of Owls": "Scénariste · dessin Greg Capullo",
    "House of X / Powers of X": "Scénariste · dessin Pepe Larraz / R. B. Silva",
    "Fantastic Four": "Scénariste · artistes variés",
    "New Avengers": "Scénariste · artistes variés",
    "Monster": "Auteur complet · d'après Osamu Tezuka",
    "Vagabond": "Auteur complet · d'après Eiji Yoshikawa",
    "Spawn": "Scénariste & dessinateur",
    "Hellboy": "Scénariste & dessinateur",
    "Berserk": "Auteur complet",
    "One Piece": "Auteur complet",
    "Attack on Titan": "Auteur complet",
    "Chainsaw Man": "Auteur complet",
    "Vinland Saga": "Auteur complet",
    "Pluto": "Auteur complet",
    "20th Century Boys": "Auteur complet",
    "Blame!": "Auteur complet",
    "Tower of God": "Auteur complet",
    "Lore Olympus": "Autrice complète"
  };

  /* Éditions / variantes possédées (fiche livre) */
  const EDITIONS = ["Édition originale", "Variant cover", "Édition intégrale", "Tirage de tête"];

  /* Profil interactif d'un auteur à partir de ta bibliothèque + de la base */
  function author(name, items) {
    const works = (items || []).filter(it => it.author === name);
    const kb = AUTHORS[name] || null;
    const generated = !kb;

    /* ── Rôles & œuvres ── */
    const list = works.map(it => ({
      id: it.id, title: it.title, year: it.year, format: it.format,
      rating: it.rating, status: it.status, read: it.read, volumes: it.volumes,
      role: CREDITS[it.title] || (kb && kb.r ? kb.r.join(" & ") : "Auteur·rice"),
      credit: !!CREDITS[it.title]
    }));

    const roles = kb && kb.r ? kb.r.slice()
      : [...new Set(list.map(w => w.role.split(" · ")[0]))];

    /* ── Bio (générée si la base ne connaît pas l'auteur) ── */
    const rated = works.filter(w => w.rating > 0);
    const avg = rated.length ? rated.reduce((s, w) => s + w.rating, 0) / rated.length : 0;
    const fmt = [...new Set(works.map(w => w.format))].join(" · ");
    const bio = kb ? kb.b
      : `${name} compte ${works.length} ouvrage${works.length > 1 ? "s" : "s"} dans ta bibliothèque` +
        (fmt ? ` (${fmt})` : "") +
        (avg ? `, pour une note moyenne de ${avg.toFixed(1)}/5` : "") +
        `. Fiche encore non documentée — la base de connaissance s'enrichit au fil de tes lectures.`;

    /* ── Thèmes : base ou dérivation automatique via tagsOf ── */
    let themes = kb && kb.t ? kb.t.slice() : [];
    if (!themes.length) {
      const freq = new Map();
      works.forEach(w => tagsOf(w).forEach(t =>
        freq.set(t, (freq.get(t) || 0) + 1)));
      themes = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
    }

    /* ── Auteurs proches : base ou similarité de tags entre voisins ── */
    let similar = kb && kb.sim ? kb.sim.slice() : [];
    if (!similar.length && works.length) {
      const mine = new Set(); works.forEach(w => tagsOf(w).forEach(t => mine.add(t)));
      const authors = [...new Set((items || []).map(i => i.author))]
        .filter(a => a !== name)
        .map(a => {
          const ws = items.filter(i => i.author === a);
          let hit = 0; ws.forEach(w => tagsOf(w).forEach(t => { if (mine.has(t)) hit++; }));
          return { a, hit };
        })
        .filter(x => x.hit > 0).sort((x, y) => y.hit - x.hit).slice(0, 3)
        .map(x => x.a);
      similar = authors;
    }
    const inLib = n => (items || []).some(i => key(i.author) === key(n));

    /* ── Jauge de possession de la bibliographie ── */
    const owned = works.length;
    const total = kb && kb.bib ? Math.max(kb.bib, owned) : 0;
    const done = works.filter(w => w.status === "Terminé").length;
    const gauge = total
      ? { mode: "biblio", pct: Math.round((owned / total) * 100), owned, total }
      : { mode: "progress", pct: owned ? Math.round((done / owned) * 100) : 0, owned, total: owned };

    return {
      name, roles, bio, style: (kb && kb.s) || "",
      themes, influences: (kb && kb.i) || [], generated,
      similar: similar.map(n => ({ name: n, inLib: inLib(n) })),
      duos: (kb && kb.duos) || [],
      works: list.sort((a, b) => a.year - b.year),
      gauge, avg, favs: works.filter(w => w.fav).length
    };
  }

  /* ═══════════════ 11. TIMELINES — PARUTION vs CHRONOLOGIE ═══════════════ */

  /* Chronologies d'univers (démo) : pos = position en % sur la barre */
  const TIMELINES = {
    "Crisis on Infinite Earths": {
      label: "Univers DC — le multivers",
      from: 1938, to: 2005, marker: { pos: 58, year: 1985 },
      events: [
        { pos: 0, year: 1938, title: "Âge d'or — Superman ouvre l'univers DC" },
        { pos: 28, year: 1956, title: "Flash (Barry Allen) — renaissance de l'Âge d'argent" },
        { pos: 58, year: 1985, title: "★ Crisis on Infinite Earths — les univers parallèles effacés" },
        { pos: 74, year: 1986, title: "Post-Crisis : Wolfman & Pérez redessinent tout" },
        { pos: 96, year: 2005, title: "Infinite Crisis — les Terres se multiplient à nouveau" }
      ],
      note: "Publié en 1985, ce crossover est LE point de bascule du multivers DC : tout se lit en avant/après."
    },
    "Batman: Year One": {
      label: "Univers Batman — chronologie de l'histoire",
      from: 1939, to: 2016, marker: { pos: 32, year: 1987 },
      events: [
        { pos: 0, year: 1939, title: "Bruce Wayne devient Batman (Detective Comics #27)" },
        { pos: 32, year: 1987, title: "★ Year One — les origines réécrites par Miller" },
        { pos: 58, year: 1993, title: "Knightfall — Bane brise le dos de Batman" },
        { pos: 82, year: 2011, title: "New 52 — la continuité repart à zéro" },
        { pos: 100, year: 2016, title: "Rebirth — le retour des histoires qui comptent" }
      ],
      note: "La genèse : à lire avant tous les récits qui assument vingt ans d'histoire Gothamienne."
    },
    "Batman: Court of Owls": {
      label: "Univers Batman — chronologie de l'histoire",
      from: 1939, to: 2016, marker: { pos: 82, year: 2011 },
      events: [
        { pos: 0, year: 1939, title: "Bruce Wayne devient Batman (Detective Comics #27)" },
        { pos: 32, year: 1987, title: "Year One — les origines réécrites par Miller" },
        { pos: 58, year: 1993, title: "Knightfall — Bane brise le dos de Batman" },
        { pos: 82, year: 2011, title: "★ Court of Owls — New 52, Snyder & Capullo" },
        { pos: 100, year: 2016, title: "Rebirth — le retour des histoires qui comptent" }
      ],
      note: "Ère New 52 (2011-2016) : continuité relancée, la Chouette y règne depuis toujours."
    },
    "Infinity Gauntlet": {
      label: "Univers Marvel — l'ère cosmique",
      from: 1966, to: 2015, marker: { pos: 58, year: 1991 },
      events: [
        { pos: 0, year: 1966, title: "Galactus & le Surfeur — le cosmos entre en scène" },
        { pos: 30, year: 1973, title: "Kree-Skrull War — le premier grand crossover" },
        { pos: 58, year: 1991, title: "★ Infinity Gauntlet — Thanos rase l'univers" },
        { pos: 76, year: 1995, title: "Infinity Crusade / Conflict — la trilogie s'achève" },
        { pos: 100, year: 2015, title: "Secret Wars — fin du multivers (run Hickman)" }
      ],
      note: "Le sommet de Starlin : les six Gemmes deviennent l'arête dorsale de tout le cosmic Marvel, jusqu'au MCU."
    },
    "Annihilation": {
      label: "Univers Marvel — le cosmic réinventé",
      from: 2005, to: 2010, marker: { pos: 22, year: 2006 },
      events: [
        { pos: 0, year: 2005, title: "Annihilation Prologue — l'Annihilus se lève" },
        { pos: 22, year: 2006, title: "★ Annihilation — Nova face à la vague" },
        { pos: 45, year: 2007, title: "Annihilation: Conquest — la Zone Négative tombe" },
        { pos: 72, year: 2008, title: "War of Kings & naissance des Guardians" },
        { pos: 100, year: 2010, title: "Realm of Kings — héritage cosmic" }
      ],
      note: "Ce run a ressuscité les héros cosmiques de Marvel — direction les Gardiens ensuite."
    },
    "Fantastic Four": {
      label: "Ère Hickman — le fil de ses runs Marvel",
      from: 2009, to: 2023, marker: { pos: 0, year: 2009 },
      events: [
        { pos: 0, year: 2009, title: "★ Fantastic Four — le run bâtisseur commence" },
        { pos: 42, year: 2013, title: "New Avengers — les Illuminati face aux Incursions" },
        { pos: 85, year: 2019, title: "House of X / Powers of X — naissance de Krakoa" },
        { pos: 100, year: 2023, title: "Fall of X — la chute de la nation mutante" }
      ],
      note: "Étape 1 du plan Hickman : FF pose les thèmes (famille, hérédité, fin du monde) qui paieront dix ans plus tard."
    },
    "New Avengers": {
      label: "Ère Hickman — le fil de ses runs Marvel",
      from: 2009, to: 2023, marker: { pos: 42, year: 2013 },
      events: [
        { pos: 0, year: 2009, title: "Fantastic Four — le run bâtisseur commence" },
        { pos: 42, year: 2013, title: "★ New Avengers — les Illuminati face aux Incursions" },
        { pos: 85, year: 2019, title: "House of X / Powers of X — naissance de Krakoa" },
        { pos: 100, year: 2023, title: "Fall of X — la chute de la nation mutante" }
      ],
      note: "Étape 2 : la mécanique d'Incursions mis en place ici mènera directement à Secret Wars (2015)."
    },
    "House of X / Powers of X": {
      label: "Ère Hickman — le fil de ses runs Marvel",
      from: 2009, to: 2023, marker: { pos: 85, year: 2019 },
      events: [
        { pos: 0, year: 2009, title: "Fantastic Four — le run bâtisseur commence" },
        { pos: 42, year: 2013, title: "New Avengers — les Illuminati face aux Incursions" },
        { pos: 85, year: 2019, title: "★ House of X / Powers of X — naissance de Krakoa" },
        { pos: 100, year: 2023, title: "Fall of X — la chute de la nation mutante" }
      ],
      note: "Étape 3 : Krakoa change la donne — à lire après FF et New Avengers pour saisir toute l'architecture."
    },
    "Watchmen": {
      label: "Âge moderne du comics — avant/après",
      from: 1986, to: 2005, marker: { pos: 4, year: 1986 },
      events: [
        { pos: 4, year: 1986, title: "★ Watchmen — le comics mûrit d'un coup" },
        { pos: 55, year: 1996, title: "Image — l'ère des créateurs explose" },
        { pos: 100, year: 2005, title: "Le roman graphique devient mainstream" }
      ],
      note: "Autonome mais pivot : avec Dark Knight Returns (1986), Watchmen sépare l'histoire du comics en deux."
    },
    "Sandman": {
      label: "Univers Sandman — le cycle des Rêves",
      from: 1989, to: 2017, marker: { pos: 0, year: 1989 },
      events: [
        { pos: 0, year: 1989, title: "★ Sandman #1 — Rêve s'échappe de sa prison" },
        { pos: 45, year: 1993, title: "The Kindly Ones — fin du cycle initial" },
        { pos: 70, year: 1996, title: "Death: The High Cost of Living" },
        { pos: 100, year: 2017, title: "The Dreaming — la suite de Gaiman" }
      ],
      note: "Se lit dans l'ordre : chaque arc ajoute une couche au mythe, la fin répond au début."
    }
  };

  /* Deux pistes pour la fiche livre :
     · pub   → parution (année de départ, rythme du format, position de TA lecture)
     · story → chronologie de l'univers (base) ou progression interne de la série */
  function timeline(it) {
    const RATE = { "Manga": 2.5, "Comic": 4, "Webtoon": 4, "Graphic Novel": 1.2 };
    const rate = RATE[it.format] || 2;
    const span = Math.max(1, Math.ceil((it.volumes || 1) / rate));
    const to = it.year + span;
    const pct = it.volumes ? it.read / it.volumes : 0;
    const pos = Math.round(pct * 100);
    const atYear = it.year + Math.round(pct * span);

    const pub = {
      from: it.year, to, pos,
      atYear: it.read > 0 ? atYear : it.year,
      label: it.volumes > 1
        ? `Tome ${it.read}/${it.volumes} · parution ≈ ${it.read > 0 ? atYear : it.year}`
        : `Publié en ${it.year}`
    };

    const kb = TIMELINES[it.title];
    if (kb) return { kind: "universe", pub, story: kb };

    const events = [
      { pos: 0, year: it.year, title: `${it.volumes > 1 ? "Tome 1" : "Publication"} — début de la série` }
    ];
    if (pos > 8 && pos < 95)
      events.push({ pos, year: atYear, title: `★ Ta position — tome ${it.read}/${it.volumes}` });
    events.push({ pos: 100, year: to, title: `${it.volumes > 1 ? `Tome ${it.volumes}` : "Fin"} — fin estimée` });

    return {
      kind: "series",
      pub,
      story: {
        label: "Chronologie de la série",
        from: it.year, to,
        marker: { pos, year: it.read > 0 ? atYear : it.year },
        events,
        note: "Pas de grand univers partagé pour ce titre : sa chronologie suit l'ordre de parution — et ta progression dedans."
      }
    };
  }

  /* ══════════ 12. ENRICHISSEMENT LIVE — VRAIES API ══════════
     Wikipédia (bio) · Open Library (bibliographie) · Google Books (secours)
     — best-effort : timeout 8 s, cache localStorage 7 jours,
       retour silencieux sur la base locale si hors ligne. */

  const Live = (() => {
    "use strict";
    const LS = typeof localStorage !== "undefined" ? localStorage : null;
    const TTL = 7 * 86400000;
    const nrm = s => (s || "").toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    const ck = n => "iv-live-v1-" + nrm(n);

    async function getJSON(url, ms = 8000) {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), ms) : 0;
      try {
        const res = await fetch(url, ctrl ? { signal: ctrl.signal } : {});
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.json();
      } finally { if (t) clearTimeout(t); }
    }

    /* Bio d'intro Wikipédia (fr puis en) */
    async function wikiBio(name) {
      for (const lang of ["fr", "en"]) {
        try {
          const d = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/` + encodeURIComponent(name));
          if (d && d.extract && d.type !== "disambiguation")
            return {
              extract: d.extract, lang: lang === "fr" ? "FR" : "EN",
              url: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || ""
            };
        } catch (e) {}
      }
      return null;
    }

    /* Bibliographie : Open Library (auteur exact) */
    async function olWorks(name) {
      try {
        const d = await getJSON("https://openlibrary.org/search.json?author=" +
          encodeURIComponent(name) + "&limit=60&fields=title,first_publish_year,cover_i");
        return ((d && d.docs) || []).map(w => ({
          t: w.title || "", y: w.first_publish_year || 0,
          c: w.cover_i ? "https://covers.openlibrary.org/b/id/" + w.cover_i + "-S.jpg" : ""
        }));
      } catch (e) { return []; }
    }

    /* Secours / complément : Google Books (inauthor) */
    async function gbWorks(name) {
      try {
        const d = await getJSON("https://www.googleapis.com/books/v1/volumes?printType=books&maxResults=40&q=" +
          encodeURIComponent('inauthor:"' + name + '"'));
        return ((d && d.items) || []).map(x => {
          const v = x.volumeInfo || {};
          const th = v.imageLinks && (v.imageLinks.smallThumbnail || v.imageLinks.thumbnail);
          return {
            t: v.title || "",
            y: parseInt(String(v.publishedDate || "").slice(0, 4), 10) || 0,
            c: th ? String(th).replace(/^http:/, "https:") : ""
          };
        });
      } catch (e) { return []; }
    }

    async function authorLive(name, items) {
      /* Cache 7 jours */
      let cached = null;
      if (LS) { try { cached = JSON.parse(LS.getItem(ck(name)) || "null"); } catch (e) {} }
      if (cached && cached.data && Date.now() - cached.at < TTL) return cached.data;

      const [bio, ol, gb] = await Promise.all([wikiBio(name), olWorks(name), gbWorks(name)]);

      /* Fusion + dédup (une entrée couverture primée) — titres sans lettres
         latines (kana/kanji seuls) écartés : illisibles dans l'UI */
      const map = new Map();
      [...ol, ...gb].forEach(w => {
        const k = nrm(w.t);
        if (!k || !/[a-z]/.test(k) || w.t.length < 2) return;
        if (/duplicate\s+of|^record\s|\(import\b/i.test(w.t)) return;   // orphelins Open Library
        const prev = map.get(k);
        if (!prev) map.set(k, w);
        else if (!prev.c && w.c) map.set(k, { t: w.t, y: prev.y || w.y, c: w.c });
      });

      /* Croisement avec la collection : exact = possédé, series = série suivie */
      const libNorms = (items || []).filter(i => i.author === name).map(i => nrm(i.title));
      const works = [...map.values()].map(w => {
        const k = nrm(w.t);
        const exact = libNorms.includes(k);
        const series = !exact && libNorms.some(l => l.length > 3 && (k.startsWith(l) || l.startsWith(k)));
        return { t: w.t, y: w.y, c: w.c, exact, series };
      }).sort((a, b) => ((a.y || 9999) - (b.y || 9999)) || a.t.localeCompare(b.t));

      const data = {
        bio,
        works,
        total: works.length,
        exact: works.filter(w => w.exact).length,
        series: works.filter(w => w.series).length,
        src: [
          ol.length ? "Open Library" : "",
          gb.length ? "Google Books" : "",
          bio ? "Wikipédia" : ""
        ].filter(Boolean)
      };

      if (LS) { try { LS.setItem(ck(name), JSON.stringify({ at: Date.now(), data })); } catch (e) {} }
      return data;
    }

    return { authorLive };
  })();

  /* ═══════════════ API ═══════════════ */
  return {
    vibe, readingOrder, insights, orderSuggestions, tagsOf, sim, key,
    smartBuy, shopOf, unitPrice, oopOf, AFFILIATES,
    author, timeline, EDITIONS, AUTHORS, CREDITS,
    authorLive: Live.authorLive
  };
})();
