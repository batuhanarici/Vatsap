const path = require('path');
const fs = require('fs');

/**
 * Vatsap V2 P0-1 Security Layer
 * Implements strict boundaries for Electron Main Process IPC channels:
 * 1. Filesystem boundary & jail for file:readBase64
 * 2. Network boundary & allowlist for openwa:request
 * 3. Sanitization & safeguards for docker:healthCheck
 */

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_OPENWA_PORT = '2785';
const ALLOWED_OPENWA_HOSTS = new Set(['127.0.0.1', 'localhost']);
const ALLOWED_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']);

// In-memory set of canonical folder paths permitted via dialog:openDirectory during the session
const allowedDirectories = new Set();

/**
 * Registers an allowed folder path (canonicalized).
 */
function registerAllowedDirectory(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') {
    return null;
  }
  try {
    const canonicalDir = fs.realpathSync(folderPath);
    allowedDirectories.add(canonicalDir);
    return canonicalDir;
  } catch {
    return null;
  }
}

/**
 * Clears allowed directories (used in tests or session reset).
 */
function clearAllowedDirectories() {
  allowedDirectories.clear();
}

/**
 * Returns a copy of allowed canonical directories.
 */
function getAllowedDirectories() {
  return Array.from(allowedDirectories);
}

/**
 * Validates that a requested file path is:
 * 1. A non-empty string without null bytes
 * 2. An existing regular file
 * 3. Strictly ending with .pdf
 * 4. Strictly within one of the allowed directories (no path traversal, no symlink escapes)
 * 5. Within the allowed file size limit (<= 50MB)
 *
 * @param {string} filePath - Untrusted input from Renderer
 * @param {string[]} [customAllowedDirs] - Optional override for unit testing
 * @returns {{ valid: boolean; canonicalPath?: string; error?: string }}
 */
function validatePdfPath(filePath, customAllowedDirs) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'Geçersiz dosya yolu formatı.' };
  }

  // Prevent null-byte injection
  if (filePath.includes('\0')) {
    return { valid: false, error: 'Dosya yolunda geçersiz karakter tespit edildi.' };
  }

  // Must have .pdf extension
  const normalizedInput = path.normalize(filePath);
  if (!normalizedInput.toLowerCase().endsWith('.pdf')) {
    return { valid: false, error: 'Yalnızca .pdf uzantılı belgeler okunabilir.' };
  }

  // Check existence & resolve canonical path
  let canonicalPath;
  try {
    canonicalPath = fs.realpathSync(normalizedInput);
  } catch {
    return { valid: false, error: 'Belirtilen dosya bulunamadı veya erişilemez.' };
  }

  // Must end with .pdf even after canonical resolution (prevent symlink renaming trick)
  if (!canonicalPath.toLowerCase().endsWith('.pdf')) {
    return { valid: false, error: 'Hedef dosya geçerli bir PDF belgesi değil.' };
  }

  // Must be a regular file
  try {
    const stat = fs.statSync(canonicalPath);
    if (!stat.isFile()) {
      return { valid: false, error: 'Hedef bir dosya değil.' };
    }
    if (stat.size > MAX_PDF_SIZE_BYTES) {
      return { valid: false, error: 'Dosya boyutu izin verilen sınırı (50MB) aşıyor.' };
    }
  } catch {
    return { valid: false, error: 'Dosya bilgileri okunamadı.' };
  }

  // Jail check: Canonical file must reside strictly inside an allowed directory
  const allowedPool = customAllowedDirs ? customAllowedDirs.map((d) => {
    try { return fs.realpathSync(d); } catch { return path.resolve(d); }
  }) : Array.from(allowedDirectories);

  if (allowedPool.length === 0) {
    return { valid: false, error: 'Erişim reddedildi: Henüz geçerli bir karne klasörü seçilmedi.' };
  }

  let isInsideAllowedDir = false;
  for (const allowedDir of allowedPool) {
    const rel = path.relative(allowedDir, canonicalPath);
    // rel must not start with '..' and must not be absolute
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      // Double check that resolving back lands on canonicalPath
      const resolved = path.resolve(allowedDir, rel);
      if (resolved === canonicalPath) {
        isInsideAllowedDir = true;
        break;
      }
    }
  }

  if (!isInsideAllowedDir) {
    return { valid: false, error: 'Erişim reddedildi: Dosya seçilen izinli klasör sınırları dışındadır.' };
  }

  return { valid: true, canonicalPath };
}

/**
 * Validates and sanitizes OpenWA network request options:
 * 1. Strictly http://127.0.0.1:2785 or http://localhost:2785
 * 2. Allowed HTTP methods only
 * 3. Path must start with /api/ or allowed OpenWA routes
 * 4. Disallows dangerous headers (Cookie, Authorization)
 * 5. Strips and sanitizes incoming headers
 *
 * @param {object} options - Untrusted options from Renderer
 * @returns {{ valid: boolean; sanitizedOptions?: object; error?: string }}
 */
function validateOpenWaRequest(options) {
  if (!options || typeof options !== 'object') {
    return { valid: false, error: 'İstek parametreleri eksik veya hatalı.' };
  }

  const { url, method = 'GET', headers = {}, body, timeoutMs = 15000 } = options;

  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Hedef URL parametresi zorunludur.' };
  }

  // Parse URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: 'Geçersiz URL formatı.' };
  }

  // 1. Protocol validation: Strictly http:
  if (parsedUrl.protocol !== 'http:') {
    return { valid: false, error: `Yalnızca yerel HTTP protokolüne izin verilir (${parsedUrl.protocol} engellendi).` };
  }

  // 2. Hostname validation: Strictly 127.0.0.1 or localhost
  if (!ALLOWED_OPENWA_HOSTS.has(parsedUrl.hostname)) {
    return { valid: false, error: `Erişim reddedildi: Hedef adres ${parsedUrl.hostname} izinli yerel OpenWA adresi değildir.` };
  }

  // 3. Port validation: Strictly 2785
  const port = parsedUrl.port || (parsedUrl.protocol === 'http:' ? '80' : '443');
  if (port !== ALLOWED_OPENWA_PORT) {
    return { valid: false, error: `Erişim reddedildi: Port ${port} izinli değil. Yalnızca OpenWA portu (${ALLOWED_OPENWA_PORT}) kullanılabilir.` };
  }

  // 4. HTTP Method validation
  const upperMethod = String(method).toUpperCase();
  if (!ALLOWED_HTTP_METHODS.has(upperMethod)) {
    return { valid: false, error: `Geçersiz veya izin verilmeyen HTTP yöntemi: ${upperMethod}` };
  }

  // 5. Path validation: Must start with /api/ or allowed OpenWA endpoints
  const pathname = parsedUrl.pathname;
  const isAllowedPath =
    pathname.startsWith('/api/') ||
    pathname === '/api' ||
    pathname.startsWith('/sessions') ||
    pathname === '/ping' ||
    pathname === '/health';

  if (!isAllowedPath) {
    return { valid: false, error: `Erişim reddedildi: İstek yapılan API yolu (${pathname}) OpenWA standart rotası değildir.` };
  }

  // 6. Header Sanitization & Disallow dangerous headers
  const sanitizedHeaders = {};
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();

      // Explicitly reject dangerous or tracking headers
      if (
        lowerKey === 'cookie' ||
        lowerKey === 'authorization' ||
        lowerKey === 'proxy-authorization' ||
        lowerKey === 'host' ||
        lowerKey === 'origin' ||
        lowerKey === 'referer'
      ) {
        continue;
      }

      // Allow Content-Type (json, octet-stream, text)
      if (lowerKey === 'content-type') {
        const strVal = String(value);
        if (strVal.includes('application/json') || strVal.includes('text/plain') || strVal.includes('application/octet-stream')) {
          sanitizedHeaders['Content-Type'] = strVal;
        }
        continue;
      }

      // Allow Accept
      if (lowerKey === 'accept') {
        sanitizedHeaders['Accept'] = String(value);
        continue;
      }

      // API Key handling: sanitize value (only before newline/CR, alphanumeric, dashes, underscores, max 256)
      if (lowerKey === 'x-api-key' || lowerKey === 'api-key') {
        const firstLine = String(value).split(/[\r\n]/)[0];
        const cleanVal = firstLine.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 256);
        if (cleanVal) {
          sanitizedHeaders['X-API-Key'] = cleanVal;
          sanitizedHeaders['api-key'] = cleanVal;
        }
        continue;
      }
    }
  }

  if (!sanitizedHeaders['Accept']) {
    sanitizedHeaders['Accept'] = 'application/json';
  }

  // 7. Body validation
  let sanitizedBody = undefined;
  if (body !== undefined && ['POST', 'PUT', 'PATCH'].includes(upperMethod)) {
    if (typeof body === 'string') {
      if (body.length > 50 * 1024 * 1024) { // 50MB max body
        return { valid: false, error: 'İstek gövdesi izin verilen boyutu aşıyor.' };
      }
      sanitizedBody = body;
    } else if (typeof body === 'object') {
      try {
        const serialized = JSON.stringify(body);
        if (serialized.length > 50 * 1024 * 1024) {
          return { valid: false, error: 'İstek gövdesi izin verilen boyutu aşıyor.' };
        }
        sanitizedBody = serialized;
        if (!sanitizedHeaders['Content-Type']) {
          sanitizedHeaders['Content-Type'] = 'application/json';
        }
      } catch {
        return { valid: false, error: 'İstek gövdesi JSON olarak serileştirilemedi.' };
      }
    }
  }

  // 8. Timeout validation: Between 1000ms and 60000ms
  const safeTimeoutMs = Math.max(1000, Math.min(Number(timeoutMs) || 15000, 60000));

  return {
    valid: true,
    sanitizedOptions: {
      url: parsedUrl.toString(),
      method: upperMethod,
      headers: sanitizedHeaders,
      body: sanitizedBody,
      timeoutMs: safeTimeoutMs,
    },
  };
}

/**
 * Validates and sanitizes options for docker:healthCheck
 */
function validateDockerHealthOptions(options) {
  const safeOptions = {
    baseUrl: 'http://127.0.0.1:2785/api',
    apiKey: '',
  };

  if (options && typeof options === 'object') {
    if (typeof options.baseUrl === 'string' && options.baseUrl.trim()) {
      try {
        const u = new URL(options.baseUrl.trim());
        if (u.protocol === 'http:' && ALLOWED_OPENWA_HOSTS.has(u.hostname) && (u.port === '2785' || !u.port)) {
          safeOptions.baseUrl = `${u.protocol}//${u.hostname}:2785${u.pathname.replace(/\/+$/, '') || '/api'}`;
        }
      } catch {
        // Fallback to default
      }
    }

    if (typeof options.apiKey === 'string') {
      // Remove any control characters or shell metacharacters
      safeOptions.apiKey = options.apiKey.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 256);
    }
  }

  return safeOptions;
}

module.exports = {
  MAX_PDF_SIZE_BYTES,
  ALLOWED_OPENWA_PORT,
  ALLOWED_OPENWA_HOSTS,
  registerAllowedDirectory,
  clearAllowedDirectories,
  getAllowedDirectories,
  validatePdfPath,
  validateOpenWaRequest,
  validateDockerHealthOptions,
};
