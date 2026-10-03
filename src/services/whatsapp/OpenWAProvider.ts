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

  private get headers(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    }
    return headers;
  }

  private formatChatId(phone: string): string {
    const cleanPhone = normalizePhoneNumber(phone);
    return `${cleanPhone}@c.us`;
  }

  /**
   * Checks the status of the current session on OpenWA
   */
  async getStatus(): Promise<WhatsAppStatus> {
    const url = `${this.config.baseUrl}/sessions/${this.config.sessionId}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            state: 'disconnected',
            sessionId: this.config.sessionId,
            details: 'Oturum bulunamadı. Yeni bir oturum başlatılması gerekiyor.'
          };
        }
        if (response.status === 401) {
          return {
            state: 'error',
            sessionId: this.config.sessionId,
            details: 'OpenWA API anahtarı geçersiz veya yetersiz rol.'
          };
        }
        return {
          state: 'error',
          sessionId: this.config.sessionId,
          details: `OpenWA yanıt vermedi (HTTP ${response.status}).`
        };
      }

      const data = await response.json();
      const statusValue = (data.status || '').toLowerCase();

      switch (statusValue) {
        case 'ready':
          return {
            state: 'connected',
            sessionId: this.config.sessionId,
            details: 'WhatsApp bağlı ve gönderime hazır.',
            phoneConnected: data.phone || data.user
          };
        case 'qr_ready':
          return {
            state: 'qr_ready',
            sessionId: this.config.sessionId,
            details: 'QR kod hazır, taranması bekleniyor.',
            qrCodeUrl: data.qr || null
          };
        case 'initializing':
        case 'created':
          return {
            state: 'starting',
            sessionId: this.config.sessionId,
            details: 'WhatsApp motoru başlatılıyor...'
          };
        case 'authenticating':
          return {
            state: 'authenticating',
            sessionId: this.config.sessionId,
            details: 'QR tarandı, oturum doğrulanıyor...'
          };
        default:
          return {
            state: 'disconnected',
            sessionId: this.config.sessionId,
            details: `Oturum durumu: ${statusValue || 'Bilinmiyor'}`
          };
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        state: 'disconnected',
        sessionId: this.config.sessionId,
        details: errorMsg.includes('Failed to fetch') || errorMsg.includes('timeout')
          ? 'OpenWA servisine bağlanılamadı. Docker veya OpenWA servisinin çalıştığından emin olun.'
          : 'Bağlantı hatası oluştu.'
      };
    }
  }

  /**
   * Retrieves the QR code for authenticating the WhatsApp session
   */
  async getQrCode(): Promise<string | null> {
    const url = `${this.config.baseUrl}/sessions/${this.config.sessionId}/qr`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      // data.qr can be data:image/png;base64,... or raw string
      return data.qr || data.qrCode || null;
    } catch {
      return null;
    }
  }

  /**
   * Creates a session if not already existing
   */
  async createSession(): Promise<boolean> {
    const url = `${this.config.baseUrl}/sessions`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          sessionId: this.config.sessionId
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Starts a created session
   */
  async startSession(): Promise<boolean> {
    const url = `${this.config.baseUrl}/sessions/${this.config.sessionId}/start`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Sends a plain text message to a recipient
   */
  async sendMessage(phone: string, message: string): Promise<SendResult> {
    const chatId = this.formatChatId(phone);
    const url = `${this.config.baseUrl}/sessions/${this.config.sessionId}/messages/send-text`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          chatId,
          text: message
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        if (response.status === 409) {
          return {
            success: false,
            error: 'WhatsApp oturumu hazır değil. Lütfen bağlantı durumunu kontrol edin.'
          };
        }
        if (response.status === 401) {
          return {
            success: false,
            error: 'API anahtarı yetkisiz veya süresi dolmuş.'
          };
        }
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.message || `Metin mesajı gönderilemedi (HTTP ${response.status}).`
        };
      }

      const data = await response.json().catch(() => ({}));
      return {
        success: true,
        messageId: data.messageId || data.id || 'sent'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: msg.includes('timeout') ? 'Zaman aşımı: OpenWA yanıt vermedi.' : 'OpenWA bağlantı hatası.'
      };
    }
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
    const url = `${this.config.baseUrl}/sessions/${this.config.sessionId}/messages/send-document`;

    try {
      const payload: Record<string, unknown> = {
        chatId,
        base64: base64Data,
        mimetype: 'application/pdf',
        filename: fileName
      };

      if (caption) {
        payload.caption = caption;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) {
        if (response.status === 409) {
          return {
            success: false,
            error: 'WhatsApp oturumu hazır değil.'
          };
        }
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.message || `PDF gönderilemedi (HTTP ${response.status}).`
        };
      }

      const data = await response.json().catch(() => ({}));
      return {
        success: true,
        messageId: data.messageId || data.id || 'sent'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: msg.includes('timeout') ? 'Zaman aşımı: PDF yüklenemedi.' : 'PDF gönderme hatası.'
      };
    }
  }
}
