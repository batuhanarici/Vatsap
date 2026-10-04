import { WhatsAppProvider } from './types';
import { WhatsAppStatus, SendResult } from '../../types/whatsapp';
import { normalizePhoneNumber } from '../normalizer';
import * as pdfjsLib from 'pdfjs-dist';

export class WhatsAppWebProvider implements WhatsAppProvider {
  async getStatus(): Promise<WhatsAppStatus> {
    return {
      state: 'connected',
      sessionId: 'web_session',
      details: 'WhatsApp Web Modu Aktif — Mesaj ve karne doğrudan WhatsApp sohbetine aktarılır.',
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

  /**
   * Sends the report card PDF to the WhatsApp message:
   * 1. Copies the report card document/image to the system clipboard so it can be pasted with Cmd+V / Ctrl+V
   * 2. Opens WhatsApp Web directly addressed to the parent's phone with the complete message text
   * 3. NEVER downloads the PDF to the teacher's computer!
   */
  async sendDocument(
    phone: string,
    base64Data: string,
    fileName: string,
    caption?: string
  ): Promise<SendResult> {
    const cleanPhone = normalizePhoneNumber(phone);

    // 1. Prepare message text to send in the WhatsApp message
    const messageToSend = caption
      ? `${caption}\n\n📎 Ekli Belge: ${fileName}`
      : `Sayın Velimiz, öğrenci karnesi ekte bilgilerinize sunulmuştur.\n\n📎 Belge: ${fileName}`;

    // 2. Put the report card into clipboard so that Cmd+V / Ctrl+V in WhatsApp Web pastes it directly into the chat
    try {
      await this.copyKarneToClipboard(base64Data, fileName);
    } catch {
      // Best-effort clipboard copy
    }

    // 3. Open WhatsApp Web with the parent's phone and message text
    const encodedText = encodeURIComponent(messageToSend);
    const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

    try {
      const win = window.open(url, '_blank');
      if (!win) {
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

  private async copyKarneToClipboard(base64Data: string, fileName: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return false;
    }

    try {
      const byteCharacters = atob(base64Data);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }

      // Try rendering first page of PDF as image/png for seamless pasting into WhatsApp Web
      try {
        const loadingTask = pdfjsLib.getDocument({ data: byteArray });
        const pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const imageBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/png')
          );
          if (imageBlob && typeof ClipboardItem !== 'undefined') {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': imageBlob }),
            ]);
            return true;
          }
        }
      } catch {
        // Fallback to pdf blob
      }

      // Fallback: copy as pdf blob or file if supported
      const pdfBlob = new Blob([byteArray], { type: 'application/pdf' });
      if (typeof ClipboardItem !== 'undefined') {
        const item = new ClipboardItem({ 'application/pdf': pdfBlob });
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch (err) {
      console.warn('Clipboard write fallback error:', err);
    }
    return false;
  }
}
