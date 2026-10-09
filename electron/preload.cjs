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
  credentials: {
    isAvailable: () => ipcRenderer.invoke('credentials:isAvailable'),
    hasOpenWAKey: () => ipcRenderer.invoke('credentials:hasOpenWAKey'),
    saveOpenWAKey: (key) => ipcRenderer.invoke('credentials:saveOpenWAKey', key),
    deleteOpenWAKey: () => ipcRenderer.invoke('credentials:deleteOpenWAKey'),
    hasMetaAccessToken: () => ipcRenderer.invoke('credentials:hasMetaAccessToken'),
    saveMetaAccessToken: (token) => ipcRenderer.invoke('credentials:saveMetaAccessToken', token),
    deleteMetaAccessToken: () => ipcRenderer.invoke('credentials:deleteMetaAccessToken'),
    migrateLegacy: (payload) => ipcRenderer.invoke('credentials:migrateLegacy', payload),
  },
  metaCloud: {
    getStatus: (options) => ipcRenderer.invoke('meta:getStatus', options),
    sendMessage: (options) => ipcRenderer.invoke('meta:sendMessage', options),
    sendDocument: (options) => ipcRenderer.invoke('meta:sendDocument', options),
  },
});
