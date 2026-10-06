const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  readPdfBase64: (filePath) => ipcRenderer.invoke('file:readBase64', filePath),
  requestOpenWA: (options) => ipcRenderer.invoke('openwa:request', options),
  secureStorage: {
    isAvailable: () => ipcRenderer.invoke('secure:isAvailable'),
    encrypt: (plainText) => ipcRenderer.invoke('secure:encrypt', plainText),
    decrypt: (cipherText) => ipcRenderer.invoke('secure:decrypt', cipherText),
  },
});
