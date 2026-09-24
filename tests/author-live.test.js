const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'ai.js'), 'utf8');

test('la bibliographie en cache recalcule la possession à chaque consultation', async () => {
  const cached = {
    at: Date.now(),
    data: {
      works: [
        { t: 'Watchmen', y: 1986, c: '', exact: true },
        { t: 'Watchmen: Before', y: 2012, c: '' },
        { t: 'V for Vendetta', y: 1982, c: '' }
      ],
      total: 3, exact: 1, series: 0
    }
  };
  const storage = new Map([['iv-live-v3-alanmoore', JSON.stringify(cached)]]);
  const AI = vm.runInNewContext(source + '\nAI;', {
    localStorage: { getItem: key => storage.get(key) || null },
    fetch: () => { throw new Error('Le cache ne doit pas déclencher de requête réseau'); }
  });

  const initial = await AI.authorLive('Alan Moore', []);
  assert.equal(initial.exact, 0);
  assert.equal(initial.series, 0);
  assert.equal(initial.works[0].exact, false);

  const owned = await AI.authorLive('Alan Moore', [{ author: 'Alan Moore', title: 'Watchmen' }]);
  assert.equal(owned.total, 3);
  assert.equal(owned.exact, 1);
  assert.equal(owned.series, 1);
  assert.equal(owned.works[0].exact, true);
  assert.equal(owned.works[1].series, true);

  const removed = await AI.authorLive('Alan Moore', []);
  assert.equal(removed.exact, 0);
  assert.equal(removed.series, 0);
});

test('MangaDex complète la bibliographie live avec un titre et sa couverture', async () => {
  const storage = new Map();
  const response = data => ({ ok: true, status: 200, json: async () => data });
  const fetch = async url => {
    if (url.includes('wikipedia.org')) return response({});
    if (url.includes('openlibrary.org/search.json')) return response({ docs: [] });
    if (url.includes('openlibrary.org/search/authors.json')) return response({ docs: [] });
    if (url.includes('googleapis.com')) return response({ items: [] });
    if (url.includes('api.mangadex.org/author')) return response({
      data: [{
        id: 'author-1',
        attributes: { name: 'Naoki Urasawa' },
        relationships: [{ type: 'manga', id: 'manga-1' }]
      }]
    });
    if (url.includes('api.mangadex.org/manga')) return response({
      data: [{
        id: 'manga-1',
        attributes: {
          title: { 'ja-ro': 'プロト' },
          altTitles: [{ fr: 'Pluto' }],
          year: 1999
        },
        relationships: [{
          type: 'cover_art', id: 'cover-1', attributes: { fileName: 'cover-file.jpg' }
        }]
      }]
    });
    return response({});
  };
  const AI = vm.runInNewContext(source + '\nAI;', {
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    fetch
  });

  const result = await AI.authorLive('Naoki Urasawa', []);
  assert.ok(result.src.includes('MangaDex'));
  assert.equal(result.works.length, 1);
  assert.equal(result.works[0].t, 'Pluto');
  assert.equal(result.works[0].y, 1999);
  assert.match(result.works[0].c, /uploads\.mangadex\.org\/covers\/manga-1\/cover-file\.jpg\.512\.jpg/);
});
