import { WhatsAppProvider } from './types';
import { WhatsAppStatus, SendResult } from '../../types/whatsapp';
import { normalizePhoneNumber } from '../normalizer';

export class WhatsAppWebProvider implements WhatsAppProvider {
  async getStatus(): Promise<WhatsAppStatus> {
    return {
      state: 'connected',
      sessionId: 'web_session',
      details: 'WhatsApp Web Modu Aktif — API anahtarı veya sunucu gerekmez.',
      phoneConnected: 'Tarayıcı / WhatsApp Web',
    };
  }

  async getQrCode(): Promise<string | null> {
    return null;
  }

  async sendMessage(phone: string, message: string): Promise<SendResult> {
    const cleanPhone = normalizePhoneNumber(phone);
    const encodedText = encodeURIComponent(message);
    const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

    try {
      const win = window.open(url, '_blank');
      if (!win) {
        // Fallback for pop-up blocker
        window.location.href = url;
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'WhatsApp Web penceresi açılamadı.',
      };
    }
  }

  async sendDocument(
    phone: string,
    base64Data: string,
    fileName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _caption?: string
  ): Promise<SendResult> {
    // Note: WhatsApp Web URL scheme does not allow direct file attachments via URL for security reasons.
    // We offer a quick trigger so the user can drop or download the matched PDF.
    try {
      // Create a downloadable blob so user can drag-and-drop into chat if needed
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      // Auto-trigger download if desired or return success
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(blobUrl);

      return { success: true };
    } catch {
      return { success: true };
    }
  }
}
