const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDicomFiles: () => ipcRenderer.invoke('dialog:openDicomFiles'),
  openDicomDirectory: () => ipcRenderer.invoke('dialog:openDicomDirectory'),
  openPath: (targetPath) => ipcRenderer.invoke('system:openPath', targetPath),
  detectOpticalDrives: () => ipcRenderer.invoke('system:detectOpticalDrives'),
  pacsEcho: (serverConfig) => ipcRenderer.invoke('pacs:echo', serverConfig),
  pacsSearch: (serverConfig, filters) => ipcRenderer.invoke('pacs:search', serverConfig, filters),
  pacsRetrieve: (serverConfig, studyInstanceUid) => ipcRenderer.invoke('pacs:retrieve', serverConfig, studyInstanceUid),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
  onPacsSlice: (callback) => {
    const listener = (event, slice) => callback(slice);
    ipcRenderer.on('pacs:slice', listener);
    return () => ipcRenderer.removeListener('pacs:slice', listener);
  }
});
