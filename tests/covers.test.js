const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'covers.js'), 'utf8');

function harness(fetch, PromiseImpl = Promise, cached) {
  const storage = new Map(cached === undefined ? [] : [['ink-covers-v2', cached]]);
  const Covers = vm.runInNewContext(source + '\nCovers;', {
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    fetch,
    Promise: PromiseImpl,
    AbortController,
    setTimeout: (fn, ms) => {
      if (ms === 300 || ms === 700) queueMicrotask(fn);
      return 0;
    },
    clearTimeout: () => {}
  });
  return { Covers, storage };
}

const book = { format: 'Comic', title: 'Watchmen', author: 'Alan Moore', isbn: '123' };
const image = { ok: true, headers: { get: () => 'image/jpeg' } };

test('resolve partage une recherche en cours puis garde le succès en cache', async () => {
  let release;
  let calls = 0;
  const { Covers, storage } = harness(() => {
    calls++;
    return new Promise(resolve => { release = resolve; });
  });

  const first = Covers.resolve(book);
  const second = Covers.resolve({ ...book });
  assert.strictEqual(second, first);
  await Promise.resolve(); // démarrage de la file
  assert.equal(calls, 1);
  release(image);
  const url = await first;
  assert.equal(await second, url);
  assert.equal(url, 'https://covers.openlibrary.org/b/isbn/123-L.jpg?default=false');
  assert.equal(await Covers.resolve(book), url);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(storage.get('ink-covers-v2'))['Comic|Watchmen|Alan Moore'], url);

  const other = Covers.resolve({ ...book, title: 'V for Vendetta' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  release(image);
  await other;
});

test('une recherche identique déjà en file est partagée', async () => {
  let release;
  const calls = [];
  const { Covers } = harness(url => {
    calls.push(url);
    return new Promise(resolve => { release = resolve; });
  });
  const first = Covers.resolve(book);
  await Promise.resolve();
  const queued = { ...book, title: 'V for Vendetta' };
  const second = Covers.resolve(queued);
  assert.strictEqual(Covers.resolve({ ...queued }), second);
  assert.equal(calls.length, 1);
  release(image);
  await first;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
  release(image);
  await second;
  assert.equal(calls.length, 2);
});

test('un cache disque malformé ne bloque pas la recherche', async () => {
  for (const cached of ['null', '[]', '{', JSON.stringify({ 'Comic|Watchmen|Alan Moore': { url: 'invalid' } })]) {
    let calls = 0;
    const { Covers } = harness(async () => { calls++; return image; }, Promise, cached);
    assert.equal(await Covers.resolve(book), 'https://covers.openlibrary.org/b/isbn/123-L.jpg?default=false');
    assert.equal(calls, 1);
  }
});

test('resolve partage aussi les recherches sans couverture et conserve le cache négatif', async () => {
  let calls = 0;
  const { Covers, storage } = harness(async url => {
    calls++;
    if (url.includes('/b/isbn/')) return { ok: false, status: 404 };
    if (url.includes('googleapis.com')) return { ok: true, json: async () => ({ items: [] }) };
    return { ok: true, json: async () => ({ docs: [] }) };
  });

  const first = Covers.resolve(book);
  assert.strictEqual(Covers.resolve({ ...book }), first);
  assert.equal(await first, null);
  const count = calls;
  assert.ok(count > 0);
  assert.equal(await Covers.resolve(book), null);
  assert.equal(calls, count);
  assert.equal(storage.size, 0);
});

test('une promesse rejetée est retirée des recherches en cours pour permettre un nouvel essai', async () => {
  let calls = 0;
  let failOnce = true;
  class FlakyPromise extends Promise {
    static race(values) {
      if (failOnce) {
        failOnce = false;
        throw new Error('impossible de démarrer la recherche');
      }
      return super.race(values);
    }
  }
  const { Covers } = harness(async () => { calls++; return image; }, FlakyPromise);

  const first = Covers.resolve(book);
  assert.strictEqual(Covers.resolve(book), first);
  await assert.rejects(first, /impossible de démarrer la recherche/);
  assert.equal(calls, 1);
  assert.equal(await Covers.resolve(book), 'https://covers.openlibrary.org/b/isbn/123-L.jpg?default=false');
  assert.equal(calls, 2);
});
