const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'ai.js'), 'utf8');

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
  const storage = new Map([['iv-live-v2-alanmoore', JSON.stringify(cached)]]);
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
