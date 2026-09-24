const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getApiPort: () => ipcRenderer.invoke('get-api-port'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  savePdf: (fileName, options) => ipcRenderer.invoke('save-pdf', fileName, options),
  silentPrint: (options) => ipcRenderer.invoke('silent-print', options),
  isElectron: true,
});
