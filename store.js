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
  function valid(state) {
    if (!state || typeof state !== "object") return false;
    if (!Array.isArray(state.items)) return false;
    if (!state.items.length) return false;
    return state.items.every(it =>
      it && typeof it === "object" &&
      typeof it.title === "string" && it.title.trim() &&
      typeof it.author === "string"
    );
  }

  function normalize(state) {
    const out = Object.assign(seed(), state);
    out.v = VER;
    out.activity = out.activity && typeof out.activity === "object" ? out.activity : Object.create(null);
    out.goal = Math.max(1, parseInt(out.goal) || 40);
    out.prefs = Object.assign({ filter: "all", sort: "title", view: "grid" }, out.prefs || {});
    out.items = out.items.map(it => Object.assign({
      fav: false, review: "", addedAt: iso(new Date()), finishedAt: null
    }, it));
    return out;
  }

  /* ─────────── Lecture / écriture ─────────── */
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return normalize(seed()); }
    if (!raw) {
      // premier lancement : on grave tout de suite le seed sur le disque
      const fresh = normalize(seed());
      save(fresh);
      return fresh;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed.v !== VER || !valid(parsed)) return normalize(seed());
      return normalize(parsed);
    } catch (e) {
      return normalize(seed());
    }
  }

  function save(state) {
    try {
      state.v = VER;
      localStorage.setItem(KEY, JSON.stringify(state));
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

  return { load, save, clear, size, valid, normalize, iso };
})();
