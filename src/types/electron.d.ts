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

export interface ElectronAPI {
  isElectron: boolean;
  openDirectoryDialog: () => Promise<{
    folderPath: string;
    pdfFiles: Array<{ name: string; path: string; size: number; lastModified?: number }>;
  } | null>;
  readPdfBase64: (filePath: string) => Promise<string>;
  requestOpenWA: <T = unknown>(options: OpenWARequestOptions) => Promise<OpenWAResponse<T>>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
