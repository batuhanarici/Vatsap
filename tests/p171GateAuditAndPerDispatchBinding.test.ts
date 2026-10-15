import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  DispatchRepository,
} = require('../electron/DispatchRepository.cjs');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  LiveAuthorizationGate,
  VALID_CONFIRMATION_PHRASES,
  validateOpenWaRequest,
} = require('../electron/security.cjs');

describe('Vatsap V2 — P1.7.1 Güvenlik Kapısı Bağımsız Kod Denetimi ve Gönderim Başına Bağlayıcı Onay Testleri', () => {
  let tempDir: string;
  let repo: any;
  let liveGate: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p171-audit-'));
    liveGate = new LiveAuthorizationGate();
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p171.db',
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
  // 1. Onay Mekanizması ve Güvenlik Sınırı Denetimi (Section 1)
  // ---------------------------------------------------------------------------
  it('1.1: CANLI_GONDERIM_ONAYLI sabit ifadesi yalnızca niyet teyididir; hatalı ifadeler reddedilir', () => {
    expect(VALID_CONFIRMATION_PHRASES.has('CANLI_GONDERIM_ONAYLI')).toBe(true);

    const badAttempt = liveGate.authorizeLiveMode({ confirmationPhrase: 'EVET_HEMEN_GONDER' });
    expect(badAttempt.success).toBe(false);
    expect(badAttempt.authorized).toBe(false);
    expect(liveGate.isLiveModeAuthorized()).toBe(false);

    const validAttempt = liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });
    expect(validAttempt.success).toBe(true);
    expect(validAttempt.authorized).toBe(true);
    expect(liveGate.isLiveModeAuthorized()).toBe(true);
  });

  it('1.2: Uygulama yeniden başlatıldığında canlı yetki sıfırlanır (geçici bellek garantisi)', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });
    expect(liveGate.isLiveModeAuthorized()).toBe(true);

    // Yeni bir Gate örneği oluşturarak uygulama yeniden başlatma simülasyonu
    const freshGate = new LiveAuthorizationGate();
    expect(freshGate.isLiveModeAuthorized()).toBe(false);
    expect(freshGate.verifyLiveDispatchAllowed('openwa').allowed).toBe(false);
  });

  it('1.3: openwa:request kanalı üzerinden doğrudan mesaj ve belge gönderimi kesinlikle engellenir', () => {
    const docBlocked = validateOpenWaRequest({
      url: 'http://127.0.0.1:2785/api/sessions/default/messages/send-document',
      method: 'POST',
    });
    expect(docBlocked.valid).toBe(false);
    expect(docBlocked.error).toContain('Belge gönderimi doğrudan openwa:request üzerinden yapılamaz');

    const msgBlocked = validateOpenWaRequest({
      url: 'http://127.0.0.1:2785/api/sessions/default/messages/send-text',
      method: 'POST',
    });
    expect(msgBlocked.valid).toBe(false);
    expect(msgBlocked.error).toContain('Mesaj gönderimi doğrudan openwa:request üzerinden yapılamaz');
  });

  // ---------------------------------------------------------------------------
  // 2. Gönderim Başına Bağlayıcı Bilet Mekanizması (Section 2)
  // ---------------------------------------------------------------------------
  it('2.1: Canlı mod yetkili değilken tek kullanımlık bilet oluşturulamaz', () => {
    expect(liveGate.isLiveModeAuthorized()).toBe(false);

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId: 'std_01',
      phone: '905551112233',
      pdfSha256: crypto.createHash('sha256').update('pdf-content').digest('hex'),
      examName: 'P1.7.1 Denetim Sınavı',
      messageText: 'Sayın Veli...',
    });

    expect(ticketRes.success).toBe(false);
    expect(ticketRes.code).toBe('LIVE_MODE_UNAUTHORIZED');
  });

  it('2.2: Canlı mod yetkiliyken tüm parametrelere bağlı kriptografik bilet oluşturulur', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_02';
    const phone = '905551112244';
    const pdfSha256 = crypto.createHash('sha256').update('karne-pdf-02').digest('hex');
    const examName = 'LGS Deneme 1';
    const messageText = 'Sayın Veli, öğrencinizin karnesi ektedir.';

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
      ttlSeconds: 120,
    });

    expect(ticketRes.success).toBe(true);
    expect(ticketRes.ticketToken).toMatch(/^lvt_[a-f0-9]{48}$/);
    expect(ticketRes.fingerprint).toBeDefined();
    expect(ticketRes.expiresAt).toBeGreaterThan(Date.now());
  });

  it('2.3: Bilet parametrelerinden biri (telefon) değişirse gönderim LIVE_TICKET_BINDING_MISMATCH ile reddedilir', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_03';
    const phone = '905551112255';
    const pdfSha256 = crypto.createHash('sha256').update('karne-pdf-03').digest('hex');
    const examName = 'LGS Deneme 1';
    const messageText = 'Sayın Veli, karne ektedir.';

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });
    expect(ticketRes.success).toBe(true);

    // Telefon numarasını başka bir numaraya değiştirelim (saldırı / parametre kurcalama simülasyonu)
    const verifyRes = liveGate.verifyAndConsumeLiveDispatchTicket(ticketRes.ticketToken, {
      studentId,
      phone: '905559999999', // DEĞİŞTİRİLDİ!
      pdfSha256,
      examName,
      messageText,
    });

    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.code).toBe('LIVE_TICKET_BINDING_MISMATCH');
    expect(verifyRes.reason).toContain('Canlı gönderim parametreleri onaylanan bilet ile eşleşmiyor');
  });

  it('2.4: Bilet parametrelerinden PDF SHA-256 değişirse gönderim reddedilir', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_04';
    const phone = '905551112266';
    const pdfSha256 = crypto.createHash('sha256').update('karne-pdf-04-orijinal').digest('hex');
    const examName = 'LGS Deneme 1';
    const messageText = 'Sayın Veli, karne ektedir.';

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });
    expect(ticketRes.success).toBe(true);

    // PDF içeriği değiştirilmiş sahte SHA-256
    const alteredSha = crypto.createHash('sha256').update('karne-pdf-04-degistirilmis').digest('hex');
    const verifyRes = liveGate.verifyAndConsumeLiveDispatchTicket(ticketRes.ticketToken, {
      studentId,
      phone,
      pdfSha256: alteredSha, // DEĞİŞTİRİLDİ!
      examName,
      messageText,
    });

    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.code).toBe('LIVE_TICKET_BINDING_MISMATCH');
  });

  it('2.5: Bilet parametrelerinden öğrenci kimliği veya sınav adı değişirse reddedilir', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_05';
    const phone = '905551112277';
    const pdfSha256 = crypto.createHash('sha256').update('karne-pdf-05').digest('hex');
    const examName = 'LGS Deneme 1';
    const messageText = 'Sayın Veli, karne ektedir.';

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });

    // Farklı öğrenci kimliği ile tüketim denemesi
    const verifyResStudent = liveGate.verifyAndConsumeLiveDispatchTicket(ticketRes.ticketToken, {
      studentId: 'std_99_baska', // DEĞİŞTİRİLDİ!
      phone,
      pdfSha256,
      examName,
      messageText,
    });
    expect(verifyResStudent.valid).toBe(false);
    expect(verifyResStudent.code).toBe('LIVE_TICKET_BINDING_MISMATCH');

    // Yeni bilet üretelim ve sınav adını değiştirelim
    const ticketRes2 = liveGate.createLiveDispatchTicket({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });
    const verifyResExam = liveGate.verifyAndConsumeLiveDispatchTicket(ticketRes2.ticketToken, {
      studentId,
      phone,
      pdfSha256,
      examName: 'Farkli Bir Sinav', // DEĞİŞTİRİLDİ!
      messageText,
    });
    expect(verifyResExam.valid).toBe(false);
    expect(verifyResExam.code).toBe('LIVE_TICKET_BINDING_MISMATCH');
  });

  it('2.6: Tek kullanımlık bilet tüketildikten sonra ikinci kez kullanılamaz (Replay Attack Engeli)', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_06';
    const phone = '905551112288';
    const pdfSha256 = crypto.createHash('sha256').update('karne-pdf-06').digest('hex');
    const examName = 'LGS Deneme 1';
    const messageText = 'Sayın Veli, karne ektedir.';

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });

    // 1. Kullanım: Başarılı olmalı
    const firstUse = liveGate.verifyAndConsumeLiveDispatchTicket(ticketRes.ticketToken, {
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });
    expect(firstUse.valid).toBe(true);

    // 2. Kullanım denemesi: Reddedilmeli
    const secondUse = liveGate.verifyAndConsumeLiveDispatchTicket(ticketRes.ticketToken, {
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });
    expect(secondUse.valid).toBe(false);
    expect(['LIVE_TICKET_ALREADY_USED', 'LIVE_TICKET_NOT_FOUND']).toContain(secondUse.code);
  });

  it('2.7: Süresi dolmuş bilet LIVE_TICKET_EXPIRED ile reddedilir', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_07';
    const phone = '905551112299';
    const pdfSha256 = crypto.createHash('sha256').update('karne-pdf-07').digest('hex');
    const examName = 'LGS Deneme 1';
    const messageText = 'Sayın Veli...';

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
      ttlSeconds: 10,
    });

    // Bilet süresini geçmişe çekelim
    const ticketObj = liveGate._tickets.get(ticketRes.ticketToken);
    ticketObj.expiresAt = Date.now() - 5000;

    const verifyRes = liveGate.verifyAndConsumeLiveDispatchTicket(ticketRes.ticketToken, {
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });

    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.code).toBe('LIVE_TICKET_EXPIRED');
  });

  // ---------------------------------------------------------------------------
  // 3. Renderer Bayrakları ile Atlatma Girişimlerinin Engellenmesi (Anti-Bypass)
  // ---------------------------------------------------------------------------
  it('3.1: Renderer approved: true, isMockMode: false, forceLive: true gönderse dahi yetki kapısı aşılamaz', () => {
    expect(liveGate.isLiveModeAuthorized()).toBe(false);

    const studentId = 'std_08';
    const phone = '905551112200';
    const pdfSha256 = crypto.createHash('sha256').update('karne-pdf-08').digest('hex');
    const examName = 'LGS Deneme 1';

    const reserveRes = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Aldatıcı İstek',
        phone,
        examName,
        pdfName: 'karne.pdf',
        pdfSha256,
        provider: 'openwa',
        isMockMode: false,
        approved: true,
        forceLive: true,
        userConfirmed: true,
      },
      {
        isFromRenderer: true,
        forceLive: true,
        approved: true,
      }
    );

    expect(reserveRes.allowed).toBe(false);
    expect(reserveRes.code).toBe('LIVE_MODE_UNAUTHORIZED');
  });

  // ---------------------------------------------------------------------------
  // 4. DispatchRepository ile Uçtan Uca Bilet Doğrulaması
  // ---------------------------------------------------------------------------
  it('4.1: DispatchRepository, canlı modda geçerli bilet ile rezervasyonu onaylar ve bileti tüketir', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_09';
    const phone = '905551112211';
    const pdfSha256 = crypto.createHash('sha256').update('karne-pdf-09').digest('hex');
    const examName = 'LGS Deneme 1';
    const messageText = 'Karne mesajı';

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });

    const reserveRes = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Biletli Öğrenci',
        phone,
        examName,
        pdfName: 'karne.pdf',
        pdfSha256,
        provider: 'openwa',
        caption: messageText,
      },
      {
        ticketToken: ticketRes.ticketToken,
        isFromRenderer: true,
      }
    );

    expect(reserveRes.allowed).toBe(true);
    expect(reserveRes.dispatchKey).toBeDefined();

    // Bilet tüketildiği için ikinci rezervasyon denemesinde bilet geçersiz kalmalıdır
    const secondReserve = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Biletli Öğrenci',
        phone,
        examName,
        pdfName: 'karne.pdf',
        pdfSha256,
        provider: 'openwa',
        caption: messageText,
      },
      {
        ticketToken: ticketRes.ticketToken,
        isFromRenderer: true,
      }
    );

    expect(secondReserve.allowed).toBe(false);
    expect(['LIVE_TICKET_ALREADY_USED', 'LIVE_TICKET_NOT_FOUND', 'ALREADY_SENT', 'SENDING_IN_PROGRESS']).toContain(secondReserve.code);
  });

  it('4.2: DispatchRepository, değiştirilmiş parametrelerle sunulan bileti LIVE_TICKET_BINDING_MISMATCH ile reddeder', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_10';
    const phone = '905551112222';
    const pdfSha256 = crypto.createHash('sha256').update('karne-pdf-10').digest('hex');
    const examName = 'LGS Deneme 1';
    const messageText = 'Orijinal mesaj';

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId,
      phone,
      pdfSha256,
      examName,
      messageText,
    });

    // Rezervasyon sırasında farklı bir telefon numarası kullanalım
    const tamperedReserve = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Kurcalanmış İstek',
        phone: '905559998877', // DEĞİŞTİRİLDİ!
        examName,
        pdfName: 'karne.pdf',
        pdfSha256,
        provider: 'openwa',
        caption: messageText,
      },
      {
        ticketToken: ticketRes.ticketToken,
        isFromRenderer: true,
      }
    );

    expect(tamperedReserve.allowed).toBe(false);
    expect(tamperedReserve.code).toBe('LIVE_TICKET_BINDING_MISMATCH');
  });
});
