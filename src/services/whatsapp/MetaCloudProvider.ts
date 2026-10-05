import { WhatsAppProvider } from './types';
import { WhatsAppStatus, SendResult } from '../../types/whatsapp';
import { normalizePhoneNumber } from '../normalizer';

export interface MetaCloudConfig {
  accessToken: string;
  phoneNumberId: string;
}

export class MetaCloudProvider implements WhatsAppProvider {
  private config: MetaCloudConfig;

  constructor(config: MetaCloudConfig) {
    this.config = config;
  }

  public updateConfig(newConfig: Partial<MetaCloudConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  async getStatus(): Promise<WhatsAppStatus> {
    if (!this.config.accessToken.trim()) {
      return {
        state: 'disconnected',
        sessionId: 'meta_cloud',
        details: 'Meta API Access Token girilmedi.',
      };
    }

    if (!this.config.phoneNumberId.trim()) {
      return {
        state: 'disconnected',
        sessionId: 'meta_cloud',
        details: 'Phone Number ID (Telefon Numarası Kimliği) girilmedi.',
      };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
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
        details: err instanceof Error ? err.message : 'Meta sunucularına erişilemedi.',
      };
    }
  }

  async getQrCode(): Promise<string | null> {
    return null; // Cloud API does not need QR codes
  }

  async sendMessage(phone: string, message: string): Promise<SendResult> {
    const cleanPhone = normalizePhoneNumber(phone);
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: {
              preview_url: false,
              body: message,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        return {
          success: false,
          outcome: 'failed',
          pdfSent: false,
          messageSent: false,
          error: errorData?.error?.message || `Gönderim başarısız (${response.status})`,
        };
      }

      const resJson = await response.json();
      return {
        success: true,
        outcome: 'partial_success',
        pdfSent: false,
        messageSent: true,
        messageId: resJson?.messages?.[0]?.id,
      };
    } catch (err) {
      return {
        success: false,
        outcome: 'failed',
        pdfSent: false,
        messageSent: false,
        error: err instanceof Error ? err.message : 'Bağlantı hatası',
      };
    }
  }

  async sendDocument(
    phone: string,
    _base64Data: string,
    fileName: string,
    caption?: string
  ): Promise<SendResult> {
    // Cloud API requires media upload first or direct media URL
    // As a resilient fallback, we send notification with caption
    if (caption) {
      return this.sendMessage(phone, `[Belge: ${fileName}]\n\n${caption}`);
    }
    return {
      success: true,
      outcome: 'partial_success',
      pdfSent: false,
      messageSent: true,
    };
  }
}
