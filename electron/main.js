/* ══════════════════════════════════════════════
   INKVAULT — Coquille desktop (Electron)
   Charge l'app statique à la racine du projet.
   ══════════════════════════════════════════════ */

const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const fsp = require("fs/promises");
const { pathToFileURL } = require("url");

/* Export PDF natif : boîte de sauvegarde + printToPDF sur une fenêtre éphémère */
ipcMain.handle("iv:save-pdf", async (event, html, defaultName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Enregistrer le PDF",
    defaultPath: path.join(app.getPath("documents"),
      String(defaultName || "inkvault-export.pdf").replace(/[^\w. -]/g, "_")),
    filters: [{ name: "Document PDF", extensions: ["pdf"] }]
  });
  if (canceled || !filePath) return { canceled: true };

  const tmp = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await tmp.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(String(html)));
    const buf = await tmp.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true   // @page A4 + marges de la coquille d'export
    });
    await fsp.writeFile(filePath, buf);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    if (!tmp.isDestroyed()) tmp.destroy();
  }
});

/* ══ Confirmer (Electron n'implémente PAS window.confirm) ══
   Sans ça, Retirer/Import ne font absolument rien sous Electron. */
ipcMain.handle("iv:confirm", async (event, message, okLabel) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["Annuler", String(okLabel || "Confirmer")],
    defaultId: 0, cancelId: 0,
    title: "InkVault",
    message: String(message || "Confirmer cette action ?")
  });
  return response === 1;
});

/* AppImage Linux uniquement : .deb et tar.gz n'ont pas de mise à jour intégrée.
   Une version téléchargée est installée à la fermeture normale de l'app. */
function initUpdater() {
  if (!app.isPackaged || process.platform !== "linux" || !process.env.APPIMAGE ||
      !["x64", "arm64"].includes(process.arch)) return;

  // Conserver les erreurs sans interrompre la lecture ni afficher de dialogue.
  const logError = error => {
    const message = `[${new Date().toISOString()}] ${String(error && (error.stack || error.message) || error)}\n`;
    fsp.appendFile(path.join(app.getPath("userData"), "update-errors.log"), message).catch(() => {});
  };

  let autoUpdater;
  try { autoUpdater = require("electron-updater").autoUpdater; }
  catch (e) { logError(e); return; }
  autoUpdater.logger = { info() {}, warn: logError, error: logError, debug() {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", logError);
  const check = () => Promise.resolve().then(() => autoUpdater.checkForUpdates()).catch(logError);
  check();
  setInterval(check, 6 * 60 * 60 * 1000).unref();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: "#0a0a0f",
    autoHideMenuBar: true,
    title: "InkVault",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  const indexPath = path.join(__dirname, "..", "index.html");
  const indexUrl = pathToFileURL(indexPath);
  win.loadFile(indexPath);

  /* Les liens sortants (enseignes, Archive.org…) s'ouvrent dans le navigateur */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  /* Seul le document de l'application peut rester dans la fenêtre. */
  win.webContents.on("will-navigate", (e, url) => {
    if (/^https?:\/\//i.test(url)) { e.preventDefault(); shell.openExternal(url); return; }
    try {
      const target = new URL(url);
      if (target.protocol === "file:" && !target.host && !target.search &&
          target.pathname === indexUrl.pathname) return;
    } catch (err) { /* navigation invalide */ }
    e.preventDefault();
  });
}

/* Une seule instance : double lancement → on focuses la fenêtre existante */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });

  app.whenReady().then(() => {
    createWindow();
    initUpdater();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
