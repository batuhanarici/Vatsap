import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  DispatchRepository,
  computeDeterministicDispatchKey,
} = require('../electron/DispatchRepository.cjs');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  LiveAuthorizationGate,
  VALID_CONFIRMATION_PHRASES,
  validateOpenWaRequest,
} = require('../electron/security.cjs');

describe('Vatsap V2 — P1.7 Canlı Gönderim Yetkilendirmesi ve Pilot Güvenlik Kapısı Testleri', () => {
  let tempDir: string;
  let repo: any;
  let liveGate: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p17-livegate-'));
    liveGate = new LiveAuthorizationGate();
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p17.db',
      liveGate,
    });
    await repo.init();
  });

  afterEach(() => {
    if (repo && repo.isInitialized()) {
      repo.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Güvenli Varsayılan (Default Safe: Mock Mode Only)
  // ---------------------------------------------------------------------------
  it('1.1: LiveAuthorizationGate başlatıldığında canlı yetki varsayılan olarak kapalıdır', () => {
    expect(liveGate.isLiveModeAuthorized()).toBe(false);

    const status = liveGate.getLiveModeStatus();
    expect(status.isLiveAuthorized).toBe(false);
    expect(status.expiresAt).toBeNull();
    expect(status.remainingSeconds).toBe(0);
  });

  it('1.2: Mock sağlayıcı (mock) canlı yetki gerektirmeksizin her zaman izinlidir', () => {
    const resMock = liveGate.verifyLiveDispatchAllowed('mock');
    expect(resMock.allowed).toBe(true);
    expect(resMock.mode).toBe('mock');

    const resEmpty = liveGate.verifyLiveDispatchAllowed('');
    expect(resEmpty.allowed).toBe(true);
    expect(resEmpty.mode).toBe('mock');
  });

  // ---------------------------------------------------------------------------
  // 2. Yetkisiz Canlı Gönderim Engeli (Live Mode Unauthorized)
  // ---------------------------------------------------------------------------
  it('2.1: Canlı yetki olmadan openwa veya meta_cloud sağlayıcısı LIVE_MODE_UNAUTHORIZED ile engellenir', () => {
    const resOpenWa = liveGate.verifyLiveDispatchAllowed('openwa');
    expect(resOpenWa.allowed).toBe(false);
    expect(resOpenWa.code).toBe('LIVE_MODE_UNAUTHORIZED');
    expect(resOpenWa.reason).toContain('Canlı gönderim yetkisi aktif değil');

    const resMeta = liveGate.verifyLiveDispatchAllowed('meta_cloud');
    expect(resMeta.allowed).toBe(false);
    expect(resMeta.code).toBe('LIVE_MODE_UNAUTHORIZED');

    const resWeb = liveGate.verifyLiveDispatchAllowed('whatsapp_web');
    expect(resWeb.allowed).toBe(false);
    expect(resWeb.code).toBe('LIVE_MODE_UNAUTHORIZED');
  });

  it('2.2: Bilinmeyen sağlayıcı adı UNKNOWN_PROVIDER ile reddedilir', () => {
    const resUnknown = liveGate.verifyLiveDispatchAllowed('evil_proxy_telecom');
    expect(resUnknown.allowed).toBe(false);
    expect(resUnknown.code).toBe('UNKNOWN_PROVIDER');
  });

  // ---------------------------------------------------------------------------
  // 3. Açık Onay İfadesi Doğrulaması (Explicit Confirmation Phrase)
  // ---------------------------------------------------------------------------
  it('3.1: Hatalı, eksik veya sahte onay ifadesi ile canlı mod yetkilendirilemez', () => {
    const res1 = liveGate.authorizeLiveMode({ confirmationPhrase: 'evet' });
    expect(res1.success).toBe(false);
    expect(res1.authorized).toBe(false);
    expect(res1.error).toContain('Geçersiz onay ifadesi');
    expect(liveGate.isLiveModeAuthorized()).toBe(false);

    const res2 = liveGate.authorizeLiveMode({ confirmationPhrase: '' });
    expect(res2.success).toBe(false);
    expect(liveGate.isLiveModeAuthorized()).toBe(false);

    const res3 = liveGate.authorizeLiveMode({ confirmationPhrase: 'ENABLE_LIVE_NOW' });
    expect(res3.success).toBe(false);
    expect(liveGate.isLiveModeAuthorized()).toBe(false);
  });

  it('3.2: Geçerli onay ifadesi (CANLI_GONDERIM_ONAYLI) ile canlı mod yetkilendirilir', () => {
    const res = liveGate.authorizeLiveMode({
      confirmationPhrase: 'CANLI_GONDERIM_ONAYLI',
      durationMinutes: 15,
    });

    expect(res.success).toBe(true);
    expect(res.authorized).toBe(true);
    expect(typeof res.token).toBe('string');
    expect(res.expiresAt).toBeGreaterThan(Date.now());
    expect(liveGate.isLiveModeAuthorized()).toBe(true);

    const status = liveGate.getLiveModeStatus();
    expect(status.isLiveAuthorized).toBe(true);
    expect(status.remainingSeconds).toBeGreaterThan(800);

    // Canlı mod yetkilendikten sonra openwa izinlidir
    const checkOpenWa = liveGate.verifyLiveDispatchAllowed('openwa');
    expect(checkOpenWa.allowed).toBe(true);
    expect(checkOpenWa.mode).toBe('live');
  });

  // ---------------------------------------------------------------------------
  // 4. Yetki İptali (Revocation) ve Süre Aşımı (Expiration)
  // ---------------------------------------------------------------------------
  it('4.1: revokeLiveMode çağrıldığında canlı mod yetkisi anında iptal edilir', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });
    expect(liveGate.isLiveModeAuthorized()).toBe(true);

    const revokeRes = liveGate.revokeLiveMode();
    expect(revokeRes.success).toBe(true);
    expect(revokeRes.authorized).toBe(false);
    expect(liveGate.isLiveModeAuthorized()).toBe(false);

    const checkAgain = liveGate.verifyLiveDispatchAllowed('openwa');
    expect(checkAgain.allowed).toBe(false);
    expect(checkAgain.code).toBe('LIVE_MODE_UNAUTHORIZED');
  });

  it('4.2: Süresi dolan canlı mod oturumu otomatik olarak geçersiz kılınır', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI', durationMinutes: 1 });
    expect(liveGate.isLiveModeAuthorized()).toBe(true);

    // Oturum süresini geçmişe çekelim
    liveGate._grant.expiresAt = Date.now() - 1000;

    expect(liveGate.isLiveModeAuthorized()).toBe(false);
    const status = liveGate.getLiveModeStatus();
    expect(status.isLiveAuthorized).toBe(false);
    expect(status.remainingSeconds).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 5. Yeniden Başlatma Dayanıklılığı (Transient In-Memory Policy)
  // ---------------------------------------------------------------------------
  it('5.1: Yeni bir Gate nesnesi (uygulama yeniden başlatma simülasyonu) hiçbir eski yetkiyi taşımaz', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });
    expect(liveGate.isLiveModeAuthorized()).toBe(true);

    // Yeniden başlatma simülasyonu: yeni süreç veya yeni nesne
    const restartedGate = new LiveAuthorizationGate();
    expect(restartedGate.isLiveModeAuthorized()).toBe(false);
    expect(restartedGate.verifyLiveDispatchAllowed('openwa').allowed).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 6. DispatchRepository Entegrasyonu ve Rezervasyon Kapısı
  // ---------------------------------------------------------------------------
  it('6.1: DispatchRepository, canlı yetki olmadan Renderer kaynaklı openwa rezervasyonunu reddeder', () => {
    const studentId = 'std_p17_01';
    const examName = 'P1.7 Pilot Sınav';
    const phone = '905551234567';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 test').digest('hex');

    // liveGate henüz yetkisiz
    const reserveRes = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Test Öğrenci',
        phone,
        examName,
        pdfName: 'karne.pdf',
        pdfSha256,
        provider: 'openwa',
      },
      { isFromRenderer: true }
    );

    expect(reserveRes.allowed).toBe(false);
    expect(reserveRes.code).toBe('LIVE_MODE_UNAUTHORIZED');
    expect(reserveRes.reason).toContain('Canlı gönderim yetkisi aktif değil');
  });

  it('6.2: Mock sağlayıcı ile yapılan rezervasyon canlı yetki gerektirmeksizin kabul edilir', () => {
    const studentId = 'std_p17_02';
    const examName = 'P1.7 Pilot Sınav';
    const phone = '905551234568';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 mock').digest('hex');

    const reserveRes = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Mock Öğrenci',
        phone,
        examName,
        pdfName: 'mock.pdf',
        pdfSha256,
        provider: 'mock',
      },
      { isFromRenderer: true }
    );

    expect(reserveRes.allowed).toBe(true);
    expect(reserveRes.dispatchKey).toBeDefined();
  });

  it('6.3: Canlı yetki verildikten sonra openwa rezervasyonu başarıyla kabul edilir', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_p17_03';
    const examName = 'P1.7 Pilot Sınav';
    const phone = '905551234569';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 live').digest('hex');

    const reserveRes = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Canlı Öğrenci',
        phone,
        examName,
        pdfName: 'live.pdf',
        pdfSha256,
        provider: 'openwa',
      },
      { isFromRenderer: true }
    );

    expect(reserveRes.allowed).toBe(true);
    expect(reserveRes.dispatchKey).toBeDefined();

    // Veritabanında rezervasyon 'sending' durumunda olmalı
    const record = repo.getDispatchByKey(reserveRes.dispatchKey);
    expect(record).toBeDefined();
    expect(record.status).toBe('sending');
    expect(record.provider).toBe('openwa');
  });

  it('6.4: Canlı mod yetkili olsa dahi başarılı (sent) karnenin mükerrer gönderimi ALREADY_SENT ile engellenir', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_p17_04';
    const examName = 'P1.7 Pilot Sınav';
    const phone = '905551234570';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 idempotency').digest('hex');

    const first = repo.reserveDispatch(
      {
        studentId,
        studentName: 'İdempotent Öğrenci',
        phone,
        examName,
        pdfName: 'idempotent.pdf',
        pdfSha256,
        provider: 'openwa',
      },
      { isFromRenderer: true }
    );
    expect(first.allowed).toBe(true);

    // Durumu 'sent' yapalım
    repo.updateDispatchStatus(first.dispatchKey, 'sent', { provider_message_id: 'live_msg_99' });

    // İkinci rezervasyon denemesi: Canlı yetkili olsa bile kesinlikle engellenmelidir!
    const second = repo.reserveDispatch(
      {
        studentId,
        studentName: 'İdempotent Öğrenci',
        phone,
        examName,
        pdfName: 'idempotent.pdf',
        pdfSha256,
        provider: 'openwa',
      },
      { isFromRenderer: true }
    );

    expect(second.allowed).toBe(false);
    expect(second.code).toBe('ALREADY_SENT');
  });

  // ---------------------------------------------------------------------------
  // 7. Salt Okunur Oturum ve Durum Kontrolleri
  // ---------------------------------------------------------------------------
  it('7.1: Salt okunur OpenWA istekleri (/health, /ping, /sessions) canlı yetki gerektirmeksizin doğrulanır', () => {
    const healthCheck = validateOpenWaRequest({
      url: 'http://127.0.0.1:2785/api/health',
      method: 'GET',
    });
    expect(healthCheck.valid).toBe(true);

    const sessionCheck = validateOpenWaRequest({
      url: 'http://127.0.0.1:2785/api/sessions/default',
      method: 'GET',
    });
    expect(sessionCheck.valid).toBe(true);
  });

  it('7.2: openwa:request üzerinden mesaj veya belge gönderim denemeleri kesinlikle engellenir', () => {
    const sendDoc = validateOpenWaRequest({
      url: 'http://127.0.0.1:2785/api/sessions/default/messages/send-document',
      method: 'POST',
      body: JSON.stringify({ chatId: '905551112233@c.us' }),
    });
    expect(sendDoc.valid).toBe(false);
    expect(sendDoc.error).toContain('Belge gönderimi doğrudan openwa:request üzerinden yapılamaz');

    const sendMsg = validateOpenWaRequest({
      url: 'http://127.0.0.1:2785/api/sessions/default/messages/send-text',
      method: 'POST',
      body: JSON.stringify({ chatId: '905551112233@c.us', text: 'Merhaba' }),
    });
    expect(sendMsg.valid).toBe(false);
    expect(sendMsg.error).toContain('Mesaj gönderimi doğrudan openwa:request üzerinden yapılamaz');
  });

  // ---------------------------------------------------------------------------
  // 8. Renderer Bayrakları ile Güvenlik Kapısını Atlama Girişimleri (Anti-Bypass)
  // ---------------------------------------------------------------------------
  it('8.1: Renderer sahte bayraklar (isMockMode: false, forceLive: true) gönderse dahi Main Process engeller', () => {
    const studentId = 'std_p17_05';
    const examName = 'P1.7 Pilot Sınav';
    const phone = '905551234571';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 spoof').digest('hex');

    // liveGate yetkisiz
    expect(liveGate.isLiveModeAuthorized()).toBe(false);

    const spoofAttempt = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Spoof Öğrenci',
        phone,
        examName,
        pdfName: 'spoof.pdf',
        pdfSha256,
        provider: 'openwa',
        isMockMode: false,
        forceLive: true,
        userConfirmed: true,
      },
      {
        isFromRenderer: true,
        allowLive: true, // Sahte renderer opsiyonu
      }
    );

    expect(spoofAttempt.allowed).toBe(false);
    expect(spoofAttempt.code).toBe('LIVE_MODE_UNAUTHORIZED');
  });
});
