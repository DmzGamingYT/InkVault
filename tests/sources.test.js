const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'sources.js'), 'utf8');

/* Les temporisations d'enchaînement (300 et 700 ms) sont neutralisées, mais pas
   le délai de garde de 12 s : sinon la course系 de la file gagnerait avant même
   que les sources aient répondu. Même réglage que la banc d'essai de covers.js. */
function harness(fetch, cached) {
  const storage = new Map(cached === undefined ? [] : [['ink-sources-v1', cached]]);
  const Sources = vm.runInNewContext(source + '\nSources;', {
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    fetch,
    Promise,
    AbortController,
    setTimeout: (fn, ms) => {
      if (ms === 300 || ms === 700) queueMicrotask(fn);
      return 0;
    },
    clearTimeout: () => {}
  });
  return { Sources, storage };
}

const json = body => ({ ok: true, json: async () => body });

/* Réponses minimales mais réalistes pour les sept sources. */
function api(overrides = {}) {
  return async url => {
    for (const [needle, body] of Object.entries(overrides)) {
      if (!url.includes(needle)) continue;
      if (body instanceof Error) throw body;
      return json(body);
    }
    if (url.includes('graphql.anilist.co')) return json({ data: { Page: { media: [] } } });
    if (url.includes('api.jikan.moe')) return json({ data: [] });
    if (url.includes('api.mangadex.org')) return json({ data: [] });
    if (url.includes('googleapis.com')) return json({ totalItems: 0, items: [] });
    if (url.includes('openlibrary.org')) return json({ docs: [] });
    if (url.includes('wikipedia.org')) return json({ query: { pages: [] } });
    throw new Error('URL inattendue : ' + url);
  };
}

const anilistMedia = (title, extra = {}) => ({
  data: { Page: { media: [Object.assign({
    id: 1,
    volumes: 12,
    siteUrl: 'https://anilist.co/manga/1',
    startDate: { year: 1997 },
    title: { english: title, romaji: title, native: title },
    description: 'Un résumé.',
    genres: ['Action'],
    coverImage: { extraLarge: 'https://cdn.example/cover.jpg' },
    staff: { edges: [] }
  }, extra)] } }
});

test('fusionne les sources d’un même ouvrage et écarte les titres sans rapport', async () => {
  const { Sources } = harness(api({
    'graphql.anilist.co': anilistMedia('Berserk', {
      staff: { edges: [
        { role: 'Story & Art', node: { name: { full: 'Kentaro Miura' } } },
        { role: 'Art', node: { name: { full: 'Studio Gaga' } } }
      ] }
    }),
    'openlibrary.org': { docs: [
      { title: 'Berserk', author_name: ['Kentaro Miura'], cover_i: 42, first_publish_year: 1989,
        subject: ['Bandes dessinées'], key: '/works/OL1W' },
      { title: 'Voyage en/cosmos', author_name: ['Quelqu’un'], cover_i: 7, first_publish_year: 1999 }
    ] }
  }));

  const list = await Sources.search('Berserk');
  const first = list[0];

  assert.equal(list.length, 1, 'le titre sans rapport est écarté');
  assert.equal(first.title, 'Berserk');
  assert.equal(first.sources.slice().sort().join('+'), 'AniList+Open Library');
  assert.equal(first.author, 'Kentaro Miura', 'le rôle « Story & Art » gagne sur l’équipe d assisting');
  assert.equal(first.cover, 'https://cdn.example/cover.jpg', 'la fiche la mieux notée fournit la couverture');
  assert.equal(first.volumes, 12);
  assert.equal(first.format, 'Manga');
  assert.equal(first.year, 1997, 'le champ absent d’une source est repris chez l’autre');
});

test('déduit le format BD à partir des matières d’Open Library', async () => {
  const { Sources } = harness(api({
    'openlibrary.org': { docs: [
      { title: 'Astérix le Gaulois', author_name: ['René Goscinny', 'Albert Uderzo'], cover_i: 962725,
        first_publish_year: 1961, subject: ['Bandes dessinées'], key: '/works/OL267622W' },
      { title: 'Astérix Gladiateur', author_name: ['René Goscinny'], cover_i: 1,
        first_publish_year: 1964, subject: ['Comic books, strips'], key: '/works/OL2W' }
    ] }
  }));

  const list = await Sources.search('Astérix');
  const byTitle = Object.fromEntries(list.map(x => [x.title, x.format]));  assert.equal(byTitle['Astérix le Gaulois'], 'Graphic Novel', '« bandes dessinées » → BD');
  assert.equal(byTitle['Astérix Gladiateur'], 'Comic', '« comic books » → comic');
  assert.equal(list[0].cover, 'https://covers.openlibrary.org/b/id/962725-M.jpg');
});

test('Wikipédia : suffixe d’imprimé retiré, autres médias écartés, logos refusés', async () => {
  const page = (title, description, extract, thumb) => ({
    title, description, extract, fullurl: 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(title),
    thumbnail: thumb ? { source: thumb } : undefined, categories: []
  });
  const { Sources } = harness(api({
    'fr.wikipedia.org': { query: { pages: [
      page('Le Crabe aux pincES d\'or', 'album de bande dessinée', 'Album d\'Hergé.', 'https://img.example/couv.jpg'),
      page('Le Crabe aux pincES d\'or (album)', 'album', 'Le même album.', 'https://img.example/logo.png'),
      page('Le Crabe aux pincES d\'or (film, 1947)', 'film', 'Un film.', 'https://img.example/film.jpg'),
      page('Liste des auteurs', 'page de liste', 'Rien à voir.', 'https://img.example/liste.jpg')
    ] } }
  }));

  const list = await Sources.search('Le Crabe aux pinces');
  assert.equal(list.length, 1, 'un seul ouvrage, sans doublon ni film ni page hors sujet');
  assert.equal(list[0].title, "Le Crabe aux pincES d'or", 'le suffixe (album) est retiré pour fusionner');
  assert.equal(list[0].sources.slice().sort().join('+'), 'Wikipédia');
  assert.equal(list[0].cover, 'https://img.example/couv.jpg', 'un logo n\'est pas une couverture');
  assert.equal(list[0].year, 0);
});

test('une source en panne est écartée pour la session, pas pour la requête', async () => {
  let olCalls = 0;
  const { Sources } = harness(async url => {
    if (url.includes('api.jikan.moe')) throw new TypeError('Failed to fetch');
    if (url.includes('openlibrary.org')) { olCalls++; return json({ docs: [{ title: 'Nausicaä', author_name: ['Hayao Miyazaki'], cover_i: 5, first_publish_year: 1984, key: '/works/OL3W' }] }); }
    return api()(url);
  });

  const first = await Sources.search('Nausicaä');
  assert.equal(first.length, 1);
  assert.ok(Sources.dead.includes('Jikan'));

  await Sources.search('Nausicaä du vent');
  assert.equal(olCalls, 2, 'Open Library, elle, continue de répondre');
  assert.ok(Sources.dead.includes('Jikan'), 'Jikan reste écartée');
});

test('le cache évite une seconde requête et se relit hors ligne', async () => {
  let calls = 0;
  const { Sources, storage } = harness(async url => {
    calls++;
    if (url.includes('openlibrary.org'))
      return json({ docs: [{ title: 'Watchmen', author_name: ['Alan Moore'], cover_i: 9, first_publish_year: 1986, key: '/works/OL4W' }] });
    return api()(url);
  });

  assert.equal(Sources.cached('Watchmen'), null);
  const first = await Sources.search('Watchmen');
  const count = calls;
  assert.equal(first.length, 1);
  assert.ok(count > 0);
  assert.equal(Sources.cached('Watchmen').length, 1, 'la réponse est lisible sans requête');
  assert.equal((await Sources.search('watchmen')).map(x => x.title).join(), 'Watchmen', 'la casse ne change rien à la clé');
  assert.equal(calls, count, 'aucune requête supplémentaire');

  const disk = JSON.parse(storage.get('ink-sources-v1'))['q-watchmen'];
  assert.equal(disk.data[0].title, 'Watchmen');
  assert.ok(disk.at > 0);
});

test('une recherche trop courte ne part pas sur le réseau', async () => {
  let calls = 0;
  const { Sources } = harness(async url => { calls++; return api()(url); });
  assert.equal((await Sources.search('  ')).length, 0);
  assert.equal((await Sources.search('a')).length, 0);
  assert.equal(calls, 0);
});

test('une recherche identique en cours est partagée', async () => {
  let calls = 0;
  const { Sources } = harness(async url => {
    calls++;
    return api()(url);
  });

  const first = Sources.search('Persepolis');
  const second = Sources.search('Persepolis');
  await Promise.all([first, second]);
  assert.ok(calls > 0);
  /* 7 sources, dont Google Books qui réessaie en recherche libre : 8 au plus. */
  assert.ok(calls <= 8, 'une seule série de requêtes : ' + calls);
});
