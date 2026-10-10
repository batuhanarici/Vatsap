const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const CredentialService = require('./CredentialService.cjs');
const {
  DispatchRepository,
  computeSha256,
  computeDeterministicDispatchKey,
  normalizeRecipientPhone,
} = require('./DispatchRepository.cjs');
const {
  registerAllowedDirectory,
  validatePdfPath,
  validateOpenWaRequest,
  validateDockerHealthOptions,
} = require('./security.cjs');

const execAsync = promisify(exec);
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const credentialService = new CredentialService();
const dispatchRepository = new DispatchRepository();

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

// Domain-Specific Credential IPC Handlers (Renderer CANNOT decrypt or fetch plaintext secrets)
ipcMain.handle('credentials:isAvailable', () => {
  return credentialService.isEncryptionAvailable();
});

ipcMain.handle('credentials:hasOpenWAKey', () => {
  return credentialService.hasOpenWAKey();
});

ipcMain.handle('credentials:saveOpenWAKey', (_, key) => {
  return credentialService.saveOpenWAKey(key);
});

ipcMain.handle('credentials:deleteOpenWAKey', () => {
  return credentialService.deleteOpenWAKey();
});

ipcMain.handle('credentials:hasMetaAccessToken', () => {
  return credentialService.hasMetaAccessToken();
});

ipcMain.handle('credentials:saveMetaAccessToken', (_, token) => {
  return credentialService.saveMetaAccessToken(token);
});

ipcMain.handle('credentials:deleteMetaAccessToken', () => {
  return credentialService.deleteMetaAccessToken();
});

ipcMain.handle('credentials:migrateLegacy', (_, payload) => {
  return credentialService.migrateLegacyCiphertext(payload);
});

// IPC Handlers for Meta WhatsApp Cloud API (Executes in Main Process with isolated credentials)
ipcMain.handle('meta:getStatus', async (_, options) => {
  const { phoneNumberId } = options || {};
  if (!phoneNumberId || !phoneNumberId.trim()) {
    return {
      state: 'disconnected',
      sessionId: 'meta_cloud',
      details: 'Phone Number ID (Telefon Numarası Kimliği) girilmedi.',
    };
  }

  const metaToken = credentialService.getMetaAccessToken();
  if (!metaToken) {
    return {
      state: 'disconnected',
      sessionId: 'meta_cloud',
      details: 'Meta API Erişim Belirteci kaydedilmemiş.',
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId.trim())}`,
      {
        headers: {
          Authorization: `Bearer ${metaToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errMsg = errorData?.error?.message || `HTTP ${response.status} hatası`;
      return {
        state: 'error',
        sessionId: 'meta_cloud',
        details: `Meta API Hatası: ${errMsg}`,
      };
    }

    const data = await response.json();
    const phoneDisplay = data.display_phone_number || data.verified_name || 'Aktif';

    return {
      state: 'connected',
      sessionId: 'meta_cloud',
      details: `Meta WhatsApp Cloud API bağlı (${phoneDisplay})`,
      phoneConnected: phoneDisplay,
    };
  } catch (err) {
    return {
      state: 'error',
      sessionId: 'meta_cloud',
      details: 'Meta sunucularına erişilemedi.',
    };
  }
});

ipcMain.handle('meta:sendMessage', async () => {
  return {
    success: false,
    outcome: 'failed',
    pdfSent: false,
    messageSent: false,
    error: 'Erişim Reddedildi: meta:sendMessage kanalı kaldırıldı. Rezervasyonsuz doğrudan mesaj gönderimine izin verilmez.',
  };
});

ipcMain.handle('meta:sendDocument', async () => {
  return {
    success: false,
    outcome: 'failed',
    pdfSent: false,
    messageSent: false,
    error: 'Erişim Reddedildi: meta:sendDocument kanalı kaldırıldı. PDF belge gönderimleri yalnızca güvenli dispatch:send üzerinden gerçekleştirilebilir.',
  };
});

// IPC Handler for OpenWA HTTP API requests (Hardened: Loopback 2785 only, credential injected by Main)
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

  // Authenticate OpenWA request using CredentialService directly inside Main Process
  const openWaApiKey = credentialService.getOpenWAKey();
  if (openWaApiKey) {
    headers['X-API-Key'] = openWaApiKey;
    headers['api-key'] = openWaApiKey;
  }

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
  const { baseUrl } = validateDockerHealthOptions(rawOptions);
  const effectiveApiKey = credentialService.getOpenWAKey();

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
    if (effectiveApiKey) {
      probeHeaders['X-API-Key'] = effectiveApiKey;
      probeHeaders['api-key'] = effectiveApiKey;
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

// =============================================================================
// Vatsap V2 — Dispatch Reservation & Idempotency IPC Handlers (P0-3B.2)
// =============================================================================

ipcMain.handle('dispatch:reserve', async (_, rawParams, rawOptions) => {
  try {
    if (!rawParams || typeof rawParams !== 'object') {
      throw new Error('dispatch:reserve: Geçersiz istek parametresi.');
    }

    const {
      studentId,
      studentName,
      phone,
      examName,
      pdfName,
      pdfPath,
      pdfBase64,
      provider,
      id,
    } = rawParams;

    if (!studentId || typeof studentId !== 'string') {
      throw new Error('dispatch:reserve: studentId zorunludur.');
    }
    if (!studentName || typeof studentName !== 'string') {
      throw new Error('dispatch:reserve: studentName zorunludur.');
    }
    if (!phone || typeof phone !== 'string') {
      throw new Error('dispatch:reserve: phone zorunludur.');
    }
    if (!examName || typeof examName !== 'string') {
      throw new Error('dispatch:reserve: examName zorunludur.');
    }
    if (!pdfName || typeof pdfName !== 'string') {
      throw new Error('dispatch:reserve: pdfName zorunludur.');
    }
    if (!provider || typeof provider !== 'string') {
      throw new Error('dispatch:reserve: provider zorunludur.');
    }

    // Security Invariant (P0-3B.2):
    // Real PDF bytes MUST be used to calculate SHA-256. Never trust a client-supplied pdfSha256 string!
    let pdfSha256 = '';

    if (pdfPath) {
      const validation = validatePdfPath(pdfPath);
      if (!validation.valid) {
        console.warn(`[Security Alert] dispatch:reserve PDF dosya erişimi engellendi: ${validation.reason} (${pdfPath})`);
        throw new Error(`Erişim Engellendi: ${validation.reason}`);
      }
      const stats = fs.statSync(validation.canonicalPath);
      if (stats.size > 25 * 1024 * 1024) {
        throw new Error('PDF boyutu 25MB güvenlik sınırını aşıyor.');
      }
      const buffer = fs.readFileSync(validation.canonicalPath);
      pdfSha256 = computeSha256(buffer);
    } else if (pdfBase64 && typeof pdfBase64 === 'string') {
      const approxBytes = Buffer.byteLength(pdfBase64, 'base64');
      if (approxBytes > 25 * 1024 * 1024) {
        throw new Error('PDF boyutu 25MB güvenlik sınırını aşıyor.');
      }
      const buffer = Buffer.from(pdfBase64, 'base64');
      pdfSha256 = computeSha256(buffer);
    } else {
      throw new Error('dispatch:reserve: PDF içeriği (pdfPath veya pdfBase64) zorunludur.');
    }

    const cleanPhone = normalizeRecipientPhone(phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      throw new Error('dispatch:reserve: Geçersiz alıcı telefon numarası.');
    }

    // Sanitized options (P0-3B.3):
    // Renderer CANNOT bypass unknown safety by passing allowUnknownRetry: true!
    // A single-use confirmationToken generated by Main Process is strictly required.
    const sanitizedOptions = {
      confirmationToken:
        rawOptions && typeof rawOptions.confirmationToken === 'string'
          ? rawOptions.confirmationToken
          : undefined,
      isFromRenderer: true,
    };

    const reservationResult = dispatchRepository.reserveDispatch(
      {
        studentId,
        studentName,
        phone: cleanPhone,
        examName,
        pdfName,
        pdfSha256,
        provider,
        id,
      },
      sanitizedOptions
    );

    return {
      success: true,
      pdfSha256,
      ...reservationResult,
    };
  } catch (err) {
    console.error('[Electron] dispatch:reserve Hatası:', err.message);
    return {
      success: false,
      allowed: false,
      error: err.message,
    };
  }
});

ipcMain.handle('dispatch:createUnknownRetryToken', async (_, dispatchKey) => {
  try {
    if (!dispatchKey || typeof dispatchKey !== 'string') {
      throw new Error('dispatch:createUnknownRetryToken: dispatchKey zorunludur.');
    }
    const tokenInfo = dispatchRepository.createUnknownRetryToken(dispatchKey);
    return { success: true, ...tokenInfo };
  } catch (err) {
    console.error('[Electron] dispatch:createUnknownRetryToken Hatası:', err.message);
    return { success: false, error: err.message };
  }
});

// =============================================================================
// Vatsap V2 — Main Process Authoritative Provider Execution (P0-3B.3.1)
// =============================================================================

function isAmbiguousError(errMsg) {
  if (!errMsg || typeof errMsg !== 'string') return false;
  const lower = errMsg.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('zaman aşımı') ||
    lower.includes('econnreset') ||
    lower.includes('econnaborted') ||
    lower.includes('enetdown') ||
    lower.includes('enetunreach') ||
    lower.includes('etimedout') ||
    lower.includes('bağlantı') ||
    lower.includes('connection') ||
    lower.includes('network') ||
    lower.includes('504') ||
    lower.includes('502') ||
    lower.includes('gateway')
  );
}

async function sendMetaDocumentInternal({ phoneNumberId, metaToken, phone, pdfBuffer, fileName, caption }) {
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('type', 'application/pdf');
  formData.append('file', blob, fileName || 'karne.pdf');

  const uploadRes = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId.trim())}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${metaToken}`,
      },
      body: formData,
    }
  );

  if (!uploadRes.ok) {
    const errorData = await uploadRes.json().catch(() => null);
    return {
      success: false,
      error: `Meta Cloud PDF yükleme hatası: ${errorData?.error?.message || uploadRes.statusText}`,
    };
  }

  const uploadJson = await uploadRes.json();
  const mediaId = uploadJson?.id;
  if (!mediaId) {
    return {
      success: false,
      error: 'Meta Cloud API geçerli bir Media ID döndürmedi.',
    };
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const docPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'document',
    document: {
      id: mediaId,
      filename: fileName || 'karne.pdf',
    },
  };
  if (caption && caption.trim()) {
    docPayload.document.caption = caption.trim();
  }

  const sendRes = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId.trim())}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${metaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(docPayload),
    }
  );

  if (!sendRes.ok) {
    const errorData = await sendRes.json().catch(() => null);
    return {
      success: false,
      error: errorData?.error?.message || `Mesaj gönderilemedi (${sendRes.status})`,
    };
  }

  const sendJson = await sendRes.json();
  return {
    success: true,
    messageId: sendJson?.messages?.[0]?.id,
  };
}

async function sendOpenWaDocumentInternal({ baseUrl, sessionId, phone, base64, fileName, caption }) {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const cleanBase64 = (base64.startsWith('data:') ? base64.split(',')[1] : base64).trim().replace(/\s+/g, '');
  const safeSession = (sessionId || 'default').trim();
  const safeBaseUrl = (baseUrl || 'http://127.0.0.1:2785/api').replace(/\/+$/, '');
  const url = `${safeBaseUrl}/sessions/${encodeURIComponent(safeSession)}/messages/send-document`;

  const payload = {
    chatId: `${cleanPhone}@c.us`,
    base64: cleanBase64,
    mimetype: 'application/pdf',
    filename: fileName || 'karne.pdf',
    caption: caption || fileName || 'karne.pdf',
  };

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const openWaApiKey = credentialService.getOpenWAKey();
  if (openWaApiKey) {
    headers['X-API-Key'] = openWaApiKey;
    headers['api-key'] = openWaApiKey;
  }

  const controller = new AbortController();
  const timeoutMs = 30000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg = data?.message || data?.error || `OpenWA HTTP ${res.status}`;
      return { success: false, error: errMsg };
    }

    const messageId = data?.messageId || data?.id || `msg_${Date.now()}`;
    return { success: true, messageId };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err.name === 'AbortError' || (err.message && err.message.includes('abort'));
    const errorText = isAbort
      ? `OpenWA sunucusu ${timeoutMs}ms içinde yanıt vermedi (Zaman aşımı / ETIMEDOUT).`
      : `OpenWA bağlantı hatası: ${err.message || String(err)}`;
    return { success: false, error: errorText };
  }
}

ipcMain.handle('dispatch:send', async (_, request) => {
  try {
    if (!request || typeof request !== 'object') {
      throw new Error('dispatch:send: İstek parametresi geçersiz.');
    }

    const {
      studentId,
      studentName,
      phone,
      examName,
      pdfName,
      pdfPath,
      pdfBase64,
      provider = 'openwa',
      caption,
      messageText,
      confirmationToken,
      openwaConfig,
      metaConfig,
    } = request;

    if (!studentId || !studentName || !phone || !examName || !pdfName) {
      throw new Error('dispatch:send: Eksik öğrenci veya sınav bilgisi.');
    }

    // 1. PDF Byte Hash & Size bounds check
    let pdfSha256 = '';
    let finalBase64 = pdfBase64 || '';
    let finalBuffer = null;

    if (pdfPath) {
      const validation = validatePdfPath(pdfPath);
      if (!validation.valid) {
        console.warn(`[Security Alert] dispatch:send PDF erişimi engellendi: ${validation.error} (${pdfPath})`);
        throw new Error(`Erişim Engellendi: ${validation.error}`);
      }
      const stats = fs.statSync(validation.canonicalPath);
      if (stats.size > 25 * 1024 * 1024) {
        throw new Error('PDF boyutu 25MB güvenlik sınırını aşıyor.');
      }
      finalBuffer = fs.readFileSync(validation.canonicalPath);
      finalBase64 = finalBuffer.toString('base64');
      pdfSha256 = computeSha256(finalBuffer);
    } else if (pdfBase64 && typeof pdfBase64 === 'string') {
      const approxBytes = Buffer.byteLength(pdfBase64, 'base64');
      if (approxBytes > 25 * 1024 * 1024) {
        throw new Error('PDF boyutu 25MB güvenlik sınırını aşıyor.');
      }
      finalBuffer = Buffer.from(pdfBase64, 'base64');
      pdfSha256 = computeSha256(finalBuffer);
    } else {
      throw new Error('dispatch:send: PDF içeriği zorunludur.');
    }

    const cleanPhone = normalizeRecipientPhone(phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      throw new Error('dispatch:send: Geçersiz alıcı telefon numarası.');
    }

    // 2. Atomic SQLite Reservation in Main Process
    const reservation = dispatchRepository.reserveDispatch(
      {
        studentId,
        studentName,
        phone: cleanPhone,
        examName,
        pdfName,
        pdfSha256,
        provider,
      },
      {
        confirmationToken: typeof confirmationToken === 'string' ? confirmationToken : undefined,
        isFromRenderer: true,
      }
    );

    if (!reservation.allowed) {
      // Reservation blocked! Strict zero provider call guarantee!
      return {
        success: false,
        allowed: false,
        code: reservation.code,
        reason: reservation.reason,
        existing: reservation.existing,
      };
    }

    const dispatchKey = reservation.dispatchKey;

    // 3. Authoritative Provider Call inside Main Process
    let providerResult = { success: false, error: '', messageId: null };

    try {
      if (provider === 'meta_cloud') {
        const metaPhoneNumberId = metaConfig?.phoneNumberId;
        const metaToken = credentialService.getMetaAccessToken();
        if (!metaPhoneNumberId || !metaToken) {
          throw new Error('Meta Cloud API kimlik bilgileri eksik.');
        }

        providerResult = await sendMetaDocumentInternal({
          phoneNumberId: metaPhoneNumberId,
          metaToken,
          phone: cleanPhone,
          pdfBuffer: finalBuffer,
          fileName: pdfName,
          caption: caption || pdfName,
        });
      } else if (provider === 'mock') {
        if (request.mockShouldTimeout) {
          throw new Error('OpenWA sunucusu 15000ms içinde yanıt vermedi (Zaman aşımı / ETIMEDOUT).');
        }
        if (request.mockShouldReject) {
          throw new Error('ECONNRESET connection reset by peer');
        }
        if (request.mockShouldFail) {
          providerResult = { success: false, error: 'HTTP 400 Bad Request: Geçersiz numara.' };
        } else {
          providerResult = { success: true, messageId: `mock_msg_${Date.now()}` };
        }
      } else {
        providerResult = await sendOpenWaDocumentInternal({
          baseUrl: openwaConfig?.baseUrl || 'http://127.0.0.1:2785/api',
          sessionId: openwaConfig?.sessionId || 'default',
          phone: cleanPhone,
          base64: finalBase64,
          fileName: pdfName,
          caption: caption || pdfName,
        });
      }
    } catch (providerErr) {
      providerResult = {
        success: false,
        error: providerErr.message || String(providerErr),
      };
    }

    // 4. Result Classification & Authoritative SQLite Update (P0-B)
    const isAmbiguous = isAmbiguousError(providerResult.error);

    if (providerResult.success) {
      dispatchRepository.updateDispatchStatus(dispatchKey, 'sent', {
        provider_message_id: providerResult.messageId || null,
      });

      return {
        success: true,
        allowed: true,
        outcome: 'success',
        dispatchKey,
        status: 'sent',
        messageId: providerResult.messageId || null,
        pdfSent: true,
        messageSent: true,
      };
    } else if (isAmbiguous) {
      dispatchRepository.updateDispatchStatus(dispatchKey, 'unknown', {
        last_error: providerResult.error || 'Zaman aşımı / belirsiz teslimat.',
      });

      return {
        success: false,
        allowed: true,
        outcome: 'unknown',
        dispatchKey,
        status: 'unknown',
        error: providerResult.error,
        pdfSent: false,
        messageSent: false,
      };
    } else {
      dispatchRepository.updateDispatchStatus(dispatchKey, 'failed', {
        last_error: providerResult.error || 'Gönderim başarısız oldu.',
      });

      return {
        success: false,
        allowed: true,
        outcome: 'failed',
        dispatchKey,
        status: 'failed',
        error: providerResult.error,
        pdfSent: false,
        messageSent: false,
      };
    }
  } catch (err) {
    console.error('[Electron] dispatch:send Hatası:', err.message);
    return {
      success: false,
      allowed: false,
      error: err.message,
    };
  }
});

ipcMain.handle('dispatch:updateStatus', async () => {
  return {
    success: false,
    error: 'Erişim Reddedildi: dispatch:updateStatus doğrudan Renderer tarafından çağrılamaz. Durum güncellemeleri yalnızca Main Process tarafından yetkili biçimde yönetilir.',
  };
});

ipcMain.handle('dispatch:getByKey', async (_, dispatchKey) => {
  if (!dispatchKey || typeof dispatchKey !== 'string') return null;
  return dispatchRepository.getDispatchByKey(dispatchKey);
});

ipcMain.handle('dispatch:getByExam', async (_, examName) => {
  if (!examName || typeof examName !== 'string') return [];
  return dispatchRepository.getDispatchesByExam(examName);
});

ipcMain.handle('dispatch:getByStatus', async (_, status) => {
  if (!status || typeof status !== 'string') return [];
  return dispatchRepository.getDispatchesByStatus(status);
});

ipcMain.handle('dispatch:computeKey', async (_, payload) => {
  const { studentId, examName, phone, pdfSha256 } = payload || {};
  return computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 });
});

app.whenReady().then(async () => {
  try {
    credentialService.setStorageDir(app.getPath('userData'));
    credentialService.setSafeStorage(safeStorage);
    credentialService.load();
  } catch (err) {
    console.error('[Electron] CredentialService başlatılamadı:', err);
  }

  try {
    dispatchRepository.setStorageDir(app.getPath('userData'));
    await dispatchRepository.init();
    console.log('[Electron] DispatchRepository (SQLite) başarıyla başlatıldı.');
  } catch (err) {
    console.error('[Electron] DispatchRepository başlatılamadı:', err);
    throw err;
  }

  await startLocalServerIfNeeded();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (dispatchRepository) {
    dispatchRepository.close();
  }
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

module.exports = {
  dispatchRepository,
  credentialService,
};
