/* ══════════════════════════════════════════════
   INKVAULT — Résolution des couvertures
   Manga / Webtoon : AniList  →  Jikan (MyAnimeList)  →  Open Library
   Comic / Graphic  : Google Books  →  Open Library
   Fallback final   : couverture stylisée générée
   ══════════════════════════════════════════════ */

const Covers = (() => {
  "use strict";

  const STORE_KEY = "ink-covers-v2";

  /* ── Caches ── */
  let persisted = Object.create(null);
  try {
    const cached = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    if (cached && typeof cached === "object" && !Array.isArray(cached))
      persisted = Object.assign(Object.create(null), cached);
  } catch (e) { /* Un cache illisible ne doit pas bloquer les recherches. */ }
  const memory = Object.create(null);          // succès + échecs de la session
  const inFlight = new Map();                   // recherches simultanées par ouvrage
  const dead   = new Set();                    // sources coupées pour la session

  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(persisted)); } catch (e) {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const keyOf = it => `${it.format}|${it.title}|${it.author}`;

  /* ══════════ Matching ══════════ */
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
    return Math.round((200 * hit) / (ga.size + gb.size)) / 1;
  }

  /* Score de titre sensible à la longueur :
     "The Walking Dead" doit battre "The Walking Dead: Rise of the Governor" */
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

  /* Proximité avec l'année de publication de l'ouvrage catalogué */
  function yearBonus(first, year) {
    if (!first || !year) return 0;
    const d = Math.abs(first - year);
    if (d <= 2) return 15;
    if (d <= 5) return 8;
    if (d <= 15) return 0;
    return -15;
  }

  /* ══════════ HTTP ══════════ */
  class SrcError extends Error {}

  async function getJSON(url, opts = {}, ms = 9000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, Object.assign({ signal: ctrl.signal }, opts));
      if (!res.ok) throw new SrcError("HTTP " + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  /* ══════════ Source : AniList (manga, webtoon) ══════════ */
  async function fromAniList(item) {
    const q = `
      query ($s: String) {
        Page(page: 1, perPage: 8) {
          media(search: $s, type: MANGA, sort: SEARCH_MATCH) {
            title { romaji english native }
            coverImage { extraLarge large }
            staff(perPage: 3, sort: RELEVANCE) { nodes { name { full } } }
          }
        }
      }`;
    const data = await getJSON("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query: q, variables: { s: item.title } })
    });

    const list = (data && data.data && data.data.Page && data.data.Page.media) || [];
    let best = null, bestScore = 0;

    for (const m of list) {
      const t = m.title || {};
      let s = Math.max(
        similarity(item.title, t.romaji),
        similarity(item.title, t.english)
      );
      if (t.native) s = Math.max(s, similarity(item.title, t.native) * .5);
      const names = ((m.staff && m.staff.nodes) || []).map(n => n.name.full).join(" ");
      if (names && similarity(item.author, names) > 40) s += 14;
      if (s > bestScore) { bestScore = s; best = m; }
    }

    if (!best || bestScore < 55) return null;
    const ci = best.coverImage || {};
    return ci.extraLarge || ci.large || null;
  }

  /* ══════════ Source : Jikan / MyAnimeList ══════════ */
  async function fromJikan(item) {
    const url = "https://api.jikan.moe/v4/manga?q=" +
      encodeURIComponent(item.title) + "&limit=8&sfw=true";
    const data = await getJSON(url);
    const list = (data && data.data) || [];

    let best = null, bestScore = 0;
    for (const e of list) {
      let s = Math.max(
        similarity(item.title, e.title),
        e.title_english ? similarity(item.title, e.title_english) : 0
      );
      const authors = (e.authors || []).map(a => a.name).join(" ");
      if (authors && similarity(item.author, authors) > 40) s += 12;
      if (s > bestScore) { bestScore = s; best = e; }
    }
    if (!best || bestScore < 55) return null;
    const img = best.images && best.images.jpg;
    return (img && (img.large_image_url || img.image_url)) || null;
  }

  /* ══════════ Source : Google Books ══════════ */
  async function fromGoogle(item) {
    const base = "https://www.googleapis.com/books/v1/volumes?country=US&maxResults=8&";
    const q1 = encodeURIComponent(`intitle:"${item.title}" inauthor:"${item.author}"`);
    let data = await getJSON(base + "q=" + q1 + "&printType=books");
    if (!data || !data.totalItems) {
      data = await getJSON(base + "q=" + encodeURIComponent(item.title + " " + item.author));
    }

    const list = (data && data.items) || [];
    let best = null, bestScore = 0;
    for (const it of list) {
      const vi = it.volumeInfo || {};
      if (!vi.imageLinks) continue;
      let s = similarity(item.title, vi.title);
      if (vi.authors && vi.authors.length && similarity(item.author, vi.authors.join(" ")) > 40) s += 14;
      if (vi.industryIdentifiers) s += 5;
      if (s > bestScore) { bestScore = s; best = vi; }
    }
    if (!best || bestScore < 45) return null;
    const L = best.imageLinks;
    const raw = L.extraLarge || L.large || L.medium || L.thumbnail || L.smallThumbnail;
    if (!raw) return null;
    return String(raw)
      .replace(/^http:/, "https:")
      .replace(/&edge=curl/g, "")
      .replace(/zoom=1/, "zoom=2");
  }

  /* ══════════ Source : ISBN (couverture directe) ══════════ */
  async function fromIsbn(item) {
    if (!item.isbn) return null;
    const url = `https://covers.openlibrary.org/b/isbn/${item.isbn}-L.jpg?default=false`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) throw new SrcError("HTTP " + res.status);
      return null;
    }
    const type = res.headers.get("content-type") || "";
    if (!/^image\//.test(type)) return null;
    return url;
  }

  /* ══════════ Source : Open Library ══════════ */
  const OL_FIELDS =
    "fields=title,author_name,cover_i,first_publish_year,subject,publisher,key";

  /* Le classement de pertinence d'Open Library est un excellent signal :
     on le récompense fortement (le 1er résultat est presque toujours le bon ouvrage) */
  const RANK_BONUS = [60, 20, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1];

  const RE_COMIC_PUB = /\bcomics?\b|vertigo|marvel|image comics|skybound|dark horse|shonen jump|shueisha|kodansha|gl[eé]nat|kana|panini|delcourt|soleil|bamboo|titan/i;
  const RE_VOL1 = /(^|[^a-z0-9])(vol|volume|tome|part|book|livre)s?\.?\s*0?1([^0-9]|$)|book\s*one|compendium\s*one|omnibus\s*one|deluxe edition,\s*book 1/i;

  async function olQuery(qs) {
    try {
      const d = await getJSON("https://openlibrary.org/search.json?limit=12&" + OL_FIELDS + qs);
      return (d && d.docs) || [];
    } catch (e) { return []; }
  }

  async function fromOpenLibrary(item) {
    const want = item.search || item.title;

    // 1) recherche structurée (précise)  2) recherche libre (plus large)
    const [structured, free] = await Promise.all([
      olQuery("&title=" + encodeURIComponent(want) + "&author=" + encodeURIComponent(item.author)),
      olQuery("&q=" + encodeURIComponent(want + " " + item.author))
    ]);

    let best = null, bestScore = 0;
    const scores = new Map();          // cover_i → meilleur score rencontré

    const consider = (docs, offset) => docs.forEach((d, i) => {
      if (!d.cover_i) return;
      const rank = i + offset;

      const t = titleScore(want, d.title);
      const authors = (d.author_name || []).join(" ");
      const a = similarity(item.author, authors);

      // Titre non reconnu → on n'accepte que si c'est un top résultat
      // et que l'auteur correspond vraiment.
      if (t < 20 && !(rank <= 2 && a > 40)) return;

      let s = t;

      if (a > 40) s += 25;
      else if (a > 0) s += 6;
      else s -= 30;

      const subj = (d.subject || []).join(" ").toLowerCase();
      if (/\bcomic|graphic novel|webtoon|manga|strips|superhero|vertigo/.test(subj)) s += 18;

      if (RE_COMIC_PUB.test((d.publisher || []).join(" "))) s += 18;
      if (RE_VOL1.test(d.title || "")) s += 14;

      s += yearBonus(d.first_publish_year, item.year);
      s += RANK_BONUS[Math.min(rank, RANK_BONUS.length - 1)];

      const prev = scores.get(d.cover_i);
      if (prev === undefined || s > prev) {
        scores.set(d.cover_i, s);
        if (s > bestScore) { bestScore = s; best = d; }
      }
    });

    consider(structured, 0);
    consider(free, 0);

    if (!best || bestScore < 80) return null;
    return `https://covers.openlibrary.org/b/id/${best.cover_i}-L.jpg`;
  }

  /* ══════════ Plans de recherche ══════════ */
  const LANES = { media: null, print: null };   // 2 files parallèles

  const PLANS = {
    "Manga":          { lane: "media", delay: 700, steps: [["AniList", fromAniList], ["Jikan", fromJikan], ["OpenLibrary", fromOpenLibrary]] },
    "Webtoon":        { lane: "media", delay: 700, steps: [["AniList", fromAniList], ["Jikan", fromJikan], ["OpenLibrary", fromOpenLibrary]] },
    "Comic":          { lane: "print", delay: 300, steps: [["Isbn", fromIsbn], ["GoogleBooks", fromGoogle], ["OpenLibrary", fromOpenLibrary]] },
    "Graphic Novel":  { lane: "print", delay: 300, steps: [["Isbn", fromIsbn], ["GoogleBooks", fromGoogle], ["OpenLibrary", fromOpenLibrary]] }
  };

  function makeLane() {
    let chain = Promise.resolve();
    return (task, delay) => {
      const p = chain.then(() =>
        Promise.race([task(), sleep(13000).then(() => null)]).catch(() => null)
      );
      chain = p.then(() => sleep(delay), () => sleep(delay));
      return p;
    };
  }
  LANES.media = makeLane();
  LANES.print = makeLane();

  async function lookup(item) {
    const plan = PLANS[item.format] || PLANS["Comic"];
    for (const [name, fn] of plan.steps) {
      if (dead.has(name)) continue;
      try {
        const url = await fn(item);
        if (url) return url;
      } catch (err) {
        // 404 par ouvrage : la source reste utilisable pour les autres recherches.
        const msg = String(err && err.message);
        if (/\bHTTP (?:429|5\d\d)\b|aborted|Failed|Network/i.test(msg) || err?.name === "AbortError") dead.add(name);
      }
    }
    return null;
  }

  /* ══════════ API publique ══════════ */
  function resolve(item) {
    const key = keyOf(item);
    if (key in memory) return Promise.resolve(memory[key]);
    if (typeof persisted[key] === "string" && persisted[key]) {
      memory[key] = persisted[key];
      return Promise.resolve(persisted[key]);
    }
    if (inFlight.has(key)) return inFlight.get(key);

    const plan = PLANS[item.format] || PLANS["Comic"];
    const pending = LANES[plan.lane](() => lookup(item), plan.delay).then(url => {
      memory[key] = url || null;
      if (url) { persisted[key] = url; save(); }
      return url || null;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }

  function warmAll(list) { list.forEach(resolve); }

  /* ══════════ Injection dans le DOM ══════════ */
  function paint(container, item, cls = "cover-img") {
    if (!container) return null;
    const old = container.querySelector("." + cls);
    if (old) old.remove();
    container.querySelector(".cover-shimmer")?.remove();

    // indicateur de chargement
    const shimmer = document.createElement("div");
    shimmer.className = "cover-shimmer";
    container.appendChild(shimmer);
    const settle = () => { if (shimmer.parentNode) shimmer.remove(); };

    const img = document.createElement("img");
    img.className = cls;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("load", () => { img.classList.add("is-loaded"); settle(); });
    img.addEventListener("error", settle);
    container.insertBefore(img, container.firstChild);

    resolve(item).then(url => {
      if (!url) { img.remove(); settle(); return; }
      img.src = url;
      if (img.complete && img.naturalWidth) { img.classList.add("is-loaded"); settle(); }
    }).catch(settle);

    setTimeout(settle, 14000);
    return img;
  }

  return { resolve, warmAll, paint, similarity, get dead() { return [...dead]; } };
})();
