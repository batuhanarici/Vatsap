import { WhatsAppProvider } from './types';
import { WhatsAppStatus, SendResult } from '../../types/whatsapp';

export class MockWhatsAppProvider implements WhatsAppProvider {
  private isConnected: boolean = true;
  private failRate: number = 0; // 0 = always succeed, 0.2 = 20% fail for testing error state

  constructor(initialConnected = true) {
    this.isConnected = initialConnected;
  }

  setConnected(state: boolean) {
    this.isConnected = state;
  }

  setFailRate(rate: number) {
    this.failRate = rate;
  }

  async getStatus(): Promise<WhatsAppStatus> {
    await new Promise(r => setTimeout(r, 400));
    if (!this.isConnected) {
      return {
        state: 'disconnected',
        sessionId: 'test-session',
        details: 'Test modu: WhatsApp bağlantısı kapalı.'
      };
    }
    return {
      state: 'connected',
      sessionId: 'test-session',
      details: 'Test modu: WhatsApp bağlı (Simülasyon).',
      phoneConnected: '905550001122'
    };
  }

  async getQrCode(): Promise<string | null> {
    await new Promise(r => setTimeout(r, 300));
    // Sample QR SVG/data
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';
  }

  async sendMessage(phone: string, _message: string): Promise<SendResult> {
    await new Promise(r => setTimeout(r, 700));
    if (!this.isConnected) {
      return { success: false, error: 'WhatsApp oturumu hazır değil.' };
    }
    if (this.failRate > 0 && Math.random() < this.failRate) {
      return { success: false, error: 'Mesaj iletilemedi (Zaman aşımı).' };
    }
    return { success: true, messageId: `mock_msg_${Date.now()}_${phone}` };
  }

  async sendDocument(
    phone: string,
    _base64Data: string,
    _fileName: string,
    _caption?: string
  ): Promise<SendResult> {
    await new Promise(r => setTimeout(r, 1000));
    if (!this.isConnected) {
      return { success: false, error: 'WhatsApp oturumu hazır değil.' };
    }
    if (this.failRate > 0 && Math.random() < this.failRate) {
      return { success: false, error: 'PDF belgesi yüklenemedi.' };
    }
    return { success: true, messageId: `mock_doc_${Date.now()}_${phone}` };
  }
}
