const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'ai.js'), 'utf8');
const response = data => ({ ok: true, status: 200, json: async () => data });

test('un parcours inconnu fusionne Open Library et AniList avant le classement IA', async () => {
  const storage = new Map();
  const fetch = async (url, options = {}) => {
    if (url.includes('openlibrary.org/search.json')) return response({
      docs: [{
        key: '/works/OL42W',
        title: 'Nova Chronicles Volume 2',
        author_name: ['Jane Doe'],
        first_publish_year: 2021
      }]
    });
    if (url === 'https://graphql.anilist.co' && options.method === 'POST') return response({
      data: {
        Page: {
          media: [{
            id: 200,
            title: { english: 'Nova Chronicles', romaji: null, native: null },
            startDate: { year: 2020 },
            staff: { nodes: [{ name: { full: 'Jane Doe' } }] },
            relations: {
              edges: [{
                relationType: 'PREQUEL',
                node: {
                  id: 100,
                  type: 'MANGA',
                  title: { english: 'Nova Chronicles: Origins', romaji: null, native: null },
                  startDate: { year: 2019 },
                  staff: { nodes: [{ name: { full: 'Jane Doe' } }] }
                }
              }]
            }
          }]
        }
      }
    });
    throw new Error('Endpoint inattendu: ' + url);
  };
  const AI = vm.runInNewContext(source + '\nAI;', {
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    fetch
  });

  const result = await AI.readingOrderLive('Dans quel ordre lire Nova Chronicles ?', []);

  assert.equal(result.kind, 'live');
  assert.deepEqual(Array.from(result.liveSources), ['AniList', 'Open Library']);
  assert.equal(result.steps[0].t, 'Nova Chronicles: Origins');
  assert.equal(result.steps[0].source, 'AniList');
  assert.match(result.steps[0].why, /Préquelle/);
  assert.ok(result.steps.some(step => step.source === 'Open Library'));
});

test('le cache des parcours live évite de rappeler les API publiques', async () => {
  const cache = {
    at: Date.now(),
    data: {
      query: 'Nova',
      sources: ['Open Library'],
      works: [{
        t: 'Nova Volume 1', a: 'Jane Doe', y: 2020,
        source: 'Open Library', sourceUrl: 'https://openlibrary.org/works/OL1W',
        rank: 0, relation: 'publication'
      }]
    }
  };
  const storage = new Map([['iv-order-live-v1-nova', JSON.stringify(cache)]]);
  const AI = vm.runInNewContext(source + '\nAI;', {
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    fetch: () => { throw new Error('Le cache doit empêcher toute requête réseau'); }
  });

  const result = await AI.readingOrderLive('Nova', []);
  assert.equal(result.kind, 'live');
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].source, 'Open Library');
});
