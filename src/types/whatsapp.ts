export type WhatsAppConnectionState = 
  | 'connected' 
  | 'disconnected' 
  | 'starting' 
  | 'qr_ready' 
  | 'authenticating' 
  | 'error';

export interface WhatsAppStatus {
  state: WhatsAppConnectionState;
  sessionId: string;
  details?: string;
  qrCodeUrl?: string | null;
  phoneConnected?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type WhatsAppProviderType = 'whatsapp_web' | 'meta_cloud' | 'openwa' | 'mock';

export interface OpenWAConfig {
  providerType?: WhatsAppProviderType;
  baseUrl: string; // e.g. http://localhost:2785/api
  apiKey: string;
  sessionId: string;
  autoStart: boolean;
  metaToken?: string;
  metaPhoneNumberId?: string;
}

export interface MessageTemplate {
  content: string;
}
