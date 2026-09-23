const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'store.js'), 'utf8');
const library = [{
  id: 1, title: 'Saga', author: 'B. K. Vaughan', format: 'Comic', year: 2012,
  volumes: 3, read: 2, rating: 4.5, status: 'En cours', color: '#abc',
  desc: 'Une histoire', fav: true, review: 'Bien', addedAt: '2024-01-01',
  finishedAt: null, isbn: '123', variant: 'Collector'
}];

function setup(initial, options = {}) {
  const storage = new Map(initial === undefined ? [] : [['inkvault.state.v1', JSON.stringify(initial)]]);
  if (options.raw !== undefined) storage.set('inkvault.state.v1', options.raw);
  let writes = 0;
  const Store = vm.runInNewContext(source + '\nStore;', {
    LIBRARY: library,
    console: { warn: () => {} },
    localStorage: {
      getItem: key => {
        if (options.readError) throw new Error('lecture impossible');
        return storage.get(key) ?? null;
      },
      setItem: (key, value) => {
        writes++;
        if (options.writeError) throw new Error('quota dépassé');
        storage.set(key, value);
      },
      removeItem: key => storage.delete(key)
    }
  });
  return { Store, storage, writes: () => writes };
}

const item = () => ({ id: 7, title: 'Livre', author: 'Autrice' });

test('une bibliothèque vide reste vide après sauvegarde et chargement', () => {
  const { Store, storage } = setup();
  assert.equal(Store.valid({ items: [] }), true);
  const empty = Store.normalize({ items: [] });
  assert.equal(empty.items.length, 0);
  assert.equal(Object.keys(empty.activity).length, 0);
  assert.equal(Store.save(empty), true);
  assert.equal(JSON.parse(storage.get('inkvault.state.v1')).items.length, 0);
  assert.equal(Store.load().items.length, 0);
  assert.equal(Store.load().items.length, 0);
});

test('un JSON minimal reçoit des valeurs par défaut, sans données de démonstration', () => {
  const { Store } = setup({ v: 1, items: [item()] });
  const loaded = Store.load();
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].id, 7);
  assert.equal(loaded.items[0].format, 'Comic');
  assert.equal(loaded.items[0].volumes, 1);
  assert.equal(loaded.items[0].read, 0);
  assert.equal(loaded.items[0].rating, 0);
  assert.equal(loaded.items[0].status, 'Planifié');
  assert.equal(loaded.items[0].color, '#7c5cff');
  assert.equal(loaded.items[0].finishedAt, null);
  assert.match(loaded.items[0].addedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(loaded.goal, 40);
  assert.equal(loaded.prefs.sort, 'title');
  assert.equal(Object.keys(loaded.activity).length, 0);
});

test('les données legacy valides et les couleurs hexadécimales sont conservées', () => {
  const state = { v: 1, items: library, activity: { '2024-01-02': 3 }, goal: 15,
    prefs: { filter: '__fav', sort: 'added', view: 'list', mode: 'vibe', sb: 35 } };
  const { Store } = setup(state);
  assert.equal(Store.valid(state), true);
  const loaded = Store.load();
  assert.equal(loaded.items[0].color, '#abc');
  assert.equal(loaded.items[0].rating, 4.5);
  assert.equal(loaded.items[0].variant, 'Collector');
  assert.equal(loaded.items[0].isbn, '123');
  assert.equal(loaded.items[0].addedAt, '2024-01-01');
  assert.equal(loaded.activity['2024-01-02'], 3);
  assert.equal(loaded.prefs.sb, 35);
  assert.equal(loaded.goal, 15);
});

test('un budget Smart Buy de zéro reste sauvegardable', () => {
  const { Store } = setup({ v: 1, items: [item()], prefs: { sb: 0 } });
  assert.equal(Store.load().prefs.sb, 0);
  assert.equal(Store.save({ items: [item()], prefs: { sb: 0 } }), true);
  assert.equal(Store.load().prefs.sb, 0);
});

test('un ancien état sans version et avec auteur vide reste chargeable', () => {
  const { Store, storage } = setup({ items: [{ ...item(), author: '' }] });
  assert.equal(Store.load().items[0].author, '');
  assert.equal(JSON.parse(storage.get('inkvault.state.v1')).v, undefined);
});

test('une sauvegarde présente mais corrompue ou incompatible bloque le chargement sans écriture', () => {
  for (const raw of ['', '{', 'null', JSON.stringify({ v: 2, items: [item()] }),
    JSON.stringify({ v: 1, items: [{ ...item(), read: '3' }] })]) {
    const { Store, storage, writes } = setup(undefined, { raw });
    assert.throws(() => Store.load(), /Sauvegarde illisible|Sauvegarde invalide/);
    assert.equal(storage.get('inkvault.state.v1'), raw);
    assert.equal(writes(), 0);
  }
});

test('un stockage inaccessible bloque le démarrage et ne fait pas croire à une sauvegarde', () => {
  const inaccessible = setup(undefined, { readError: true });
  assert.throws(() => inaccessible.Store.load(), /Stockage inaccessible/);
  const full = setup(undefined, { writeError: true });
  assert.throws(() => full.Store.load(), /Stockage inaccessible/);
  assert.equal(full.storage.has('inkvault.state.v1'), false);
});

test('save refuse les états invalides et signale les échecs sans écraser la sauvegarde', () => {
  const original = { v: 1, items: [item()] };
  const { Store, storage, writes } = setup(original);
  assert.equal(Store.save({ items: [{ ...item(), volumes: 0 }] }), false);
  assert.equal(writes(), 0);
  assert.equal(Store.save({ items: [] }), true);
  assert.equal(JSON.parse(storage.get('inkvault.state.v1')).items.length, 0);

  const full = setup(original, { writeError: true });
  const candidate = { items: [] };
  assert.equal(full.Store.save(candidate), false);
  assert.equal(candidate.v, undefined);
  assert.deepEqual(JSON.parse(full.storage.get('inkvault.state.v1')), original);
});

test('les couleurs malveillantes ou invalides ne passent pas dans les styles', () => {
  const { Store } = setup();
  for (const unsafe of ['red; background:url(javascript:alert(1))', '#12xyz', '#1234567', 17, null]) {
    const state = { items: [{ ...item(), color: unsafe }] };
    assert.equal(Store.valid(state), true);
    assert.equal(Store.normalize(state).items[0].color, '#7c5cff');
  }
  assert.equal(Store.normalize({ items: [{ ...item(), color: '#A1b2C3' }] }).items[0].color, '#A1b2C3');
  const persisted = setup({ v: 1, items: [{ ...item(), color: 'red; background:url(evil)' }] });
  assert.equal(persisted.Store.load().items[0].color, '#7c5cff');
  assert.equal(persisted.Store.save({ items: [{ ...item(), color: 'red; background:url(evil)' }] }), true);
  assert.equal(JSON.parse(persisted.storage.get('inkvault.state.v1')).items[0].color, '#7c5cff');
});

test('un import corrompu est refusé au lieu de convertir silencieusement ses champs', () => {
  const { Store } = setup();
  const invalid = [
    null, [], { items: {} }, { items: [null] },
    { items: [{ title: 'Sans ID', author: 'A' }] },
    { items: [{ ...item(), id: '7' }] },
    { items: [item(), item()] },
    { items: [{ ...item(), title: ' ' }] },
    { items: [{ ...item(), author: 12 }] },
    { items: [{ ...item(), status: 'Inconnu' }] },
    { items: [{ ...item(), format: [] }] },
    { items: [{ ...item(), volumes: '3' }] },
    { items: [{ ...item(), volumes: 1, read: 2 }] },
    { items: [{ ...item(), read: 2 }] },
    { items: [{ ...item(), rating: 9 }] },
    { items: [{ ...item(), fav: 'true' }] },
    { items: [{ ...item(), finishedAt: 42 }] },
    { items: [item()], goal: '40' },
    { items: [item()], activity: [] },
    { items: [item()], activity: { '2024-01-01': '3' } },
    { items: [item()], prefs: { sort: 'wrong' } },
    { items: [item()], prefs: [] },
    { v: 2, items: [item()] }
  ];
  for (const state of invalid) assert.equal(Store.valid(state), false, JSON.stringify(state));
});
