const crypto = require('crypto');

const VALID_CONFIRMATION_PHRASES = new Set([
  'CANLI_GONDERIM_ONAYLI',
  'CONFIRM_LIVE_DISPATCH',
  'EVET_CANLI_GONDER',
]);

/**
 * LiveAuthorizationGate (P1.7 / P1.7.1 Pilot Güvenlik Kapısı)
 *
 * Implements authoritative Main Process boundary for live vs mock dispatching:
 * - Default state is ALWAYS Mock (unauthorized for live).
 * - Live dispatch authorization is purely in-memory and transient; never persisted to disk or SQLite.
 * - Restarts or crashes immediately revoke live authorization (secure default).
 * - Renderer cannot bypass gate by supplying arbitrary flags (isMockMode: false, provider: 'openwa', approved: true).
 * - Protects against race conditions between provider selection and dispatch reservation.
 * - P1.7.1: Per-dispatch binding ticket mechanism (LiveDispatchTicket) binding studentId, phone,
 *   pdfSha256, examName, and messageText to single-use, time-limited cryptographic approval tokens.
 */
class LiveAuthorizationGate {
  constructor() {
    this._authorized = false;
    this._grant = null;
    this._defaultDurationMinutes = 15;
    this._tickets = new Map(); // ticketToken -> TicketRecord
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
   * Explicitly revokes live dispatch authorization immediately and invalidates all pending tickets.
   */
  revokeLiveMode() {
    this._authorized = false;
    this._grant = null;
    this._tickets.clear();
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
   * Computes a deterministic SHA-256 fingerprint strictly binding all dispatch parameters together.
   * If any of studentId, phone, pdfSha256, examName, or message content changes, the fingerprint diverges.
   */
  computeTicketFingerprint({ studentId, phone, pdfSha256, examName, messageText }) {
    const normStudent = String(studentId || '').trim();
    const normPhone = String(phone || '').replace(/\D/g, '');
    const normSha = String(pdfSha256 || '').trim().toLowerCase();
    const normExam = String(examName || '').trim().toLowerCase();
    const normMsg = String(messageText || '').trim();

    return crypto
      .createHash('sha256')
      .update(`${normStudent}|${normPhone}|${normSha}|${normExam}|${normMsg}`)
      .digest('hex');
  }

  /**
   * Creates a short-lived, single-use live dispatch ticket bound cryptographically
   * to exact recipient, phone, PDF SHA-256, exam, and message content (P1.7.1).
   */
  createLiveDispatchTicket({
    studentId,
    phone,
    pdfSha256,
    examName,
    messageText,
    ttlSeconds = 300, // 5 minutes default
  } = {}) {
    if (!this.isLiveModeAuthorized()) {
      return {
        success: false,
        code: 'LIVE_MODE_UNAUTHORIZED',
        error: 'Canlı mod yetkili değil. Gönderim bileti oluşturulamaz.',
      };
    }

    if (!studentId || typeof studentId !== 'string') {
      return { success: false, code: 'INVALID_PARAM', error: 'studentId zorunludur.' };
    }
    if (!phone || typeof phone !== 'string') {
      return { success: false, code: 'INVALID_PARAM', error: 'phone zorunludur.' };
    }
    if (!pdfSha256 || typeof pdfSha256 !== 'string' || pdfSha256.length < 32) {
      return { success: false, code: 'INVALID_PARAM', error: 'Geçerli bir pdfSha256 özeti zorunludur.' };
    }
    if (!examName || typeof examName !== 'string') {
      return { success: false, code: 'INVALID_PARAM', error: 'examName zorunludur.' };
    }

    const cleanTtl = Math.min(Math.max(Number(ttlSeconds) || 300, 10), 1800);
    const ticketToken = 'lvt_' + crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const expiresAt = now + cleanTtl * 1000;

    const fingerprint = this.computeTicketFingerprint({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });

    const ticket = {
      ticketToken,
      studentId: String(studentId).trim(),
      phone: String(phone).replace(/\D/g, ''),
      pdfSha256: String(pdfSha256).trim().toLowerCase(),
      examName: String(examName).trim().toLowerCase(),
      messageText: String(messageText || '').trim(),
      fingerprint,
      createdAt: now,
      expiresAt,
      used: false,
    };

    this._tickets.set(ticketToken, ticket);

    return {
      success: true,
      ticketToken,
      expiresAt,
      fingerprint,
      ttlSeconds: cleanTtl,
    };
  }

  /**
   * Verifies and consumes a single-use live dispatch ticket against provided dispatch parameters.
   * If any bound parameter (student, phone, sha256, exam, message) differs, it is strictly rejected.
   */
  verifyAndConsumeLiveDispatchTicket(ticketToken, expectedParams = {}) {
    if (!ticketToken || typeof ticketToken !== 'string') {
      return {
        valid: false,
        code: 'LIVE_TICKET_MISSING',
        reason: 'Tek kullanımlık canlı gönderim onay belirteci (ticketToken) bulunamadı.',
      };
    }

    const ticket = this._tickets.get(ticketToken);
    if (!ticket) {
      return {
        valid: false,
        code: 'LIVE_TICKET_NOT_FOUND',
        reason: 'Canlı gönderim onay belirteci geçersiz veya bulunamadı.',
      };
    }

    if (ticket.used) {
      return {
        valid: false,
        code: 'LIVE_TICKET_ALREADY_USED',
        reason: 'Canlı gönderim onay belirteci tek kullanımlıktır ve daha önce kullanılmıştır.',
      };
    }

    if (Date.now() > ticket.expiresAt) {
      this._tickets.delete(ticketToken);
      return {
        valid: false,
        code: 'LIVE_TICKET_EXPIRED',
        reason: 'Canlı gönderim onay belirtecinin süresi dolmuştur.',
      };
    }

    // Check parameter binding
    const expectedFingerprint = this.computeTicketFingerprint({
      studentId: expectedParams.studentId,
      phone: expectedParams.phone,
      pdfSha256: expectedParams.pdfSha256,
      examName: expectedParams.examName,
      messageText: expectedParams.messageText || expectedParams.caption,
    });

    if (expectedFingerprint !== ticket.fingerprint) {
      return {
        valid: false,
        code: 'LIVE_TICKET_BINDING_MISMATCH',
        reason: 'Canlı gönderim parametreleri onaylanan bilet ile eşleşmiyor. Öğrenci, telefon, PDF içeriği veya sınav değiştirilmiş.',
      };
    }

    // Mark as consumed (single-use)
    ticket.used = true;
    ticket.usedAt = Date.now();
    this._tickets.delete(ticketToken);

    return {
      valid: true,
      ticketToken,
    };
  }

  /**
   * Verifies if a dispatch is allowed based on target provider and live authorization.
   * Mock is always permitted. Real providers (openwa, meta_cloud) require active live authorization.
   * If a ticketToken is provided or required, verifies single-use cryptographic binding.
   */
  verifyLiveDispatchAllowed(provider, options = {}) {
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

      // If a ticketToken or liveTicketToken is supplied or required:
      const ticketToken = options.ticketToken || options.liveTicketToken;
      if (ticketToken) {
        const ticketCheck = this.verifyAndConsumeLiveDispatchTicket(ticketToken, options);
        if (!ticketCheck.valid) {
          return {
            allowed: false,
            code: ticketCheck.code,
            reason: ticketCheck.reason,
          };
        }
      } else if (options.requireLiveTicket) {
        return {
          allowed: false,
          code: 'LIVE_TICKET_REQUIRED',
          reason: 'Bu işlem için bağlayıcı tek kullanımlık canlı gönderim onay belirteci zorunludur.',
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
