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

export interface OpenWAConfig {
  baseUrl: string; // e.g. http://localhost:2785/api
  apiKey: string;
  sessionId: string;
  autoStart: boolean;
}

export interface MessageTemplate {
  content: string;
}
