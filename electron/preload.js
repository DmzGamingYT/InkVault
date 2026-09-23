/* ══════════════════════════════════════════════
   INKVAULT — pont d'export PDF (contextBridge, sandbox)
   La page appelle window.inkvault.savePdf(html, nom)
   → boîte de sauvegarde native + printToPDF.
   Absent du navigateur web : l'app bascule sur l'impression.
   ══════════════════════════════════════════════ */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("inkvault", {
  savePdf: (html, defaultName) => ipcRenderer.invoke("iv:save-pdf", html, defaultName),
  confirmBox: (message, okLabel) => ipcRenderer.invoke("iv:confirm", message, okLabel)
});
