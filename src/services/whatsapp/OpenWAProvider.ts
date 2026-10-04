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
   * Sanitizes and standardizes the base URL.
   * Examples:
   * - 'localhost:2785' -> 'http://localhost:2785'
   * - 'http://localhost:2785/' -> 'http://localhost:2785'
   */
  private get sanitizedBaseUrl(): string {
    let url = (this.config.baseUrl || 'http://localhost:2785/api').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    return url.replace(/\/+$/, '');
  }

  private formatChatId(phone: string): string {
    const cleanPhone = normalizePhoneNumber(phone);
    return `${cleanPhone}@c.us`;
  }

  /**
   * Performs an API request to OpenWA with proxy fallback for Mixed-Content and CORS bypass
   */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const targetUrl = `${this.sanitizedBaseUrl}${cleanPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
      headers['api-key'] = this.config.apiKey;
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const isBrowser = typeof window !== 'undefined';
    const isHttps = isBrowser && window.location.protocol === 'https:';
    const isTargetHttp = targetUrl.startsWith('http://');

    // On an HTTPS website, direct HTTP requests to localhost/IP are blocked by Mixed Content.
    // Use our server-side proxy route (/api/openwa-proxy) first.
    if (isHttps && isTargetHttp) {
      try {
        const proxyUrl = `/api/openwa-proxy?url=${encodeURIComponent(targetUrl)}`;
        const proxyRes = await fetch(proxyUrl, {
          ...options,
          headers,
          signal: options.signal || AbortSignal.timeout(10000),
        });
        if (proxyRes.status !== 502) {
          return proxyRes;
        }
      } catch {
        // Fall back to direct fetch if proxy route isn't reachable
      }
    }

    // Direct fetch (for HTTP environments, Electron, or HTTPS OpenWA targets)
    return fetch(targetUrl, {
      ...options,
      headers,
      signal: options.signal || AbortSignal.timeout(10000),
    });
  }

  /**
   * Checks the status of the current session on OpenWA.
   * Resiliently tests both `/sessions/{id}` and `/api/sessions/{id}`.
   */
  async getStatus(): Promise<WhatsAppStatus> {
    const sessionId = this.config.sessionId || 'default';
    const candidatePaths = [
      `/sessions/${sessionId}`,
      `/api/sessions/${sessionId}`,
    ];

    let lastError: string | null = null;
    let response: Response | null = null;

    for (const path of candidatePaths) {
      try {
        response = await this.request(path, { method: 'GET' });
        if (response.ok || response.status === 401 || response.status === 403 || response.status === 404) {
          break;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!response) {
      const isMixedContent =
        typeof window !== 'undefined' &&
        window.location.protocol === 'https:' &&
        this.sanitizedBaseUrl.startsWith('http://');

      return {
        state: 'disconnected',
        sessionId,
        details: isMixedContent
          ? 'OpenWA servisine bağlanılamadı. (Sunucu kapalı olabilir veya yerel Docker servisiniz çalışmıyor).'
          : `Sunucuya ulaşılamadı (${lastError || 'Bağlantı zaman aşımı'}). Docker veya OpenWA servisinizin çalıştığından emin olun.`,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        state: 'error',
        sessionId,
        details: 'OpenWA API anahtarı geçersiz veya yetkisiz. Lütfen doğru API Key girin.',
      };
    }

    if (response.status === 404) {
      // Session does not exist yet. Try auto-creating session!
      try {
        const created = await this.createSession();
        if (created) {
          await this.startSession();
          return {
            state: 'starting',
            sessionId,
            details: `"${sessionId}" oturumu otomatik oluşturuldu, başlatılıyor...`,
          };
        }
      } catch {
        // Fallback
      }
      return {
        state: 'disconnected',
        sessionId,
        details: `"${sessionId}" adlı oturum bulunamadı. Lütfen "Oturum Başlat" butonuna tıklayın.`,
      };
    }

    if (!response.ok) {
      return {
        state: 'error',
        sessionId,
        details: `OpenWA yanıt vermedi (HTTP ${response.status}).`,
      };
    }

    try {
      const data = await response.json();
      const statusValue = (data.status || '').toLowerCase();

      switch (statusValue) {
        case 'ready':
          return {
            state: 'connected',
            sessionId,
            details: 'WhatsApp bağlı ve gönderime hazır.',
            phoneConnected: data.phone || data.user || 'Bağlı',
          };
        case 'qr_ready':
          return {
            state: 'qr_ready',
            sessionId,
            details: 'QR kod hazır, lütfen telefonunuzdan taratın.',
            qrCodeUrl: data.qr || null,
          };
        case 'initializing':
        case 'created':
          return {
            state: 'starting',
            sessionId,
            details: 'WhatsApp motoru başlatılıyor...',
          };
        case 'authenticating':
          return {
            state: 'authenticating',
            sessionId,
            details: 'QR tarandı, oturum doğrulanıyor...',
          };
        default:
          return {
            state: 'disconnected',
            sessionId,
            details: `Oturum durumu: ${statusValue || 'Bilinmiyor'}`,
          };
      }
    } catch {
      return {
        state: 'error',
        sessionId,
        details: 'OpenWA yanıtı çözümlenemedi.',
      };
    }
  }

  /**
   * Retrieves the QR code for authenticating the WhatsApp session
   */
  async getQrCode(): Promise<string | null> {
    const sessionId = this.config.sessionId || 'default';
    const candidatePaths = [
      `/sessions/${sessionId}/qr`,
      `/api/sessions/${sessionId}/qr`,
    ];

    for (const path of candidatePaths) {
      try {
        const response = await this.request(path, { method: 'GET' });
        if (response.ok) {
          const data = await response.json().catch(() => null);
          if (data && (data.qr || data.qrCode)) {
            return data.qr || data.qrCode;
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
    const candidatePaths = ['/sessions', '/api/sessions'];

    for (const path of candidatePaths) {
      try {
        const response = await this.request(path, {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
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
      `/sessions/${sessionId}/start`,
      `/api/sessions/${sessionId}/start`,
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
    const candidatePaths = [
      `/sessions/${sessionId}/messages/send-text`,
      `/api/sessions/${sessionId}/messages/send-text`,
    ];

    for (const path of candidatePaths) {
      try {
        const response = await this.request(path, {
          method: 'POST',
          body: JSON.stringify({ chatId, text: message }),
        });

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          return {
            success: true,
            messageId: data.messageId || data.id || 'sent',
          };
        }

        if (response.status === 409) {
          return {
            success: false,
            error: 'WhatsApp oturumu hazır değil. Lütfen bağlantı durumunu kontrol edin.',
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
    const candidatePaths = [
      `/sessions/${sessionId}/messages/send-document`,
      `/api/sessions/${sessionId}/messages/send-document`,
    ];

    const payload: Record<string, unknown> = {
      chatId,
      base64: base64Data,
      mimetype: 'application/pdf',
      filename: fileName,
    };
    if (caption) {
      payload.caption = caption;
    }

    for (const path of candidatePaths) {
      try {
        const response = await this.request(path, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          return {
            success: true,
            messageId: data.messageId || data.id || 'sent',
          };
        }

        if (response.status === 409) {
          return {
            success: false,
            error: 'WhatsApp oturumu hazır değil.',
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
