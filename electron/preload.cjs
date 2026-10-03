const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  readPdfBase64: (filePath) => ipcRenderer.invoke('file:readBase64', filePath),
});
