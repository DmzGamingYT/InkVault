/* ══════════════════════════════════════════════
   INKVAULT — Persistance (localStorage)
   Bibliothèque, activité de lecture, objectif, préférences
   ══════════════════════════════════════════════ */

const Store = (() => {
  "use strict";

  const KEY  = "inkvault.state.v1";
  const VER  = 1;
  const DAY  = 86400000;

  const iso = d => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };

  /* PRNG déterministe (mulberry32) — la bibliothèque de démo
     génère toujours exactement les mêmes dates. */
  function seedOf(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ─────────── État par défaut (premier lancement) ─────────── */
  function seed() {
    const now  = Date.now();
    const year = new Date().getFullYear();
    const activity = Object.create(null);

    const items = LIBRARY.map(src => {
      const it = Object.assign({}, src);
      const r = rng(seedOf(it.title + "|" + it.author));

      // date d'ajout : étalée sur les 260 derniers jours
      it.addedAt = iso(new Date(now - Math.floor(r() * 260) * DAY));

      if (it.status === "Terminé") {
        const doy = 1 + Math.floor(r() * 265);
        let fin = new Date(year, 0, doy);
        if (fin.getTime() > now) fin = new Date(now - Math.floor(r() * 30) * DAY);
        it.finishedAt = iso(fin);
      } else {
        it.finishedAt = null;
      }

      it.fav    = it.rating >= 5 ? true : r() < 0.07;
      it.review = "";

      // Sessions de lecture simulées → la heatmap n'est pas vide au démarrage
      const sessions = Math.min(12, Math.max(1, Math.round(it.read / 3) + 1));
      for (let s = 0; s < sessions; s++) {
        const day = iso(new Date(now - Math.floor(r() * 175) * DAY));
        activity[day] = (activity[day] || 0) + (1 + Math.floor(r() * 3));
      }
      if (it.finishedAt) activity[it.finishedAt] = (activity[it.finishedAt] || 0) + 3;

      return it;
    });

    return {
      v: VER,
      items,
      activity,
      goal: 40,
      prefs: { filter: "all", sort: "title", view: "grid" }
    };
  }

  /* ─────────── Validation d'un état importé ─────────── */
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const integer = value => Number.isSafeInteger(value);
  const day = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const optional = (obj, key, check) => !Object.hasOwn(obj, key) || check(obj[key]);
  const oneOf = (...values) => value => values.includes(value);
  const nonNegative = value => integer(value) && value >= 0;
  const text = value => typeof value === "string";
  const color = value => typeof value === "string" && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value);
  const COLOR = "#7c5cff";

  function valid(state) {
    if (!object(state) || !Array.isArray(state.items) ||
        !optional(state, "v", oneOf(VER)) ||
        !optional(state, "app", oneOf("inkvault")) ||
        !optional(state, "goal", n => integer(n) && n > 0) ||
        !optional(state, "activity", activity => object(activity) &&
          Object.entries(activity).every(([date, count]) => day(date) && nonNegative(count))) ||
        !optional(state, "prefs", prefs => object(prefs) &&
          optional(prefs, "filter", oneOf("all", "__fav", "__current", "Manga", "Comic", "Webtoon", "Graphic Novel")) &&
          optional(prefs, "sort", oneOf("title", "rating", "year", "progress", "fav", "added")) &&
          optional(prefs, "view", oneOf("grid", "list")) &&
          optional(prefs, "mode", oneOf("text", "vibe")) &&
          optional(prefs, "skin", oneOf("ink", "vintage", "gotham", "batman", "onepiece", "claire")) &&
          optional(prefs, "status", text) &&
          optional(prefs, "author", text) &&
          optional(prefs, "sb", n => typeof n === "number" && Number.isFinite(n) && n >= 0))) return false;

    const ids = new Set();
    return state.items.every(it => {
      if (!object(it) || !integer(it.id) || it.id <= 0 || ids.has(it.id) ||
          !text(it.title) || !it.title.trim() || !text(it.author) ||
          !optional(it, "format", oneOf("Manga", "Comic", "Webtoon", "Graphic Novel")) ||
          !optional(it, "year", n => integer(n) && n >= 0) ||
          !optional(it, "volumes", n => integer(n) && n > 0) ||
          !optional(it, "read", nonNegative) ||
          !optional(it, "rating", n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 5) ||
          !optional(it, "status", oneOf("Planifié", "En cours", "Terminé")) ||
          !optional(it, "desc", text) || !optional(it, "review", text) ||
          !optional(it, "fav", v => typeof v === "boolean") ||
          !optional(it, "addedAt", day) ||
          !optional(it, "finishedAt", v => v === null || day(v)) ||
          !optional(it, "isbn", text) || !optional(it, "search", text) ||
          !optional(it, "variant", text)) return false;
      // Une couleur invalide est récupérable : elle sera neutralisée par normalize.
      ids.add(it.id);
      return !Object.hasOwn(it, "read") || it.read <= (it.volumes === undefined ? 1 : it.volumes);
    });
  }

  function normalize(state) {
    const today = iso(new Date());
    const out = {
      v: VER,
      activity: Object.assign(Object.create(null), state.activity || {}),
      goal: state.goal === undefined ? 40 : state.goal,
      prefs: Object.assign({ filter: "all", sort: "title", view: "grid" }, state.prefs || {}),
      items: state.items.map(it => {
        const item = Object.assign({
          format: "Comic", year: new Date().getFullYear(), volumes: 1, read: 0,
          rating: 0, status: "Planifié", desc: "", fav: false, review: "",
          addedAt: today, finishedAt: null
        }, it, { color: color(it.color) ? it.color : COLOR });
        item.read = Math.min(item.volumes, Math.max(0, item.read || 0));
        if (item.read >= item.volumes) {
          item.status = "Terminé";
          item.finishedAt = item.finishedAt || item.addedAt;
        } else if (item.read > 0) {
          item.status = "En cours";
          item.finishedAt = null;
        } else {
          item.status = "Planifié";
          item.finishedAt = null;
        }
        return item;
      })
    };
    return out;
  }

  /* ─────────── Lecture / écriture ─────────── */
  function load() {
    let raw;
    try { raw = localStorage.getItem(KEY); }
    catch (e) { throw new Error("[InkVault] Stockage inaccessible : bibliothèque non chargée.", { cause: e }); }
    if (raw === null) {
      // Premier lancement : bibliothèque réellement vide, sans données de démonstration.
      const fresh = normalize({ items: [], activity: {}, goal: 40, prefs: {} });
      if (!save(fresh)) throw new Error("[InkVault] Stockage inaccessible : bibliothèque vide non enregistrée.");
      return fresh;
    }

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { throw new Error("[InkVault] Sauvegarde illisible : données conservées dans localStorage, aucune écriture effectuée.", { cause: e }); }
    if (!valid(parsed)) {
      throw new Error("[InkVault] Sauvegarde invalide ou version incompatible : données conservées dans localStorage, aucune écriture effectuée.");
    }
    return normalize(parsed);
  }

  function save(state) {
    if (!valid(state)) {
      console.warn("[InkVault] Sauvegarde refusée : état invalide.");
      return false;
    }
    try {
      const serialized = JSON.stringify(normalize(state));
      localStorage.setItem(KEY, serialized);
      state.v = VER;
      return true;
    } catch (e) {
      console.warn("[InkVault] Sauvegarde impossible :", e && e.name);
      return false;
    }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function size() {
    try {
      const raw = localStorage.getItem(KEY) || "";
      return new Blob([raw]).size;
    } catch (e) { return 0; }
  }

  const demo = () => normalize(seed());

  return { load, save, clear, size, valid, normalize, demo, iso };
})();
