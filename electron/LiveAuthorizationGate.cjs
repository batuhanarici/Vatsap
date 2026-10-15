const crypto = require('crypto');

const VALID_CONFIRMATION_PHRASES = new Set([
  'CANLI_GONDERIM_ONAYLI',
  'CONFIRM_LIVE_DISPATCH',
  'EVET_CANLI_GONDER',
]);

/**
 * LiveAuthorizationGate (P1.7 Pilot Güvenlik Kapısı)
 *
 * Implements authoritative Main Process boundary for live vs mock dispatching:
 * - Default state is ALWAYS Mock (unauthorized for live).
 * - Live dispatch authorization is purely in-memory and transient; never persisted to disk or SQLite.
 * - Restarts or crashes immediately revoke live authorization (secure default).
 * - Renderer cannot bypass gate by supplying arbitrary flags (isMockMode: false, provider: 'openwa').
 * - Protects against race conditions between provider selection and dispatch reservation.
 */
class LiveAuthorizationGate {
  constructor() {
    this._authorized = false;
    this._grant = null;
    this._defaultDurationMinutes = 15;
  }

  /**
   * Returns true if live dispatch is currently authorized and not expired.
   * Automatically revokes expired grants.
   */
  isLiveModeAuthorized() {
    if (!this._authorized || !this._grant) {
      return false;
    }
    if (Date.now() > this._grant.expiresAt) {
      this.revokeLiveMode();
      return false;
    }
    return true;
  }

  /**
   * Authorizes live mode given an explicit, intentional confirmation phrase.
   */
  authorizeLiveMode({ confirmationPhrase, durationMinutes } = {}) {
    if (!confirmationPhrase || !VALID_CONFIRMATION_PHRASES.has(confirmationPhrase)) {
      return {
        success: false,
        authorized: false,
        error: 'Geçersiz onay ifadesi. Canlı moda geçmek için açık ve geçerli kullanıcı onayı zorunludur.',
      };
    }

    const duration = Math.min(Math.max(Number(durationMinutes) || this._defaultDurationMinutes, 1), 60);
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const expiresAt = now + duration * 60 * 1000;

    this._authorized = true;
    this._grant = {
      token,
      authorizedAt: now,
      expiresAt,
      durationMinutes: duration,
      phraseUsed: confirmationPhrase,
    };

    return {
      success: true,
      authorized: true,
      token,
      expiresAt,
      remainingMinutes: duration,
    };
  }

  /**
   * Explicitly revokes live dispatch authorization immediately.
   */
  revokeLiveMode() {
    this._authorized = false;
    this._grant = null;
    return {
      success: true,
      authorized: false,
    };
  }

  /**
   * Returns current live mode status for UI / diagnostic polling.
   */
  getLiveModeStatus() {
    if (!this.isLiveModeAuthorized()) {
      return {
        isLiveAuthorized: false,
        expiresAt: null,
        remainingSeconds: 0,
      };
    }

    const remainingSeconds = Math.max(0, Math.floor((this._grant.expiresAt - Date.now()) / 1000));
    return {
      isLiveAuthorized: true,
      expiresAt: this._grant.expiresAt,
      remainingSeconds,
    };
  }

  /**
   * Verifies if a dispatch is allowed based on target provider and live authorization.
   * Mock is always permitted. Real providers (openwa, meta_cloud) require active live authorization.
   */
  verifyLiveDispatchAllowed(provider) {
    const normalized = String(provider || '').trim().toLowerCase();

    // Mock provider is always authorized (safe default)
    if (!normalized || normalized === 'mock') {
      return {
        allowed: true,
        mode: 'mock',
      };
    }

    // Live providers: openwa, meta_cloud, whatsapp, whatsapp_web
    const isLiveProvider =
      normalized === 'openwa' ||
      normalized === 'meta_cloud' ||
      normalized === 'whatsapp' ||
      normalized === 'whatsapp_web';

    if (isLiveProvider) {
      if (!this.isLiveModeAuthorized()) {
        return {
          allowed: false,
          code: 'LIVE_MODE_UNAUTHORIZED',
          reason: 'Canlı gönderim yetkisi aktif değil. Güvenlik gereği gerçek WhatsApp mesajı gönderilemez. Lütfen Canlı Modu yetkilendirin veya Test Modunu kullanın.',
        };
      }
      return {
        allowed: true,
        mode: 'live',
      };
    }

    return {
      allowed: false,
      code: 'UNKNOWN_PROVIDER',
      reason: `Bilinmeyen sağlayıcı (${provider}) reddedildi.`,
    };
  }
}

module.exports = {
  LiveAuthorizationGate,
  VALID_CONFIRMATION_PHRASES,
};
