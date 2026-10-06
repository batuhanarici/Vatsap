export type WhatsAppConnectionState = 
  | 'checking'
  | 'connected' 
  | 'disconnected' 
  | 'starting' 
  | 'qr_ready' 
  | 'authenticating' 
  | 'error';

export interface WhatsAppStatus {
  state: WhatsAppConnectionState;
  sessionId: string;
  sessionName?: string;
  sessionUuid?: string;
  details?: string;
  qrCodeUrl?: string | null;
  phoneConnected?: string;
  pushName?: string;
  lastCheckedAt?: string;
  lastErrorAt?: string;
  httpStatus?: number;
}

export type SendOutcome = 'success' | 'partial_success' | 'failed' | 'cancelled' | 'retrying';

export interface SendResult {
  success: boolean;
  outcome: SendOutcome;
  messageId?: string;
  pdfSent: boolean;
  messageSent: boolean;
  error?: string;
  attempts?: number;
}

export type WhatsAppProviderType = 'openwa' | 'whatsapp_web' | 'meta_cloud' | 'mock';

export interface OpenWAConfig {
  providerType: WhatsAppProviderType;
  baseUrl: string; // Default: 'http://127.0.0.1:2785/api'
  apiKey: string;
  sessionId: string;
  sessionUuid?: string;
  autoStart: boolean;
  delaySeconds: number;
  testPhone: string;
  schoolName?: string;
  examName?: string;
  metaToken?: string;
  metaPhoneNumberId?: string;
  maxRetries?: number;
  retryDelaySeconds?: number;
}

export interface MessageTemplate {
  content: string;
}
