const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const { testDicomEcho, searchDicomStudies, retrieveDicomStudy } = require('./dicomNetwork.cjs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0B0F17',
    title: 'RadGraph DICOM Viewer @Alshaab Hos - v1.0.0',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  mainWindow.setMenu(null);
  mainWindow.setAutoHideMenuBar(true);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.maximize();

  const isDev = process.env.NODE_ENV === 'development' || (!app.isPackaged && !process.env.IS_PACKAGED);

  if (isDev && !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Recursive folder scanner
function scanDirectoryRecursively(dirPath, filesList = []) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDirectoryRecursively(fullPath, filesList);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size >= 8) {
            const data = fs.readFileSync(fullPath);
            filesList.push({
              fileName: entry.name,
              filePath: fullPath,
              buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
            });
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error('Error scanning folder:', err);
  }
  return filesList;
}

// IPC Handlers: Files & Directories
ipcMain.handle('dialog:openDicomFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open DICOM Files or Folders',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'DICOM Files', extensions: ['dcm', 'ima', 'dicom', ''] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) return [];

  const filesList = [];
  for (const filePath of result.filePaths) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        scanDirectoryRecursively(filePath, filesList);
      } else if (stats.isFile() && stats.size >= 8) {
        const data = fs.readFileSync(filePath);
        filesList.push({
          fileName: path.basename(filePath),
          filePath,
          buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        });
      }
    } catch (e) {}
  }

  return filesList;
});

ipcMain.handle('dialog:openDicomDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Medical Study Folder or CD/DVD Drive',
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) return [];
  const dirPath = result.filePaths[0];

  return scanDirectoryRecursively(dirPath);
});

ipcMain.handle('system:openPath', async (event, targetPath) => {
  if (!targetPath || !fs.existsSync(targetPath)) return [];
  const stats = fs.statSync(targetPath);
  if (stats.isDirectory()) {
    return scanDirectoryRecursively(targetPath);
  } else if (stats.isFile() && stats.size >= 8) {
    const data = fs.readFileSync(targetPath);
    return [{
      fileName: path.basename(targetPath),
      filePath: targetPath,
      buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    }];
  }
  return [];
});

ipcMain.handle('system:detectOpticalDrives', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve([]);
      return;
    }

    exec('wmic logicaldisk where DriveType=5 get DeviceID, VolumeName, Description', (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }

      const lines = stdout.split('\n').filter(l => l.trim().length > 0).slice(1);
      const drives = lines.map(line => {
        const parts = line.trim().split(/\s{2,}/);
        return {
          driveLetter: parts[1] || parts[0] || 'D:',
          name: parts[0] || 'CD/DVD Drive',
          volumeName: parts[2] || 'DISC_MEDIA'
        };
      });

      resolve(drives);
    });
  });
});

// Native DICOM PACS DIMSE Handlers
ipcMain.handle('pacs:echo', async (event, serverConfig) => {
  return testDicomEcho(serverConfig);
});

ipcMain.handle('pacs:search', async (event, serverConfig, filters) => {
  return searchDicomStudies(serverConfig, filters);
});

ipcMain.handle('pacs:retrieve', async (event, serverConfig, studyInstanceUid) => {
  return retrieveDicomStudy(serverConfig, studyInstanceUid, (slice) => {
    try {
      event.sender.send('pacs:slice', slice);
    } catch (e) {}
  });
});

// Window Control Handlers
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:toggleFullScreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});
