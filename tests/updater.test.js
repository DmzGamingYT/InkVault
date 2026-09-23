const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');

const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');

function launch({ platform = 'linux', packaged = true, appImage = path.join(os.tmpdir(), 'InkVault-test.AppImage'),
                  arch = 'x64', silentInstall = false, locks = [true], validImage = true,
                  writable = true, checkForUpdates, quitAndInstall } = {}) {
  const windows = [];
  const timers = [];
  const logs = [];
  const diskChecks = [];
  const updater = new EventEmitter();
  const installs = [];
  let checks = 0;
  let quits = 0;
  let lockAttempts = 0;
  let updaterLoads = 0;

  updater.checkForUpdates = () => { checks++; return checkForUpdates ? checkForUpdates() : Promise.resolve(null); }; // Jamais de réseau.
  updater.quitAndInstall = (...args) => {
    installs.push(args);
    if (quitAndInstall) quitAndInstall();
  };

  class BrowserWindow {
    constructor() {
      windows.push(this);
      this.webContents = { setWindowOpenHandler() {}, on() {} };
    }
    loadFile() {} // Aucun accès au fichier index.html.
    static getAllWindows() { return windows; }
  }

  const app = new EventEmitter();
  app.isPackaged = packaged;
  app.getPath = name => {
    assert.equal(name, 'userData');
    return os.tmpdir();
  };
  app.whenReady = () => Promise.resolve();
  app.requestSingleInstanceLock = () => locks[Math.min(lockAttempts++, locks.length - 1)];
  app.quit = () => { quits++; };

  const fakeFs = {
    constants: { W_OK: fs.constants.W_OK },
    statSync(file) {
      diskChecks.push(['stat', file]);
      assert.equal(file, appImage);
      return { isFile: () => validImage };
    },
    accessSync(dir, mode) {
      diskChecks.push(['access', dir]);
      assert.equal(dir, path.dirname(appImage));
      assert.equal(mode, fs.constants.W_OK);
      if (!writable) throw new Error('Dossier AppImage non inscriptible');
    }
  };
  const fakeFsp = {
    appendFile(file, message) {
      assert.equal(file, path.join(os.tmpdir(), 'update-errors.log'));
      logs.push(message); // Aucun fichier journal réellement écrit.
      return Promise.resolve();
    },
    writeFile() { throw new Error('Écriture inattendue'); }
  };
  const modules = {
    electron: { app, BrowserWindow, shell: {}, dialog: {}, ipcMain: { handle() {} } },
    'electron-updater': { autoUpdater: updater },
    path,
    fs: fakeFs,
    'fs/promises': fakeFsp,
    url: { pathToFileURL }
  };
  vm.runInNewContext(source, {
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Dépendance non simulée : ${name}`);
      if (name === 'electron-updater') updaterLoads++;
      return modules[name];
    },
    __dirname: path.join(__dirname, '..', 'electron'),
    process: { platform, arch, env: {
      ...(appImage == null ? {} : { APPIMAGE: appImage }),
      ...(silentInstall ? { APPIMAGE_SILENT_INSTALL: 'true' } : {})
    } },
    setInterval(fn, delay) {
      const timer = { fn, delay, active: true, unref() { return this; } };
      timers.push(timer);
      return timer;
    },
    clearInterval(timer) { timer.active = false; }
  }, { filename: 'electron/main.js' });

  return {
    app, updater, installs, windows, timers, logs, diskChecks,
    get checks() { return checks; },
    get quits() { return quits; },
    get lockAttempts() { return lockAttempts; },
    get updaterLoads() { return updaterLoads; }
  };
}

test('AppImage Linux empaquetée : installe et relance une seule fois au téléchargement', async () => {
  const h = launch();
  await Promise.resolve(); // whenReady() démarre createWindow() et initUpdater().
  assert.equal(h.windows.length, 1);
  assert.equal(h.updaterLoads, 1);
  assert.equal(h.checks, 1);
  assert.equal(h.updater.autoDownload, true);
  assert.equal(h.updater.autoInstallOnAppQuit, false);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, 6 * 60 * 60 * 1000);

  h.updater.emit('update-downloaded');
  h.updater.emit('update-downloaded');
  assert.deepEqual(h.installs, [[true, true]]);
  assert.deepEqual(h.diskChecks, [
    ['stat', path.join(os.tmpdir(), 'InkVault-test.AppImage')],
    ['access', os.tmpdir()]
  ]);
  assert.deepEqual(h.logs, []);
  assert.equal(h.quits, 0);
});

test('Mac et Linux .deb ne chargent pas l’updater et n’installent rien', async () => {
  for (const options of [{ platform: 'darwin' }, { platform: 'win32' }, { appImage: null },
                         { packaged: false }, { arch: 'ia32' }]) {
    const h = launch(options);
    await Promise.resolve();
    h.updater.emit('update-downloaded');
    assert.equal(h.updaterLoads, 0);
    assert.equal(h.checks, 0);
    assert.deepEqual(h.installs, []);
    assert.deepEqual(h.diskChecks, []);
    assert.deepEqual(h.logs, []);
    assert.equal(h.timers.length, 0);
  }
});

test('une AppImage invalide ou non inscriptible ne déclenche pas quitAndInstall', async () => {
  for (const [options, message] of [
    [{ validImage: false }, /AppImage introuvable/],
    [{ writable: false }, /non inscriptible/],
    [{ appImage: 'relative.AppImage' }, /AppImage introuvable/]
  ]) {
    const h = launch(options);
    await Promise.resolve();
    h.updater.emit('update-downloaded');
    assert.deepEqual(h.installs, []);
    assert.equal(h.logs.length, 1);
    assert.match(h.logs[0], message);
  }
});

test('une erreur tardive et des téléchargements répétés ne relancent pas une seconde installation', async () => {
  const h = launch();
  await Promise.resolve();
  h.updater.emit('update-downloaded');
  h.updater.emit('error', new Error('Erreur tardive'));
  h.updater.emit('update-downloaded');
  h.timers[0].fn();
  assert.deepEqual(h.installs, [[true, true]]);
  assert.equal(h.checks, 1);
  assert.equal(h.logs.length, 1);
  assert.match(h.logs[0], /Erreur tardive/);
});

test('les contrôles ne se chevauchent pas pendant un téléchargement, et reprennent après une erreur', async () => {
  let rejectDownload;
  const downloadPromise = new Promise((resolve, reject) => { rejectDownload = reject; });
  const h = launch({ checkForUpdates: () => ({ downloadPromise }) });
  await Promise.resolve();
  h.timers[0].fn();
  assert.equal(h.checks, 1);
  rejectDownload(new Error('Téléchargement interrompu'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.logs.length, 1);
  assert.match(h.logs[0], /Téléchargement interrompu/);
  h.timers[0].fn();
  assert.equal(h.checks, 2);
});

test('une exception synchrone à l’installation est journalisée et permet une nouvelle tentative', async () => {
  let attempts = 0;
  const h = launch({ quitAndInstall: () => { if (++attempts === 1) throw new Error('Échec installation'); } });
  await Promise.resolve();
  h.updater.emit('update-downloaded');
  assert.equal(h.logs.length, 1);
  assert.match(h.logs[0], /Échec installation/);
  h.updater.emit('update-downloaded');
  assert.deepEqual(h.installs, [[true, true], [true, true]]);
});

test('une erreur émise pendant quitAndInstall autorise une nouvelle tentative', async () => {
  let attempts = 0;
  let h;
  h = launch({ quitAndInstall: () => {
    if (++attempts === 1) h.updater.emit('error', new Error('Installation refusée'));
  } });
  await Promise.resolve();
  h.updater.emit('update-downloaded');
  assert.equal(h.logs.length, 1);
  assert.match(h.logs[0], /Installation refusée/);
  h.updater.emit('update-downloaded');
  assert.deepEqual(h.installs, [[true, true], [true, true]]);
});

test('AppImage arm64 empaquetée : active aussi les mises à jour', async () => {
  const h = launch({ arch: 'arm64' });
  await Promise.resolve();
  h.updater.emit('update-downloaded');
  assert.equal(h.checks, 1);
  assert.deepEqual(h.installs, [[true, true]]);
});

test('sans relance silencieuse, une seconde instance quitte immédiatement', () => {
  const h = launch({ locks: [false] });
  assert.equal(h.quits, 1);
  assert.equal(h.timers.length, 0);
  assert.equal(h.windows.length, 0);
});

test('relance silencieuse : attend le verrou mono-instance avant de démarrer', async () => {
  const h = launch({ silentInstall: true, locks: [false, false, true] });
  assert.equal(h.windows.length, 0);
  assert.equal(h.timers.length, 1);
  const retry = h.timers[0];
  assert.equal(retry.delay, 500);
  retry.fn();
  assert.equal(h.windows.length, 0);
  assert.equal(h.quits, 0);
  retry.fn();
  await Promise.resolve();
  assert.equal(retry.active, false);
  assert.equal(h.lockAttempts, 3);
  assert.equal(h.windows.length, 1);
  assert.equal(h.checks, 1);
  assert.equal(h.quits, 0);
  assert.deepEqual(h.logs, []);
});

test('après 30 s sans verrou, la relance abandonne et journalise l’échec', () => {
  const h = launch({ silentInstall: true, locks: [false] });
  const retry = h.timers[0];
  for (let i = 0; i < 59; i++) retry.fn();
  assert.equal(h.quits, 0);
  assert.equal(retry.active, true);
  retry.fn();
  assert.equal(h.lockAttempts, 61);
  assert.equal(retry.active, false);
  assert.equal(h.quits, 1);
  assert.equal(h.windows.length, 0);
  assert.equal(h.logs.length, 1);
  assert.match(h.logs[0], /verrou mono-instance indisponible après 30 s/);
});
