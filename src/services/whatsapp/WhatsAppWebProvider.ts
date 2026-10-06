import { WhatsAppProvider } from './types';
import { WhatsAppStatus, SendResult } from '../../types/whatsapp';
import { normalizePhoneNumber } from '../normalizer';
import * as pdfjsLib from 'pdfjs-dist';

export class WhatsAppWebProvider implements WhatsAppProvider {
  async getStatus(): Promise<WhatsAppStatus> {
    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return {
      state: 'connected',
      sessionId: 'web_session',
      sessionName: 'WhatsApp Web (Yardımlı Gönderim)',
      details:
        'WhatsApp Web Yardımlı Gönderim — Tarayıcıda veli sohbeti ve taslak mesaj açılır. Web tarayıcısı üzerinden PDF otomatik gönderilemez; belgenin manuel olarak sohbete sürüklenmesi gerekir.',
      phoneConnected: 'WhatsApp Web (Yardımlı Mod)',
      lastCheckedAt: now,
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
        window.location.href = url;
      }
      return {
        success: false, // Sekme açıldı ancak WhatsApp Web üzerinden gerçek gönderim doğrulanamaz
        outcome: 'partial_success',
        messageSent: false,
        pdfSent: false,
        error: 'WhatsApp Web sohbet sekmesi açıldı. Gönder butonuna manuel basılması gereklidir.',
        attempts: 1,
      };
    } catch (err) {
      return {
        success: false,
        outcome: 'failed',
        messageSent: false,
        pdfSent: false,
        error: err instanceof Error ? err.message : 'WhatsApp Web penceresi açılamadı.',
        attempts: 1,
      };
    }
  }

  /**
   * WhatsApp Web Yardımlı Gönderim:
   * 1. Karnenin ilk sayfasını panoya kopyalar (Cmd+V / Ctrl+V için)
   * 2. Velinin WhatsApp sohbetini mesaj metni doldurulmuş olarak açar
   * 3. PDF'nin sohbete iliştirilmesi kullanıcı yardımıyla tamamlanır
   * Not: Tarayıcı güvenlik kısıtlamaları nedeniyle web linki üzerinden PDF otomatik gönderilemez.
   */
  async sendDocument(
    phone: string,
    base64Data: string,
    fileName: string,
    caption?: string
  ): Promise<SendResult> {
    const cleanPhone = normalizePhoneNumber(phone);
    const messageToSend = caption || 'Sayın Velimiz, öğrenci karnesi ekte bilgilerinize sunulmuştur.';

    // Try copying to clipboard for quick paste
    try {
      await this.copyKarneToClipboard(base64Data, fileName);
    } catch {
      // Best-effort
    }

    const encodedText = encodeURIComponent(messageToSend);
    const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

    try {
      const win = window.open(url, '_blank');
      if (!win) {
        window.location.href = url;
      }
      // DİKKAT: WhatsApp Web otomatik PDF gönderemez. Kullanıcıya açıkça bildirilir.
      return {
        success: false, // Gerçek başarı değildir; PDF iletilemedi
        outcome: 'partial_success',
        messageSent: false,
        pdfSent: false,
        error: `WhatsApp Web üzerinden PDF otomatik gönderilemez. Sohbet sekmesi açıldı; lütfen "${fileName}" karnesini sohbete manuel ekleyiniz.`,
        attempts: 1,
      };
    } catch (err) {
      return {
        success: false,
        outcome: 'failed',
        messageSent: false,
        pdfSent: false,
        error: err instanceof Error ? err.message : 'WhatsApp Web penceresi açılamadı.',
        attempts: 1,
      };
    }
  }

  private async copyKarneToClipboard(base64Data: string, _fileName: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return false;
    }

    try {
      const cleanBase64 = base64Data.startsWith('data:') ? base64Data.split(',')[1] : base64Data;
      const byteCharacters = atob(cleanBase64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }

      const loadingTask = pdfjsLib.getDocument({ data: byteArray });
      const pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      // Render to canvas
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      } as any);
      await renderTask.promise;

      // Convert to blob and copy PNG to clipboard
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );

      if (blob && typeof ClipboardItem !== 'undefined') {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch {
      // Non-fatal
    }
    return false;
  }
}
