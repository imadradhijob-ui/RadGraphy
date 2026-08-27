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
    title: 'RadGraph Viewer - v0.0.3',
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

function findReadyOpticalDrive() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(null);
      return;
    }

    // 1. Try PowerShell Get-CimInstance Win32_CDROMDrive
    exec('powershell -NoProfile -Command "Get-CimInstance Win32_CDROMDrive | Select-Object Drive, MediaLoaded, Name, VolumeName | ConvertTo-Json"', { timeout: 4000 }, (err, stdout) => {
      try {
        if (!err && stdout && stdout.trim()) {
          let data = JSON.parse(stdout.trim());
          if (!Array.isArray(data)) data = [data];
          for (const item of data) {
            const drive = item.Drive || (item.DeviceID ? item.DeviceID.match(/([A-Z]:)/)?.[1] : null);
            if (drive && (item.MediaLoaded === true || item.MediaLoaded === 'True')) {
              const root = drive.endsWith('\\') ? drive : drive + '\\';
              try {
                if (fs.existsSync(root)) {
                  const files = fs.readdirSync(root);
                  if (files.length > 0) {
                    return resolve({
                      driveLetter: drive.replace(/\\$/, ''),
                      name: item.Name || 'CD/DVD Drive',
                      volumeName: item.VolumeName || 'DICOM_DISC',
                      rootPath: root
                    });
                  }
                }
              } catch (_) {}
            }
          }
        }
      } catch (_) {}

      // 2. Fallback: Check drive letters D..Z with fs.readdirSync and look for DICOMDIR or readable files
      for (let i = 68; i <= 90; i++) {
        const letter = String.fromCharCode(i) + ':';
        const root = letter + '\\';
        try {
          if (fs.existsSync(root)) {
            const files = fs.readdirSync(root);
            const hasDicomDir = files.some(f => f.toUpperCase() === 'DICOMDIR');
            const hasDicomFolder = files.some(f => f.toUpperCase() === 'DICOM');
            if (hasDicomDir || hasDicomFolder || files.length > 0) {
              return resolve({
                driveLetter: letter,
                name: 'Optical Disc Drive',
                volumeName: 'DICOM_MEDIA',
                rootPath: root
              });
            }
          }
        } catch (_) {}
      }

      resolve(null);
    });
  });
}

ipcMain.handle('system:detectOpticalDrives', async () => {
  const ready = await findReadyOpticalDrive();
  if (ready) {
    return [{
      driveLetter: ready.driveLetter,
      name: ready.name,
      volumeName: ready.volumeName
    }];
  }
  return [];
});

ipcMain.handle('system:readOpticalDisc', async () => {
  const readyDrive = await findReadyOpticalDrive();
  if (!readyDrive) {
    return {
      success: false,
      detected: false,
      message: 'No CD/DVD disc was detected in the drive. Please make sure the patient disc is inserted properly.'
    };
  }

  const filesList = [];
  scanDirectoryRecursively(readyDrive.rootPath, filesList);

  return {
    success: filesList.length > 0,
    detected: true,
    driveLetter: readyDrive.driveLetter,
    volumeName: readyDrive.volumeName,
    count: filesList.length,
    files: filesList
  };
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
