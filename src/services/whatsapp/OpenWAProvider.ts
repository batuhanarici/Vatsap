import { WhatsAppProvider } from './types';
import { WhatsAppStatus, SendResult, OpenWAConfig } from '../../types/whatsapp';
import { normalizePhoneNumber } from '../normalizer';

/**
 * Normalizes OpenWA base URL to a clean format ending in `/api` without trailing slashes.
 * Supports:
 * - 'http://localhost:2785' -> 'http://localhost:2785/api'
 * - 'http://localhost:2785/api' -> 'http://localhost:2785/api'
 * - 'http://127.0.0.1:2785' -> 'http://127.0.0.1:2785/api'
 * - 'http://127.0.0.1:2785/api' -> 'http://127.0.0.1:2785/api'
 * - 'http://127.0.0.1:2785/api/' -> 'http://127.0.0.1:2785/api'
 * - '127.0.0.1:2785' -> 'http://127.0.0.1:2785/api'
 * - 'localhost:2785' -> 'http://localhost:2785/api'
 * - 'localhost:2785/api' -> 'http://localhost:2785/api'
 */
export function normalizeOpenWaBaseUrl(raw?: string): string {
  let trimmed = (raw || 'http://127.0.0.1:2785/api').trim();
  if (!trimmed) {
    trimmed = 'http://127.0.0.1:2785/api';
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = `http://${trimmed}`;
  }
  trimmed = trimmed.replace(/\/+$/, '');
  const withoutApi = trimmed.replace(/\/api$/i, '');
  return `${withoutApi}/api`;
}

/**
 * Masks API Key so sensitive credentials never appear in UI errors or console logs.
 */
export function maskApiKey(key?: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 6) return '***';
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
}

interface TimeoutController {
  signal: AbortSignal;
  cleanup: () => void;
}

function createTimeout(ms: number): TimeoutController {
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort(new Error(`Zaman aşımı: Sunucu ${ms}ms içinde yanıt vermedi.`));
  }, ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(id),
  };
}

export class OpenWAProvider implements WhatsAppProvider {
  private config: OpenWAConfig;

  constructor(config: OpenWAConfig) {
    this.config = {
      ...config,
      baseUrl: normalizeOpenWaBaseUrl(config.baseUrl),
    };
  }

  public updateConfig(newConfig: Partial<OpenWAConfig>) {
    this.config = {
      ...this.config,
      ...newConfig,
      baseUrl: normalizeOpenWaBaseUrl(newConfig.baseUrl || this.config.baseUrl),
    };
  }

  public getConfig(): OpenWAConfig {
    return { ...this.config };
  }

  public get apiUrl(): string {
    return normalizeOpenWaBaseUrl(this.config.baseUrl);
  }

  /**
   * The effective session identifier: prefers sessionUuid if set, otherwise sessionId.
   */
  public get effectiveSessionId(): string {
    return (this.config.sessionUuid || this.config.sessionId || 'default').trim();
  }

  private formatChatId(phone: string): string {
    const cleanPhone = normalizePhoneNumber(phone);
    return `${cleanPhone}@c.us`;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // V2 Electron Security Policy: In Electron Desktop environment, credentials are
    // isolated in Main Process CredentialService. Renderer never sends X-API-Key or api-key headers.
    return headers;
  }

  /**
   * Safe fetch with standard OpenWA error parser, Electron IPC detection, and fallback proxy support.
   */
  private async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs = 10000
  ): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
    // Prevent duplicate /api/api/... paths
    const safeEndpoint = endpoint.replace(/^\/api(?=\/|$)/i, '').replace(/^\/?/, '/');
    const url = `${this.apiUrl}${safeEndpoint}`;
    const headers = {
      ...this.getHeaders(),
      ...((options.headers as Record<string, string>) || {}),
    };

    // 1. Electron Desktop IPC Execution (Zero CORS, native macOS network access directly to Docker)
    if (typeof window !== 'undefined' && window.electronAPI?.requestOpenWA) {
      try {
        // In Electron desktop mode, secrets are isolated in Main Process; Renderer does not pass authentication headers
        const sanitizedHeadersForIpc: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...((options.headers as Record<string, string>) || {}),
        };
        delete sanitizedHeadersForIpc['X-API-Key'];
        delete sanitizedHeadersForIpc['api-key'];
        delete sanitizedHeadersForIpc['Authorization'];

        const ipcResult = await window.electronAPI.requestOpenWA<T>({
          url,
          method: options.method || 'GET',
          headers: sanitizedHeadersForIpc,
          body: options.body as string | undefined,
          timeoutMs,
        });

        if (ipcResult.ok) {
          return {
            ok: true,
            status: ipcResult.status,
            data: ipcResult.data,
          };
        }

        return {
          ok: false,
          status: ipcResult.status,
          data: ipcResult.data,
          error: this.formatErrorMessage(ipcResult.status, safeEndpoint, ipcResult.data, ipcResult.error),
        };
      } catch (err: unknown) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          status: 0,
          error: this.formatNetworkError(rawMsg, timeoutMs),
        };
      }
    }

    // 2. Web Browser Execution (Checks HTTPS Mixed Content / CORS)
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isLocalDockerTarget = url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost');

    // If browser is on HTTPS and target is HTTP localhost/docker, route through server proxy to prevent Mixed Content
    let requestUrl = url;
    let requestHeaders = { ...headers };

    if (isHttps && isLocalDockerTarget) {
      requestUrl = `/api/openwa-proxy?url=${encodeURIComponent(url)}`;
    }

    const { signal, cleanup } = createTimeout(timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(requestUrl, {
          ...options,
          headers: requestHeaders,
          signal,
        });
      } catch (fetchErr: unknown) {
        // If direct fetch failed in web browser (CORS / network), try fallback proxy if not tried yet
        if (!requestUrl.startsWith('/api/openwa-proxy')) {
          const proxyUrl = `/api/openwa-proxy?url=${encodeURIComponent(url)}`;
          response = await fetch(proxyUrl, {
            ...options,
            headers: requestHeaders,
            signal,
          });
        } else {
          throw fetchErr;
        }
      }

      cleanup();

      let parsedData: T | undefined;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          parsedData = await response.json();
        } catch {
          // ignore
        }
      } else {
        const text = await response.text().catch(() => '');
        if (text) {
          try {
            parsedData = JSON.parse(text);
          } catch {
            // ignore
          }
        }
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data: parsedData,
          error: this.formatErrorMessage(response.status, safeEndpoint, parsedData, response.statusText),
        };
      }

      return {
        ok: true,
        status: response.status,
        data: parsedData,
      };
    } catch (err: unknown) {
      cleanup();
      const rawMsg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        error: this.formatNetworkError(rawMsg, timeoutMs),
      };
    }
  }

  private formatErrorMessage(
    status: number,
    endpoint: string,
    data?: unknown,
    fallbackText?: string
  ): string {
    const dataObj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
    const detail = (dataObj?.message || dataObj?.error || dataObj?.details || fallbackText || '') as string;

    if (status === 401) {
      return 'API Anahtarı geçersiz veya yetkisiz (401 Unauthorized). Lütfen Ayarlar bölümünden OpenWA API Key\'i kontrol edin.';
    }

    if (status === 403) {
      return 'Yetkisiz erişim (403 Forbidden). API anahtarının yeterli yetkisi bulunmuyor.';
    }

    if (status === 404) {
      if (endpoint.includes('/sessions/')) {
        return `Oturum bulunamadı (404 Not Found): "${this.config.sessionId}" isimli oturum OpenWA üzerinde henüz oluşturulmamış. "Oturum Başlat" butonuna tıklayarak başlatabilirsiniz.`;
      }
      return `İstenen OpenWA endpoint'i bulunamadı (404 Not Found): ${endpoint}`;
    }

    if (status === 409) {
      return 'WhatsApp oturumu henüz hazır değil veya çakışma var (409 Conflict). Birkaç saniye sonra tekrar deneyin.';
    }

    if (status === 400) {
      return `Geçersiz istek parametresi (400 Bad Request): ${detail || 'İstek formatını kontrol edin.'}`;
    }

    if (status >= 500) {
      return `OpenWA sunucu hatası (HTTP ${status}): ${detail || 'Sunucu içi hata meydana geldi.'}`;
    }

    return detail ? `OpenWA Hatası (${status}): ${detail}` : `Sunucu yanıt kodu: ${status}`;
  }

  private formatNetworkError(rawMsg: string, timeoutMs: number): string {
    if (
      rawMsg.includes('Zaman aşımı') ||
      rawMsg.includes('timeout') ||
      rawMsg.includes('aborted') ||
      rawMsg.includes('AbortError')
    ) {
      return `OpenWA sunucusu ${timeoutMs}ms içinde yanıt vermedi (Zaman aşımı). Sunucu meşgul veya kilitlenmiş olabilir.`;
    }
    return `OpenWA servisine (${this.apiUrl}) ulaşılamadı. Docker konteynerinin çalıştığından ve 2785 portunun açık olduğundan emin olun. (${rawMsg})`;
  }

  /**
   * Checks the status of the current session on OpenWA.
   * If direct session lookup returns 404, it queries /sessions to see if the session exists
   * under a server-generated UUID or matching name.
   */
  async getStatus(): Promise<WhatsAppStatus> {
    const sessionKey = this.effectiveSessionId;
    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // 1. Query individual session endpoint
    const result = await this.request<Record<string, unknown>>(`/sessions/${encodeURIComponent(sessionKey)}`, {
      method: 'GET',
    });

    // 2. If 404, query the sessions list to find if it exists with alternative ID or human name
    if (result.status === 404) {
      const listResult = await this.request<Array<Record<string, unknown>>>('/sessions', {
        method: 'GET',
      });

      if (listResult.ok && Array.isArray(listResult.data)) {
        const found = listResult.data.find(
          (s) =>
            s.id === this.config.sessionId ||
            s.name === this.config.sessionId ||
            s.sessionId === this.config.sessionId ||
            (this.config.sessionUuid && (s.id === this.config.sessionUuid || s.name === this.config.sessionUuid))
        );

        if (found) {
          const uuid = (found.id as string) || (found.uuid as string);
          if (uuid && uuid !== this.config.sessionUuid) {
            this.config.sessionUuid = uuid;
          }
          return this.parseSessionData(found, uuid || sessionKey, listResult.status, now);
        }

        // Sessions list succeeded, but this session is definitely NOT created yet
        return {
          state: 'disconnected',
          sessionId: this.config.sessionId || 'default',
          sessionName: this.config.sessionId,
          sessionUuid: this.config.sessionUuid,
          details: `"${this.config.sessionId || 'default'}" oturumu OpenWA üzerinde henüz oluşturulmamış. Ayarlar penceresinden "Oturum Başlat" butonuna tıklayabilirsiniz.`,
          httpStatus: 404,
          lastCheckedAt: now,
          lastErrorAt: now,
        };
      }
    }

    if (!result.ok) {
      return {
        state: 'disconnected',
        sessionId: sessionKey,
        sessionName: this.config.sessionId,
        sessionUuid: this.config.sessionUuid,
        details: result.error || 'Bağlantı sağlanamadı.',
        httpStatus: result.status,
        lastCheckedAt: now,
        lastErrorAt: now,
      };
    }

    return this.parseSessionData(result.data || {}, sessionKey, result.status, now);
  }

  private parseSessionData(
    data: Record<string, unknown>,
    sessionKey: string,
    httpStatus: number,
    now: string
  ): WhatsAppStatus {
    const statusRaw = String(data.status || data.state || '').toLowerCase();
    const phone = (data.phone as string) || (data.user as string) || (data.me as string) || undefined;
    const pushName = (data.pushname as string) || (data.pushName as string) || (data.name as string) || undefined;
    const sessionUuid = (data.id as string) || (data.uuid as string) || this.config.sessionUuid;

    if (sessionUuid && sessionUuid !== this.config.sessionUuid) {
      this.config.sessionUuid = sessionUuid;
    }

    if (
      statusRaw === 'ready' ||
      statusRaw === 'connected' ||
      statusRaw === 'islogged' ||
      statusRaw === 'chatsavailable'
    ) {
      return {
        state: 'connected',
        sessionId: sessionKey,
        sessionName: this.config.sessionId,
        sessionUuid: this.config.sessionUuid,
        phoneConnected: phone || pushName || 'Bağlı',
        pushName,
        details: 'WhatsApp bağlı ve gönderime hazır.',
        httpStatus,
        lastCheckedAt: now,
      };
    }

    if (
      statusRaw === 'qr_ready' ||
      statusRaw === 'notlogged' ||
      statusRaw === 'qr' ||
      statusRaw === 'qrcode'
    ) {
      const qrCode = (data.qr as string) || (data.qrCode as string) || (data.qrcode as string) || null;
      return {
        state: 'qr_ready',
        sessionId: sessionKey,
        sessionName: this.config.sessionId,
        sessionUuid: this.config.sessionUuid,
        qrCodeUrl: qrCode,
        details: 'QR kod hazır, lütfen telefonunuzdaki WhatsApp ile taratın.',
        httpStatus,
        lastCheckedAt: now,
      };
    }

    if (statusRaw === 'initializing' || statusRaw === 'starting' || statusRaw === 'created') {
      return {
        state: 'starting',
        sessionId: sessionKey,
        sessionName: this.config.sessionId,
        sessionUuid: this.config.sessionUuid,
        details: 'WhatsApp motoru başlatılıyor, lütfen bekleyin...',
        httpStatus,
        lastCheckedAt: now,
      };
    }

    if (statusRaw === 'authenticating') {
      return {
        state: 'authenticating',
        sessionId: sessionKey,
        sessionName: this.config.sessionId,
        sessionUuid: this.config.sessionUuid,
        details: 'QR kod tarandı, oturum doğrulanıyor...',
        httpStatus,
        lastCheckedAt: now,
      };
    }

    return {
      state: 'disconnected',
      sessionId: sessionKey,
      sessionName: this.config.sessionId,
      sessionUuid: this.config.sessionUuid,
      details: `Oturum Durumu: ${statusRaw || 'Bilinmiyor'}. "Oturum Başlat" butonuna tıklayabilirsiniz.`,
      httpStatus,
      lastCheckedAt: now,
    };
  }

  /**
   * Retrieves the current QR code for authenticating the WhatsApp session.
   */
  async getQrCode(): Promise<string | null> {
    const keysToTry = [this.config.sessionUuid, this.config.sessionId, 'default'].filter(Boolean) as string[];
    const uniqueKeys = Array.from(new Set(keysToTry));

    for (const key of uniqueKeys) {
      const result = await this.request<Record<string, unknown>>(`/sessions/${encodeURIComponent(key)}/qr`, {
        method: 'GET',
      });

      if (result.ok && result.data) {
        const qr = (result.data.qr || result.data.qrCode || result.data.qrcode || result.data.url) as string | undefined;
        if (typeof qr === 'string' && qr.length > 10) {
          if (qr.startsWith('data:image') || qr.startsWith('http')) {
            return qr;
          }
          return `data:image/png;base64,${qr}`;
        }
      }
    }
    return null;
  }

  /**
   * Registers a new session on OpenWA with { sessionId, name }.
   * Captures and stores the returned session UUID.
   */
  async createSession(sessionName?: string): Promise<{ success: boolean; sessionUuid?: string; error?: string }> {
    const name = (sessionName || this.config.sessionId || 'default').trim();
    const result = await this.request<Record<string, unknown>>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ sessionId: name, name }),
    });

    if (result.ok || result.status === 409) {
      let sessionUuid =
        (result.data?.id as string) ||
        (result.data?.sessionId as string) ||
        (result.data?.uuid as string) ||
        undefined;

      if (!sessionUuid) {
        // Query sessions list to discover UUID
        const listResult = await this.request<Array<Record<string, unknown>>>('/sessions', { method: 'GET' });
        if (listResult.ok && Array.isArray(listResult.data)) {
          const found = listResult.data.find(
            (s) => s.id === name || s.name === name || s.sessionId === name
          );
          if (found && (found.id || found.uuid)) {
            sessionUuid = String(found.id || found.uuid);
          }
        }
      }

      if (sessionUuid) {
        this.config.sessionUuid = sessionUuid;
      }

      return {
        success: true,
        sessionUuid: this.config.sessionUuid || sessionUuid || name,
      };
    }

    return {
      success: false,
      error: result.error || 'Oturum oluşturulamadı.',
    };
  }

  /**
   * Starts the WhatsApp session engine.
   */
  async startSession(sessionIdentifier?: string): Promise<{ success: boolean; error?: string }> {
    const key = (sessionIdentifier || this.effectiveSessionId).trim();
    const result = await this.request<Record<string, unknown>>(`/sessions/${encodeURIComponent(key)}/start`, {
      method: 'POST',
    });

    if (result.ok || result.status === 409) {
      return { success: true };
    }

    // If key was UUID and failed with 404, or key was name and failed with 404, try alternative identifier
    const alternativeKey = key === this.config.sessionUuid ? this.config.sessionId : this.config.sessionUuid;
    if (alternativeKey && alternativeKey !== key) {
      const retryResult = await this.request<Record<string, unknown>>(
        `/sessions/${encodeURIComponent(alternativeKey)}/start`,
        {
          method: 'POST',
        }
      );
      if (retryResult.ok || retryResult.status === 409) {
        return { success: true };
      }
    }

    return {
      success: false,
      error: result.error || 'Oturum başlatılamadı.',
    };
  }

  /**
   * Sends a plain text message to a recipient.
   */
  async sendMessage(phone: string, message: string): Promise<SendResult> {
    const chatId = this.formatChatId(phone);
    const sessionKey = this.effectiveSessionId;

    const result = await this.request<Record<string, unknown>>(
      `/sessions/${encodeURIComponent(sessionKey)}/messages/send-text`,
      {
        method: 'POST',
        body: JSON.stringify({ chatId, text: message }),
      },
      15000
    );

    if (result.ok) {
      const messageId =
        (result.data?.messageId as string) ||
        (result.data?.id as string) ||
        `sent_${Date.now()}`;
      return {
        success: true,
        outcome: 'partial_success',
        messageId,
        pdfSent: false,
        messageSent: true,
        attempts: 1,
      };
    }

    return {
      success: false,
      outcome: 'failed',
      pdfSent: false,
      messageSent: false,
      error: result.error || 'Metin mesajı iletilemedi.',
      attempts: 1,
    };
  }

  /**
   * Sends a document / PDF to a recipient with optional caption.
   */
  async sendDocument(
    phone: string,
    base64Data: string,
    fileName: string,
    caption?: string
  ): Promise<SendResult> {
    const chatId = this.formatChatId(phone);
    const sessionKey = this.effectiveSessionId;

    const cleanBase64 = base64Data.startsWith('data:')
      ? base64Data.split(',')[1]
      : base64Data;

    const payload: Record<string, unknown> = {
      chatId,
      base64: cleanBase64,
      mimetype: 'application/pdf',
      filename: fileName,
    };
    if (caption) {
      payload.caption = caption;
    }

    const result = await this.request<Record<string, unknown>>(
      `/sessions/${encodeURIComponent(sessionKey)}/messages/send-document`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      30000
    );

    if (result.ok) {
      const messageId =
        (result.data?.messageId as string) ||
        (result.data?.id as string) ||
        `sent_pdf_${Date.now()}`;
      return {
        success: true,
        outcome: 'success',
        messageId,
        pdfSent: true,
        messageSent: true,
        attempts: 1,
      };
    }

    return {
      success: false,
      outcome: 'failed',
      pdfSent: false,
      messageSent: false,
      error: result.error || 'PDF belgesi iletilemedi.',
      attempts: 1,
    };
  }
}
