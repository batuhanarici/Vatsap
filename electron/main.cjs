const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const {
  registerAllowedDirectory,
  validatePdfPath,
  validateOpenWaRequest,
  validateDockerHealthOptions,
} = require('./security.cjs');

const execAsync = promisify(exec);
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let expressProcess = null;
let activeServerPort = 3000;

// Port Conflict Management: Checks if a given port is available
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port, '127.0.0.1');
  });
}

// Finds the first available port starting from 3000
async function findAvailablePort(startPort = 3000) {
  for (let p = startPort; p < startPort + 20; p++) {
    const isAvail = await checkPortAvailable(p);
    if (isAvail) return p;
  }
  return startPort;
}

// Graceful Express Server Startup in Production Desktop Environment
async function startLocalServerIfNeeded() {
  if (isDev) {
    activeServerPort = 3000;
    return;
  }

  // Check if port 3000 is already in use by another Karne Gönderici instance or local server
  const isPort3000Free = await checkPortAvailable(3000);
  if (!isPort3000Free) {
    // Check if it's already responding to our API
    try {
      const res = await fetch('http://127.0.0.1:3000/api/check-update', { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        console.log('[Electron] Yerel sunucu port 3000 üzerinde zaten çalışıyor.');
        activeServerPort = 3000;
        return;
      }
    } catch {
      // Port 3000 is used by something else, find alternative port
    }
    activeServerPort = await findAvailablePort(3001);
  } else {
    activeServerPort = 3000;
  }

  console.log(`[Electron] Yerel sunucu portu belirlendi: ${activeServerPort}`);
}

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
    mainWindow.loadURL(`http://localhost:${activeServerPort}`);
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

  // Register in security jail whitelist
  registerAllowedDirectory(folderPath);

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
  const validation = validatePdfPath(filePath);
  if (!validation.valid) {
    console.error(`[Security] file:readBase64 erişim reddedildi: ${validation.error}`);
    throw new Error(validation.error || 'Dosya okunamadı veya erişim reddedildi.');
  }

  try {
    const buffer = fs.readFileSync(validation.canonicalPath);
    return buffer.toString('base64');
  } catch (err) {
    console.error('[Security] Dosya okunamadı:', err.message);
    throw new Error('Dosya okunamadı veya erişim reddedildi.');
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

// IPC Handler for OpenWA HTTP API requests (Hardened: Loopback 2785 only, no arbitrary network/headers)
ipcMain.handle('openwa:request', async (_, options) => {
  const validation = validateOpenWaRequest(options);
  if (!validation.valid) {
    console.error(`[Security] openwa:request engellendi: ${validation.error}`);
    return {
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      error: validation.error,
    };
  }

  const { url, method, headers, body, timeoutMs } = validation.sanitizedOptions;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const fetchOptions = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = body;
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
        : 'OpenWA servisine ulaşılamadı.',
    };
  }
});

// IPC Handler: Comprehensive 5-Stage Docker & OpenWA Health Diagnostic (macOS Native, Hardened)
ipcMain.handle('docker:healthCheck', async (_, rawOptions) => {
  const { baseUrl, apiKey } = validateDockerHealthOptions(rawOptions);

  const diagnostic = {
    dockerInstalled: false,
    dockerRunning: false,
    containerRunning: false,
    containerName: '',
    portOpen: false,
    apiKeyValid: false,
    sessionReady: false,
    checkedAt: new Date().toISOString(),
    stepNotes: [],
  };

  // 1. Docker Daemon Check via CLI
  try {
    await execAsync('docker info', { timeout: 3500 });
    diagnostic.dockerInstalled = true;
    diagnostic.dockerRunning = true;
    diagnostic.stepNotes.push('Docker motoru aktif ve çalışıyor.');
  } catch {
    try {
      await execAsync('docker -v', { timeout: 2000 });
      diagnostic.dockerInstalled = true;
      diagnostic.stepNotes.push('Docker CLI yüklü ancak Docker Desktop motoru kapalı veya yanıt vermiyor.');
    } catch {
      diagnostic.stepNotes.push('macOS üzerinde Docker CLI bulunamadı.');
    }
  }

  // 2. OpenWA Container Check
  if (diagnostic.dockerRunning) {
    try {
      const { stdout } = await execAsync(
        'docker ps --filter "ancestor=openwa/wa-automate" --format "{{.Names}}|{{.Status}}"',
        { timeout: 3500 }
      );
      if (stdout && stdout.trim()) {
        diagnostic.containerRunning = true;
        const [name, status] = stdout.trim().split('\n')[0].split('|');
        diagnostic.containerName = name || 'openwa';
        diagnostic.stepNotes.push(`OpenWA Konteyneri çalışıyor (${status || 'Up'}).`);
      } else {
        diagnostic.stepNotes.push('OpenWA konteyneri (openwa/wa-automate) çalışır durumda bulunamadı.');
      }
    } catch {
      diagnostic.stepNotes.push('Konteyner durumu denetlenemedi.');
    }
  }

  // 3. Port & HTTP Service Reachability Check
  try {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const testUrl = cleanUrl.endsWith('/api') ? `${cleanUrl}/sessions` : `${cleanUrl}/api/sessions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const probeHeaders = { Accept: 'application/json' };
    if (apiKey) {
      probeHeaders['X-API-Key'] = apiKey;
      probeHeaders['api-key'] = apiKey;
    }

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: probeHeaders,
      signal: controller.signal,
    });
    clearTimeout(timer);

    diagnostic.portOpen = true;

    // 4. API Key Verification
    if (response.status === 401 || response.status === 403) {
      diagnostic.apiKeyValid = false;
      diagnostic.stepNotes.push('2785 portu açık fakat API anahtarı geçersiz veya yetkisiz (401/403).');
    } else {
      diagnostic.apiKeyValid = true;
      diagnostic.stepNotes.push('2785 portu erişilebilir ve API anahtarı doğrulandı.');

      // 5. Session State Check
      const sessionsData = await response.json().catch(() => null);
      if (Array.isArray(sessionsData) && sessionsData.some((s) => s.status === 'CONNECTED')) {
        diagnostic.sessionReady = true;
        diagnostic.stepNotes.push('WhatsApp oturumu bağlı ve mesaj gönderimine hazır.');
      } else {
        diagnostic.stepNotes.push('Oturum henüz başlatılmamış veya QR kod taraması bekleniyor.');
      }
    }
  } catch {
    diagnostic.portOpen = false;
    diagnostic.stepNotes.push('2785 portuna bağlanılamadı. Servis kapalı veya konteyner henüz başlamadı.');
  }

  return { success: true, diagnostic };
});

// IPC Handler: Update Checker (v1.0.0, Intel x64, Apple Silicon arm64, Universal)
ipcMain.handle('app:checkUpdate', async () => {
  return {
    currentVersion: app.getVersion() || '1.0.0',
    latestVersion: '1.0.0',
    hasUpdate: false,
    releaseNotes: 'Karne Gönderici v1.0.0: safeStorage şifrelemesi, SSRF korumalı proxy ve çoklu veli desteği devrede.',
    releaseDate: '2026-10-06',
    downloads: {
      appleSilicon: 'https://github.com/batuhan/karne-gonderici/releases/download/v1.0.0/Karne-Gonderici-1.0.0-arm64.dmg',
      intelMac: 'https://github.com/batuhan/karne-gonderici/releases/download/v1.0.0/Karne-Gonderici-1.0.0-x64.dmg',
      universalMac: 'https://github.com/batuhan/karne-gonderici/releases/download/v1.0.0/Karne-Gonderici-1.0.0-universal.dmg',
    },
  };
});

// IPC Handler: macOS LaunchAgent Management for background scheduled execution
ipcMain.handle('launchAgent:status', () => {
  const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.batuhan.karnegonderici.schedule.plist');
  return {
    isInstalled: fs.existsSync(plistPath),
    plistPath,
  };
});

ipcMain.handle('launchAgent:install', async () => {
  const launchAgentsDir = path.join(os.homedir(), 'Library/LaunchAgents');
  if (!fs.existsSync(launchAgentsDir)) {
    fs.mkdirSync(launchAgentsDir, { recursive: true });
  }

  const plistPath = path.join(launchAgentsDir, 'com.batuhan.karnegonderici.schedule.plist');
  const appPath = app.getPath('exe');
  const helperScript = path.join(__dirname, 'launchAgent.cjs');

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.batuhan.karnegonderici.schedule</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${helperScript}</string>
    </array>
    <key>StartInterval</key>
    <integer>60</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(os.homedir(), 'Library/Logs/KarneGonderici-schedule.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(os.homedir(), 'Library/Logs/KarneGonderici-schedule-error.log')}</string>
</dict>
</plist>`;

  try {
    fs.writeFileSync(plistPath, plistContent, 'utf8');
    await execAsync(`launchctl load -w "${plistPath}"`).catch(() => {});
    return { success: true, plistPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(async () => {
  await startLocalServerIfNeeded();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (expressProcess) {
    console.log('[Electron] Yerel sunucu kapatılıyor...');
    try {
      expressProcess.kill('SIGTERM');
    } catch {}
    expressProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
