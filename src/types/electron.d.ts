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

export interface ElectronSecureStorage {
  isAvailable: () => Promise<boolean>;
  encrypt: (plainText: string) => Promise<string>;
  decrypt: (cipherText: string) => Promise<string>;
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
  checkDockerHealth?: (options?: { baseUrl?: string; apiKey?: string }) => Promise<{
    success: boolean;
    diagnostic: ElectronDockerDiagnostic;
  }>;
  checkUpdate?: () => Promise<ElectronUpdateInfo>;
  installLaunchAgent?: () => Promise<{ success: boolean; plistPath?: string; error?: string }>;
  getLaunchAgentStatus?: () => Promise<{ isInstalled: boolean; plistPath?: string }>;
  secureStorage?: ElectronSecureStorage;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
