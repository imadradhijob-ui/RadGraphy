const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const { testDicomEcho, searchDicomStudies, retrieveDicomStudy } = require('./dicomNetwork.cjs');

// High-performance V8 flags for large medical DICOM volumes (4GB heap, aggressive GC, GPU crash immunity)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
app.commandLine.appendSwitch('enable-gpu-rasterization');

// Process-level crash prevention
process.on('uncaughtException', (err) => {
  console.error('[CRASH SHIELD] Uncaught Exception in Main Process:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH SHIELD] Unhandled Rejection in Main Process:', reason);
});
app.on('child-process-gone', (event, details) => {
  console.warn('[CRASH SHIELD] Child/GPU process exited safely:', details);
});

let mainWindow = null;

function createWindow() {
  const candidateIconPaths = [
    path.join(app.getAppPath(), 'dist/icon.png'),
    path.join(app.getAppPath(), 'dist/icon.ico'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../build/icon.ico')
  ];
  const windowIconPath = candidateIconPaths.find(p => fs.existsSync(p)) || path.join(__dirname, '../public/icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    center: true,
    backgroundColor: '#0B0F17',
    title: 'RadNode Viewer Version 0.0.8',
    icon: windowIconPath,
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

  // WebContents crash protection & auto-recovery
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[CRASH SHIELD] Renderer process terminated:', details);
    if (details.reason !== 'clean-exit') {
      try {
        dialog.showMessageBoxSync(mainWindow || undefined, {
          type: 'warning',
          title: 'RadNode Viewer - Safe Recovery',
          message: 'The display process encountered an unexpected issue and was restored.',
          detail: `Reason: ${details.reason || 'Memory or system constraint'}\nYour viewer has been restored safely.`
        });
      } catch (_) {}
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.reload();
      }
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[CRASH SHIELD] Renderer process is processing heavy imaging data...');
  });

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

// Recursive folder scanner with depth limit and cancellation check
function scanDirectoryRecursively(dirPath, filesList = [], currentDepth = 0, shouldAbort = () => false) {
  if (currentDepth > 8 || shouldAbort()) return filesList;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldAbort()) break;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDirectoryRecursively(fullPath, filesList, currentDepth + 1, shouldAbort);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          // Only read potential DICOM files (under 60MB, >= 8 bytes)
          if (stats.size >= 8 && stats.size <= 60 * 1024 * 1024) {
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

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size < 8) return null;
    const data = fs.readFileSync(filePath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  } catch (err) {
    console.error('[CRASH SHIELD] Error reading file on demand:', filePath, err);
    return null;
  }
});

let isOpticalScanCancelled = false;

function findReadyOpticalDrive() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(null);
      return;
    }

    // 1. Try PowerShell Get-CimInstance Win32_CDROMDrive strictly checking MediaLoaded
    exec('powershell -NoProfile -Command "Get-CimInstance Win32_CDROMDrive | Where-Object { $_.MediaLoaded -eq $true } | Select-Object Drive, Name, VolumeName | ConvertTo-Json"', { timeout: 3000 }, (err, stdout) => {
      try {
        if (!err && stdout && stdout.trim()) {
          let data = JSON.parse(stdout.trim());
          if (!Array.isArray(data)) data = [data];
          for (const item of data) {
            const drive = item.Drive || (item.DeviceID ? item.DeviceID.match(/([A-Z]:)/)?.[1] : null);
            if (drive) {
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

      // 2. Also check LogicalDisk for DriveType 5 (Compact Disc)
      exec('powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter \\"DriveType = 5\\" | Select-Object DeviceID, VolumeName | ConvertTo-Json"', { timeout: 2500 }, (err2, stdout2) => {
        try {
          if (!err2 && stdout2 && stdout2.trim()) {
            let data = JSON.parse(stdout2.trim());
            if (!Array.isArray(data)) data = [data];
            for (const item of data) {
              const drive = item.DeviceID;
              if (drive) {
                const root = drive.endsWith('\\') ? drive : drive + '\\';
                try {
                  if (fs.existsSync(root)) {
                    const files = fs.readdirSync(root);
                    if (files.length > 0) {
                      return resolve({
                        driveLetter: drive.replace(/\\$/, ''),
                        name: 'Optical CD/DVD Drive',
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

        // 3. Fallback: Check letters D..Z ONLY if an actual DICOMDIR file or DICOM folder exists at root
        // NEVER treat an ordinary drive as a disc just because files exist!
        for (let i = 68; i <= 90; i++) {
          const letter = String.fromCharCode(i) + ':';
          const root = letter + '\\';
          try {
            if (fs.existsSync(root)) {
              const hasDicomDir = fs.existsSync(path.join(root, 'DICOMDIR')) || fs.existsSync(path.join(root, 'dicomdir'));
              const hasDicomFolder = fs.existsSync(path.join(root, 'DICOM')) || fs.existsSync(path.join(root, 'dicom'));
              if (hasDicomDir || hasDicomFolder) {
                return resolve({
                  driveLetter: letter,
                  name: 'DICOM Media Drive',
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

ipcMain.handle('system:cancelOpticalDisc', async () => {
  isOpticalScanCancelled = true;
  return { cancelled: true };
});

ipcMain.handle('system:readOpticalDisc', async () => {
  isOpticalScanCancelled = false;
  const readyDrive = await findReadyOpticalDrive();
  if (!readyDrive) {
    return {
      success: false,
      detected: false,
      message: 'No CD/DVD disc was detected in the drive. Please make sure the patient disc is inserted properly.'
    };
  }

  const filesList = [];
  scanDirectoryRecursively(readyDrive.rootPath, filesList, 0, () => isOpticalScanCancelled);

  if (isOpticalScanCancelled) {
    return {
      success: false,
      detected: true,
      cancelled: true,
      message: 'CD/DVD reading cancelled by user.'
    };
  }

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
