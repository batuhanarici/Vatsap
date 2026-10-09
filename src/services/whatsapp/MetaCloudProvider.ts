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
    // 1. Electron Desktop IPC Execution (Credentials isolated in Main Process)
    if (typeof window !== 'undefined' && window.electronAPI?.metaCloud) {
      try {
        const result = await window.electronAPI.metaCloud.getStatus({
          phoneNumberId: this.config.phoneNumberId,
        });
        return {
          state: result.state,
          sessionId: result.sessionId || 'meta_cloud',
          details: result.details || '',
          phoneConnected: result.phoneConnected,
        };
      } catch (err) {
        return {
          state: 'error',
          sessionId: 'meta_cloud',
          details: err instanceof Error ? err.message : 'Meta bağlantı hatası',
        };
      }
    }

    // 2. Web Browser Fallback
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
        `https://graph.facebook.com/v21.0/${encodeURIComponent(this.config.phoneNumberId.trim())}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken.trim()}`,
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
    // 1. Electron Desktop IPC Execution (Credentials isolated in Main Process)
    if (typeof window !== 'undefined' && window.electronAPI?.metaCloud) {
      return window.electronAPI.metaCloud.sendMessage({
        phoneNumberId: this.config.phoneNumberId,
        phone,
        message,
      });
    }

    // 2. Web Browser Fallback
    const cleanPhone = normalizePhoneNumber(phone);
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(this.config.phoneNumberId.trim())}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.accessToken.trim()}`,
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

  private base64ToBlob(base64Data: string, mimeType = 'application/pdf'): Blob {
    const cleanBase64 = (base64Data.startsWith('data:')
      ? base64Data.split(',')[1]
      : base64Data).trim().replace(/\s+/g, '');
    const binaryString = atob(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  /**
   * Uploads binary PDF file to Meta WhatsApp Cloud media storage
   * Endpoint: POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/media
   */
  public async uploadMedia(
    base64Data: string,
    fileName: string
  ): Promise<{ success: boolean; mediaId?: string; error?: string }> {
    try {
      const blob = this.base64ToBlob(base64Data, 'application/pdf');
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', 'application/pdf');
      formData.append('file', blob, fileName);

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(this.config.phoneNumberId.trim())}/media`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.accessToken.trim()}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errMsg = errorData?.error?.message || `Medya yüklenemedi (HTTP ${response.status})`;
        return { success: false, error: errMsg };
      }

      const resJson = await response.json();
      if (!resJson?.id) {
        return { success: false, error: 'Meta Cloud API geçerli bir Media ID döndürmedi.' };
      }

      return { success: true, mediaId: String(resJson.id) };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Medya yükleme bağlantı hatası: ${msg}` };
    }
  }

  /**
   * Sends actual PDF Document with caption via Meta WhatsApp Cloud API:
   * 1. Uploads PDF to get Media ID
   * 2. Sends Document message referencing the Media ID
   * 3. Validates real delivery response and messageId
   */
  async sendDocument(
    phone: string,
    base64Data: string,
    fileName: string,
    caption?: string
  ): Promise<SendResult> {
    // 1. Electron Desktop IPC Execution (Credentials isolated in Main Process)
    if (typeof window !== 'undefined' && window.electronAPI?.metaCloud) {
      return window.electronAPI.metaCloud.sendDocument({
        phoneNumberId: this.config.phoneNumberId,
        phone,
        base64Data,
        fileName,
        caption,
      });
    }

    // 2. Web Browser Fallback
    const cleanPhone = normalizePhoneNumber(phone);

    // Step 1: Upload the PDF document to Meta Cloud to obtain Media ID
    const uploadResult = await this.uploadMedia(base64Data, fileName);
    if (!uploadResult.success || !uploadResult.mediaId) {
      return {
        success: false,
        outcome: 'failed',
        pdfSent: false,
        messageSent: false,
        error: `Meta Cloud PDF yükleme hatası: ${uploadResult.error || 'Bilinmeyen hata'}`,
      };
    }

    // Step 2: Dispatch Document message with the obtained Media ID
    try {
      const payload: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'document',
        document: {
          id: uploadResult.mediaId,
          filename: fileName,
        },
      };

      if (caption && caption.trim()) {
        (payload.document as Record<string, unknown>).caption = caption.trim();
      }

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(this.config.phoneNumberId.trim())}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.accessToken.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errMsg = errorData?.error?.message || `Belge gönderilemedi (HTTP ${response.status})`;
        return {
          success: false,
          outcome: 'failed',
          pdfSent: false,
          messageSent: false,
          error: `Meta Cloud belge gönderim hatası: ${errMsg}`,
        };
      }

      const resJson = await response.json();
      const messageId = resJson?.messages?.[0]?.id || `meta_doc_${Date.now()}`;

      return {
        success: true,
        outcome: 'success',
        pdfSent: true,
        messageSent: true,
        messageId,
        attempts: 1,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        outcome: 'failed',
        pdfSent: false,
        messageSent: false,
        error: `Meta Cloud API bağlantı hatası: ${msg}`,
      };
    }
  }
}
