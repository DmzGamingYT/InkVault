/* ══════════════════════════════════════════════
   INKVAULT — Logique de l'application
   ══════════════════════════════════════════════ */

(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  /* Icône SVG du sprite (remplace les émojis d'interface) */
  const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const DAY = 86400000;
  const reduced = () => matchMedia("(prefers-reduced-motion:reduce)").matches;
  const canHover = () => matchMedia("(hover:hover)").matches;

  /* Confirmation native : window.confirm n'existe PAS sous Electron
     (il renvoie undefined → « Retirer »/« Import » semblaient morts).
     On passe par la boîte de dialogue système via le preload. */
  const confirmBox = (msg, okLabel) => {
    const bridge = window.inkvault;
    if (bridge && typeof bridge.confirmBox === "function") return bridge.confirmBox(msg, okLabel);
    return Promise.resolve(window.confirm(msg));
  };

  /* ─────────── ÉTAT ─────────── */
  let db;
  try {
    db = Store.load();
  } catch (error) {
    const showRecovery = () => {
      const message = error && error.message ? error.message : "Les données locales n’ont pas pu être chargées.";
      const safeMessage = String(message).replace(/[&<>\"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
      document.body.innerHTML = `
        <main class="boot-recovery" role="alert">
          <div class="boot-recovery__card">
            <div class="boot-recovery__mark">◆</div>
            <h1>InkVault ne peut pas démarrer</h1>
            <p>${safeMessage}</p>
            <p class="boot-recovery__note">Tes données locales n’ont pas été effacées. Tu peux réinitialiser le stockage pour repartir avec la bibliothèque de démonstration.</p>
            <button class="btn btn--primary" id="bootReset">Réinitialiser les données locales</button>
          </div>
        </main>`;
      $("#bootReset").addEventListener("click", async () => {
        if (!await confirmBox("Cette action effacera la sauvegarde locale. Continuer ?", "Réinitialiser")) return;
        Store.clear();
        location.reload();
      });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showRecovery, { once: true });
    else showRecovery();
    return;
  }
  let items = db.items;
  const state = {
    q: "",
    filter: db.prefs.filter || "all",
    sort:   db.prefs.sort   || "title",
    view:   db.prefs.view   || "grid",
    mode:   db.prefs.mode   || "text",   // "text" = recherche classique · "vibe" = recherche par ambiance
    statusFilter: db.prefs.status || "all",
    authorFilter: db.prefs.author || "",
    skin:   db.prefs.skin   || localStorage.getItem("ink-skin") ||
            (localStorage.getItem("ink-theme") === "light" ? "claire" : "gotham"),
    sbBudget: db.prefs.sb   ?? 50,        // budget du Smart Buy (€)
    vibe:   null,                         // dernier résultat du moteur d'ambiance
    insOffset: 0,                         // 0 = mois en cours
    openId: null
  };

  function persist() {
    db.items = items;
    db.prefs = {
      filter: state.filter || "all",
      sort:   state.sort   || "title",
      view:   state.view   || "grid",
      mode:   state.mode   || "text",
      status: state.statusFilter || "all",
      author: state.authorFilter || "",
      skin:   state.skin   || "gotham",
      sb:     state.sbBudget ?? 50
    };
    return Store.save(db);
  }

  function logSession(n = 1) {
    const d = Store.iso(new Date());
    db.activity[d] = (db.activity[d] || 0) + n;
  }

  /* ═══════════ ÉCRAN DE CHARGEMENT ═══════════ */
  function runLoader() {
    const bar = $(".loader__bar span"), pct = $(".loader__pct"), loader = $("#loader");
    let p = 0;
    const t = setInterval(() => {
      p += Math.random() * 17 + 6;
      if (p >= 100) { p = 100; clearInterval(t); setTimeout(() => loader.classList.add("is-done"), 420); }
      bar.style.width = p + "%";
      pct.textContent = Math.floor(p) + "%";
    }, 130);
  }

  /* ═══════════ GLOW CURSEUR ═══════════ */
  function initCursor() {
    if (!canHover() || reduced()) return;
    const glow = $("#cursorGlow");
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y, frame = 0;
    function step() {
      if (document.hidden) { frame = 0; return; }
      cx += (x - cx) * .12; cy += (y - cy) * .12;
      glow.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
      if (Math.abs(x - cx) + Math.abs(y - cy) > .5) frame = requestAnimationFrame(step);
      else frame = 0;
    }
    addEventListener("mousemove", e => {
      x = e.clientX; y = e.clientY;
      if (!frame && !document.hidden) frame = requestAnimationFrame(step);
    }, { passive: true });
  }

  /* ═══════════ TRANSITION DE SECTION (VOILE) ═══════════ */
  function goTo(id, keepEdit = false) {
    const t = $("#" + id); if (!t) return;
    if (id === "add" && !keepEdit && editingId !== null) $("#form").reset();
    const veil = $("#veil");
    if (reduced() || !veil) { scrollTo({ top: t.offsetTop - 60, behavior: "auto" }); return; }
    veil.classList.remove("is-on");
    void veil.offsetWidth;                       // relance l'animation
    veil.classList.add("is-on");
    setTimeout(() => scrollTo({ top: t.offsetTop - 60, behavior: "auto" }), 330);
    setTimeout(() => veil.classList.remove("is-on"), 840);
  }

  /* ═══════════ NAVIGATION ═══════════ */
  function initNav() {
    const nav = $("#nav");
    const mobileNav = document.createElement("nav");
    mobileNav.className = "nav__links nav__links--mobile";
    mobileNav.setAttribute("aria-label", "Navigation mobile");
    mobileNav.innerHTML = $(".nav__links", nav).innerHTML;
    document.body.appendChild(mobileNav);

    $$("[data-scroll]").forEach(el =>
      el.addEventListener("click", () => goTo(el.dataset.scroll)));

    const ids = ["hero", "collection", "stats", "reading", "add"];
    const links = $$(".nav__link");
    const setActive = id => links.forEach(l => l.classList.toggle("is-active", l.dataset.nav === id));

    links.forEach(a => a.addEventListener("click", e => {
      e.preventDefault();
      const id = a.getAttribute("href").slice(1);
      setActive(id);
      goTo(id);
    }));

    let navFrame = 0;
    const syncNav = () => {
      navFrame = 0;
      nav.classList.toggle("is-stuck", scrollY > 40);
      const marker = scrollY + Math.min(innerHeight * .32, 260);
      let active = ids[0];
      ids.forEach(id => {
        const section = $("#" + id);
        if (section && section.offsetTop <= marker) active = id;
      });
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) active = ids[ids.length - 1];
      setActive(active);
    };
    addEventListener("scroll", () => {
      if (!navFrame) navFrame = requestAnimationFrame(syncNav);
    }, { passive: true });
    addEventListener("resize", syncNav, { passive: true });
    syncNav();

    initSkins();
  }

  /* ═══════════ THÈMES GRAPHIQUES (SKINS) ═══════════ */
  const SKINS = ["ink", "vintage", "gotham", "batman", "onepiece", "claire"];
  const DARK_SKINS = ["gotham", "batman"];

  function applySkin(name, save = true) {
    const skin = SKINS.includes(name) ? name : "gotham";
    state.skin = skin;
    const root = document.documentElement;
    root.dataset.skin = skin;
    // Les peaux claires s'appuient sur la base « papier » de styles.css
    if (DARK_SKINS.includes(skin)) root.removeAttribute("data-theme");
    else root.dataset.theme = "light";
    try { localStorage.setItem("ink-skin", skin); } catch (e) {}
    $$("#skinPick [data-skin]").forEach(b =>
      b.classList.toggle("is-active", b.dataset.skin === skin));
    if (save) persist();
  }

  function initSkins() {
    applySkin(state.skin, false);

    const pick = $("#skinPick"), toggle = $("#themeToggle");
    const setOpen = on => {
      pick.hidden = !on;
      toggle.setAttribute("aria-expanded", String(on));
    };

    toggle.addEventListener("click", e => { e.stopPropagation(); setOpen(pick.hidden); });
    pick.addEventListener("click", e => {
      const b = e.target.closest("[data-skin]"); if (!b) return;
      applySkin(b.dataset.skin);
      setOpen(false);
      showToast(`${ic("palette")} Thème « ${esc(b.querySelector("b").textContent)} » activé.`);
    });
    document.addEventListener("click", e => {
      if (!pick.hidden && !e.target.closest(".skinwrap")) setOpen(false);
    });
    addEventListener("keydown", e => {
      if (e.key === "Escape" && !pick.hidden) setOpen(false);
    });
  }

  /* ═══════════ PARALLAXE DU HERO ═══════════ */
  function initParallax() {
    const stack = $("#heroStack");
    if (!stack || reduced()) return;
    let ticking = false, lastY = -1;
    const apply = () => {
      ticking = false;
      const y = Math.min(scrollY, innerHeight);
      if (y === lastY) return;               /* hero dépassé : plus d'écriture de style */
      lastY = y;
      stack.style.transform = `translate3d(0, ${y * .16}px, 0)`;
      stack.style.opacity = String(Math.max(0, 1 - y / (innerHeight * .95)));
    };
    addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
    apply();
  }

  /* ═══════════ FLUIDITÉ DU SCROLL ═══════════ */
  function initScrollPerf() {
    /* Suspendre les effets de survol pendant le défilement, sans bloquer les clics. */
    const root = document.documentElement;
    let idle = 0;
    addEventListener("scroll", () => {
      if (!idle) root.classList.add("is-scrolling");
      clearTimeout(idle);
      idle = setTimeout(() => { root.classList.remove("is-scrolling"); idle = 0; }, 140);
    }, { passive: true });

    /* Animations infinies du hero en pause quand il n'est plus visible */
    const hero = $("#hero");
    if (hero && typeof IntersectionObserver !== "undefined") {
      new IntersectionObserver(([en]) => {
        root.classList.toggle("hero-off", !en.isIntersecting);
      }).observe(hero);
    }
  }

  /* ═══════════ PILE FLOTTANTE DU HERO ═══════════ */
  function buildHeroStack() {
    const stack = $("#heroStack");
    if (!stack) return;
    const picks = [...items].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || b.rating - a.rating).slice(0, 4);
    const layout = [
      { t: 30,  l: 6,  r: "-11deg", d: "0s",   z: 1 },
      { t: 96,  l: 78, r: "9deg",   d: "1.1s", z: 2 },
      { t: 172, l: 2,  r: "-4deg",  d: "2.2s", z: 3 },
      { t: 236, l: 72, r: "13deg",  d: "3.3s", z: 4 }
    ];
    stack.innerHTML = "";
    picks.forEach((it, i) => {
      const L = layout[i];
      const el = document.createElement("div");
      el.className = "stack-card";
      el.style.cssText =
        `top:${L.t}px; left:${L.l}%; --rot:${L.r}; z-index:${L.z}; ` +
        `background:linear-gradient(150deg, ${it.color}, ${shade(it.color, -38)}); ` +
        `animation-delay:${L.d}; transform:rotate(${L.r});`;
      el.innerHTML =
        `<div class="stack-card__spine"></div>` +
        `<div class="stack-card__scrim"></div>` +
        `<div class="stack-card__t">${esc(it.title)}</div>` +
        `<div class="stack-card__a">${esc(it.author)}</div>`;
      Covers.paint(el, it);
      el.addEventListener("click", () => openModal(it.id));
      stack.appendChild(el);
    });
  }

  /* ═══════════ UTILITAIRES ═══════════ */
  const progress = it => it.volumes ? Math.round((it.read / it.volumes) * 100) : 0;
  const textKey = value => String(value || "").toLowerCase()
    .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

  function shade(hex, amt) {
    const c = hex.replace("#", "");
    const n = parseInt(c.length === 3 ? c.split("").map(x => x + x).join("") : c, 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  const esc = s => String(s).replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const safeImageUrl = value => {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  };

  function openImageView(src, caption = "") {
    const safe = safeImageUrl(src);
    if (!safe) return;
    const dialog = $("#imageView");
    const img = $("#imageViewImg");
    const cap = $("#imageViewCap");
    if (!dialog || !img) return;
    img.src = safe;
    img.alt = caption || "Image agrandie";
    if (cap) cap.textContent = caption;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeImageView() {
    const dialog = $("#imageView");
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function initImageView() {
    const dialog = $("#imageView");
    if (!dialog) return;
    dialog.addEventListener("click", e => {
      if (e.target === dialog || e.target.closest("[data-image-close]")) closeImageView();
    });
    dialog.addEventListener("close", () => {
      const img = $("#imageViewImg");
      if (img) img.removeAttribute("src");
    });
  }

  const isHexColor = value => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || ""));

  function starsHTML(r) {
    let out = "";
    for (let i = 1; i <= 5; i++) out += `<span class="star ${i <= Math.round(r) ? "is-on" : ""}">★</span>`;
    return `<div class="stars">${out}</div>`;
  }

  const fmtDate = d => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(d);

  function countTo(el, target, dur = 1400, dec = 0) {
    if (!el) return;
    const token = (el._countToken || 0) + 1;
    el._countToken = token;
    if (el._countRaf) cancelAnimationFrame(el._countRaf);
    const start = performance.now(), from = parseFloat(el.dataset.cur || 0);
    function step(now) {
      if (el._countToken !== token) return;
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      el.textContent = dec ? v.toFixed(dec) : Math.round(v);
      if (p < 1) el._countRaf = requestAnimationFrame(step);
      else { el.dataset.cur = target; el._countRaf = 0; }
    }
    el._countRaf = requestAnimationFrame(step);
  }

  /* ═══════════ MÉTRIQUES ═══════════ */
  function renderMetrics() {
    const total   = items.length;
    const done    = items.filter(i => i.status === "Terminé").length;
    const authors = new Set(items.map(i => i.author)).size;
    const rated   = items.filter(i => i.rating > 0);
    const avg     = rated.length ? rated.reduce((s, i) => s + i.rating, 0) / rated.length : 0;
    const favs    = items.filter(i => i.fav).length;

    countTo($("#mTotal"), total);
    countTo($("#mRead"), done);
    countTo($("#mAuthors"), authors);
    countTo($("#mAvg"), avg, 1200, 1);
    $("#heroCount").textContent = total;

    const chip = $('#filters .chip[data-filter="__fav"]');
    if (chip) chip.innerHTML = `${ic("heart")} Favoris <b>${favs}</b>`;
  }

  /* ═══════════ GRILLE ═══════════ */
  function getFiltered() {
    const okF = it =>
      state.filter === "all"      ? true :
      state.filter === "__fav"    ? !!it.fav :
      state.filter === "__current" ? (it.status === "En cours" || (it.read > 0 && it.read < it.volumes)) :
      it.format === state.filter;
    const okStatus = it => state.statusFilter === "all" || it.status === state.statusFilter;
    const okAuthor = it => !state.authorFilter || it.author === state.authorFilter;

    /* ── Recherche par ambiance : classement par affinité ── */
    if (state.mode === "vibe") {
      const res = AI.vibe(state.q, items.filter(it => okF(it) && okStatus(it) && okAuthor(it)));
      state.vibe = res;
      return res.matches.map(m => m.item);
    }
    state.vibe = null;

    const q = textKey(state.q);
    const out = items.filter(it => {
      const okQ = !q || textKey(it.title).includes(q) || textKey(it.author).includes(q);
      return okF(it) && okStatus(it) && okAuthor(it) && okQ;
    });
    const by = {
      title:    (a, b) => a.title.localeCompare(b.title),
      rating:   (a, b) => b.rating - a.rating,
      year:     (a, b) => b.year - a.year,
      progress: (a, b) => progress(b) - progress(a),
      fav:      (a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || a.title.localeCompare(b.title),
      added:    (a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || ""))
    };
    return out.sort(by[state.sort] || by.title);
  }

  function bindTilt(card) {
    if (!canHover() || reduced()) return;
    let frame = 0, ex = 0, ey = 0;
    const apply = () => {
      frame = 0;
      if (!card.isConnected || document.documentElement.classList.contains("is-scrolling")) return;
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = (ex - r.left) / r.width - .5;
      const py = (ey - r.top) / r.height - .5;
      card.style.setProperty("--ry", (px * 9).toFixed(2) + "deg");
      card.style.setProperty("--rx", (-py * 9).toFixed(2) + "deg");
      card.style.setProperty("--mx", ((px + .5) * 100).toFixed(1) + "%");
      card.style.setProperty("--my", ((py + .5) * 100).toFixed(1) + "%");
    };
    card.addEventListener("pointermove", e => {
      if (e.pointerType === "touch" || document.documentElement.classList.contains("is-scrolling")) return;
      ex = e.clientX; ey = e.clientY;
      if (!frame) frame = requestAnimationFrame(apply);   /* 1 calcul max par frame */
    });
    const reset = () => {
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      card.style.removeProperty("--rx");
      card.style.removeProperty("--ry");
      card.style.removeProperty("--mx");
      card.style.removeProperty("--my");
    };
    card.addEventListener("pointerleave", reset);
    card.addEventListener("pointercancel", reset);
  }

  const pendingCovers = new WeakMap();
  const coverObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      coverObserver.unobserve(entry.target);
      const job = pendingCovers.get(entry.target);
      if (job && entry.target.isConnected) Covers.paint(job.cover, job.it);
    });
  }, { rootMargin: "300px" });

  function renderGrid(animate = true) {
    const grid = $("#grid"), empty = $("#empty");
    const list = getFiltered();
    const vm = state.mode === "vibe" && state.vibe
      ? new Map(state.vibe.matches.map(m => [m.item.id, m]))
      : null;

    $("#resultCount").textContent = list.length;
    empty.hidden = list.length > 0;
    const demoButton = $("#loadDemo");
    if (demoButton) demoButton.hidden = items.length > 0;
    if (!items.length) {
      const title = empty.querySelector("h3"), copy = empty.querySelector("p");
      if (title) title.textContent = "Votre bibliothèque est vide";
      if (copy) copy.textContent = "Ajoutez votre premier ouvrage ou chargez la collection de démonstration.";
    } else {
      const title = empty.querySelector("h3"), copy = empty.querySelector("p");
      if (title) title.textContent = "Aucun ouvrage trouvé";
      if (copy) copy.textContent = "Essaie un autre mot-clé ou change de filtre.";
    }
    if (coverObserver) coverObserver.disconnect();
    grid.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const progressBars = [], coversToObserve = [];

    list.forEach((it, i) => {
      const p = progress(it);
      const mv = vm ? vm.get(it.id) : null;
      const matchRow = mv && mv.score > 0 ? `
          <div class="card__match">
            <span class="card__pct">${mv.pct}%</span>
            <span class="card__why" title="${esc(mv.why.join(" · "))}">${esc(mv.why.length ? mv.why.join(" · ") : "mots-clés de ta recherche")}</span>
          </div>` : "";
      const card = document.createElement("article");
      card.className = "card" + (animate && i < 15 ? " card--enter" : "");
      card.style.setProperty("--cd", Math.min(i, 14) * 55 + "ms");
      card.dataset.id = it.id;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `${it.title} — ${it.author}`);

      card.innerHTML = `
        <button class="card__open" aria-label="Ouvrir la fiche">↗</button>
        <button class="fav${it.fav ? " is-on" : ""}" data-fav="${it.id}"
                aria-pressed="${!!it.fav}" aria-label="Favori">${ic("heart")}</button>
        <div class="card__cover" style="background:linear-gradient(155deg, ${it.color}, ${shade(it.color, -46)});">
          <div class="cover-scrim"></div>
          <div>
            <div class="card__title">${esc(it.title)}</div>
            <div class="card__author">${esc(it.author)}</div>
          </div>
        </div>
        <div class="card__body">
          ${matchRow}
          <div class="card__info">
            <div class="card__info-title">${esc(it.title)}</div>
            <div class="card__info-meta"><button type="button" class="lnk-au" data-author="${esc(it.author)}">${esc(it.author)}</button> · ${it.year} · ${esc(it.format)}</div>
          </div>
          <div class="card__row">
            <div class="card__meta">
              <span class="card__type">${esc(it.format)}</span>
              ${it.review ? `<span class="quote-mark" title="${esc(it.review)}">❝</span>` : ""}
            </div>
            <span class="status" data-s="${esc(it.status)}">${esc(it.status)}</span>
          </div>
          <div class="progress"><i style="width:${animate && i < 15 ? 0 : p}%"></i></div>
          <div class="card__foot">
            <span><b>${it.read}</b>/${it.volumes} tomes</span>
            <span>${p}%</span>
          </div>
        </div>`;

      card.addEventListener("click", e => {
        if (e.target.closest("button")) return;
        openModal(it.id);
      });
      card.querySelector(".card__open").addEventListener("click", e => {
        e.stopPropagation(); openModal(it.id);
      });
      card.querySelector(".fav").addEventListener("click", e => {
        e.stopPropagation(); toggleFav(it.id);
      });

      if (animate && i < 15) {
        card.addEventListener("animationend", () => card.classList.remove("card--enter"), { once: true });
        const bar = card.querySelector(".progress i");
        bar.style.transitionDelay = Math.min(i, 14) * 55 + 340 + "ms";
        progressBars.push([bar, p]);
      }

      fragment.appendChild(card);
      const cover = card.querySelector(".card__cover");
      /* Observer la carte entière pour anticiper le chargement en grille comme en liste. */
      if (coverObserver) {
        pendingCovers.set(card, { cover, it });
        coversToObserve.push(card);
      } else Covers.paint(cover, it);
      bindTilt(card);
    });

    grid.classList.toggle("is-list", state.view === "list");
    grid.appendChild(fragment);
    coversToObserve.forEach(card => coverObserver.observe(card));
    if (progressBars.length) requestAnimationFrame(() => {
      progressBars.forEach(([bar, p]) => { if (bar.isConnected) bar.style.width = p + "%"; });
    });
    if (state.mode === "vibe") paintVibe();
  }

  /* ═══════════ RECHERCHE PAR AMBIANCE (MOTEUR LOCAL) ═══════════ */
  function paintVibe() {
    const res = state.vibe;
    const tags = $("#vibeTags"), count = $("#vibeCount");
    if (!tags || !count) return;

    $$("#vibeExamples .chip--ex").forEach(c =>
      c.classList.toggle("is-active", c.dataset.q.trim() === state.q.trim()));

    if (!res || !res.hasSignal) {
      tags.innerHTML = `<span class="vibe__tag"><i>attente</i>décris une ambiance pour activer le classement par affinité</span>`;
      count.innerHTML = "";
      return;
    }

    let d = 0;
    const chip = (g, label) =>
      `<span class="vibe__tag" style="animation-delay:${(d++) * 55}ms"><i>${esc(g)}</i>${esc(label)}</span>`;

    tags.innerHTML =
      res.facets.map(f => chip(f.g, f.label)).join("") +
      res.toks.map(w => chip("mot", w)).join("") +
      res.negs.map(w => chip("écarté", w)).join("");

    const hits = res.matches.filter(m => m.score > 0).length;
    count.innerHTML = res.facets.length || res.toks.length
      ? `<b>${hits}</b> <em>correspondance${hits > 1 ? "s" : ""}</em>`
      : "";
  }

  function setVibeMode(on) {
    state.mode = on ? "vibe" : "text";
    persist();
    syncVibeChrome();
    renderGrid();
  }

  function syncVibeChrome() {
    const on = state.mode === "vibe";
    const t = $("#vibeToggle"), p = $("#vibePanel"), input = $("#search");
    if (t) { t.classList.toggle("is-active", on); t.setAttribute("aria-pressed", String(on)); }
    if (p) p.hidden = !on;
    if (input) input.placeholder = on
      ? "Décris une ambiance : « un seinen sombre, de l'encre détaillée… »"
      : "Rechercher un titre, un auteur…";
    const sort = $("#sort");
    if (sort) { sort.disabled = on; sort.title = on ? "Le tri est remplacé par l’affinité d’ambiance" : ""; }
    if (!on) {
      state.vibe = null;
      const tags = $("#vibeTags"), count = $("#vibeCount");
      if (tags) tags.innerHTML = "";
      if (count) count.innerHTML = "";
    }
  }

  function initVibe() {
    $("#vibeToggle").addEventListener("click", () => setVibeMode(state.mode !== "vibe"));

    const examples = $("#vibeExamples");
    if (examples) examples.addEventListener("click", e => {
      const b = e.target.closest(".chip--ex"); if (!b) return;
      const q = b.dataset.q;
      $("#search").value = q;
      state.q = q;
      if (state.mode !== "vibe") setVibeMode(true);
      else { syncVibeChrome(); renderGrid(); }
      $("#grid").scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
    });

    syncVibeChrome();
  }

  function jumpToVibe(q) {
    $("#search").value = q;
    state.q = q;
    if (state.mode !== "vibe") setVibeMode(true);
    else { syncVibeChrome(); renderGrid(); }
    goTo("collection");
  }

  /* ═══════════ FAVORIS ═══════════ */
  function toggleFav(id) {
    const it = items.find(x => x.id === id); if (!it) return;
    const previous = it.fav;
    it.fav = !it.fav;
    if (!persist()) {
      it.fav = previous;
      showToast(ic("alert") + " Impossible d’enregistrer le favori.");
      return;
    }

    const card = $(`.card[data-id="${id}"] .fav`);
    if (card) {
      card.classList.toggle("is-on", it.fav);
      card.setAttribute("aria-pressed", String(it.fav));
      if (it.fav && !reduced()) {
        card.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.45)" }, { transform: "scale(1)" }],
          { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" }
        );
      }
    }
    if (state.filter === "__fav") renderGrid(false);
    renderMetrics();
    buildHeroStack();
    if (state.openId === id) syncModalFav(it);
  }

  function syncModalFav(it) {
    const b = $("#mFav");
    if (!b) return;
    b.classList.toggle("is-on", !!it.fav);
    b.setAttribute("aria-pressed", String(!!it.fav));
  }

  /* ═══════════ BARRE D'OUTILS ═══════════ */
  function syncAuthorFilter() {
    const select = $("#authorFilter");
    if (!select) return;
    const current = state.authorFilter;
    const authors = [...new Set(items.map(it => it.author).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
    select.innerHTML = `<option value="">Auteur : tous</option>` + authors.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join("");
    if (authors.includes(current)) state.authorFilter = current;
    else state.authorFilter = "";
    select.value = state.authorFilter;
  }

  function initToolbar() {
    let searchTimer = 0;
    $("#search").addEventListener("input", e => {
      state.q = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderGrid(false), 140);
    });

    $$("#filters .chip[data-filter]").forEach(c => c.addEventListener("click", () => {
      if (!c.dataset.filter) return;
      $$("#filters .chip[data-filter]").forEach(x => x.classList.remove("is-active"));
      c.classList.add("is-active");
      state.filter = c.dataset.filter;
      persist();
      renderGrid();
    }));

    // restaure la préférence
    $$("#filters .chip[data-filter]").forEach(x =>
      x.classList.toggle("is-active", x.dataset.filter === state.filter));
    $("#sort").value = state.sort;
    $("#statusFilter").value = state.statusFilter;
    syncAuthorFilter();
    $$(".view-btn").forEach(b => b.classList.toggle("is-active", b.dataset.view === state.view));

    $("#sort").addEventListener("change", e => { state.sort = e.target.value; persist(); renderGrid(); });
    $("#statusFilter").addEventListener("change", e => { state.statusFilter = e.target.value; persist(); renderGrid(); });
    $("#authorFilter").addEventListener("change", e => { state.authorFilter = e.target.value; persist(); renderGrid(); });

    $$(".view-btn").forEach(b => b.addEventListener("click", () => {
      $$(".view-btn").forEach(x => x.classList.remove("is-active"));
      b.classList.add("is-active");
      state.view = b.dataset.view;
      persist();
      renderGrid(false);
    }));

    $("#resetFilters").addEventListener("click", resetFilters);
    $("#loadDemo").addEventListener("click", loadDemo);
    $("#btnImport").addEventListener("click", () => $("#fileImport").click());
    $("#fileImport").addEventListener("change", importJSON);
    /* #btnExport est câblé par initExport() — menu JSON / Markdown / PDF */

    addEventListener("keydown", e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        $("#search").focus();
        $("#search").scrollIntoView({ block: "center", behavior: "smooth" });
      }
      if (e.key === "Escape") {
        if (!closeAuthor()) closeModal();
      }
    });

    initGridKeys();
  }

  function initGridKeys() {
    const grid = $("#grid");
    grid.addEventListener("keydown", e => {
      const card = e.target.closest(".card");
      if (!card || e.target !== card) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); openModal(+card.dataset.id); return;
      }
      const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const cards = $$(".card", grid);
      const i = cards.indexOf(card);
      const first = cards[0];
      const step = state.view === "list"
        ? 1
        : Math.max(1, Math.round(grid.clientWidth / (first ? first.offsetWidth + 26 : 240)));
      const n = e.key === "ArrowRight" ? i + 1
              : e.key === "ArrowLeft"  ? i - 1
              : e.key === "ArrowDown"  ? i + step
              : i - step;
      if (cards[n]) { cards[n].focus(); cards[n].scrollIntoView({ block: "nearest" }); }
    });
  }

  function resetFilters() {
    state.q = ""; state.filter = "all"; state.statusFilter = "all"; state.authorFilter = "";
    $("#search").value = "";
    $("#statusFilter").value = "all";
    syncAuthorFilter();
    $$("#filters .chip[data-filter]").forEach(x => x.classList.toggle("is-active", x.dataset.filter === "all"));
    persist();
    renderGrid();
  }

  async function loadDemo() {
    if (items.length && !await confirmBox("Charger la collection de démonstration à la place de la bibliothèque actuelle ?", "Charger la démo")) return;
    const demo = Store.demo();
    if (!Store.save(demo)) { showToast(ic("alert") + " Impossible d’enregistrer la collection de démonstration."); return; }
    db = demo;
    items = db.items;
    state.filter = "all"; state.statusFilter = "all"; state.authorFilter = "";
    $("#statusFilter").value = "all";
    syncAuthorFilter();
    refreshAll();
    buildHeroStack();
    showToast(ic("spark") + " Collection de démonstration chargée.");
  }

  /* ═══════════ EXPORT / IMPORT ═══════════ */
  function exportJSON() {
    const payload = {
      app: "inkvault", v: 1,
      exportedAt: new Date().toISOString(),
      items, activity: db.activity, goal: db.goal, prefs: db.prefs
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inkvault-${Store.iso(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(ic("save") + " Export terminé — " + items.length + " ouvrages.");
  }

  function importJSON(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const fr = new FileReader();
    fr.onload = async () => {
      let data;
      try { data = JSON.parse(fr.result); }
      catch (err) {      showToast(ic("alert") + " Fichier JSON illisible."); return; }

      if (!Store.valid(data)) { showToast(ic("alert") + " Ce fichier n'est pas une sauvegarde InkVault valide."); return; }
      if (!await confirmBox(`Remplacer la bibliothèque actuelle par celle du fichier (${data.items.length} ouvrages) ?`, "Importer")) return;

      const imported = Store.normalize(data);
      if (!Store.save(imported)) {
        showToast(ic("alert") + " Import impossible : stockage local indisponible.");
        return;
      }
      db = imported;
      items = db.items;
      $("#form").reset();
      state.filter = db.prefs.filter || "all";
      state.sort   = db.prefs.sort   || "title";
      state.view   = db.prefs.view   || "grid";
      state.mode   = db.prefs.mode   || "text";
      state.statusFilter = db.prefs.status || "all";
      state.authorFilter = db.prefs.author || "";
      state.skin   = db.prefs.skin   || state.skin;
      state.sbBudget = db.prefs.sb   ?? state.sbBudget;
      persist();
      applySkin(state.skin, false);
      $("#sbBudget").value = state.sbBudget;
      syncVibeChrome();
      $("#sort").value = state.sort;
      $("#statusFilter").value = state.statusFilter;
      syncAuthorFilter();
      $$("#filters .chip[data-filter]").forEach(x => x.classList.toggle("is-active", x.dataset.filter === state.filter));
      $$(".view-btn").forEach(b => b.classList.toggle("is-active", b.dataset.view === state.view));

      buildHeroStack();
      refreshAll();
      showToast(ic("folder") + " Import réussi — bibliothèque remplacée.");
    };
    fr.readAsText(file);
  }

  /* ═══════════ STATISTIQUES ═══════════ */
  function renderStats() {
    const completed = items.filter(i => i.status === "Terminé").length;
    const rated = items.filter(i => Number(i.rating) > 0);
    const readVolumes = items.reduce((sum, i) => sum + Math.max(0, Number(i.read) || 0), 0);
    const average = rated.length
      ? (rated.reduce((sum, i) => sum + Number(i.rating), 0) / rated.length).toFixed(1)
      : "—";
    const completion = items.length ? Math.round(completed / items.length * 100) : 0;

    $("#statTotal").textContent = items.length;
    $("#statRead").textContent = readVolumes;
    $("#statCompletion").textContent = `${completion}% terminés`;
    $("#statAverage").textContent = average === "—" ? average : `${average}/5`;
    $("#statFavorites").textContent = items.filter(i => i.fav).length;

    // Barres formats
    const formats = ["Manga", "Comic", "Graphic Novel", "Webtoon"];
    const counts  = formats.map(f => items.filter(i => i.format === f).length);
    const max     = Math.max(...counts, 1);
    $("#barsGenre").innerHTML = formats.map((f, i) => `
      <div class="bar">
        <div class="bar__top"><span>${f}</span><b>${counts[i]}</b></div>
        <div class="bar__track"><div class="bar__fill" data-w="${(counts[i] / max) * 100}"></div></div>
      </div>`).join("");

    // Anneau
    const pctDone = items.length ? Math.round(items.filter(i => i.status === "Terminé").length / items.length * 100) : 0;
    const circ = 2 * Math.PI * 52;
    const ring = $("#ringFill");
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = circ;
    setTimeout(() => {
      ring.style.strokeDashoffset = circ - (circ * pctDone / 100);
      countTo($("#ringPct"), pctDone, 1500);
    }, 350);

    // Auteurs
    const byAuthor = Object.create(null);
    items.forEach(i => byAuthor[i.author] = (byAuthor[i.author] || 0) + 1);
    const top = Object.entries(byAuthor).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxA = Math.max(...top.map(t => t[1]), 1);
    $("#authorsList").innerHTML = top.map(([name, n], i) => {
      const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      const col = PALETTE[i % PALETTE.length];
      return `<li>
        <span class="ava" style="background:${col}">${esc(initials)}</span>
        <span><span class="a-name"><button type="button" class="lnk-au" data-author="${esc(name)}">${esc(name)}</button></span><br><span class="a-count">${n} ouvrage${n > 1 ? "s" : ""}</span></span>
        <span class="a-bar">${Math.round(n / maxA * 100)}%</span>
      </li>`;
    }).join("");

    // Sparkline années d'ajout (et non années de publication)
    const byYear = {};
    items.forEach(i => {
      const year = String(i.addedAt || "").slice(0, 4);
      if (/^\\d{4}$/.test(year)) byYear[year] = (byYear[year] || 0) + 1;
    });
    const years = Object.keys(byYear).sort().slice(-8);
    const maxY  = Math.max(...years.map(y => byYear[y]), 1);
    $("#spark").innerHTML = years.map(y => `
      <div class="spark__col">
        <div class="spark__bar" data-h="${(byYear[y] / maxY) * 100}">
          <span class="spark__val">${byYear[y]}</span>
        </div>
        <span class="spark__lbl">${y}</span>
      </div>`).join("");

    renderChallenge();
    renderHeatmap();
    renderInsights();
    renderSmartBuy();
  }

  /* ─── Challenge annuel ─── */
  function renderChallenge() {
    const year = new Date().getFullYear();
    const done = items.filter(i => i.finishedAt && +i.finishedAt.slice(0, 4) === year).length;
    const goal = db.goal || 40;
    const pct  = Math.min(100, Math.round(done / goal * 100));

    $("#chYear").textContent = year;
    const goalEl = $("#chGoal");
    if (document.activeElement !== goalEl) goalEl.value = goal;

    const doneEl = $("#chDone");
    doneEl.dataset.cur = doneEl.dataset.cur || 0;
    setTimeout(() => countTo(doneEl, done, 1100), 150);

    const bar = $("#chBar");
    bar.dataset.w = pct;
    bar.style.width = "0%";

    $("#chLeft").textContent = done >= goal
      ? ic("check") + " Objectif atteint"
      : `${goal - done} restant${goal - done > 1 ? "s" : ""}`;

    const jan1 = new Date(year, 0, 1).getTime();
    const months = Math.max(1, (Date.now() - jan1) / DAY / 30.44);
    $("#chPace").textContent = `≈ ${(done / months).toFixed(1)}/mois`;
  }

  /* ─── Heatmap d'activité ─── */
  function renderHeatmap() {
    const wrap = $("#heatmap"), months = $("#hmMonths");
    if (!wrap) return;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7;                 // lundi = 0
    const monday = new Date(today.getTime() - dow * DAY);
    const start  = new Date(monday.getTime() - 25 * 7 * DAY);

    const level = n => !n ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;

    let html = "", mhtml = "", prevMonth = -1;
    const cells = [];

    for (let w = 0; w < 26; w++) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + (w * 7 + d) * DAY);
        const key  = Store.iso(date);
        const n    = db.activity[key] || 0;
        const lv   = level(n);
        cells.push({ date, n, lv, key, isFuture: date.getTime() > today.getTime() });
      }
      const firstDay = new Date(start.getTime() + w * 7 * DAY);
      const m = firstDay.getMonth();
      mhtml += `<span>${m !== prevMonth && firstDay.getDate() <= 7
        ? new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(firstDay).replace(".", "")
        : ""}</span>`;
      prevMonth = m;
    }

    cells.forEach((c, i) => {
      const label = c.isFuture
        ? ""
        : `${fmtDate(c.date)} — ${c.n} session${c.n > 1 ? "s" : ""}`;
      html += `<i class="hm-cell${c.n ? " l" + c.lv : ""}${c.n ? "" : " is-zero"}"
                  data-lv="${c.lv}" title="${esc(label)}"></i>`;
    });

    wrap.innerHTML = html;
    months.innerHTML = mhtml;

    // série en cours
    let streak = 0, cursor = new Date(today);
    if (!(db.activity[Store.iso(cursor)])) cursor = new Date(today.getTime() - DAY);
    while (db.activity[Store.iso(cursor)]) { streak++; cursor = new Date(cursor.getTime() - DAY); }
    $("#hmStreak").innerHTML = streak > 0 ? `${ic("bolt")} ${streak} jour${streak > 1 ? "s" : ""} d'affilée` : "—";

    const total = Object.values(db.activity).reduce((s, n) => s + n, 0);
    $("#hmTotal").textContent = `${total} sessions`;
  }

  let statsIO = null;
  function observeStats() {
    if (statsIO) statsIO.disconnect();
    statsIO = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const c = en.target;
        c.classList.add("is-in");
        requestAnimationFrame(() => {
          $$(".bar__fill", c).forEach(b => { b.style.width = b.dataset.w + "%"; });
          $$(".spark__bar", c).forEach(b => { b.style.height = Math.max(b.dataset.h, 6) + "%"; });
          const cb = c.querySelector("#chBar");
          if (cb) cb.style.width = cb.dataset.w + "%";
          $$(".ins__fill", c).forEach(b => { b.style.width = b.dataset.w + "%"; });
          c.classList.add("is-stats-ready");
        });
        statsIO.unobserve(c);
      });
    }, { threshold: .15 });
    $$(".stat-card").forEach(c => statsIO.observe(c));
  }

  /* ═══════════ FORMULAIRE ═══════════ */
  let editingId = null;
  let reviewTimer = 0;
  let lastSavedReview = "";
  function initForm() {
    const sw = $("#swatches"), colorInput = $("#colorInput");
    const form = $("#form");
    sw.innerHTML = PALETTE.map(c =>
      `<div class="swatch${c === colorInput.value ? " is-active" : ""}" data-c="${c}" style="background:${c}; color:${c}"></div>`
    ).join("");
    sw.addEventListener("click", e => {
      const s = e.target.closest(".swatch"); if (!s) return;
      $$(".swatch", sw).forEach(x => x.classList.remove("is-active"));
      s.classList.add("is-active");
      colorInput.value = s.dataset.c;
    });

    const rating = $('input[name="rating"]'), out = $("#rateOut");
    const paint = () => {
      out.textContent = rating.value;
      const p = (rating.value - rating.min) / (rating.max - rating.min) * 100;
      rating.style.background = `linear-gradient(90deg, var(--accent) ${p}%, var(--surface-2) ${p}%)`;
    };
    rating.addEventListener("input", paint); paint();
    $('input[name="year"]').defaultValue = String(new Date().getFullYear());

    form.addEventListener("reset", () => {
      editingId = null;
      $("#add .section-title").innerHTML = "Ajouter un <em>ouvrage</em>";
      form.querySelector('[type="submit"] span').textContent = "Ajouter à la bibliothèque";
      form.querySelector('[type="reset"] span').textContent = "Effacer";
      setTimeout(() => {
        $$(".swatch", sw).forEach(x => x.classList.toggle("is-active", x.dataset.c === colorInput.value));
        paint();
      }, 0);
    });

    form.addEventListener("submit", e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const title  = (f.get("title")  || "").toString().trim();
      const author = (f.get("author") || "").toString().trim();
      if (!title || !author) { showToast(ic("alert") + " Le titre et l'auteur sont obligatoires."); return; }

      const current = editingId === null ? null : items.find(x => x.id === editingId);
      if (editingId !== null && !current) { showToast(ic("alert") + " Ouvrage introuvable."); return; }
      const volumes = Math.min(9999, Math.max(1, parseInt(f.get("volumes"), 10) || 1));
      const requestedStatus = String(f.get("status") || "Planifié");
      const allowedStatuses = new Set(["Planifié", "En cours", "Terminé"]);
      const allowedFormats = new Set(["Manga", "Comic", "Webtoon", "Graphic Novel"]);
      const format = String(f.get("format") || "Comic").slice(0, 40);
      const year = parseInt(f.get("year"), 10) || new Date().getFullYear();
      const rating = Math.min(5, Math.max(0, parseFloat(f.get("rating")) || 0));
      const color = String(f.get("color") || "#7c5cff");
      const desc = String(f.get("desc") || "").trim().slice(0, 2000);
      const requestedRead = parseInt(f.get("read"), 10) || 0;
      if (!allowedStatuses.has(requestedStatus) || !allowedFormats.has(format) || !isHexColor(color) ||
          year < 1900 || year > 2100 || title.length > 300 || author.length > 200) {
        showToast(ic("alert") + " Certains champs sont invalides.");
        return;
      }
      const read = requestedStatus === "Terminé" ? volumes
        : requestedStatus === "Planifié" ? 0
        : Math.min(volumes, Math.max(0, requestedRead));
      const status = read >= volumes ? "Terminé" : read > 0 ? "En cours" : "Planifié";
      const today = Store.iso(new Date());
      const item = {
        ...(current || {}),
        id: current ? current.id : items.reduce((max, x) => Math.max(max, x.id + 1), Date.now()),
        title, author, format,
        year: Math.min(2100, Math.max(1900, year)),
        volumes,
        read,
        rating,
        status, color,
        desc: desc || current?.desc || "Ajouté récemment à ta bibliothèque InkVault.",
        fav: current?.fav || false,
        review: current?.review || "",
        addedAt: current?.addedAt || today,
        finishedAt: status === "Terminé" ? (current?.finishedAt || today) : null
      };
      const previousItems = items;
      const previousActivity = { ...db.activity };
      if (status === "Terminé" && current?.status !== "Terminé") logSession(2);

      items = current ? items.map(x => x.id === current.id ? item : x) : [item, ...items];
      if (!persist()) {
        items = previousItems;
        db.items = previousItems;
        db.activity = previousActivity;
        showToast(ic("alert") + " Enregistrement impossible : stockage local indisponible.");
        return;
      }
      refreshAll();
      buildHeroStack();
      showToast(ic("check") + ` « ${esc(title)} » ${current ? "modifié" : "ajouté"} dans la bibliothèque !`);

      form.reset();
      setTimeout(() => goTo("collection"), 550);
    });
  }

  let toastTimer;
  function showToast(msg) {
    const t = $("#toast");
    t.innerHTML = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 4000);
  }

  /* ═══════════ FICHE AUTEUR — APERÇU · ŒUVRES · RÉSEAU ═══════════ */
  const amodal = $("#amodal");
  const LIVE_LIMIT = 18;
  let liveSeq = 0;
  let lastAuthor = null;          // dernière fiche ouverte (pour le croisement live)
  let liveWorks = [];             // bibliographie live, volumes regroupés par série
  let liveAuthor = null;          // auteur de cette bibliographie
  let liveOwn = new Map();        // possession modifiée depuis la fiche (index → booléen)
  let liveFilter = "all";
  let liveShown = LIVE_LIMIT;
  let olWorkCount = 0;            // total d'œuvres selon l'autorité Open Library
  const authorSub = { trade: "", years: "" };

  const plural = (n, one, many = one + "s") => `${n} ${n > 1 ? many : one}`;

  /* Personne(s) derrière une influence : « Guin Saga — Kaoru Kurimoto » → Kaoru Kurimoto,
     « L'Incal — Jodorowsky & Moebius » → les deux. Une entrée sans tiret n'est une personne
     que si on la connaît (bibliothèque ou base) : « Star Wars » reste du texte. */
  function influencePeople(inf, known) {
    const parts = String(inf).split(/\s+[—–]\s+/);
    if (parts.length > 1) return parts[parts.length - 1].split(/\s+(?:&|et|and)\s+/).map(s => s.trim()).filter(Boolean);
    const who = known.find(a => AI.key(a) === AI.key(inf));
    return who ? [who] : [];
  }
  const authorLink = (name, label = name, title = `Voir la fiche de ${name}`) =>
    `<button class="am__tag am__tag--link" data-author="${esc(name)}" type="button" title="${esc(title)}">${esc(label)}</button>`;
  const hexColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : "var(--accent)";

  const FORMAT_TRADE = {
    Manga: "Mangaka", Comic: "Auteur·rice de comics",
    Webtoon: "Webtooniste", "Graphic Novel": "Auteur·rice de romans graphiques"
  };

  /* Mots-clés Open Library utiles, traduits ; les catégories de librairie
     (« manga volume », « Literature »…) sont ignorées. */
  const SUBJECT_FR = {
    "dark fantasy": "dark fantasy", "epic fantasy": "fantasy épique", "fantasy": "fantasy",
    "sword and sorcery": "heroic fantasy", "science fiction": "science-fiction",
    "horror": "horreur", "adventure": "aventure", "romance": "romance",
    "superheroes": "super-héros", "humor": "humour", "mystery": "mystère", "war": "guerre",
    "samurai": "samouraïs", "pirates": "pirates", "demons": "démons", "magic": "magie",
    "martial arts": "arts martiaux", "sports": "sport", "crime": "polar",
    "detective and mystery stories": "enquête", "vampires": "vampires", "zombies": "zombies",
    "time travel": "voyage dans le temps", "robots": "robots", "dystopias": "dystopie",
    "mythology": "mythologie", "seinen": "seinen", "shonen": "shōnen", "shōnen": "shōnen",
    "shojo": "shōjo", "cyberpunk": "cyberpunk", "vikings": "vikings", "swordsmen": "épéistes",
    "revenge": "vengeance", "friendship": "amitié", "history": "histoire",
    "historical fiction": "récit historique", "post-apocalyptic": "post-apocalyptique"
  };
  const subjectsFr = list => [...new Set((list || [])
    .map(s => SUBJECT_FR[String(s).toLowerCase().trim()]).filter(Boolean))];

  /* « Berserk Deluxe Volume 3 » et « Berserk, Vol. 4 » → une seule entrée de série */
  const VOL_RE = /(?:[\s,:–—-]+|\s*\()(?:vol(?:ume)?\.?|tome|t\.|book|livre|#|no\.)\s*\d+\)?.*$/i;
  function groupWorks(works) {
    const groups = new Map();
    works.forEach(w => {
      const base = String(w.t || "").replace(VOL_RE, "").trim() || w.t;
      const k = AI.key(base);
      const g = groups.get(k);
      if (!g) {
        groups.set(k, { t: base, y: w.y || 0, y2: w.y || 0, c: w.c, src: w.src,
          n: 1, exact: !!w.exact, series: !!w.series });
        return;
      }
      g.n++;
      if (w.y) { g.y = g.y ? Math.min(g.y, w.y) : w.y; g.y2 = Math.max(g.y2, w.y); }
      g.c = g.c || w.c;
      g.src = g.src || w.src;
      g.exact = g.exact || !!w.exact;
      g.series = g.series || !!w.series;
    });
    return [...groups.values()];
  }

  /* ── Onglets ── */
  function setAuthorTab(tab, focus = false) {
    $$(".am__tab", amodal).forEach(b => {
      const on = b.dataset.atab === tab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    $$(".am__panel", amodal).forEach(p => { p.hidden = p.dataset.apanel !== tab; });
  }
  const currentAuthorTab = () => {
    const b = $('.am__tab[aria-selected="true"]', amodal);
    return b ? b.dataset.atab : "overview";
  };

  /* ── En-tête ── */
  function setAuthorSub(trade, years) {
    if (trade != null) authorSub.trade = trade;
    if (years != null) authorSub.years = years;
    const txt = [authorSub.trade, authorSub.years].filter(Boolean).join(" · ");
    $("#amSub").textContent = txt;
    $("#amSub").hidden = !txt;
  }

  function setAuthorGauge(pct) {
    const g = $("#amGauge");
    g.style.width = "0%";
    $("#amKpiBib").textContent = pct == null ? "—" : pct + "%";
    if (pct != null) setTimeout(() => { g.style.width = Math.min(100, pct) + "%"; }, 140);
  }

  /* Chiffres clés + « Dans ta collection » (repeint après un ajout ou un retrait) */
  function paintAuthorCollection(d) {
    $("#amKpiOwned").innerHTML = String(d.works.length) +
      (d.favs ? `<small title="${plural(d.favs, "favori")}">${ic("heart")} ${d.favs}</small>` : "");
    $("#amKpiOwnedL").textContent = d.works.length > 1 ? "œuvres en collection" : "œuvre en collection";
    $("#amKpiAvg").innerHTML = d.avg ? `${d.avg.toFixed(1)}<small>/5</small>` : "—";

    let note = "";
    if (d.gauge.mode === "biblio") {
      setAuthorGauge(d.gauge.pct);
      note = `${plural(d.gauge.owned, "œuvre")} sur ${d.gauge.total} de sa bibliographie majeure.`;
    } else if (olWorkCount) {
      const owned = d.works.length;
      setAuthorGauge(owned ? Math.max(1, Math.round((owned / olWorkCount) * 100)) : 0);
      note = `D'après Open Library : ${plural(owned, "œuvre")} en collection sur ${olWorkCount} référencées.`;
    } else {
      setAuthorGauge(null);
      note = d.works.length ? `${d.gauge.pct} % de ses œuvres en collection sont terminées.` : "";
    }
    const noteEl = $("#amGaugeNote");
    noteEl.textContent = note;
    noteEl.hidden = !note;
    $("#amCollSec").hidden = !d.works.length;

    $("#amWorks").innerHTML = d.works.length
      ? d.works.map(w => {
          const it = items.find(x => x.id === w.id);
          const p = w.volumes ? Math.round((w.read / w.volumes) * 100) : 0;
          return `
        <li class="am__work">
          <span class="am__work-sw" style="--c:${hexColor(it && it.color)}"></span>
          <div class="am__work-b">
            <span class="am__work-t">${esc(w.title)}</span>
            <span class="am__work-r">${esc(w.role)} · ${esc(w.year)}</span>
          </div>
          <div class="am__work-p">
            <div class="progress"><i style="width:${p}%"></i></div>
            <small>${esc(w.read)}/${esc(w.volumes)} tomes</small>
          </div>
          <span class="status" data-s="${esc(w.status)}">${esc(w.status)}</span>
          <button class="am__work-open" data-open="${w.id}" type="button" title="Ouvrir la fiche"
                  aria-label="Ouvrir la fiche de ${esc(w.title)}">${ic("external")}</button>
        </li>`;
        }).join("")
      : "";
  }

  function renderAuthorThemes(themes, style) {
    $("#amTags").innerHTML = themes.map(t => `<span class="am__tag">${esc(t)}</span>`).join("");
    $("#amTags").hidden = !themes.length;
    const st = $("#amStyle");
    st.textContent = style || "";
    st.hidden = !style;
    $("#amThemesSec").hidden = !themes.length && !style;
  }

  function renderAuthorDuos(list) {
    $("#amDuos").innerHTML = list.map(x =>
      `<div class="am__duo"><b>${esc(x.with)}</b><span>${esc(x.note)}</span></div>`).join("");
    $("#amDuoSec").hidden = !list.length;
    const empty = $("#amSimSec").hidden && $("#amDuoSec").hidden;
    $("#amTab-network").hidden = empty;
    $("#amNetEmpty").hidden = !empty;
    if (empty && currentAuthorTab() === "network") setAuthorTab("overview");
  }

  function openAuthor(name) {
    const d = AI.author(name, items);
    lastAuthor = d;
    olWorkCount = 0;
    const mine = items.filter(i => i.author === name);

    /* En-tête : identité, rôles, chiffres clés */
    $("#amAva").textContent = name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
    $("#amName").textContent = d.name;
    const trade = mine.map(i => FORMAT_TRADE[i.format]).find(Boolean) || "";
    setAuthorSub(trade, "");
    $("#amRoles").innerHTML = d.roles.map(r => `<span class="am__role">${esc(r)}</span>`).join("");
    paintAuthorCollection(d);

    /* Aperçu */
    $("#amBio").textContent = d.bio;
    $("#amBioSrc").hidden = true;
    $("#amBioSrc").innerHTML = "";
    renderAuthorThemes(d.themes, d.style);

    const known = [...new Set([...items.map(i => i.author), ...Object.keys(AI.AUTHORS || {})])]
      .filter(a => a && a !== name);
    $("#amInfl").innerHTML = d.influences.map(inf => {
      const people = influencePeople(inf, known).filter(p => AI.key(p) !== AI.key(name));
      if (!people.length) return `<span class="am__tag">${esc(inf)}</span>`;
      if (people.length === 1) return authorLink(people[0], inf);
      return people.map(p => authorLink(p)).join("");
    }).join("");
    $("#amInflSec").hidden = !d.influences.length;

    /* Réseau */
    /* « Quimchee (I Love Yoo) » : la parenthèse reste affichée, pas dans la recherche */
    $("#amSimilar").innerHTML = d.similar.map(s => {
      const who = s.name.replace(/\s*\(.*\)\s*$/, "").trim() || s.name;
      return authorLink(who, s.name, s.inLib ? `Dans ta collection — voir la fiche de ${who}` : undefined);
    }).join("");
    $("#amSimSec").hidden = !d.similar.length;
    renderAuthorDuos(d.duos);

    setAuthorTab("overview");
    $("#amScroll").scrollTop = 0;
    amodal.classList.add("is-open");
    amodal.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    setTimeout(() => amodal.querySelector(".modal__close").focus(), 60);

    /* Enrichissement live : Wikipédia, Open Library, MangaDex… */
    resetAuthorLive();
    const seq = ++liveSeq;
    AI.authorLive(name, items)
      .then(live => { if (seq === liveSeq) paintAuthorLive(live, name); })
      .catch(() => {
        if (seq !== liveSeq) return;
        $("#amLiveWorks").innerHTML = "";
        $("#amLiveNote").innerHTML =
          `${ic("globe")}<span>Hors ligne : sa bibliographie en ligne est indisponible pour l’instant.</span>`;
        $("#amLiveRetry").hidden = false;
      });
  }

  function resetAuthorLive() {
    $("#amLiveNote").innerHTML = `${ic("search")}<span>Recherche de sa bibliographie en ligne…</span>`;
    $("#amLiveWorks").innerHTML = Array.from({ length: 6 }, () =>
      `<li class="am__wc am__wc--sk" aria-hidden="true"><span class="am__wc-cover"></span>` +
      `<span class="am__wc-line"></span><span class="am__wc-line am__wc-line--s"></span></li>`).join("");
    $("#amFilters").hidden = true;
    $("#amFilters").innerHTML = "";
    $("#amLiveMore").hidden = true;
    $("#amLiveRetry").hidden = true;
    $("#amLiveSrc").hidden = true;
    $("#amWorksCount").hidden = true;
    $("#amTab-works").hidden = false;
    liveWorks = [];
    liveAuthor = null;
    liveOwn = new Map();
    liveFilter = "all";
    liveShown = LIVE_LIMIT;
  }

  function paintAuthorLive(d, name) {
    const author = lastAuthor;

    /* Une seule biographie : Wikipédia en priorité, repli sur le texte local */
    const wiki = d.bio && d.bio.extract ? d.bio : null;
    const wikiUrl = wiki ? safeImageUrl(wiki.url) : "";   // même contrôle http(s) que les images
    const useWiki = !!wiki && (wiki.lang !== "EN" || !author || author.generated);
    if (useWiki) $("#amBio").textContent = wiki.extract;
    if (wikiUrl) {
      $("#amBioSrc").innerHTML = useWiki
        ? `Source : <a href="${esc(wikiUrl)}" target="_blank" rel="noopener">Wikipédia${wiki.lang === "EN" ? " (en anglais)" : ""} ${ic("external")}</a>`
        : `<a href="${esc(wikiUrl)}" target="_blank" rel="noopener">Lire sa biographie complète sur Wikipédia (en anglais) ${ic("external")}</a>`;
      $("#amBioSrc").hidden = false;
    }

    /* Portrait (Wikipédia puis Open Library), initiales en repli */
    const photo = safeImageUrl(d.photo);
    if (photo) {
      const img = document.createElement("img");
      img.className = "am__ava-img";
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => img.remove());
      img.src = photo;
      $("#amAva").appendChild(img);
    }

    /* Années de vie, sans reprendre la description (souvent en anglais) */
    const years = String((d.ol && d.ol.date) || d.wikiDesc || "").match(/\b(?:1[89]\d\d|20\d\d)\b/g) || [];
    setAuthorSub(null, years.length >= 2 ? `${years[0]} – ${years[1]}` : "");

    /* Thèmes locaux + mots-clés Open Library traduits, sans doublon */
    if (author) {
      const seen = new Set(author.themes.map(t => AI.key(t)));
      const extra = subjectsFr(d.subjects)
        .filter(t => { const k = AI.key(t); if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 4);
      renderAuthorThemes([...author.themes, ...extra], author.style);
    }

    /* Jauge unique : Open Library prend le relais sans bibliographie locale */
    if (d.workCount && author && author.gauge.mode !== "biblio") {
      olWorkCount = d.workCount;
      paintAuthorCollection(author);
    }

    /* Binômes : base locale + co-auteurs Open Library, sans doublon */
    const nk = s => (s || "").toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const kbD = (author && author.duos) || [];
    const apiD = (d.binomes || [])
      .filter(b => !kbD.some(x => nk(x.with) === nk(b.with)))
      .map(b => ({ with: b.with, note: plural(b.n, "œuvre commune", "œuvres communes") }));
    if (apiD.length) renderAuthorDuos([...kbD, ...apiD]);

    /* Œuvres */
    if (!d.works.length) {
      $("#amLiveWorks").innerHTML = "";
      $("#amLiveNote").innerHTML = `${ic("search")}<span>Aucun titre trouvé en ligne pour ${esc(name)}.</span>`;
      $("#amTab-works").hidden = true;
      if (currentAuthorTab() === "works") setAuthorTab("overview");
      return;
    }
    liveWorks = groupWorks(d.works);
    liveAuthor = name;
    $("#amWorksCount").textContent = liveWorks.length;
    $("#amWorksCount").hidden = false;
    $("#amLiveNote").innerHTML = `${ic("globe")}<span>${plural(d.total, "titre référencé", "titres référencés")} en ligne` +
      (liveWorks.length < d.works.length ? ", volumes regroupés par série" : "") + `</span>`;
    renderLiveWorks();

    const sources = [...new Set((d.src || []).filter(Boolean).concat(d.mdCount ? ["MangaDex"] : []))];
    const src = $("#amLiveSrc");
    src.textContent = `Sources : ${sources.join(" · ") || "—"} · mis en cache 7 jours.`;
    src.hidden = false;
  }

  /* ── Grille des œuvres en ligne ── */
  const liveIsOwn = (w, i) => liveOwn.has(i) ? liveOwn.get(i) : (w.exact || inLibNow(w.t));
  const liveState = (w, i) => liveIsOwn(w, i) ? "own" : w.series ? "series" : "new";

  function liveCard(w, i) {
    const state = liveState(w, i);
    const img = safeImageUrl(w.c) || safeImageUrl(w.src);
    const years = w.y ? (w.y2 && w.y2 !== w.y ? `${w.y}–${w.y2}` : String(w.y)) : "—";
    const cover = img
      ? `<button class="am__wc-cover" type="button" data-view="${esc(img)}" aria-label="Agrandir la couverture de ${esc(w.t)}"><img src="${esc(img)}" alt="" loading="lazy" decoding="async"></button>`
      : `<span class="am__wc-cover" data-lc="${esc(w.t)}"><span class="am__wc-ph">${esc(w.t)}</span></span>`;
    const badge = state === "own"
      ? `<span class="am__wc-state am__wc-state--own" role="img" aria-label="Possédé" title="Possédé">${ic("check")}</span>`
      : state === "series"
        ? `<span class="am__wc-state am__wc-state--series" role="img" aria-label="Série suivie" title="Série suivie">${ic("book")}</span>` : "";
    const action = state === "own"
      ? `<button class="am__wc-btn am__wc-btn--rm" type="button" data-removelive="${i}" title="Retirer de la bibliothèque" aria-label="Retirer ${esc(w.t)} de la bibliothèque">${ic("trash")}</button>`
      : state === "series"
        ? `<span class="am__wc-tag">Suivie</span>`
        : `<button class="am__wc-btn am__wc-btn--add" type="button" data-addlive="${i}" aria-label="Ajouter ${esc(w.t)} à la bibliothèque">${ic("plus")}<span>Ajouter</span></button>`;
    return `
      <li class="am__wc is-${state}" data-live="${i}">
        <div class="am__wc-media">${cover}${w.n > 1 ? `<span class="am__wc-vol">${w.n} vol.</span>` : ""}${badge}</div>
        <p class="am__wc-t" title="${esc(w.t)}">${esc(w.t)}</p>
        <div class="am__wc-meta"><span>${years}</span>${action}</div>
      </li>`;
  }

  function renderLiveWorks() {
    const counts = { all: liveWorks.length, new: 0, own: 0 };
    liveWorks.forEach((w, i) => { counts[liveState(w, i) === "new" ? "new" : "own"]++; });
    const filters = $("#amFilters");
    filters.innerHTML = [["all", "Tout"], ["new", "À découvrir"], ["own", "Possédés"]]
      .map(([k, label]) => `<button class="am__filter${liveFilter === k ? " is-active" : ""}" type="button" ` +
        `data-afilter="${k}" aria-pressed="${liveFilter === k}">${label} <b>${counts[k]}</b></button>`).join("");
    filters.hidden = false;

    const list = liveWorks.map((w, i) => [w, i]).filter(([w, i]) =>
      liveFilter === "all" || (liveFilter === "new") === (liveState(w, i) === "new"));
    const ul = $("#amLiveWorks");
    ul.innerHTML = list.slice(0, liveShown).map(([w, i]) => liveCard(w, i)).join("") ||
      `<li class="am__empty">${liveFilter === "new"
        ? "Tu possèdes déjà tout ce qui est référencé. Chapeau !"
        : "Rien de cet auteur dans ta collection pour l’instant."}</li>`;

    const rest = list.length - liveShown;
    const more = $("#amLiveMore");
    more.hidden = rest <= 0 && liveShown <= LIVE_LIMIT;
    more.textContent = rest > 0 ? `Afficher ${plural(rest, "autre titre", "autres titres")}` : "Réduire la liste";
    resolveLiveCovers(ul);
  }

  /* Titres sans couverture → API de couvertures (lane selon le format de l'auteur) */
  function resolveLiveCovers(root) {
    const lane = items.some(i => i.author === liveAuthor && /manga|webtoon/i.test(i.format || ""))
      ? "Manga" : "Comic";
    $$("[data-lc]", root).forEach(ph => {
      Covers.resolve({ format: lane, title: ph.dataset.lc, author: liveAuthor })
        .then(url => {
          const safe = safeImageUrl(url);
          if (!safe || !ph.isConnected) return;
          const li = ph.closest("[data-live]");
          const w = li && liveWorks[+li.dataset.live];
          if (w) w.c = safe;
          ph.outerHTML = `<button class="am__wc-cover" type="button" data-view="${esc(safe)}" ` +
            `aria-label="Agrandir la couverture de ${esc(ph.dataset.lc)}"><img src="${esc(safe)}" alt="" loading="lazy" decoding="async"></button>`;
        })
        .catch(() => {});
    });
  }

  function closeAuthor() {
    if (!amodal.classList.contains("is-open")) return false;
    amodal.classList.remove("is-open");
    amodal.setAttribute("aria-hidden", "true");
    if (!modal.classList.contains("is-open"))
      document.body.classList.remove("no-scroll");
    return true;
  }

  function refreshAuthorCollection() {
    if (!lastAuthor || !amodal.classList.contains("is-open")) return;
    lastAuthor = AI.author(lastAuthor.name, items);
    paintAuthorCollection(lastAuthor);
  }

  /* ── Ajout / retrait direct depuis la bibliographie live ── */
  const inLibNow = title => items.some(i => AI.key(i.title) === AI.key(title));

  function focusLiveAction(i) {
    const btn = $(`[data-live="${i}"] .am__wc-btn`, $("#amLiveWorks"));
    if (btn) btn.focus();
  }

  async function removeLiveWork(i) {
    const w = liveWorks[i];
    if (!w) return;
    const authorName = liveAuthor || (lastAuthor && lastAuthor.name) || "";
    let index = items.findIndex(x => AI.key(x.title) === AI.key(w.t) && x.author === authorName);
    if (index < 0) index = items.findIndex(x => AI.key(x.title) === AI.key(w.t));
    if (index < 0) {
      showToast(ic("alert") + " Cet ouvrage n’est plus dans la bibliothèque.");
      liveOwn.set(i, false);
      renderLiveWorks();
      return;
    }
    const item = items[index];
    const ok = await confirmBox(`Retirer « ${item.title} » de ta bibliothèque ?`, "Retirer");
    if (!ok) return;
    items.splice(index, 1);
    if (!persist()) {
      items.splice(index, 0, item);
      showToast(ic("alert") + " Retrait impossible : stockage local indisponible.");
      return;
    }
    liveOwn.set(i, false);
    refreshAll(); buildHeroStack();
    refreshAuthorCollection();
    renderLiveWorks();
    focusLiveAction(i);
    showToast(ic("check") + ` « ${esc(item.title)} » retiré de la bibliothèque.`);
  }

  function addLiveWork(w, authorName) {
    const lane = items.some(i => i.author === authorName && /manga|webtoon/i.test(i.format || ""))
      ? "Manga" : "Comic";
    const y = parseInt(w.y, 10);
    const item = {
      id: Math.max(0, ...items.map(x => +x.id || 0)) + 1,
      title: w.t, author: authorName, format: lane,
      year: (y >= 1900 && y <= 2100) ? y : new Date().getFullYear(),
      volumes: w.n > 1 ? w.n : 1, read: 0, rating: 0, status: "Planifié",
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      desc: `Ajouté depuis la bibliographie en ligne de ${authorName}.`,
      fav: false, review: "",
      addedAt: Store.iso(new Date()), finishedAt: null
    };
    items.unshift(item);
    if (!persist()) {
      items.shift();
      showToast(ic("alert") + " Ajout impossible : stockage local indisponible.");
      return null;
    }
    refreshAll(); buildHeroStack();
    return item;
  }

  function initAuthor() {
    $("#amLiveRetry").addEventListener("click", () => {
      if (!lastAuthor) return;
      openAuthor(lastAuthor.name);
      setAuthorTab("works");
    });
    amodal.addEventListener("click", e => {
      if (e.target.hasAttribute("data-aclose")) closeAuthor();
    });

    /* Un clic sur un nom d'auteur, n'importe où dans l'app */
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-author]");
      if (!b) return;
      openAuthor(b.dataset.author);
    });

    /* Onglets : clic + flèches du clavier (motif ARIA « tabs ») */
    const tabs = $(".am__tabs", amodal);
    tabs.addEventListener("click", e => {
      const b = e.target.closest("[data-atab]");
      if (b) setAuthorTab(b.dataset.atab);
    });
    tabs.addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      const list = $$(".am__tab", tabs).filter(b => !b.hidden);
      const cur = list.indexOf(document.activeElement);
      if (cur < 0) return;
      e.preventDefault();
      const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1
        : (cur + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length;
      setAuthorTab(list[next].dataset.atab, true);
    });

    /* Œuvre de la collection → fiche livre (on referme l'auteur) */
    $("#amWorks").addEventListener("click", e => {
      const b = e.target.closest("[data-open]"); if (!b) return;
      closeAuthor();
      openModal(+b.dataset.open);
    });

    $("#amFilters").addEventListener("click", e => {
      const b = e.target.closest("[data-afilter]"); if (!b) return;
      liveFilter = b.dataset.afilter;
      liveShown = LIVE_LIMIT;
      renderLiveWorks();
    });
    $("#amLiveMore").addEventListener("click", () => {
      liveShown = liveShown > LIVE_LIMIT ? LIVE_LIMIT : liveWorks.length;
      renderLiveWorks();
    });

    /* Grille live : couverture → agrandissement, + → ajout, corbeille → retrait */
    $("#amLiveWorks").addEventListener("click", e => {
      const view = e.target.closest("[data-view]");
      if (view) {
        const li = view.closest("[data-live]");
        const w = li && liveWorks[+li.dataset.live];
        openImageView(view.dataset.view, w ? w.t : "");
        return;
      }
      const remove = e.target.closest("[data-removelive]");
      if (remove) { removeLiveWork(+remove.dataset.removelive); return; }

      const add = e.target.closest("[data-addlive]"); if (!add) return;
      const i = +add.dataset.addlive;
      const w = liveWorks[i]; if (!w) return;
      if (inLibNow(w.t)) {
        liveOwn.set(i, true);
        renderLiveWorks();
        focusLiveAction(i);
        showToast(ic("check") + ` « ${esc(w.t)} » est déjà dans ta bibliothèque.`);
        return;
      }
      const added = addLiveWork(w, liveAuthor || (lastAuthor && lastAuthor.name) || "");
      if (!added) return;
      liveOwn.set(i, true);
      refreshAuthorCollection();
      renderLiveWorks();
      focusLiveAction(i);
      showToast(ic("check") + ` « ${esc(w.t)} » ajouté à la bibliothèque !`);
    });
  }

  /* ═══════════ GALERIE · ÉDITIONS · TIMELINE (fiche livre) ═══════════ */


  /* Affiche une vue dans la scène : préchargement puis fondu enchaîné
     (pas de flash blanc ni de saut de mise en page). */
  let galSeq = 0;
  function galShow(stage, src, cap) {
    const seq = ++galSeq;
    const img = new Image();
    img.alt = cap;
    img.decoding = "async";
    img.src = src;
    const ready = img.decode ? img.decode().catch(() => {}) : Promise.resolve();

    ready.then(() => {
      if (seq !== galSeq) return;           /* un clic plus récent a pris la main */
      const frame = document.createElement("div");
      frame.className = "gal__frame";
      const bg = document.createElement("div");
      bg.className = "gal__bg";
      bg.style.backgroundImage = `url("${String(src).replace(/["\\\n]/g, encodeURIComponent)}")`;
      if (String(src).startsWith("data:image/svg+xml")) img.className = "mock-page";
      const capEl = document.createElement("span");
      capEl.className = "gal__stage-cap";
      capEl.textContent = cap;
      frame.append(bg, img, capEl);

      const old = $$(".gal__frame", stage);
      stage.appendChild(frame);
      stage.classList.remove("is-loading");
      void frame.offsetWidth;               /* force le style initial avant la transition */
      frame.classList.add("is-in");
      old.forEach(o => {
        o.classList.remove("is-in");
        setTimeout(() => o.remove(), reduced() ? 0 : 380);
      });
    });
  }

  function paintGalThumbs(thumbs, all, activeIdx) {
    thumbs.innerHTML = all.map((v, i) => v.pending
      ? `<span class="gal__thumb gal__thumb--skel" aria-hidden="true"></span>`
      : `<button class="gal__thumb${i === activeIdx ? " is-on" : ""}" data-src="${esc(v.src)}" data-cap="${esc(v.cap)}" ` +
        `type="button" aria-pressed="${i === activeIdx}" aria-label="${esc(v.cap)}">` +
        `<img src="${esc(v.src)}" alt="" loading="lazy" decoding="async" /></button>`).join("");
  }

  function renderGallery(it) {
    const gal = $("#mGal"); gal.hidden = false;
    const stage = $("#galStage"), thumbs = $("#galThumbs");

    stage.innerHTML = "";
    stage.classList.add("is-loading");
    paintGalThumbs(thumbs, [{ pending: true }], -1);

    Covers.resolve(it).catch(() => null).then(url => {
      if (state.openId !== it.id) return;   /* la fiche a changé entre-temps */
      const src = safeImageUrl(url);
      if (!src) {
        gal.hidden = true;
        return;
      }
      paintGalThumbs(thumbs, [{ cap: "Couverture", src }], 0);
      galShow(stage, src, "Couverture");
    });

    const q = encodeURIComponent(`${it.title} ${it.author}`);
    $("#galExt").innerHTML =
      `<span class="gal__ext-lbl">Extraits légaux chez l'éditeur :</span>` +
      `<a href="https://archive.org/search?query=${q}" target="_blank" rel="noopener">Archive.org</a>` +
      `<a href="https://www.google.com/search?tbm=bks&q=${q}" target="_blank" rel="noopener">Google Livres</a>`;
  }

  function renderEditions(it) {
    const ed = $("#mEd"); ed.hidden = false;
    const cur = it.variant || AI.EDITIONS[0];
    $("#edCurrent").textContent = cur;
    $("#edChips").innerHTML = AI.EDITIONS.map(v =>
      `<button class="ed__chip${v === cur ? " is-on" : ""}" data-v="${esc(v)}" type="button">${esc(v)}</button>`
    ).join("");
  }

  function initBookExtras() {
    /* Miniatures de la galerie (état porté par les data-attributes) */
    const selectThumb = b => {
      if (!b || b.classList.contains("is-on")) return;
      $$("#galThumbs .gal__thumb").forEach(t => {
        t.classList.toggle("is-on", t === b);
        if (t.tagName === "BUTTON") t.setAttribute("aria-pressed", String(t === b));
      });
      const src = safeImageUrl(b.dataset.src) || b.dataset.src;
      galShow($("#galStage"), src, b.dataset.cap);
    };
    $("#galThumbs").addEventListener("click", e => selectThumb(e.target.closest("button.gal__thumb")));
    /* Flèches gauche/droite pour parcourir les vues */
    $("#galThumbs").addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const list = $$("#galThumbs button.gal__thumb"); if (!list.length) return;
      const cur = Math.max(0, list.indexOf(document.activeElement));
      const next = list[(cur + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
      e.preventDefault();
      next.focus();
      selectThumb(next);
    });

    /* Variante d'édition → persistée sur l'ouvrage */
    $("#edChips").addEventListener("click", e => {
      const b = e.target.closest(".ed__chip"); if (!b) return;
      const it = items.find(x => x.id === state.openId); if (!it) return;
      it.variant = b.dataset.v;
      persist();
      renderEditions(it);
      showToast(`${ic("book")} Variante enregistrée : ${esc(it.variant)}.`);
    });
  }

  function renderTimeline(it) {
    const tl = $("#mTl"); tl.hidden = false;
    const d = AI.timeline(it);

    $("#tlKind").textContent = d.kind === "universe"
      ? "chronologie d'univers"
      : "chronologie de série";

    /* Piste 1 — publication */
    $("#tlPubSpan").textContent = `${d.pub.from} → ${d.pub.to}`;
    const pubPos = Math.max(4, Math.min(96, d.pub.pos));
    $("#tlPubLbl").textContent = d.pub.atYear;
    /* Piste 2 — histoire */
    $("#tlStoryLbl").textContent = d.story.label;
    const stPos = Math.max(4, Math.min(96, d.story.marker.pos));
    $("#tlStoryLbl2").textContent = d.story.marker.year;
    $("#tlEvents").innerHTML = d.story.events.map(ev => {
      const here = ev.title.startsWith("★");
      return `<li class="${here ? "is-here" : ""}"><b>${ev.year}</b> — ${esc(ev.title.replace(/^★\s*/, ""))}</li>`;
    }).join("");
    $("#tlNote").textContent = d.story.note;

    /* animations (la modale n'est pas observée par l'IntersectionObserver) */
    const pf = $("#tlPubFill"), pd = $("#tlPubDot"), pl = $("#tlPubLbl");
    const sf = $("#tlStoryFill"), sd = $("#tlStoryDot"), sl = $("#tlStoryLbl2");
    [pf, sf].forEach(f => f.style.width = "0%");
    [pd, sd].forEach(x => x.style.left = "0%");
    [pl, sl].forEach(x => x.style.left = "0%");
    setTimeout(() => {
      pf.style.width = d.pub.pos + "%";
      pd.style.left = pubPos + "%";
      pl.style.left = pubPos + "%";
      sf.style.width = d.story.marker.pos + "%";
      sd.style.left = stPos + "%";
      sl.style.left = stPos + "%";
    }, 160);
  }

  /* ═══════════ OÙ L'ACHETER ? — SHOP MULTI-ENSEIGNES ═══════════ */
  function renderShop(it) {
    const el = $("#mShop"); if (!el) return;
    const s = AI.shopOf(it);
    const link = l =>
      `<a class="shop__btn" href="${l.u}" target="_blank" rel="sponsored noopener">${esc(l.n)}</a>`;

    el.hidden = false;
    el.innerHTML = `
      <div class="shop__head">
        <span class="shop__h">${ic("cart")} Où l'acheter ?</span>
        <span class="shop__price">≈ ${s.unit.toFixed(2).replace(".", ",")} € / tome</span>
      </div>
      <div class="shop__grp">
        <span class="shop__lbl">Neuf</span>
        <div class="shop__links">${s.neuf.map(link).join("")}</div>
      </div>
      <div class="shop__grp">
        <span class="shop__lbl">Occasion${s.oop ? `<em class="shop__oop">rupture probable</em>` : ""}</span>
        <div class="shop__links">${s.occasion.map(link).join("")}</div>
      </div>
      <p class="shop__note">Recherche « ${esc(s.query)} » · estimation locale, prix indicatifs ·
        certains liens peuvent être affiliés.</p>`;
  }

  /* ═══════════ MODALE ═══════════ */
  const modal = $("#modal");

  function setHash(id) {
    try {
      history.replaceState(null, "", id ? `#o/${id}` : location.pathname + location.search);
    } catch (e) {
      if (id) location.hash = `o/${id}`;
      else if (location.hash.startsWith("#o/")) location.hash = "";
    }
  }

  function flushReview() {
    clearTimeout(reviewTimer);
    const it = items.find(x => x.id === state.openId);
    if (!it || it.review === lastSavedReview) return true;
    if (persist()) { lastSavedReview = it.review; return true; }
    it.review = lastSavedReview;
    return false;
  }

  function openModal(id) {
    if (state.openId !== null && state.openId !== id) flushReview();
    const it = items.find(x => x.id === id); if (!it) return;
    state.openId = id;

    const cover = $("#mCover");
    cover.style.cssText = `background:linear-gradient(155deg, ${it.color}, ${shade(it.color, -44)});`;
    cover.innerHTML =
      `<div class="cover-scrim"></div>` +
      `<div class="mc-t">${esc(it.title)}</div>` +
      `<div class="mc-a">${esc(it.author)}</div>`;
    Covers.paint(cover, it);

    $("#mFormat").textContent = it.format;
    $("#mTitle").textContent  = it.title;
    $("#mAuthor").innerHTML =
      `<button type="button" class="lnk-au" data-author="${esc(it.author)}" ` +
      `title="Voir la fiche auteur de ${esc(it.author)}">${esc(it.author)}</button>` +
      ` · ${it.year}` + starsHTML(it.rating);
    $("#mMeta").textContent   = it.desc;

    const volEl = $("#mVolumes"); volEl.dataset.cur = 0;
    countTo(volEl, it.volumes, 900);

    $("#mYear").textContent   = it.year;
    $("#mRating").textContent = it.rating + "/5";
    $("#mStatus").textContent = it.status;
    $("#mNext").style.display = it.read >= it.volumes ? "none" : "";

    const rev = $("#mReview");
    rev.value = it.review || "";
    lastSavedReview = rev.value;

    syncModalFav(it);
    updateModalProgress(it);
    renderShop(it);
    renderGallery(it);
    renderEditions(it);
    renderTimeline(it);

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    setHash(id);
    setTimeout(() => $(".modal__close").focus(), 60);
  }

  function updateModalProgress(it) {
    const p = progress(it);
    $("#mProgLabel").textContent = `${it.read}/${it.volumes} tomes · ${p}%`;
    const bar = $("#mProgBar");
    bar.style.width = "0%";
    setTimeout(() => bar.style.width = p + "%", 120);
  }

  function closeModal() {
    if (!modal.classList.contains("is-open")) return;
    if (!flushReview()) showToast(ic("alert") + " Impossible d’enregistrer la note.");
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    state.openId = null;
    setHash(null);
  }

  function initModal() {
    modal.addEventListener("click", e => { if (e.target.hasAttribute("data-close")) closeModal(); });

    // Piège de focus
    modal.addEventListener("keydown", e => {
      if (e.key !== "Tab" || !modal.classList.contains("is-open")) return;
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    $("#mFav").addEventListener("click", () => {
      const it = items.find(x => x.id === state.openId); if (it) toggleFav(it.id);
    });

    $("#mEdit").addEventListener("click", () => {
      const it = items.find(x => x.id === state.openId); if (!it) return;
      editingId = it.id;
      const form = $("#form");
      for (const key of ["title", "author", "format", "year", "volumes", "read", "status", "rating", "color", "desc"])
        form.elements.namedItem(key).value = it[key];
      $$(".swatch", $("#swatches")).forEach(x => x.classList.toggle("is-active", x.dataset.c === it.color));
      form.querySelector('[name="rating"]').dispatchEvent(new Event("input"));
      $("#add .section-title").innerHTML = "Modifier un <em>ouvrage</em>";
      form.querySelector('[type="submit"] span').textContent = "Enregistrer les modifications";
      form.querySelector('[type="reset"] span').textContent = "Annuler";
      closeModal();
      goTo("add", true);
      form.elements.namedItem("title").focus();
    });

    // Avis personnel : sauvegarde différée pour éviter une écriture à chaque frappe.
    $("#mReview").addEventListener("input", e => {
      const it = items.find(x => x.id === state.openId); if (!it) return;
      it.review = e.target.value.trim();
      clearTimeout(reviewTimer);
      reviewTimer = setTimeout(() => {
        if (persist()) {
          lastSavedReview = it.review;
          renderGrid(false);
        } else {
          it.review = lastSavedReview;
          e.target.value = lastSavedReview;
          showToast(ic("alert") + " Impossible d’enregistrer la note.");
        }
      }, 350);
    });

    $("#mNext").addEventListener("click", () => {
      const it = items.find(x => x.id === state.openId); if (!it) return;
      const previous = { read: it.read, status: it.status, finishedAt: it.finishedAt };
      const previousActivity = { ...db.activity };
      it.read = Math.min(it.volumes, it.read + 1);
      logSession(1);
      const finishing = it.read >= it.volumes;
      if (finishing) {
        it.status = "Terminé";
        it.finishedAt = Store.iso(new Date());
        logSession(2);
      } else if (it.status === "Planifié") {
        it.status = "En cours";
      }
      if (!persist()) {
        Object.assign(it, previous);
        db.activity = previousActivity;
        updateModalProgress(it);
        $("#mStatus").textContent = it.status;
        showToast(ic("alert") + " Progression non enregistrée.");
        return;
      }
      updateModalProgress(it);
      $("#mStatus").textContent = it.status;
      $("#mNext").style.display = it.read >= it.volumes ? "none" : "";
      refreshAll();
      showToast(finishing ? ic("check") + " Ouvrage terminé !" : `${ic("book")} Tome ${it.read}/${it.volumes}`);
    });

    $("#mDelete").addEventListener("click", async () => {
      const it = items.find(x => x.id === state.openId); if (!it) return;
      if (!await confirmBox(`Retirer « ${it.title} » de la bibliothèque ?`, "Retirer")) return;
      const previous = items;
      items = items.filter(x => x.id !== it.id);
      if (!persist()) {
        items = previous;
        db.items = previous;
        showToast(ic("alert") + " Suppression impossible : stockage local indisponible.");
        return;
      }
      closeModal();
      refreshAll();
      buildHeroStack();
      showToast(`${ic("trash")} « ${esc(it.title)} » retiré.`);
    });

    // Lien partagé : #o/<id>
    const fromHash = () => {
      const m = /^#o\/(\d+)/.exec(location.hash);
      if (m) openModal(+m[1]);
    };
    addEventListener("hashchange", fromHash);
    setTimeout(fromHash, 700);
  }

  /* ═══════════ OBJECTIF ANNUEL ═══════════ */
  function initChallenge() {
    const input = $("#chGoal");
    input.addEventListener("change", () => {
      db.goal = Math.max(1, parseInt(input.value) || 40);
      input.value = db.goal;
      persist();
      renderChallenge();
      const card = input.closest(".stat-card");
      const bar = $("#chBar");
      if (bar) setTimeout(() => bar.style.width = bar.dataset.w + "%", 60);
      if (card) card.classList.add("is-in");
    });
  }

  /* ═══════════ INSIGHTS & PROFIL DE LECTURE ═══════════ */
  function renderInsights() {
    const card = $("#insCard");
    if (!card) return;
    const d = AI.insights(items, db.activity, { offset: state.insOffset });

    $("#insMonth").textContent = "· " + d.label;
    $("#insText").textContent = d.text;

    const tiles = [
      [d.finished.length, "terminés"],
      [d.added.length,     "ajoutés"],
      [d.sessions,         "sessions"],
      [d.avg ? d.avg.toFixed(1) + "/5" : "—", d.mode === "month" ? "note du mois" : "note moyenne"]
    ];
    $("#insTiles").innerHTML = tiles.map(([v, l]) =>
      `<div class="ins__tile"><b>${v}</b><span>${l}</span></div>`).join("");

    $("#insBars").innerHTML = d.themes.length
      ? d.themes.map((t, i) => `
        <div class="ins__bar ins__bar--${i + 1}">
          <div class="ins__bar-top"><span>${esc(t.label)}</span><b>${t.pct}%</b></div>
          <div class="ins__track"><i class="ins__fill" data-w="${t.pct}"></i></div>
        </div>`).join("")
      : `<p class="ins__empty">Aucun penchant détecté pour l'instant.</p>`;

    const s = d.suggestion;
    $("#insSuggest").innerHTML = s
      ? `<button class="ins__pick" data-id="${s.id}">
           <span class="ins__pick-t">${esc(s.title)}</span>
           <span class="ins__pick-m">${esc(s.author)} · ${s.year} · ${s.rating}/5 · ${s.read}/${s.volumes} tomes</span>
           <span class="ins__pick-why">✓ en phase avec tes penchants du moment</span>
         </button>`
      : `<p class="ins__empty">Rien à proposer pour l'instant.</p>`;

    $("#insPrev").disabled = state.insOffset >= 12;
    $("#insNext").disabled = state.insOffset <= 0;

    /* Les barres s'animent seulement si la carte est déjà révélée :
       sinon c'est l'IntersectionObserver qui s'en charge. */
    const revealed = card.classList.contains("is-in");
    $$(".ins__fill", card).forEach((b, i) => {
      if (revealed) setTimeout(() => b.style.width = b.dataset.w + "%", 60 + i * 90);
      else b.style.width = "0%";
    });
  }

  function initInsights() {
    $("#insPrev").addEventListener("click", () => {
      if (state.insOffset < 12) { state.insOffset++; renderInsights(); }
    });
    $("#insNext").addEventListener("click", () => {
      if (state.insOffset > 0) { state.insOffset--; renderInsights(); }
    });
    $("#insSuggest").addEventListener("click", e => {
      const b = e.target.closest(".ins__pick");
      if (b) openModal(+b.dataset.id);
    });
  }

  /* ═══════════ SMART BUY — ASSISTANT D'ACHAT ═══════════ */
  function renderSmartBuy() {
    const out = $("#sbOut"); if (!out) return;
    const res = AI.smartBuy(state.sbBudget, items);
    const eur = c => (c / 100).toFixed(2).replace(".", ",") + " €";

    const rows = res.picks.map((p, i) => `
      <li class="sb__item" style="--i:${i}">
        <div class="sb__main">
          <b>${esc(p.title)}</b>
          <span class="sb__meta">${esc(p.format)} · ${p.n === 1
            ? `tome ${p.from}` : `tomes ${p.from} → ${p.to}`} · ${p.missing} à acquérir dans la série</span>
          <span class="sb__why">✓ ${p.why.length ? p.why.map(esc).join(" · ") : "complète ta collection"}</span>
        </div>
        <div class="sb__price">
          <b>${eur(p.cost)}</b>
          <i>${p.oop ? `≈ ${eur(p.occ)} en occasion` : `${eur(p.unit)} / tome`}</i>
        </div>
        <button class="mini-btn" data-open="${p.id}" type="button">↗ fiche</button>
      </li>`).join("");

    out.innerHTML =
      `<p class="sb__text">${res.text}</p>` +
      (res.picks.length ? `<ul class="sb__list">${rows}</ul>` : "") +
      `<div class="sb__totals">
         <span>Total <b>${eur(res.spent)}</b></span>
         <span>Reste <b>${eur(res.left)}</b></span>
         <span class="sb__note">Prix estimés (neuf) · occasion ≈ −45 % · séries incomplètes analysées</span>
       </div>`;
  }

  function initSmartBuy() {
    const input = $("#sbBudget");
    if (!input) return;
    input.value = state.sbBudget;

    const syncPreset = () =>
      $$("#sbPresets .chip").forEach(x =>
        x.classList.toggle("is-active", +x.dataset.v === state.sbBudget));

    const run = () => {
      state.sbBudget = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = state.sbBudget;
      persist();
      syncPreset();
      renderSmartBuy();
      $("#sbCard").classList.add("is-in");
    };

    $("#sbGo").addEventListener("click", run);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); run(); }
    });
    $("#sbPresets").addEventListener("click", e => {
      const b = e.target.closest(".chip[data-v]"); if (!b) return;
      state.sbBudget = +b.dataset.v;
      input.value = state.sbBudget;
      persist();
      syncPreset();
      renderSmartBuy();
      $("#sbCard").classList.add("is-in");
    });
    $("#sbCard").addEventListener("click", e => {
      const b = e.target.closest("[data-open]");
      if (b) openModal(+b.dataset.open);
    });

    syncPreset();
    renderSmartBuy();
  }

  /* ═══════════ ORDRES DE LECTURE ═══════════ */
  const KIND_LABEL = {
    essentiel: "Incontournable",
    contexte:  "Contexte",
    optionnel:  "Optionnel",
    autonome:  "Hors-série",
    reprise:    "Reprends ici"
  };

  const RO_EMPTY = `
    <div class="ro__empty">
      <span class="ro__empty-icon">${ic("compass")}</span>
      <h3>Un fil conducteur, étape par étape</h3>
      <p>Pose ta question : une saga, un auteur, un crossover, un arc. Je reconstitue l'ordre,
         j'explique chaque étape et je te dis ce que tu as déjà — et ce qu'il te reste à trouver.</p>
    </div>`;

  let lastPlan = null;
  let orderRequest = 0;

  async function renderOrder(raw) {
    const out = $("#roOut");
    const q = String(raw || "").trim();
    const request = ++orderRequest;
    if (!q) {
      lastPlan = null;
      $("#roGo").disabled = false;
      out.removeAttribute("aria-busy");
      out.innerHTML = RO_EMPTY;
      return;
    }

    const go = $("#roGo");
    go.disabled = true;
    out.setAttribute("aria-busy", "true");
    out.innerHTML = `<div class="ro__loading"><span>${ic("spark")}</span><b>Recherche en temps réel</b><p>Open Library et AniList répondent pendant que l’IA structure le parcours…</p></div>`;

    const local = AI.readingOrder(q, items);
    let res = local;
    try { res = await AI.readingOrderLive(q, items); } catch (e) { res = local; }
    if (request !== orderRequest) return;
    go.disabled = false;
    out.removeAttribute("aria-busy");

    if (res.kind === "none") {
      lastPlan = null;
      out.innerHTML = `
        <div class="ro__none">
          <span class="ro__empty-icon">${ic("search")}</span>
          <h3>Pas encore de fil conducteur pour ça</h3>
          <p>Je n'ai pas d'ordre codé pour « ${esc(q)} ». Essaie l'une de ces sagas — ou reformule
             ta demande en recherche d'ambiance, mon autre moteur s'en charge.</p>
          <div class="ro__sugg">${res.suggestions.map(s =>
            `<button class="chip chip--ex" data-roq="${esc(s.q)}">${esc(s.title)}</button>`).join("")}</div>
          <button class="btn btn--ghost btn--sm" data-vibe="${esc(q)}">
            <span>✦ Chercher « ${esc(q)} » par ambiance</span>
          </button>
        </div>`;
      return;
    }

    const steps = res.steps;
    const inLib  = steps.filter(s => s.item).length;
    const toFind = steps.length - inLib;
    const resume = steps.find(s => s.item && s.item.read > 0 && s.item.read < s.item.volumes);
    lastPlan = res;

    out.innerHTML = `
      <div class="ro__head">
        <div class="ro__head-main">
          <span class="ro__kind${res.liveSources && res.liveSources.length ? " is-live" : res.kind === "generated" ? " is-gen" : ""}">${
            res.liveSources && res.liveSources.length ? "✦ IA + données live" :
            res.kind === "generated" ? "✦ Ordre reconstruit" : "✦ Ordre de lecture"}</span>
          <h3 class="ro__title">${esc(res.title)}</h3>
          <p class="ro__blurb">${esc(res.blurb)}</p>
          <div class="ro__sum">
            <span><b>${steps.length}</b> étapes</span>
            <span class="is-lib"><b>${inLib}</b> dans ta bibliothèque</span>
            ${toFind ? `<span class="is-out"><b>${toFind}</b> à acquérir</span>` : ""}
            ${resume ? `<span>↳ reprise au tome ${resume.item.read + 1}/${resume.item.volumes} — ${esc(resume.item.title)}</span>` : ""}
            ${res.liveSources && res.liveSources.length ? `<span class="is-live">${ic("globe")} ${esc(res.liveSources.join(" + "))} · ${res.liveCount} résultats</span>` : ""}
          </div>
        </div>
        <div class="ro__actions">
          <button class="mini-btn ro__copy" data-copy>${ic("copy")} Copier l'ordre</button>
          <button class="mini-btn" data-roexp="md" title="Exporter cet ordre en Markdown">${ic("file")} .md</button>
          <button class="mini-btn" data-roexp="pdf" title="Exporter cet ordre en PDF">${ic("printer")} PDF</button>
        </div>
      </div>

      <ol class="ro__steps">
        ${steps.map((s, i) => {
          const head = s.arc
            ? `<span class="step__arc">${esc(s.arc)}</span>`
            : `<div class="step__t">${esc(s.t)}</div>`;
          const meta = s.arc
            ? `${esc(s.t)} · <button type="button" class="lnk-au" data-author="${esc(s.a)}">${esc(s.a)}</button>`
            : `<button type="button" class="lnk-au" data-author="${esc(s.a)}">${esc(s.a)}</button>${s.y ? " · " + s.y : ""}`;
          const lib = s.item
            ? `<button class="step__lib is-lib" data-open="${s.item.id}">dans ta bibliothèque · ${s.item.read}/${s.item.volumes}</button>`
            : `<span class="step__lib">à acquérir</span>`;
          const p = s.item ? progress(s.item) : 0;
          const prog = s.item ? `
              <div class="step__prog">
                <div class="progress"><i style="width:${p}%"></i></div><span>${p}%</span>
              </div>` : "";
          return `
            <li class="step step--${s.k}" style="--sd:${Math.min(i, 14) * 55}ms">
              <div class="step__n">${String(i + 1).padStart(2, "0")}</div>
              <div class="step__card">
                <div class="step__top">
                  <span class="step__kind">${KIND_LABEL[s.k] || s.k}</span>
                  ${lib}
                  ${s.source && s.sourceUrl ? `<a class="step__source" href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">${esc(s.source)} ${ic("external")}</a>` : ""}
                </div>
                ${head}
                <div class="step__m">${meta}</div>
                <p class="step__why">${esc(s.why)}</p>
                ${prog}
              </div>
            </li>`;
        }).join("")}
      </ol>

      <p class="ro__note"><b>Pourquoi cet ordre —</b> ${esc(res.note)}</p>`;
  }

  function copyPlan() {
    if (!lastPlan) return;
    const lines = [lastPlan.title, "", lastPlan.blurb, ""];
    lastPlan.steps.forEach((s, i) => lines.push(
      `${i + 1}. ${s.arc ? s.arc + " — " : ""}${s.t} (${s.a}${s.y ? ", " + s.y : ""})` +
      `${s.item ? " · dans ta bibliothèque" : " · à acquérir"}`));
    lines.push("", "Pourquoi cet ordre : " + lastPlan.note);
    const txt = lines.join("\n");
    const done = () => showToast(ic("copy") + " Ordre copié dans le presse-papiers.");
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      showToast(ok ? ic("copy") + " Ordre copié dans le presse-papiers." : ic("alert") + " Copie impossible.");
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(txt).then(done, fallback);
    else fallback();
  }

  function initReading() {
    const input = $("#roInput"), out = $("#roOut"), ex = $("#roExamples");
    const picks = AI.orderSuggestions().slice(0, 7);
    ex.innerHTML = picks.map(o =>
      `<button class="chip chip--ex" data-q="${esc(o.q)}">${esc(o.title)}</button>`).join("");

    ex.addEventListener("click", e => {
      const b = e.target.closest(".chip--ex"); if (!b) return;
      input.value = b.dataset.q;
      renderOrder(b.dataset.q);
    });

    const run = () => renderOrder(input.value);
    $("#roGo").addEventListener("click", run);
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); run(); } });

    out.addEventListener("click", e => {
      if (e.target.closest("[data-copy]"))   { copyPlan(); return; }
      const re = e.target.closest("[data-roexp]");
      if (re) { exportOrder(re.dataset.roexp); return; }
      const lib = e.target.closest("[data-open]");
      if (lib) { openModal(+lib.dataset.open); return; }
      const vb = e.target.closest("[data-vibe]");
      if (vb) { jumpToVibe(vb.dataset.vibe); return; }
      const rq = e.target.closest("[data-roq]");
      if (rq) { input.value = rq.dataset.roq; renderOrder(rq.dataset.roq); }
    });

    renderOrder("");
  }

  /* ═══════════ RAFRAÎCHISSEMENT GLOBAL ═══════════ */
  function refreshAll(rerenderGrid = true) {
    renderMetrics();
    if (rerenderGrid) renderGrid();
    renderStats();
    observeStats();
  }

  /* ═══════════ EXPORT — MARKDOWN & PDF (bibliothèque + ordres) ═══════════ */

  const EXPORT_DATE = () =>
    new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  const EXPORT_STAMP = () => new Date().toISOString().slice(0, 10);

  const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "export";

  const mdCell = s => String(s == null || s === "" ? "—" : s)
    .replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

  const progCell = i => (i && i.volumes) ? `${i.read || 0}/${i.volumes}` : ((i && i.read) ? "lu" : "—");

  function libraryStats() {
    const done = items.filter(i => i.status === "Terminé").length;
    const rated = items.filter(i => i.rating > 0);
    const avg = rated.length ? rated.reduce((s, i) => s + i.rating, 0) / rated.length : 0;
    const favs = items.filter(i => i.fav).length;
    const fmts = {}, sts = {};
    items.forEach(i => {
      fmts[i.format || "Autre"] = (fmts[i.format || "Autre"] || 0) + 1;
      sts[i.status || "—"] = (sts[i.status || "—"] || 0) + 1;
    });
    return { done, avg, favs, fmts, sts, rated: rated.length };
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* ── Bibliothèque → Markdown ── */
  function buildLibraryMd() {
    const s = libraryStats();
    const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title, "fr"));

    let md = `# 📚 Ma bibliothèque — InkVault\n\n`;
    md += `> Exportée le ${EXPORT_DATE()} · **${items.length} ouvrages** · ${s.done} terminés`;
    if (s.rated) md += ` · note moyenne **${s.avg.toFixed(1)}/5**`;
    if (s.favs) md += ` · ${s.favs} ♥`;
    md += `\n\n## 📊 Vue d'ensemble\n\n`;
    md += `| Statut | Ouvrages |\n|---|---:|\n`;
    Object.entries(s.sts).sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => { md += `| ${mdCell(k)} | ${n} |\n`; });
    md += `\n| Format | Ouvrages |\n|---|---:|\n`;
    Object.entries(s.fmts).sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => { md += `| ${mdCell(k)} | ${n} |\n`; });

    md += `\n## 📖 Catalogue (${items.length})\n\n`;
    md += `| # | Titre | Auteur | Format | Année | Statut | Progression | Note |\n|---:|---|---|---|---:|---|---|---:|\n`;
    sorted.forEach((i, idx) => {
      md += `| ${idx + 1} | **${mdCell(i.title)}** | ${mdCell(i.author)} | ${mdCell(i.format)} | ` +
        `${i.year || "—"} | ${mdCell(i.status)} | ${progCell(i)} | ` +
        `${i.rating ? i.rating + "/5" : "—"}${i.fav ? " ♥" : ""} |\n`;
    });

    const noted = sorted.filter(i => i.review && i.review.trim());
    if (noted.length) {
      md += `\n## 📝 Mes notes de lecture\n\n`;
      noted.forEach(i => {
        md += `### ${mdCell(i.title)}\n\n`;
        if (i.rating) {
          const r = Math.round(i.rating);
          md += `**${"★".repeat(r)}${"☆".repeat(Math.max(0, 5 - r))}** — ${i.rating}/5\n\n`;
        }
        md += i.review.trim() + `\n\n`;
      });
    }
    md += `\n---\n_Généré par InkVault — bibliothèque comics & mangas._\n`;
    return { text: md, name: `inkvault-bibliotheque-${EXPORT_STAMP()}.md` };
  }

  /* ── Ordre de lecture → Markdown ── */
  function buildOrderMd(plan) {
    const steps = plan.steps || [];
    const inLib = steps.filter(x => x.item).length;
    const stepTitle = st => st.arc ? `${st.arc} — ${st.t}` : st.t;
    const libBadge = st => st.item
      ? `✅ lu ${st.item.volumes ? (st.item.read || 0) + "/" + st.item.volumes : "possédé"}`
      : `❌ à acquérir`;

    let md = `# 🧭 Ordre de lecture — ${mdCell(plan.title)}\n\n`;
    md += `> ${mdCell(plan.blurb)}\n>\n`;
    md += `> Exporté le ${EXPORT_DATE()} · **${steps.length} étapes** · ${inLib} dans ta bibliothèque · ` +
      `${steps.length - inLib} à acquérir\n\n`;
    md += `| # | Étape | Auteur | Année | Type | Bibliothèque |\n|---:|---|---|---:|---|---|\n`;
    steps.forEach((st, i) => {
      md += `| ${i + 1} | **${mdCell(stepTitle(st))}** | ${mdCell(st.a)} | ${st.y || "—"} | ` +
        `${KIND_LABEL[st.k] || st.k} | ${libBadge(st)} |\n`;
    });

    md += `\n## ✏️ Détail des étapes\n\n`;
    steps.forEach((st, i) => {
      md += `${i + 1}. **${mdCell(stepTitle(st))}** — ${mdCell(st.a)}${st.y ? ` (${st.y})` : ""}` +
        ` · *${KIND_LABEL[st.k] || st.k}* · ${libBadge(st)}\n`;
      if (st.why) md += `   > ${st.why}\n`;
    });
    md += `\n## 💡 Pourquoi cet ordre\n\n${mdCell(plan.note)}\n\n---\n_Généré par InkVault._\n`;
    return { text: md, name: `inkvault-ordre-${slug(plan.title)}-${EXPORT_STAMP()}.md` };
  }

  /* ── Coquille d'impression (A4) — partagée navigateur & Electron ── */
  const EXPORT_CSS = `
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body { margin:0; padding:26px 22px; color:#18181d; background:#fff;
      font: 14px/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    .doc-head { border-bottom:3px solid #6c5ce7; padding-bottom:12px; margin-bottom:16px; }
    .doc-k { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#6c5ce7; font-weight:800; }
    h1 { font-size:25px; margin:6px 0 4px; }
    .doc-sub { color:#444; margin:0; font-size:14px; }
    .doc-meta { font-size:12px; color:#888; margin-top:6px; }
    .chips { display:flex; flex-wrap:wrap; gap:7px; margin:14px 0; }
    .chip { border:1px solid #ddd; border-radius:999px; padding:4px 11px; font-size:12px; background:#f6f5fd; }
    h2 { font-size:17px; margin:24px 0 10px; border-left:4px solid #6c5ce7; padding-left:10px; }
    table { width:100%; border-collapse:collapse; font-size:12.5px; }
    th, td { border:1px solid #e3e1ee; padding:6px 8px; text-align:left; vertical-align:top; }
    th { background:#f1effb; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
    tr:nth-child(even) td { background:#fafafd; }
    .num { text-align:center; white-space:nowrap; }
    ol.steps { list-style:none; margin:0; padding:0; }
    ol.steps li { display:flex; gap:12px; padding:10px 0; border-bottom:1px dashed #ddd; break-inside:avoid; }
    ol.steps li::before { content:attr(data-n); font-weight:800; color:#6c5ce7;
      font-size:15px; min-width:26px; padding-top:1px; }
    .st-t { font-weight:700; font-size:14px; }
    .st-m { color:#666; font-size:12px; margin:2px 0; }
    .badge { display:inline-block; font-size:10px; font-weight:800; letter-spacing:.05em;
      text-transform:uppercase; border-radius:20px; padding:2px 9px; margin-right:6px;
      background:#efeafd; color:#5a49d6; }
    .badge.lib { background:#e5f8ee; color:#1c8e51; }
    .badge.out { background:#fdeeee; color:#c0392b; }
    .why { color:#444; font-size:12.5px; margin:4px 0 0; }
    .note { background:#f6f5fd; border:1px solid #e3e1ee; border-radius:10px;
      padding:12px 14px; font-size:13px; }
    .foot { margin-top:26px; font-size:11px; color:#999; text-align:center; }
    @media print { body { padding:0; } }
  `;

  const docShell = bodyHtml =>
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">` +
    `<title>Export InkVault</title><style>${EXPORT_CSS}</style></head><body>${bodyHtml}</body></html>`;

  /* ── Bibliothèque → HTML d'impression (PDF) ── */
  function buildLibraryHtml() {
    const s = libraryStats();
    const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title, "fr"));
    const chips = [
      ...Object.entries(s.sts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${mdCell(k)} · ${n}`),
      ...Object.entries(s.fmts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${mdCell(k)} · ${n}`)
    ].map(c => `<span class="chip">${c}</span>`).join("");

    const rows = sorted.map((i, idx) => `<tr>
      <td class="num">${idx + 1}</td><td><b>${esc(i.title)}</b></td><td>${esc(i.author)}</td>
      <td>${esc(i.format || "—")}</td><td class="num">${i.year || "—"}</td><td>${esc(i.status || "—")}</td>
      <td class="num">${progCell(i)}</td>
      <td class="num">${i.rating ? i.rating + "/5" : "—"}${i.fav ? " ♥" : ""}</td></tr>`).join("");

    const noted = sorted.filter(i => i.review && i.review.trim());
    const notesHtml = noted.length ? `<h2>📝 Mes notes de lecture</h2>` + noted.map(i => `
      <div class="note"><b>${esc(i.title)}</b>${i.rating ? ` — ${i.rating}/5` : ""}<br>${esc(i.review.trim())}</div>`
    ).join("") : "";

    const body = `
      <div class="doc-head">
        <div class="doc-k">✦ InkVault — export bibliothèque</div>
        <h1>📚 Ma bibliothèque${s.favs ? ` — ${s.favs} ♥` : ""}</h1>
        <p class="doc-sub">${items.length} ouvrages · ${s.done} terminés` +
        (s.rated ? ` · moyenne ${s.avg.toFixed(1)}/5` : "") + `</p>
        <div class="doc-meta">Exportée le ${EXPORT_DATE()}</div>
      </div>
      <div class="chips">${chips}</div>
      <h2>📖 Catalogue (${items.length})</h2>
      <table><thead><tr><th>#</th><th>Titre</th><th>Auteur</th><th>Format</th><th>Année</th>
      <th>Statut</th><th>Progression</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>
      ${notesHtml}
      <div class="foot">Généré par InkVault — bibliothèque comics & mangas · ${EXPORT_DATE()}</div>`;

    return { html: docShell(body), name: `inkvault-bibliotheque-${EXPORT_STAMP()}.pdf` };
  }

  /* ── Ordre de lecture → HTML d'impression (PDF) ── */
  function buildOrderHtml(plan) {
    const steps = plan.steps || [];
    const inLib = steps.filter(x => x.item).length;
    const stepTitle = st => st.arc ? `${st.arc} — ${st.t}` : st.t;

    const lis = steps.map((st, i) => {
      const kind = KIND_LABEL[st.k] || st.k;
      const lib = st.item
        ? `<span class="badge lib">dans ta bibliothèque` +
          (st.item.volumes ? ` · ${st.item.read || 0}/${st.item.volumes}` : ``) + `</span>`
        : `<span class="badge out">à acquérir</span>`;
      const meta = `${esc(st.a)}${st.y ? ` · ${st.y}` : ""}`;
      return `<li data-n="${String(i + 1).padStart(2, "0")}">
        <div>
          <div class="st-t"><span class="badge">${kind}</span>${esc(stepTitle(st))}</div>
          <div class="st-m">${meta} ${lib}</div>
          ${st.why ? `<p class="why">${esc(st.why)}</p>` : ""}
        </div></li>`;
    }).join("");

    const body = `
      <div class="doc-head">
        <div class="doc-k">✦ InkVault — ${plan.kind === "generated" ? "ordre reconstruit" : "ordre de lecture"}</div>
        <h1>🧭 ${esc(plan.title)}</h1>
        <p class="doc-sub">${esc(plan.blurb)}</p>
        <div class="chips">
          <span class="chip">${steps.length} étapes</span>
          <span class="chip">${inLib} dans ta bibliothèque</span>
          <span class="chip">${steps.length - inLib} à acquérir</span>
          <span class="chip">Exporté le ${EXPORT_DATE()}</span>
        </div>
      </div>
      <ol class="steps">${lis}</ol>
      <h2>💡 Pourquoi cet ordre</h2>
      <div class="note">${esc(plan.note)}</div>
      <div class="foot">Généré par InkVault — bibliothèque comics & mangas · ${EXPORT_DATE()}</div>`;

    return { html: docShell(body), name: `inkvault-ordre-${slug(plan.title)}-${EXPORT_STAMP()}.pdf` };
  }

  /* ── PDF : pont Electron (sauvegarde native) puis impression navigateur ── */
  function printViaIframe(html) {
    const old = document.getElementById("printFrame");
    if (old) old.remove();
    const f = document.createElement("iframe");
    f.id = "printFrame";
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(f);
    const doc = f.contentDocument;
    doc.open(); doc.write(html); doc.close();
    const go = () => {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {}
      setTimeout(() => { if (f.parentNode) f.remove(); }, 1200);
    };
    if (doc.readyState === "complete") setTimeout(go, 300);
    else f.onload = () => setTimeout(go, 300);
  }

  function exportPdf(html, filename) {
    const br = window.inkvault;
    if (br && typeof br.savePdf === "function") {
      Promise.resolve(br.savePdf(html, filename))
        .then(r => {
          if (r && r.ok) showToast("📄 PDF enregistré — " + filename);
          else if (r && r.canceled) showToast("Export PDF annulé.");
          else { printViaIframe(html); showToast("🖨️ Fenêtre d'impression — « Enregistrer au format PDF »."); }
        })
        .catch(() => { printViaIframe(html); showToast("🖨️ Fenêtre d'impression — « Enregistrer au format PDF »."); });
      return;
    }
    printViaIframe(html);
    showToast("🖨️ Fenêtre d'impression — « Enregistrer au format PDF ».");
  }

  function exportOrder(kind) {
    if (!lastPlan) { showToast("⚠️ Génère d'abord un ordre de lecture."); return; }
    if (kind === "md") {
      const x = buildOrderMd(lastPlan);
      downloadText(x.name, x.text, "text/markdown");
      showToast("📝 Ordre exporté en Markdown — " + x.name);
    } else {
      const x = buildOrderHtml(lastPlan);
      exportPdf(x.html, x.name);
    }
  }

  function initExport() {
    const dd = $("#exportDD"), btn = $("#btnExport"), menu = $("#exportMenu");
    if (!dd || !btn || !menu) return;
    const closeMenu = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };

    btn.addEventListener("click", e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", e => { if (!dd.contains(e.target)) closeMenu(); });

    menu.addEventListener("click", e => {
      const b = e.target.closest("[data-exp]"); if (!b) return;
      closeMenu();
      const kind = b.dataset.exp;
      if (kind === "json") { exportJSON(); return; }
      if (kind === "md") {
        const x = buildLibraryMd();
        downloadText(x.name, x.text, "text/markdown");
        showToast("📝 Bibliothèque exportée en Markdown — " + x.name);
      } else if (kind === "pdf") {
        const x = buildLibraryHtml();
        exportPdf(x.html, x.name);
      }
    });
  }

  /* ═══════════ DÉMARRAGE ═══════════ */
  document.addEventListener("DOMContentLoaded", () => {
    runLoader();
    initCursor();
    initNav();
    buildHeroStack();
    initParallax();
    initScrollPerf();
    initToolbar();
    initVibe();
    initForm();
    initModal();
    initChallenge();
    initInsights();
    initSmartBuy();
    initAuthor();
    initBookExtras();
    initImageView();
    initReading();
    initExport();

    renderMetrics();
    renderGrid();
    renderStats();
    observeStats();

  });
})();
