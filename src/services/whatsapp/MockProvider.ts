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
    await new Promise((r) => setTimeout(r, 200));
    const now = new Date().toLocaleTimeString('tr-TR');
    if (!this.isConnected) {
      return {
        state: 'disconnected',
        sessionId: 'test-session',
        sessionName: 'Simülasyon Oturumu',
        details: 'Test modu: WhatsApp bağlantısı kapalı.',
        lastCheckedAt: now,
      };
    }
    return {
      state: 'connected',
      sessionId: 'test-session',
      sessionName: 'Simülasyon Oturumu',
      details: 'Test modu: WhatsApp bağlı (Simülasyon).',
      phoneConnected: '+90 555 000 11 22',
      pushName: 'Test Öğretmen',
      lastCheckedAt: now,
    };
  }

  async getQrCode(): Promise<string | null> {
    await new Promise((r) => setTimeout(r, 200));
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';
  }

  async createSession(sessionName = 'default') {
    await new Promise((r) => setTimeout(r, 300));
    return { success: true, sessionUuid: `mock-uuid-${Date.now()}` };
  }

  async startSession() {
    await new Promise((r) => setTimeout(r, 300));
    return { success: true };
  }

  async sendMessage(phone: string, _message: string): Promise<SendResult> {
    await new Promise((r) => setTimeout(r, 400));
    if (!this.isConnected) {
      return {
        success: false,
        outcome: 'failed',
        messageSent: false,
        pdfSent: false,
        error: 'WhatsApp oturumu hazır değil.',
        attempts: 1,
      };
    }
    if (this.failRate > 0 && Math.random() < this.failRate) {
      return {
        success: false,
        outcome: 'failed',
        messageSent: false,
        pdfSent: false,
        error: 'Mesaj iletilemedi (Zaman aşımı).',
        attempts: 1,
      };
    }
    return {
      success: true,
      outcome: 'partial_success',
      messageSent: true,
      pdfSent: false,
      messageId: `mock_msg_${Date.now()}_${phone}`,
      attempts: 1,
    };
  }

  async sendDocument(
    phone: string,
    _base64Data: string,
    _fileName: string,
    _caption?: string
  ): Promise<SendResult> {
    await new Promise((r) => setTimeout(r, 500));
    if (!this.isConnected) {
      return {
        success: false,
        outcome: 'failed',
        messageSent: false,
        pdfSent: false,
        error: 'WhatsApp oturumu hazır değil.',
        attempts: 1,
      };
    }
    if (this.failRate > 0 && Math.random() < this.failRate) {
      return {
        success: false,
        outcome: 'failed',
        messageSent: false,
        pdfSent: false,
        error: 'PDF belgesi yüklenemedi.',
        attempts: 1,
      };
    }
    return {
      success: true,
      outcome: 'success',
      messageSent: true,
      pdfSent: true,
      messageId: `mock_doc_${Date.now()}_${phone}`,
      attempts: 1,
    };
  }
}
