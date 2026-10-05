import { WhatsAppProvider } from './types';
import { WhatsAppStatus, SendResult, OpenWAConfig } from '../../types/whatsapp';
import { normalizePhoneNumber } from '../normalizer';

export class OpenWAProvider implements WhatsAppProvider {
  private config: OpenWAConfig;

  constructor(config: OpenWAConfig) {
    this.config = config;
  }

  public updateConfig(newConfig: Partial<OpenWAConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Cleans and normalizes the server base URL so it NEVER produces double slashes or double /api/api.
   * Examples:
   * - 'localhost:2785' -> 'http://localhost:2785'
   * - 'http://localhost:2785/' -> 'http://localhost:2785'
   * - 'http://localhost:2785/api' -> 'http://localhost:2785'
   * - 'http://localhost:2785/api/' -> 'http://localhost:2785'
   */
  private get cleanBaseUrl(): string {
    let url = (this.config.baseUrl || 'http://localhost:2785').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    // Remove trailing /api and trailing slashes so all endpoints can cleanly append /api/...
    return url.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  }

  private formatChatId(phone: string): string {
    const cleanPhone = normalizePhoneNumber(phone);
    return `${cleanPhone}@c.us`;
  }

  private get headers(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
      headers['api-key'] = this.config.apiKey;
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Direct fetch to OpenWA / WhatsApp REST API without invalid cloud proxies
   */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const targetUrl = `${this.cleanBaseUrl}${cleanPath}`;

    return fetch(targetUrl, {
      ...options,
      headers: {
        ...this.headers,
        ...((options.headers as Record<string, string>) || {}),
      },
      signal: options.signal || AbortSignal.timeout(8000),
    });
  }

  /**
   * Checks the status of the current session on OpenWA or WPPConnect.
   * Tests both OpenWA standard endpoint (/api/sessions/:id) and WPPConnect (/api/:id/status-session).
   */
  async getStatus(): Promise<WhatsAppStatus> {
    const sessionId = this.config.sessionId || 'default';

    // Candidate 1: OpenWA standard (/api/sessions/default)
    // Candidate 2: WPPConnect (/api/default/status-session)
    const candidates = [
      { path: `/api/sessions/${sessionId}`, type: 'openwa' as const },
      { path: `/api/${sessionId}/status-session`, type: 'wppconnect' as const },
    ];

    let lastError: string | null = null;
    let isConnected = false;
    let statusData: Record<string, unknown> | null = null;
    let respondedCandidate: (typeof candidates)[number] | null = null;

    for (const cand of candidates) {
      try {
        const res = await this.request(cand.path, { method: 'GET' });
        if (res.ok) {
          statusData = await res.json().catch(() => ({}));
          respondedCandidate = cand;
          isConnected = true;
          break;
        }

        if (res.status === 401 || res.status === 403) {
          return {
            state: 'error',
            sessionId,
            details: 'API Anahtarı Geçersiz: Girdiğiniz OpenWA API Key sunucu tarafından reddedildi.',
          };
        }

        if (res.status === 404) {
          // Candidate returned 404 (session doesn't exist yet on OpenWA)
          // Try to create the session!
          const created = await this.createSession();
          if (created) {
            await this.startSession();
            return {
              state: 'starting',
              sessionId,
              details: `"${sessionId}" oturumu oluşturuldu, başlatılıyor...`,
            };
          }
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!isConnected || !statusData) {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const isLocalhost = this.cleanBaseUrl.includes('localhost') || this.cleanBaseUrl.includes('127.0.0.1');

      if (isHttps && isLocalhost && lastError?.includes('Failed to fetch')) {
        return {
          state: 'disconnected',
          sessionId,
          details: `localhost:2785 sunucusuna bağlanılamadı. Docker/OpenWA servisinin bilgisayarınızda çalıştığından emin olun (Hata: ${lastError}).`,
        };
      }

      return {
        state: 'disconnected',
        sessionId,
        details: lastError
          ? `OpenWA servisine bağlanılamadı (${lastError}). Sunucunun (port 2785) açık olduğundan emin olun.`
          : `"${sessionId}" oturumu bulunamadı. Lütfen "Oturum Başlat" butonuna tıklayın.`,
      };
    }

    // Determine state based on response
    const statusRaw = String(
      statusData.status || statusData.state || statusData.sessionStatus || ''
    ).toLowerCase();

    if (
      statusRaw === 'ready' ||
      statusRaw === 'connected' ||
      statusRaw === 'islogged' ||
      statusRaw === 'inchat' ||
      statusRaw === 'chatsavailable'
    ) {
      return {
        state: 'connected',
        sessionId,
        details: 'WhatsApp bağlı ve gönderime hazır.',
        phoneConnected:
          (statusData.phone as string) ||
          (statusData.user as string) ||
          (statusData.pushname as string) ||
          'Bağlı',
      };
    }

    if (
      statusRaw === 'qr_ready' ||
      statusRaw === 'notlogged' ||
      statusRaw === 'qr' ||
      statusRaw === 'qrcode'
    ) {
      const qrCode = (statusData.qr as string) || (statusData.qrCode as string) || null;
      return {
        state: 'qr_ready',
        sessionId,
        details: 'QR kod hazır, lütfen telefonunuzdan taratın.',
        qrCodeUrl: qrCode,
      };
    }

    if (statusRaw === 'initializing' || statusRaw === 'starting' || statusRaw === 'created') {
      return {
        state: 'starting',
        sessionId,
        details: 'WhatsApp motoru başlatılıyor, lütfen bekleyin...',
      };
    }

    if (statusRaw === 'authenticating') {
      return {
        state: 'authenticating',
        sessionId,
        details: 'QR kod tarandı, oturum doğrulanıyor...',
      };
    }

    return {
      state: 'disconnected',
      sessionId,
      details: `Oturum Durumu: ${statusRaw || 'Bağlantı Yok'}. Oturum Başlat butonuna basabilirsiniz.`,
    };
  }

  /**
   * Retrieves the QR code for authenticating the WhatsApp session
   */
  async getQrCode(): Promise<string | null> {
    const sessionId = this.config.sessionId || 'default';
    const candidatePaths = [
      `/api/sessions/${sessionId}/qr`,
      `/api/${sessionId}/qrcode-session`,
      `/api/sessions/${sessionId}`,
    ];

    for (const path of candidatePaths) {
      try {
        const response = await this.request(path, { method: 'GET' });
        if (response.ok) {
          const data = await response.json().catch(() => null);
          if (data) {
            const qr = data.qr || data.qrCode || data.qrcode || (typeof data.url === 'string' && data.url.startsWith('data:image') ? data.url : null);
            if (qr) return qr;
          }
        }
      } catch {
        // try next
      }
    }
    return null;
  }

  /**
   * Creates a session if not already existing
   */
  async createSession(): Promise<boolean> {
    const sessionId = this.config.sessionId || 'default';

    // Official OpenWA payload requires: { name: sessionId }
    // WPPConnect uses: /api/:session/start-session
    const candidateCalls = [
      { path: '/api/sessions', method: 'POST', body: { name: sessionId, sessionId } },
      { path: `/api/${sessionId}/start-session`, method: 'POST', body: {} },
    ];

    for (const call of candidateCalls) {
      try {
        const response = await this.request(call.path, {
          method: call.method,
          body: JSON.stringify(call.body),
        });
        if (response.ok || response.status === 409) {
          return true;
        }
      } catch {
        // try next
      }
    }
    return false;
  }

  /**
   * Starts a created session
   */
  async startSession(): Promise<boolean> {
    const sessionId = this.config.sessionId || 'default';
    const candidatePaths = [
      `/api/sessions/${sessionId}/start`,
      `/api/${sessionId}/start-session`,
    ];

    for (const path of candidatePaths) {
      try {
        const response = await this.request(path, { method: 'POST' });
        if (response.ok || response.status === 409) {
          return true;
        }
      } catch {
        // try next
      }
    }
    return false;
  }

  /**
   * Sends a plain text message to a recipient
   */
  async sendMessage(phone: string, message: string): Promise<SendResult> {
    const chatId = this.formatChatId(phone);
    const sessionId = this.config.sessionId || 'default';

    const candidateCalls = [
      // OpenWA
      {
        path: `/api/sessions/${sessionId}/messages/send-text`,
        body: { chatId, text: message },
      },
      // WPPConnect
      {
        path: `/api/${sessionId}/send-message`,
        body: { phone: normalizePhoneNumber(phone), message },
      },
    ];

    for (const call of candidateCalls) {
      try {
        const response = await this.request(call.path, {
          method: 'POST',
          body: JSON.stringify(call.body),
        });

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          return {
            success: true,
            messageId: data.messageId || data.id || 'sent',
          };
        }
      } catch {
        // try next
      }
    }

    return {
      success: false,
      error: 'OpenWA servisi üzerinden metin mesajı iletilemedi.',
    };
  }

  /**
   * Sends a document / PDF to a recipient with optional caption
   */
  async sendDocument(
    phone: string,
    base64Data: string,
    fileName: string,
    caption?: string
  ): Promise<SendResult> {
    const chatId = this.formatChatId(phone);
    const sessionId = this.config.sessionId || 'default';

    const cleanBase64 = base64Data.startsWith('data:')
      ? base64Data.split(',')[1]
      : base64Data;

    const candidateCalls = [
      // OpenWA
      {
        path: `/api/sessions/${sessionId}/messages/send-document`,
        body: {
          chatId,
          base64: cleanBase64,
          mimetype: 'application/pdf',
          filename: fileName,
          caption: caption || '',
        },
      },
      // WPPConnect
      {
        path: `/api/${sessionId}/send-file-base64`,
        body: {
          phone: normalizePhoneNumber(phone),
          base64: `data:application/pdf;base64,${cleanBase64}`,
          filename: fileName,
          message: caption || '',
        },
      },
    ];

    for (const call of candidateCalls) {
      try {
        const response = await this.request(call.path, {
          method: 'POST',
          body: JSON.stringify(call.body),
        });

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          return {
            success: true,
            messageId: data.messageId || data.id || 'sent',
          };
        }
      } catch {
        // try next
      }
    }

    return {
      success: false,
      error: 'OpenWA servisi üzerinden PDF belgesi iletilemedi.',
    };
  }
}
