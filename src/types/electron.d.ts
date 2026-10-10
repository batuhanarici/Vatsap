export interface OpenWARequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  timeoutMs?: number;
}

export interface OpenWAResponse<T = unknown> {
  ok: boolean;
  status: number;
  statusText?: string;
  data?: T;
  error?: string;
}

export interface ElectronCredentialsAPI {
  isAvailable: () => Promise<boolean>;
  hasOpenWAKey: () => Promise<boolean>;
  saveOpenWAKey: (key: string) => Promise<{ success: boolean; saved: boolean }>;
  deleteOpenWAKey: () => Promise<{ success: boolean; deleted: boolean }>;
  hasMetaAccessToken: () => Promise<boolean>;
  saveMetaAccessToken: (token: string) => Promise<{ success: boolean; saved: boolean }>;
  deleteMetaAccessToken: () => Promise<{ success: boolean; deleted: boolean }>;
  migrateLegacy: (payload: { encryptedOpenWaKey?: string | null; encryptedMetaToken?: string | null }) => Promise<{
    success: boolean;
    migratedOpenWa: boolean;
    migratedMeta: boolean;
  }>;
}

export interface ElectronMetaCloudAPI {
  getStatus: (options: { phoneNumberId: string }) => Promise<{
    state: 'connected' | 'disconnected' | 'error';
    sessionId?: string;
    details?: string;
    phoneConnected?: string;
  }>;
  sendMessage: (options: {
    phoneNumberId: string;
    phone: string;
    message: string;
  }) => Promise<{
    success: boolean;
    outcome: 'success' | 'partial_success' | 'failed' | 'cancelled' | 'retrying';
    pdfSent: boolean;
    messageSent: boolean;
    messageId?: string;
    error?: string;
  }>;
  sendDocument: (options: {
    phoneNumberId: string;
    phone: string;
    base64Data: string;
    fileName: string;
    caption?: string;
  }) => Promise<{
    success: boolean;
    outcome: 'success' | 'partial_success' | 'failed' | 'cancelled' | 'retrying';
    pdfSent: boolean;
    messageSent: boolean;
    messageId?: string;
    error?: string;
  }>;
}

export interface ElectronDockerDiagnostic {
  dockerInstalled: boolean;
  dockerRunning: boolean;
  containerRunning: boolean;
  containerName: string;
  portOpen: boolean;
  apiKeyValid: boolean;
  sessionReady: boolean;
  checkedAt: string;
  stepNotes: string[];
}

export interface ElectronUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseNotes: string;
  releaseDate?: string;
  downloads: {
    appleSilicon: string;
    intelMac: string;
    universalMac: string;
  };
}

export interface ElectronDispatchReserveParams {
  studentId: string;
  studentName: string;
  phone: string;
  examName: string;
  pdfName: string;
  pdfPath?: string;
  pdfBase64?: string;
  provider: string;
  id?: string;
}

export interface ElectronDispatchReserveResult {
  success: boolean;
  allowed: boolean;
  code?: 'ALREADY_SENT' | 'IN_PROGRESS' | 'UNKNOWN_DELIVERY' | string;
  reason?: string;
  dispatchKey?: string;
  pdfSha256?: string;
  isRetry?: boolean;
  dispatch?: any;
  existing?: any;
  error?: string;
}

export interface ElectronDispatchRecord {
  id: string;
  dispatch_key: string;
  student_id: string;
  student_name: string;
  phone: string;
  exam_name: string;
  pdf_name: string;
  pdf_sha256: string;
  provider: string;
  provider_message_id?: string | null;
  status: 'pending' | 'sending' | 'sent' | 'delivered' | 'failed' | 'unknown';
  retry_count: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ElectronDispatchSendRequest {
  studentId: string;
  studentName: string;
  phone: string;
  examName: string;
  pdfName: string;
  pdfPath?: string;
  pdfBase64?: string;
  provider?: string;
  caption?: string;
  messageText?: string;
  confirmationToken?: string;
  openwaConfig?: { baseUrl?: string; sessionId?: string };
  metaConfig?: { phoneNumberId?: string };
  mockShouldTimeout?: boolean;
  mockShouldReject?: boolean;
  mockShouldFail?: boolean;
}

export interface ElectronDispatchSendResult {
  success: boolean;
  allowed?: boolean;
  outcome?: 'success' | 'unknown' | 'failed' | 'db_error';
  dispatchKey?: string;
  status?: string;
  messageId?: string | null;
  pdfSent?: boolean;
  messageSent?: boolean;
  code?: string;
  reason?: string;
  error?: string;
  existing?: ElectronDispatchRecord | null;
}

export interface ElectronDispatchAPI {
  send: (request: ElectronDispatchSendRequest) => Promise<ElectronDispatchSendResult>;
  reserve: (
    params: ElectronDispatchReserveParams,
    options?: { confirmationToken?: string; allowUnknownRetry?: boolean }
  ) => Promise<ElectronDispatchReserveResult>;
  createUnknownRetryToken: (dispatchKey: string) => Promise<{
    success: boolean;
    token?: string;
    expiresAt?: number;
    dispatchKey?: string;
    warning?: string;
    error?: string;
  }>;
  updateStatus: (
    dispatchKey: string,
    status: 'pending' | 'sending' | 'sent' | 'delivered' | 'failed' | 'unknown',
    extra?: {
      provider_message_id?: string | null;
      retry_count?: number;
      last_error?: string | null;
      delivery_proof?: string | null;
    }
  ) => Promise<{ success: boolean; dispatch?: ElectronDispatchRecord; error?: string }>;
  getByKey: (dispatchKey: string) => Promise<ElectronDispatchRecord | null>;
  getByExam: (examName: string) => Promise<ElectronDispatchRecord[]>;
  getByStatus: (status: string) => Promise<ElectronDispatchRecord[]>;
  computeKey: (payload: {
    studentId: string;
    examName: string;
    phone: string;
    pdfSha256: string;
  }) => Promise<string>;
}

export interface ElectronAPI {
  isElectron: boolean;
  openDirectoryDialog: () => Promise<{
    folderPath: string;
    pdfFiles: Array<{ name: string; path: string; size: number; lastModified?: number }>;
  } | null>;
  readPdfBase64: (filePath: string) => Promise<string>;
  requestOpenWA: <T = unknown>(options: OpenWARequestOptions) => Promise<OpenWAResponse<T>>;
  checkDockerHealth?: (options?: { baseUrl?: string }) => Promise<{
    success: boolean;
    diagnostic: ElectronDockerDiagnostic;
  }>;
  checkUpdate?: () => Promise<ElectronUpdateInfo>;
  installLaunchAgent?: () => Promise<{ success: boolean; plistPath?: string; error?: string }>;
  getLaunchAgentStatus?: () => Promise<{ isInstalled: boolean; plistPath?: string }>;
  credentials?: ElectronCredentialsAPI;
  metaCloud?: ElectronMetaCloudAPI;
  dispatch?: ElectronDispatchAPI;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
