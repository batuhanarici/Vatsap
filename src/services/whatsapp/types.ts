import { WhatsAppStatus, SendResult } from '../../types/whatsapp';

export interface WhatsAppProvider {
  getStatus(): Promise<WhatsAppStatus>;
  getQrCode(): Promise<string | null>;
  createSession?(sessionName?: string): Promise<{ success: boolean; sessionUuid?: string; error?: string }>;
  startSession?(sessionIdentifier?: string): Promise<{ success: boolean; error?: string }>;
  sendMessage(phone: string, message: string): Promise<SendResult>;
  sendDocument(
    phone: string,
    base64Data: string,
    fileName: string,
    caption?: string
  ): Promise<SendResult>;
}
