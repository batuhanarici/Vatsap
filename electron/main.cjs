const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require('electron');
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

// Secure Storage via Electron safeStorage (macOS Keychain / OS-level encryption)
ipcMain.handle('secure:isAvailable', () => {
  return Boolean(safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable());
});

ipcMain.handle('secure:encrypt', (_, plainText) => {
  if (!plainText) return '';
  if (safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = safeStorage.encryptString(plainText);
      return buffer.toString('base64');
    } catch (err) {
      console.error('safeStorage şifreleme hatası:', err);
      return plainText;
    }
  }
  return plainText;
});

ipcMain.handle('secure:decrypt', (_, cipherTextBase64) => {
  if (!cipherTextBase64) return '';
  if (safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(cipherTextBase64, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (err) {
      console.error('safeStorage çözme hatası:', err);
      return cipherTextBase64;
    }
  }
  return cipherTextBase64;
});

// IPC Handler for OpenWA HTTP API requests (Bypasses Chromium CORS and sandbox network hurdles)
ipcMain.handle('openwa:request', async (_, options) => {
  const { url, method = 'GET', headers = {}, body, timeoutMs = 15000 } = options || {};
  if (!url) {
    return { ok: false, status: 400, error: 'URL parametresi belirtilmedi.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const fetchHeaders = {
      Accept: 'application/json',
      ...headers,
    };

    const fetchOptions = {
      method,
      headers: fetchHeaders,
      signal: controller.signal,
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      if (!fetchHeaders['Content-Type']) {
        fetchHeaders['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timer);

    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else {
      const text = await response.text().catch(() => '');
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
    };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err.name === 'AbortError' || (err.message && err.message.includes('abort'));
    return {
      ok: false,
      status: 0,
      statusText: isAbort ? 'Timeout' : 'NetworkError',
      error: isAbort
        ? `OpenWA sunucusu ${timeoutMs}ms içinde yanıt vermedi (Zaman aşımı).`
        : `OpenWA servisine (${url}) ulaşılamadı: ${err.message}`,
    };
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
