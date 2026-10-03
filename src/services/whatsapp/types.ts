import { WhatsAppStatus, SendResult } from '../../types/whatsapp';

export interface WhatsAppProvider {
  getStatus(): Promise<WhatsAppStatus>;
  getQrCode(): Promise<string | null>;
  createSession?(): Promise<boolean>;
  startSession?(): Promise<boolean>;
  sendMessage(phone: string, message: string): Promise<SendResult>;
  sendDocument(
    phone: string,
    base64Data: string,
    fileName: string,
    caption?: string
  ): Promise<SendResult>;
}
