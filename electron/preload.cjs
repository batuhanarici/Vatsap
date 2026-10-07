const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  readPdfBase64: (filePath) => ipcRenderer.invoke('file:readBase64', filePath),
  requestOpenWA: (options) => ipcRenderer.invoke('openwa:request', options),
  checkDockerHealth: (options) => ipcRenderer.invoke('docker:healthCheck', options),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  installLaunchAgent: () => ipcRenderer.invoke('launchAgent:install'),
  getLaunchAgentStatus: () => ipcRenderer.invoke('launchAgent:status'),
  secureStorage: {
    isAvailable: () => ipcRenderer.invoke('secure:isAvailable'),
    encrypt: (plainText) => ipcRenderer.invoke('secure:encrypt', plainText),
    decrypt: (cipherText) => ipcRenderer.invoke('secure:decrypt', cipherText),
  },
});
