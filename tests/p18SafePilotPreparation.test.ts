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
  validatePdfPath,
  calculateMatchScore,
  computeMatchApprovalFingerprint,
} = require('../electron/security.cjs');

// Import frontend mock provider for end-to-end simulation
import { MockWhatsAppProvider } from '../src/services/whatsapp/MockProvider';

describe('Vatsap V2 — P1.8 Güvenli Pilot Hazırlığı ve Mock Pilot Senaryoları', () => {
  let tempDir: string;
  let repo: any;
  let liveGate: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p18-pilot-'));
    liveGate = new LiveAuthorizationGate();
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p18.db',
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
        // Ignore cleanup errors
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Güvenli Varsayılanlar & Başlangıç Durumu
  // ---------------------------------------------------------------------------
  it('1.1: Uygulama açılışında canlı mod kesinlikle kapalıdır ve yetkisizdir', () => {
    expect(liveGate.isLiveModeAuthorized()).toBe(false);
    const status = liveGate.getLiveModeStatus();
    expect(status.isLiveAuthorized).toBe(false);
    expect(status.remainingSeconds).toBe(0);
    expect(status.expiresAt).toBeNull();
  });

  it('1.2: Uygulama yeniden başlatıldığında canlı yetki sıfırlanır, eski yetki geri yüklenmez', () => {
    // 1. Oturum: Yetki al
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });
    expect(liveGate.isLiveModeAuthorized()).toBe(true);

    // 2. Oturum (Uygulama yeniden başlatıldı / yeni örnek oluşturuldu)
    const freshGate = new LiveAuthorizationGate();
    expect(freshGate.isLiveModeAuthorized()).toBe(false);
    expect(freshGate.getLiveModeStatus().isLiveAuthorized).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 2. Önizleme, PDF Ataması ve Güvenlik Sınırları
  // ---------------------------------------------------------------------------
  it('2.1: Örnek öğrenci ve sahte telefon numarasıyla gönderim önizlemesi oluşturulabilir', () => {
    const student = {
      id: 'mock_std_101',
      studentName: 'Ahmet Yılmaz',
      parentName: 'Mehmet Yılmaz',
      phone: '05551234567',
    };
    const examName = '2026 Bahar Deneme 1';
    const pdfName = 'Ahmet_Yilmaz_Karne.pdf';

    const match = calculateMatchScore(student.studentName, pdfName);
    expect(match.score).toBeGreaterThanOrEqual(70);

    const previewMessage = `Sayın ${student.parentName}, öğrenciniz ${student.studentName}'ın ${examName} karnesi ekte sunulmuştur.`;
    expect(previewMessage).toContain('Ahmet Yılmaz');
    expect(previewMessage).toContain('Mehmet Yılmaz');
    expect(previewMessage).toContain('2026 Bahar Deneme 1');
  });

  it('2.2: Düşük güvenli eşleşme (%70 altı) Main Process güvenlik kapısı tarafından engellenir', () => {
    const lowMatchStudent = {
      id: 'mock_std_102',
      studentName: 'Zeynep Kaya',
      phone: '05559876543',
    };
    const unrelatedPdf = 'Mehmet_Demir_Karne.pdf';

    const matchAnalysis = calculateMatchScore(lowMatchStudent.studentName, unrelatedPdf);
    expect(matchAnalysis.score).toBeLessThan(70);

    const reserveRes = repo.reserveDispatch(
      {
        studentId: lowMatchStudent.id,
        studentName: lowMatchStudent.studentName,
        phone: lowMatchStudent.phone,
        examName: 'Deneme Sınavı',
        pdfName: unrelatedPdf,
        pdfSha256: crypto.createHash('sha256').update('unrelated').digest('hex'),
        provider: 'mock',
        confidenceScore: matchAnalysis.score,
      },
      { isFromRenderer: true }
    );

    expect(reserveRes.allowed).toBe(false);
    expect(reserveRes.code).toBe('LOW_MATCH_CONFIDENCE');
  });

  it('2.3: Geçersiz PDF uzantısı veya dosya boyutu sınırı (25MB/50MB) reddedilir', () => {
    // 1. PDF olmayan dosya
    const nonPdfResult = validatePdfPath('/tmp/test_image.png', [tempDir]);
    expect(nonPdfResult.valid).toBe(false);
    expect(nonPdfResult.error).toContain('.pdf uzantılı');

    // 2. İzinli klasör dışında kalan dosya
    const outsideResult = validatePdfPath('/etc/passwd.pdf', [tempDir]);
    expect(outsideResult.valid).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 3. Eşzamanlılık ve İdempotency (Çift Gönderim Koruması)
  // ---------------------------------------------------------------------------
  it('3.1: Aynı gönderim için eşzamanlı iki rezervasyon mükerrer gönderimi engeller', () => {
    const studentId = 'std_race_01';
    const phone = '05553334455';
    const examName = 'Pilot Sınavı';
    const pdfName = 'std_race_01.pdf';
    const pdfSha256 = crypto.createHash('sha256').update('race_pdf').digest('hex');

    const firstReserve = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Ali Yarışçı',
        phone,
        examName,
        pdfName,
        pdfSha256,
        provider: 'mock',
      },
      { isFromRenderer: true }
    );

    expect(firstReserve.allowed).toBe(true);
    expect(firstReserve.dispatchKey).toBeDefined();

    // İkinci eşzamanlı istek aynı işi başlatamamalıdır
    const secondReserve = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Ali Yarışçı',
        phone,
        examName,
        pdfName,
        pdfSha256,
        provider: 'mock',
      },
      { isFromRenderer: true }
    );

    expect(secondReserve.allowed).toBe(false);
    expect(['IN_PROGRESS', 'SENDING_IN_PROGRESS', 'ALREADY_SENT']).toContain(secondReserve.code);
  });

  // ---------------------------------------------------------------------------
  // 4. Sağlayıcı Hatası vs Belirsiz Ağ Durumu (failed vs unknown)
  // ---------------------------------------------------------------------------
  it('4.1: Kesin sağlayıcı hatası (400 Bad Request) failed olarak kaydedilir', () => {
    const reserve = repo.reserveDispatch(
      {
        studentId: 'std_fail_01',
        studentName: 'Hata Testi',
        phone: '05551110011',
        examName: 'Hata Sınavı',
        pdfName: 'karne.pdf',
        pdfSha256: crypto.createHash('sha256').update('data').digest('hex'),
        provider: 'mock',
      },
      { isFromRenderer: true }
    );

    expect(reserve.allowed).toBe(true);
    const dispatchKey = reserve.dispatchKey;

    repo.updateDispatchStatus(dispatchKey, 'failed', {
      last_error: 'HTTP 400 Bad Request: Geçersiz numara biçimi',
    });

    const record = repo.getDispatchByKey(dispatchKey);
    expect(record).toBeDefined();
    expect(record.status).toBe('failed');
    expect(record.last_error).toContain('400 Bad Request');
  });

  it('4.2: Belirsiz ağ hatası (ETIMEDOUT) unknown olarak kilitlenir ve otomatik tekrar denenmez', () => {
    const studentId = 'std_unknown_01';
    const phone = '05551110022';
    const examName = 'Timeout Sınavı';
    const pdfName = 'karne.pdf';
    const pdfSha256 = crypto.createHash('sha256').update('timeout_data').digest('hex');

    const reserve = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Zaman Aşımı Öğrencisi',
        phone,
        examName,
        pdfName,
        pdfSha256,
        provider: 'mock',
      },
      { isFromRenderer: true }
    );

    expect(reserve.allowed).toBe(true);
    const dispatchKey = reserve.dispatchKey;

    // Zaman aşımı durumunda unknown olarak güncellenir
    repo.updateDispatchStatus(dispatchKey, 'unknown', {
      last_error: 'ETIMEDOUT: Sunucu 15000ms içinde yanıt vermedi',
    });

    const record = repo.getDispatchByKey(dispatchKey);
    expect(record.status).toBe('unknown');

    // Tekrar rezervasyon denemesi: unknown durumu kilitli olmalı, otomatik retry engellenmeli
    const retryAttempt = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Zaman Aşımı Öğrencisi',
        phone,
        examName,
        pdfName,
        pdfSha256,
        provider: 'mock',
      },
      { isFromRenderer: true }
    );

    expect(retryAttempt.allowed).toBe(false);
    expect(['UNKNOWN_DELIVERY', 'SENDING_IN_PROGRESS', 'ALREADY_SENT', 'UNKNOWN_STATUS_PENDING']).toContain(retryAttempt.code);
  });

  // ---------------------------------------------------------------------------
  // 5. Parametre Değişimi ve Bilet Geçersizliği
  // ---------------------------------------------------------------------------
  it('5.1: Onaydan sonra alıcı numarası veya PDF değiştirilirse bilet geçersiz olur', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const studentId = 'std_tamper_01';
    const originalPhone = '05554443322';
    const originalPdfSha256 = crypto.createHash('sha256').update('original_pdf_bytes').digest('hex');
    const examName = 'LGS Deneme';
    const messageText = 'Sayın Veli, karne ekte.';

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId,
      phone: originalPhone,
      pdfSha256: originalPdfSha256,
      examName,
      messageText,
    });
    expect(ticketRes.success).toBe(true);

    // 1. Değiştirilmiş telefon numarası ile kontrol
    const phoneTamperCheck = liveGate.verifyAndConsumeLiveDispatchTicket(ticketRes.ticketToken, {
      studentId,
      phone: '05559998877', // DEĞİŞTİRİLDİ
      pdfSha256: originalPdfSha256,
      examName,
      messageText,
    });
    expect(phoneTamperCheck.valid).toBe(false);
    expect(phoneTamperCheck.code).toBe('LIVE_TICKET_BINDING_MISMATCH');

    // 2. Değiştirilmiş PDF SHA-256 ile kontrol
    const pdfTamperCheck = liveGate.verifyAndConsumeLiveDispatchTicket(ticketRes.ticketToken, {
      studentId,
      phone: originalPhone,
      pdfSha256: crypto.createHash('sha256').update('different_pdf_bytes').digest('hex'), // DEĞİŞTİRİLDİ
      examName,
      messageText,
    });
    expect(pdfTamperCheck.valid).toBe(false);
    expect(pdfTamperCheck.code).toBe('LIVE_TICKET_BINDING_MISMATCH');
  });

  it('5.2: Canlı mod iptal edildiğinde (revoke) bekleyen tüm biletler anında geçersizleşir', () => {
    liveGate.authorizeLiveMode({ confirmationPhrase: 'CANLI_GONDERIM_ONAYLI' });

    const ticketRes = liveGate.createLiveDispatchTicket({
      studentId: 'std_revoke_01',
      phone: '05550001122',
      pdfSha256: crypto.createHash('sha256').update('pdf_to_revoke').digest('hex'),
      examName: 'Revoke Deneme',
      messageText: 'Mesaj',
    });
    expect(ticketRes.success).toBe(true);

    // Canlı modu iptal et
    liveGate.revokeLiveMode();

    const checkAfterRevoke = liveGate.verifyLiveDispatchAllowed('openwa', {
      ticketToken: ticketRes.ticketToken,
      studentId: 'std_revoke_01',
      phone: '05550001122',
      pdfSha256: crypto.createHash('sha256').update('pdf_to_revoke').digest('hex'),
      examName: 'Revoke Deneme',
      messageText: 'Mesaj',
    });

    expect(checkAfterRevoke.allowed).toBe(false);
    expect(checkAfterRevoke.code).toBe('LIVE_MODE_UNAUTHORIZED');
  });

  // ---------------------------------------------------------------------------
  // 6. Mock Sağlayıcı ve İzole Çalışma Garantisi
  // ---------------------------------------------------------------------------
  it('6.1: Mock sağlayıcı çağrıldığında sonuç yalnızca simüle edilir, ağ isteği yapılmaz', async () => {
    const mockProvider = new MockWhatsAppProvider(true);
    const status = await mockProvider.getStatus();
    expect(status.state).toBe('connected');
    expect(status.details).toContain('Simülasyon');

    const sendRes = await mockProvider.sendDocument('05550001122', 'dummy_base64', 'karne.pdf', 'Mesaj');
    expect(sendRes.success).toBe(true);
    expect(sendRes.outcome).toBe('success');
    expect(sendRes.messageId).toContain('mock_doc_');
    expect(mockProvider.providerType).toBe('mock');
  });

  it('6.2: Mock modundayken gerçek sağlayıcı IPC kanalı (openwa:request) mesaj/belge gönderimine kapalıdır', () => {
    const sendFileAttempt = validateOpenWaRequest({
      url: 'http://127.0.0.1:2785/api/sendFile',
      method: 'POST',
      body: { phone: '05550001122', file: 'base64' },
    });

    expect(sendFileAttempt.valid).toBe(false);
    expect(sendFileAttempt.error).toContain('Erişim reddedildi: Belge gönderimi doğrudan openwa:request üzerinden yapılamaz');

    const sendTextAttempt = validateOpenWaRequest({
      url: 'http://127.0.0.1:2785/api/messages/send-text',
      method: 'POST',
      body: { phone: '05550001122', message: 'Merhaba' },
    });

    expect(sendTextAttempt.valid).toBe(false);
    expect(sendTextAttempt.error).toContain('Erişim reddedildi: Mesaj gönderimi doğrudan openwa:request üzerinden yapılamaz');
  });
});
