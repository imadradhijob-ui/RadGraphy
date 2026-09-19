const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDicomFiles: () => ipcRenderer.invoke('dialog:openDicomFiles'),
  openDicomDirectory: () => ipcRenderer.invoke('dialog:openDicomDirectory'),
  openPath: (targetPath) => ipcRenderer.invoke('system:openPath', targetPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  detectOpticalDrives: () => ipcRenderer.invoke('system:detectOpticalDrives'),
  readOpticalDisc: () => ipcRenderer.invoke('system:readOpticalDisc'),
  cancelOpticalDisc: () => ipcRenderer.invoke('system:cancelOpticalDisc'),
  pacsEcho: (serverConfig) => ipcRenderer.invoke('pacs:echo', serverConfig),
  pacsSearch: (serverConfig, filters) => ipcRenderer.invoke('pacs:search', serverConfig, filters),
  pacsRetrieve: (serverConfig, studyInstanceUid) => ipcRenderer.invoke('pacs:retrieve', serverConfig, studyInstanceUid),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
  logError: (entry) => ipcRenderer.invoke('log:append', entry),
  openLogFile: () => ipcRenderer.invoke('log:openFile'),
  getLogPath: () => ipcRenderer.invoke('log:getPath'),
  readLogContent: () => ipcRenderer.invoke('log:readContent'),
  clearLog: () => ipcRenderer.invoke('log:clear'),
  onPacsSlice: (callback) => {
    const listener = (event, slice) => callback(slice);
    ipcRenderer.on('pacs:slice', listener);
    return () => ipcRenderer.removeListener('pacs:slice', listener);
  }
});
