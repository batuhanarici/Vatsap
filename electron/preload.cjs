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
  },
  dispatch: {
    send: (request) => ipcRenderer.invoke('dispatch:send', request),
    reserve: (params, options) => ipcRenderer.invoke('dispatch:reserve', params, options),
    createUnknownRetryToken: (dispatchKey) =>
      ipcRenderer.invoke('dispatch:createUnknownRetryToken', dispatchKey),
    updateStatus: (dispatchKey, status, extra) =>
      ipcRenderer.invoke('dispatch:updateStatus', { dispatchKey, status, extra }),
    getByKey: (dispatchKey) => ipcRenderer.invoke('dispatch:getByKey', dispatchKey),
    getByExam: (examName) => ipcRenderer.invoke('dispatch:getByExam', examName),
    getByStatus: (status) => ipcRenderer.invoke('dispatch:getByStatus', status),
    computeKey: (payload) => ipcRenderer.invoke('dispatch:computeKey', payload),
  },
});
