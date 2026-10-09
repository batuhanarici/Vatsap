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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
