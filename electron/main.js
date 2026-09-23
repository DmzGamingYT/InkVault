/* ══════════════════════════════════════════════
   INKVAULT — Coquille desktop (Electron)
   Charge l'app statique à la racine du projet.
   ══════════════════════════════════════════════ */

const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const fsp = require("fs/promises");

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

/* ══ Mises à jour silencieuses (electron-updater) ══
   Vérifiées AU LANCEMENT, téléchargées en arrière-plan, installées au
   prochain redémarrage — aucun message visible.
   • Fonctionne avec l'AppImage (seule cible Linux auto-actualisable) ;
     .deb / tar.gz : pas d'auto-update (réinstallation via la release).
   • x64 uniquement : la CI publie un unique latest-linux.yml constrduit
     en dernier sur x64 — sur arm64 il indiquerait le mauvais binaire. */
function initUpdater() {
  if (!app.isPackaged || process.arch !== "x64") return;
  let autoUpdater;
  try { autoUpdater = require("electron-updater").autoUpdater; } catch (e) { return; }
  autoUpdater.logger = { info() {}, warn() {}, error() {}, debug() {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", () => {});              // hors ligne : on ignore
  autoUpdater.on("update-downloaded", () => {});  // rien à l'écran : install au prochain lancement
  try { autoUpdater.checkForUpdates(); } catch (e) {}
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

  win.loadFile(path.join(__dirname, "..", "index.html"));

  /* Les liens sortants (enseignes, Archive.org…) s'ouvrent dans le navigateur */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  /* Filet de sécurité : l'app ne quitte JAMAIS sa coquille.
     Même un lien sans target="_blank" ne détourne pas la fenêtre. */
  win.webContents.on("will-navigate", (e, url) => {
    if (/^https?:\/\//i.test(url)) { e.preventDefault(); shell.openExternal(url); }
    else if (!/^file:/i.test(url)) e.preventDefault();
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
