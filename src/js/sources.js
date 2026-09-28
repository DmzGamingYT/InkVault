/* ══════════════════════════════════════════════
   INKVAULT — Recherche de fiches d'ouvrage
   BD / comics        : Google Books, Open Library, Wikipédia
   Mangas / webtoons  : AniList, Jikan, MangaDex
   Sources publiques, sans clé ni compte · cache local 6 h
   ══════════════════════════════════════════════ */

const Sources = (() => {
  "use strict";

  const CACHE_KEY = "ink-sources-v1";
  const TTL   = 6 * 3600000;   // même durée que les ordres de lecture
  const GAP   = { manga: 700, print: 300 };   // ms entre deux requêtes d'une même file
  const MAX   = 12;

  /* ── Caches ── */
  let persisted = Object.create(null);
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) persisted = raw;
  } catch (e) { /* un cache illisible ne doit pas bloquer la recherche */ }
  const memory   = new Map();   // clé normalisée → { at, data }
  const inFlight = new Map();   // recherches simultanées par requête
  const dead     = new Set();   // sources coupées pour la session

  const save = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(persisted)); } catch (e) {} };
  const isFresh = e => !!(e && Array.isArray(e.data) && Date.now() - e.at < TTL);
  const uniq = list => [...new Set((list || []).filter(Boolean))];

  /* ══════════ Normalisation & scoring ══════════ */
  const norm = s => (s || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  function similarity(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 88;
    const grams = s => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
    const ga = grams(a), gb = grams(b);
    if (!ga.size || !gb.size) return 0;
    let hit = 0; ga.forEach(g => { if (gb.has(g)) hit++; });
    return Math.round((200 * hit) / (ga.size + gb.size));
  }

  /* Score de titre pondéré par la longueur : « The Walking Dead » doit
     battre « The Walking Dead : Rise of the Governor ». */
  function titleScore(q, c) {
    const a = norm(q), b = norm(c);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) {
      const r = Math.min(a.length, b.length) / Math.max(a.length, b.length);
      return Math.round(50 + 45 * r);
    }
    return similarity(a, b);
  }

  const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'", "&#39;": "'", "&nbsp;": " " };
  const clean = s => String(s == null ? "" : s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|nbsp|#0?39);/g, m => ENTITIES[m] || m)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);

  /* ══════════ Format déduit des métadonnées ══════════
     « Comics & Graphic Novels » est la catégorie mère de Google Books :
     on teste donc le manga et la BD francophone avant l'américain.
     Les motifs acceptent le pluriel — Wikipédia écrit « bandes dessinées ». */
  function guessFormat(...hints) {
    const h = hints.filter(Boolean).join(" ").toLowerCase();
    if (/\bmangas?\b|\bmanhwas?\b|\bmanhuas?\b|japonaise?s?/.test(h)) return "Manga";
    if (/\bwebtoons?\b|manhwa cor[ée]en/.test(h)) return "Webtoon";
    if (/bandes? dessin[ée]s?|\bgraphic novels?\b|albums? de bd/.test(h)) return "Graphic Novel";
    if (/\bcomics?\b|comic books?|marvel|dc comics|image comics|vertigo/.test(h)) return "Comic";
    return "";
  }

  /* ══════════ HTTP ══════════ */
  class SrcError extends Error {}

  async function getJSON(url, opts = {}, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, Object.assign({ signal: ctrl.signal }, opts));
      if (!res.ok) throw new SrcError("HTTP " + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  const postJSON = (url, body, ms = 8000) =>
    getJSON(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body)
    }, ms);

  /* ══════════ Source : AniList (mangas, webtoons) ══════════ */
  const ANI_QUERY = `query ($s:String!) {
    Page(page:1, perPage:10) {
      media(search:$s, type:MANGA, sort:SEARCH_MATCH) {
        id volumes siteUrl
        startDate { year }
        title { english romaji native }
        description genres
        coverImage { extraLarge large }
        staff(perPage:6, sort:RELEVANCE) { edges { role node { name { full } } } }
      }
    }
  }`;

  /* L'équipe d'un manga mêle scénario, dessin et assistance : on ne veut
     dans le champ « auteur » que celui qui porte l'histoire. */
  function aniAuthor(staff) {
    const edges = (((staff || {}).edges) || [])
      .filter(e => e && e.node && e.node.name && e.node.name.full);
    const pick = role => edges.find(e => String(e.role || "").toLowerCase() === role);
    const found = pick("story & art") || pick("story") || edges[0];
    return found ? [found.node.name.full] : [];
  }

  async function fromAniList(query) {
    const d = await postJSON("https://graphql.anilist.co", { query: ANI_QUERY, variables: { s: query } });
    const media = ((((d || {}).data || {}).Page) || {}).media || [];
    return media.map((m, rank) => {
      const t = m.title || {}, ci = m.coverImage || {};
      return {
        source: "AniList",
        sourceUrl: m.siteUrl || (m.id ? "https://anilist.co/manga/" + m.id : ""),
        title: t.english || t.romaji || t.native || "",
        alt: [t.romaji, t.native, t.english],
        author: aniAuthor(m.staff),
        year: (m.startDate || {}).year || 0,
        volumes: m.volumes || 0,
        desc: clean(m.description),
        cover: ci.extraLarge || ci.large || "",
        tags: m.genres || [],
        format: "Manga",
        rank
      };
    }).filter(x => x.title);
  }

  /* ══════════ Source : Jikan / MyAnimeList (mangas) ══════════ */
  async function fromJikan(query) {
    const d = await getJSON("https://api.jikan.moe/v4/manga?q=" + encodeURIComponent(query) + "&limit=8&sfw=true");
    const list = (d || {}).data || [];
    return list.map((e, rank) => {
      const img = (e.images || {}).jpg || {};
      return {
        source: "Jikan",
        sourceUrl: e.url || "",
        title: e.title_english || e.title || "",
        alt: [e.title, e.title_english, e.title_japanese],
        author: (e.authors || []).map(a => a.name),
        year: parseInt(String((e.published || {}).from || "").slice(0, 4), 10) || 0,
        volumes: e.volumes || 0,
        desc: clean(e.synopsis),
        cover: img.large_image_url || img.image_url || "",
        tags: (e.genres || []).map(g => g.name),
        format: "Manga",
        rank
      };
    }).filter(x => x.title);
  }

  /* ══════════ Source : MangaDex (mangas, titres FR et EN) ══════════ */
  async function fromMangaDex(query) {
    const url = "https://api.mangadex.org/manga?title=" + encodeURIComponent(query) +
      "&limit=8&includes[]=cover_art&includes[]=author" +
      "&contentRating[]=safe&order[relevance]=desc";
    const d = await getJSON(url);
    const list = (d || {}).data || [];
    return list.map((m, rank) => {
      const a = m.attributes || {}, rel = m.relationships || [];
      const alt = Array.isArray(a.altTitles) ? a.altTitles : [];
      const localized = alt.find(t => t && t.fr) || alt.find(t => t && t.en) || {};
      const art = rel.find(r => r.type === "cover_art");
      const file = art && art.attributes && art.attributes.fileName;
      const au = rel.find(r => r.type === "author");
      return {
        source: "MangaDex",
        sourceUrl: m.id ? "https://mangadex.org/title/" + m.id : "",
        title: localized.fr || localized.en ||
          Object.values(a.title || {}).find(v => /[a-z]/i.test(String(v))) || "",
        alt: [...Object.values(a.title || {}), ...Object.values(localized)],
        author: [au && au.attributes && au.attributes.name],
        year: a.year || 0,
        volumes: Number(a.volume) || 0,
        desc: clean(a.description && (a.description.fr || a.description.en)),
        cover: file && m.id
          ? "https://uploads.mangadex.org/covers/" + encodeURIComponent(m.id) + "/" + encodeURIComponent(file) + ".512.jpg"
          : "",
        tags: (a.tags || []).map(t => t.attributes && t.attributes.name && t.attributes.name.en),
        format: "Manga",
        rank
      };
    }).filter(x => x.title);
  }

  /* ══════════ Source : Google Books (BD, comics, albums) ══════════ */
  const quote = s => '"' + clean(s).replace(/["\\]/g, " ").trim() + '"';

  async function fromGoogleBooks(query) {
    const base = "https://www.googleapis.com/books/v1/volumes?country=FR&orderBy=relevance&maxResults=10&printType=books&";
    let d = await getJSON(base + "q=" + encodeURIComponent("intitle:" + quote(query)));
    if (!d || !d.totalItems) d = await getJSON(base + "q=" + encodeURIComponent(clean(query)));

    const list = (d || {}).items || [];
    return list.map((it, rank) => {
      const v = it.volumeInfo || {}, img = v.imageLinks || {};
      const categories = v.categories || [];
      const publisher = [v.publisher, ...categories].join(" ");
      return {
        source: "Google Books",
        sourceUrl: v.infoLink || "",
        title: v.title || "",
        alt: [v.subtitle].filter(Boolean),
        author: v.authors || [],
        year: parseInt(String(v.publishedDate || "").slice(0, 4), 10) || 0,
        volumes: 0,
        pages: v.pageCount || 0,
        desc: clean(v.description),
        cover: String(img.extraLarge || img.large || img.medium || img.thumbnail || "")
          .replace(/^http:/, "https:").replace(/&edge=curl/g, "").replace(/zoom=1/, "zoom=2"),
        tags: categories.map(c => String(c).split("/").pop()),
        format: guessFormat(publisher, v.title),
        rank
      };
    }).filter(x => x.title);
  }

  /* ══════════ Source : Open Library (BD, comics, albums) ══════════ */
  const OL_FIELDS = "title,author_name,cover_i,first_publish_year,subject,publisher,first_sentence,key";

  async function fromOpenLibrary(query) {
    const d = await getJSON(`https://openlibrary.org/search.json?limit=10&fields=${OL_FIELDS}&title=` + encodeURIComponent(query));
    return ((d || {}).docs || []).map((doc, rank) => {
      const subjects = doc.subject || [];
      return {
        source: "Open Library",
        sourceUrl: doc.key ? "https://openlibrary.org" + doc.key : "",
        title: doc.title || "",
        alt: [],
        author: doc.author_name || [],
        year: doc.first_publish_year || 0,
        volumes: 0,
        desc: clean([].concat(doc.first_sentence || [])[0]),
        cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : "",
        tags: subjects.slice(0, 6),
        format: guessFormat(subjects.join(" "), (doc.publisher || []).join(" ")),
        rank
      };
    }).filter(x => x.title);
  }

  /* ══════════ Source : Wikipédia (BD, mangas, séries) ══════════
     `origin=*` est ce qui rend l'API MediaWiki interrogeable en CORS
     sans clé ni compte. Le résumé d'introduction sert de description. */
  const WIKI_URL = lang => "https://" + lang + ".wikipedia.org/w/api.php?action=query&format=json" +
    "&formatversion=2&origin=*&generator=search&gsrnamespace=0&gsrlimit=6" +
    "&prop=pageimages|extracts|description|info|categories" +
    "&piprop=thumbnail&pithumbsize=320&exintro=1&explaintext=1&exsentences=2&inprop=url&cllimit=20";

  /* Ce qui suit « par » sans être un nom d'auteur. */
  const NOT_A_NAME = /^(la|le|les|un|une|des|de|du|son|sa|ses|leur|leurs|français|américain|britannique|japonais|belge|canadien|adaptation|illustration|scénario|dessin|coloriage|encre|papier|édition|éditions|éditeur|nombreux|plusieurs|même|http)/i;
  const NAME_PART = "[A-ZÀ-ÖØ-Þ][\\p{L}'’\\-]+";
  const RE_BY = new RegExp("\\b(?:par|dessin[ée]e?\\s+par)\\s+((?:" + NAME_PART + ")" +
    "(?:\\s+(?:de|du|van|von|le|la)?\\s*(?:" + NAME_PART + ")){0,2})", "u");

  function wikiAuthor(text) {
    const head = clean(text).split(/(?<=[.!?])\s/)[0] || "";
    const m = head.match(RE_BY);
    const name = m ? m[1].replace(/\s+/g, " ").trim() : "";
    if (name.length < 4 || name.length > 70) return "";
    if (/\d/.test(name) || NOT_A_NAME.test(name)) return "";
    if (name.split(/\s+/).length > 4) return "";
    return name;
  }

  const RE_COMIC = /bandes? dessin[ée]s?|\bcomics?\b|\bmangas?\b|\bwebtoons?\b|\bmanhwas?\b|\bbd\b|strips?|\bcases?\b/i;

  /* Wikipédia ramène aussi le film, la série télévisée ou le roman du même nom :
     InkVault catalogue de l'imprimé, on écarte ces pages. */
  const RE_OTHER_MEDIA = /\(\s*(?:film|série télévisée|série tv|jeu|jeu vidéo|vidéo|roman|chanson|disque|musique)\b[^)]*\)$/i;
  /* « Astérix le Gaulois (album) » et « Astérix le Gaulois » sont le même ouvrage. */
  const RE_PRINT_SUFFIX = /\s*\(\s*(?:album|bd|bande dessinée|manga|comics?|décénale|intégral)\s*\)$/i;
  /* La vignette de tête d'un article est souvent la couverture — mais parfois
     un logo ou une carte : dans ce cas la fiche reste valable, sans image. */
  const RE_NOT_A_COVER = /(^|[-_ ])(logo|map|signature|banner|icon|flag|plan)([-_.]|$)/i;

  async function fromWikipedia(lang, query) {
    const d = await getJSON(WIKI_URL(lang) + "&gsrsearch=" + encodeURIComponent(query));
    const pages = ((((d || {}).query) || {}).pages || [])
      .filter(p => p && p.title && !RE_OTHER_MEDIA.test(p.title));
    return pages.map((p, rank) => {
      const cats = (p.categories || []).map(c => c.category);
      const desc = clean(p.description);
      const extract = clean(p.extract);
      const years = (desc + " " + extract).match(/\b(19\d\d|20[0-2]\d)\b/);
      return {
        source: lang === "fr" ? "Wikipédia" : "Wikipedia",
        sourceUrl: p.fullurl || "",
        title: p.title.replace(RE_PRINT_SUFFIX, "") || p.title,
        alt: [],
        author: [wikiAuthor(extract)],
        year: years ? parseInt(years[1], 10) : 0,
        volumes: 0,
        desc: extract,
        cover: (p.thumbnail && !RE_NOT_A_COVER.test(p.thumbnail.source) && p.thumbnail.source) || "",
        tags: cats.slice(0, 6),
        format: guessFormat(cats.join(" "), desc),
        /* Une page qui n'a rien à voir avec les cases élargit le bruit : on l'écarte. */
        comic: RE_COMIC.test(cats.join(" ") + " " + desc + " " + extract),
        rank
      };
    }).filter(x => x.title && x.comic);
  }

  /* ══════════ Files de recherche ══════════
     BD et mangas ne se marchent plus dessus : une recherche de BD n'attend
     jamais les API de mangas, et réciproquement. */
  const PLANES = {
    manga: [["AniList", fromAniList], ["Jikan", fromJikan], ["MangaDex", fromMangaDex]],
    print: [["GoogleBooks", fromGoogleBooks], ["OpenLibrary", fromOpenLibrary],
            ["Wikipédia", q => fromWikipedia("fr", q)], ["Wikipedia", q => fromWikipedia("en", q)]]
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chains = { manga: Promise.resolve(), print: Promise.resolve() };

  function queue(lane, task, delay) {
    const p = chains[lane].then(() =>
      Promise.race([task(), sleep(12000).then(() => null)]).catch(() => null)
    );
    chains[lane] = p.then(() => sleep(delay), () => sleep(delay));
    return p;
  }

  function runLane(lane, query) {
    return queue(lane, async () => {
      const out = [];
      for (const [name, fn] of PLANES[lane]) {
        if (dead.has(name)) continue;
        try {
          out.push(...((await fn(query)) || []));
        } catch (err) {
          /* 429/5xx/réseau : la source est écartée pour la session, pas pour l'ouvrage. */
          const msg = String(err && err.message);
          if (/\bHTTP (?:429|5\d\d)\b|aborted|Failed|Network|rate limit/i.test(msg) || (err && err.name === "AbortError"))
            dead.add(name);
        }
      }
      return out;
    }, GAP[lane]);
  }

  /* ══════════ Fusion & tri ══════════ */
  /* Deux sources qui décrivent le même ouvrage sont fusionnées : on garde le
     meilleur champ de chacune (une couverture d'un côté, une année de l'autre).
     La fiche la mieux notée sert de référence, pour que le résultat ne dépende
     pas de l'ordre d'arrivée des deux files. */
  function merge(a, b) {
    const [best, other] = (b._score || 0) > (a._score || 0) ? [b, a] : [a, b];
    return {
      source: best.source,
      sourceUrl: best.sourceUrl || other.sourceUrl,
      sources: uniq([...(a.sources || [a.source]), ...(b.sources || [b.source])]),
      title: best.title || other.title,
      alt: uniq([...(a.alt || []), ...(b.alt || [])]),
      author: best.author || other.author || "",
      year: best.year || other.year || 0,
      volumes: best.volumes || other.volumes || 0,
      pages: best.pages || other.pages || 0,
      desc: String(best.desc || "").length >= 90 ? best.desc : (best.desc || other.desc || ""),
      cover: best.cover || other.cover || "",
      tags: uniq([...(a.tags || []), ...(b.tags || [])]).slice(0, 8),
      format: best.format || other.format || "",
      _score: Math.max(a._score || 0, b._score || 0)
    };
  }

  function dedupe(list, query) {
    const map = new Map();
    for (const c of list) {
      const t = titleScore(query, c.title);
      if (t < 25) continue;              // le titre ne ressemble pas assez à la demande
      const entry = {
        ...c,
        author: uniq(c.author).join(", "),
        sources: [c.source],
        _score: t + (2 - (c.rank || 0)) * 2 + (c.cover ? 6 : 0) +
          (c.desc ? 4 : 0) + (c.year ? 2 : 0) + (c.volumes ? 2 : 0)
      };
      const key = norm(c.title);
      map.set(key, map.has(key) ? merge(map.get(key), entry) : entry);
    }
    return [...map.values()].sort((a, b) => b._score - a._score);
  }

  const cleanOut = c => ({
    title: c.title, author: c.author, year: c.year, volumes: c.volumes,
    pages: c.pages, desc: c.desc, cover: c.cover, format: c.format,
    tags: c.tags, source: c.source, sources: c.sources, sourceUrl: c.sourceUrl
  });

  /* ══════════ API publique ══════════ */
  const cacheKey = q => "q-" + norm(q);

  function cachedRaw(query) {
    const key = cacheKey(query);
    const entry = memory.get(key) || persisted[key];
    if (!isFresh(entry)) return null;
    memory.set(key, entry);
    return entry.data;
  }

  /* Rendu immédiat (cache) : évite d'afficher un chargement pour rien. */
  const cached = query => {
    const data = cachedRaw(query);
    return data ? data.map(cleanOut) : null;
  };

  /* Recherche par titre uniquement : le champ « auteur » du formulaire peut
     contenir le Validateur d'une autre fiche, et l'associer au titre fausserait
     toute la recherche. L'auteur se remplit à partir de la fiche choisie. */
  async function search(query, opts = {}) {
    const q = clean(query);
    if (q.length < 2) return [];
    const limit = opts.limit || MAX;
    const key = cacheKey(q);

    const hit = cachedRaw(q);
    if (hit) return hit.slice(0, limit).map(cleanOut);
    if (inFlight.has(key)) return (await inFlight.get(key)).slice(0, limit).map(cleanOut);

    const pending = Promise.all([
      runLane("manga", q),
      runLane("print", q)
    ]).then(lanes => {
      const data = dedupe(lanes.flat().filter(Boolean), q);
      const entry = { at: Date.now(), data };
      memory.set(key, entry);
      persisted[key] = entry;
      save();
      return data;
    });

    inFlight.set(key, pending);
    try {
      return (await pending).slice(0, limit).map(cleanOut);
    } finally {
      inFlight.delete(key);
    }
  }

  return { search, cached, get dead() { return [...dead]; } };
})();
