import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';

const execAsync = promisify(exec);

// Security Helper: Sanitize log lines to protect phone numbers, API keys, and PDF binaries
function sanitizeSensitiveText(text: string): string {
  if (!text) return '';
  return text
    .replace(/((\+?90|0)?\s*[5][0-9]{2}[\s.-]*)[0-9]{3}[\s.-]*([0-9]{2})[\s.-]*([0-9]{2})/g, '$1*** **$4')
    .replace(/([?&]key=)[^&]+/gi, '$1***')
    .replace(/(["']?(?:apiKey|metaToken|token|secret)["']?\s*[:=]\s*["'])[^"']+(["'])/gi, '$1***$2')
    .replace(/(["']?data:application\/pdf;base64,)[^"']+(["'])/gi, '$1[PDF_OMITTED]$2');
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Proxy for OpenWA local services (Hardened against SSRF, Port Scanning & sensitive data leakage)
  app.all('/api/openwa-proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: 'url parametresi zorunludur.' });
    }

    // SSRF Allowlist & Security Guard:
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: 'Geçersiz hedef URL formatı.' });
    }

    // 1. Protocol Restriction (Prevent file://, ftp://, gopher://, dict://)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(403).json({ error: 'Güvenlik ihlali: Yalnızca HTTP/HTTPS protokollerine izin verilir.' });
    }

    // 2. Hostname Restriction (Strict loopback allowlist; block AWS metadata 169.254.x, private 10.x, 0.0.0.0 etc.)
    const isAllowedHost =
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === 'host.docker.internal';

    if (!isAllowedHost) {
      return res.status(403).json({
        error: 'Erişim engellendi: Yalnızca yerel OpenWA sunucularına (127.0.0.1, localhost) izin verilir.',
      });
    }

    // 3. Port Restriction (Only permit standard OpenWA and local test ports; block arbitrary internal ports)
    const allowedPorts = ['2785', '8080', '3000', ''];
    if (!allowedPorts.includes(parsed.port)) {
      return res.status(403).json({
        error: `Erişim engellendi: Güvenlik politikası gereği ${parsed.port} portuna proxy isteği yapılamaz. Yalnızca 2785 ve 8080 portlarına izin verilir.`,
      });
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // Only forward X-API-Key to verified loopback hosts
      const apiKey = (req.headers['x-api-key'] || req.headers['api-key']) as string | undefined;
      if (apiKey && isAllowedHost) {
        headers['X-API-Key'] = apiKey;
        headers['api-key'] = apiKey;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(parsed.toString(), fetchOptions);
      const data = await response.json().catch(() => null);

      res.status(response.status).json(data || { status: response.statusText });
    } catch (err: unknown) {
      // Sanitize error messages: Never expose raw auth headers, phone numbers, or internal server paths
      const rawMsg = err instanceof Error ? err.message : 'Bağlantı hatası';
      const sanitizedMsg = sanitizeSensitiveText(rawMsg);
      res.status(502).json({
        error: 'OpenWA servisine ulaşılamadı.',
        details: sanitizedMsg,
      });
    }
  });

  // Comprehensive Docker & OpenWA 5-Stage Health Check Route
  app.get('/api/docker-health', async (req, res) => {
    const targetUrl = (req.query.url as string) || 'http://127.0.0.1:2785/api';
    const apiKey = (req.headers['x-api-key'] as string) || '';

    const diagnostic = {
      dockerInstalled: false,
      dockerRunning: false,
      containerRunning: false,
      containerName: '',
      portOpen: false,
      apiKeyValid: false,
      sessionReady: false,
      checkedAt: new Date().toISOString(),
      stepNotes: [] as string[],
    };

    // 1. Docker Daemon Check via CLI
    try {
      await execAsync('docker info', { timeout: 3000 });
      diagnostic.dockerInstalled = true;
      diagnostic.dockerRunning = true;
      diagnostic.stepNotes.push('Docker servisi aktif ve çalışıyor.');
    } catch (err: unknown) {
      try {
        await execAsync('docker -v', { timeout: 2000 });
        diagnostic.dockerInstalled = true;
        diagnostic.stepNotes.push('Docker yüklü fakat Docker Desktop motoru kapalı veya yanıt vermiyor.');
      } catch {
        diagnostic.stepNotes.push('Sistemde Docker CLI bulunamadı veya Docker yüklü değil.');
      }
    }

    // 2. OpenWA Container Check
    if (diagnostic.dockerRunning) {
      try {
        const { stdout } = await execAsync(
          'docker ps --filter "ancestor=openwa/wa-automate" --format "{{.Names}}|{{.Status}}"',
          { timeout: 3000 }
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
        diagnostic.stepNotes.push('Konteyner durumu sorgulanırken hata oluştu.');
      }
    }

    // 3. Port & HTTP Service Reachability Check
    try {
      const cleanUrl = targetUrl.replace(/\/+$/, '');
      const testUrl = cleanUrl.endsWith('/api') ? `${cleanUrl}/sessions` : `${cleanUrl}/api/sessions`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);

      const probeHeaders: Record<string, string> = { Accept: 'application/json' };
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
        diagnostic.stepNotes.push('Port açık ancak API anahtarı geçersiz veya yetkisiz (401/403).');
      } else {
        diagnostic.apiKeyValid = true;
        diagnostic.stepNotes.push('2785 portu erişilebilir ve API anahtarı doğrulandı.');

        // 5. Session State Check
        const sessionsData = (await response.json().catch(() => null)) as Array<{ status?: string }> | null;
        if (Array.isArray(sessionsData) && sessionsData.some((s) => s.status === 'CONNECTED')) {
          diagnostic.sessionReady = true;
          diagnostic.stepNotes.push('WhatsApp oturumu bağlı ve mesaj gönderimine hazır.');
        } else {
          diagnostic.stepNotes.push('Oturum henüz başlatılmamış veya QR kod taraması bekleniyor.');
        }
      }
    } catch {
      diagnostic.portOpen = false;
      diagnostic.stepNotes.push('2785 portuna bağlanılamadı. Servis kapalı veya güvenlik duvarı engelliyor.');
    }

    res.json({ success: true, diagnostic });
  });

  // App Update Checker Route (Provides Intel x64, Apple Silicon arm64, and Universal release info)
  app.get('/api/check-update', (_req, res) => {
    res.json({
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
      hasUpdate: false,
      releaseNotes: 'Karne Gönderici v1.0.0: Güvenli safeStorage, gelişmiş görsel OCR ve çift veli desteği devrede.',
      releaseDate: '2026-10-06',
      downloads: {
        appleSilicon: 'https://github.com/batuhan/karne-gonderici/releases/download/v1.0.0/Karne-Gonderici-1.0.0-arm64.dmg',
        intelMac: 'https://github.com/batuhan/karne-gonderici/releases/download/v1.0.0/Karne-Gonderici-1.0.0-x64.dmg',
        universalMac: 'https://github.com/batuhan/karne-gonderici/releases/download/v1.0.0/Karne-Gonderici-1.0.0-universal.dmg',
      },
    });
  });

  // Multimodal OCR Route for Scanned PDFs (Visual Optical Character Recognition) - Hardened for P1.3
  app.post('/api/ocr-scan', async (req, res) => {
    try {
      const { imageBase64, pdfBase64, studentCandidates } = req.body;
      if (!imageBase64 && !pdfBase64) {
        return res.status(400).json({
          success: false,
          error: 'Görsel veya PDF verisi (imageBase64 veya pdfBase64) zorunludur.',
        });
      }

      const base64Data = pdfBase64 || imageBase64;
      if (typeof base64Data !== 'string' || base64Data.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Geçersiz Base64 verisi sağlandı.',
        });
      }

      // 1. Strict Size Limit (Max ~15 MB raw binary / ~20 MB base64 string)
      const MAX_BASE64_LENGTH = 20 * 1024 * 1024;
      if (base64Data.length > MAX_BASE64_LENGTH) {
        return res.status(413).json({
          success: false,
          error: 'Belge boyutu izin verilen sınırı aşıyor (Maksimum 15 MB).',
        });
      }

      // 2. Sanitize and Validate Student Candidates Array
      let sanitizedCandidates: string[] = [];
      if (Array.isArray(studentCandidates)) {
        sanitizedCandidates = studentCandidates
          .slice(0, 200) // Max 200 candidates
          .filter((c) => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.slice(0, 100).replace(/[<>{}\\]/g, '').trim()); // Strip injection tags
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          success: false,
          isOcrAvailable: false,
          error:
            'Görsel OCR motoru yapılandırılmamış (GEMINI_API_KEY bulunamadı). Taranmış belgeleri manuel olarak eşleştirebilir veya dijital metin katmanlı orijinal PDF kullanabilirsiniz.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const mimeType = pdfBase64 ? 'application/pdf' : 'image/jpeg';

      const prompt = `Sen uzman bir optik karakter tanıma (OCR) ve okul sınav karnesi analiz motorusun.
Aşağıdaki taranmış karne / sınav sonuç belgesini oku ve analiz et.
Belgede yazan Öğrenci Adı Soyadı, Okul No, Sınıf ve Şube bilgilerini tespit et.
Eğer varsa aşağıdaki aday öğrenci listesinden hangisiyle eşleştiğini bul:
Aday Öğrenciler: ${JSON.stringify(sanitizedCandidates)}

Yanıtı kesinlikle geçerli bir JSON olarak ver:
{
  "detectedStudentName": "Belgede okunan öğrenci adı soyadı veya boş string",
  "matchedStudentName": "Aday listesinden tam eşleşen öğrencinin adı veya null",
  "extractedText": "Belgeden okunan anahtar metinler veya karne başlığı",
  "confidence": 85,
  "isScanned": true,
  "notes": "Belge durumuyla ilgili kısa not"
}`;

      // 25 second timeout safeguard
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR servis zaman aşımı (25 saniye)')), 25000)
      );

      const generatePromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const responseText = response.text || '{}';

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = {
          detectedStudentName: '',
          matchedStudentName: null,
          extractedText: responseText.slice(0, 1000),
          confidence: 50,
          isScanned: true,
        };
      }

      // 3. Strict Output Schema Validation & Sanitization
      const cleanDetected = typeof parsed.detectedStudentName === 'string'
        ? parsed.detectedStudentName.replace(/<[^>]*>/g, '').trim().slice(0, 100)
        : '';

      let cleanMatched: string | null = null;
      if (typeof parsed.matchedStudentName === 'string' && parsed.matchedStudentName) {
        // Matched student MUST exist in sanitizedCandidates
        const cand = sanitizedCandidates.find(
          (c) => c.toLowerCase() === (parsed.matchedStudentName as string).toLowerCase().trim()
        );
        cleanMatched = cand || null;
      }

      const cleanText = typeof parsed.extractedText === 'string'
        ? parsed.extractedText.replace(/<[^>]*>/g, '').slice(0, 2000)
        : '';

      const numConfidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.min(100, Math.max(0, Math.round(parsed.confidence)))
        : 80;

      const cleanData = {
        detectedStudentName: cleanDetected,
        matchedStudentName: cleanMatched,
        extractedText: cleanText,
        confidence: numConfidence,
        isScanned: Boolean(parsed.isScanned),
        notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 200) : '',
      };

      return res.json({
        success: true,
        isOcrAvailable: true,
        data: cleanData,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTimeout = errMsg.includes('zaman aşımı');
      const statusCode = isTimeout ? 504 : 500;
      return res.status(statusCode).json({
        success: false,
        isOcrAvailable: true,
        error: `OCR işlemi başarısız oldu: ${sanitizeSensitiveText(errMsg)}`,
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
