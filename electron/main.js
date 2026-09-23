/* ══════════════════════════════════════════════
   INKVAULT — Coquille desktop (Electron)
   Charge l'app statique à la racine du projet.
   ══════════════════════════════════════════════ */

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

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
      sandbox: true
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
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
