const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1150,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    title: 'Karne Gönderici',
    titleBarStyle: 'hiddenInset', // Native macOS traffic lights
    backgroundColor: '#fbfbfb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('HTML yükleme hatası:', err);
      // Fallback
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  }

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.error('Sayfa yüklenemedi:', errorCode, errorDescription);
  });
}

process.on('uncaughtException', (err) => {
  console.error('Kritik Electron Hatası:', err);
});

// IPC Handlers for native macOS dialogs
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Karne PDF Klasörünü Seçin',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const folderPath = result.filePaths[0];

  // Scan folder for .pdf files
  try {
    const files = fs.readdirSync(folderPath);
    const pdfFiles = files
      .filter((file) => file.toLowerCase().endsWith('.pdf'))
      .map((file) => {
        const fullPath = path.join(folderPath, file);
        const stats = fs.statSync(fullPath);
        return {
          name: file,
          path: fullPath,
          size: stats.size,
          lastModified: stats.mtimeMs,
        };
      });
    return { folderPath, pdfFiles };
  } catch (err) {
    console.error('Klasör okunamadı:', err);
    return { folderPath, pdfFiles: [] };
  }
});

ipcMain.handle('file:readBase64', async (_, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer.toString('base64');
  } catch (err) {
    console.error('Dosya okunamadı:', err);
    throw err;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
