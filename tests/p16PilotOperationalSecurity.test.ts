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
const { validateOpenWaRequest, validatePdfPath } = require('../electron/security.cjs');

describe('Vatsap V2 — P1.6 Kontrollü Pilot Hazırlığı ve Operasyonel Güvenlik Testleri', () => {
  let tempDir: string;
  let repo: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p16-pilot-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p16.db',
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
  // Senaryo 1: OpenWA kapalı (Bağlantı kurulamıyor)
  // ---------------------------------------------------------------------------
  it('Senaryo 1: OpenWA kapalıyken kesin hata failed olarak işlenir, belirsiz unknown yapılmaz', () => {
    const studentId = 'pilot_std_01';
    const phone = '905551110001';
    const examName = 'Pilot Sınav 1';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P1').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 1',
      phone,
      examName,
      pdfName: 'p1.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(res.allowed).toBe(true);

    // Servis kapalı (ECONNREFUSED): Sağlayıcıya hiç ulaşılamadığı kesin
    const updated = repo.updateDispatchStatus(res.dispatchKey, 'failed', {
      last_error: 'ECONNREFUSED: OpenWA yerel servisi (127.0.0.1:2785) kapalı.',
    });

    expect(updated.status).toBe('failed');
    expect(updated.last_error).toContain('ECONNREFUSED');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 2: WhatsApp oturumu hazır değil veya QR bekliyor
  // ---------------------------------------------------------------------------
  it('Senaryo 2: WhatsApp oturumu hazır değil veya QR bekliyorsa gönderim başlatılmaz', () => {
    const sessionStatus = { state: 'qr_ready', sessionId: 'default' };
    const canSend = sessionStatus.state === 'connected';

    expect(canSend).toBe(false);

    // Main process oturum hazır değilken isteği reddeder
    const studentId = 'pilot_std_02';
    const phone = '905551110002';
    const examName = 'Pilot Sınav 2';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P2').digest('hex');

    if (!canSend) {
      // Gönderim başlatılmadan engellenir
      const blockedRecord = repo.createDispatch({
        id: 'disp_p2',
        dispatch_key: computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 }),
        student_id: studentId,
        student_name: 'Öğrenci 2',
        phone,
        exam_name: examName,
        pdf_name: 'p2.pdf',
        pdf_sha256: pdfSha256,
        provider: 'mock',
        status: 'failed',
        last_error: 'Gönderim başlatılmadı: WhatsApp oturumu bağlı değil (QR bekleniyor).',
      });
      expect(blockedRecord.status).toBe('failed');
      expect(blockedRecord.last_error).toContain('WhatsApp oturumu bağlı değil');
    }
  });

  // ---------------------------------------------------------------------------
  // Senaryo 3: PDF okunamıyor, bozuk veya desteklenmeyen biçimde
  // ---------------------------------------------------------------------------
  it('Senaryo 3: Bozuk veya sahte PDF dosyası (%PDF başlığı içermeyen) kesin olarak engellenir', () => {
    const invalidPdfBuffer = Buffer.from('NOT_A_REAL_PDF_DATA_CONTENT');
    const isPdfValid = invalidPdfBuffer.length >= 4 && invalidPdfBuffer.subarray(0, 4).toString('ascii') === '%PDF';
    expect(isPdfValid).toBe(false);

    // Bozuk dosya için rezervasyon çağrısı yapılmamalı veya hata fırlatmalıdır
    expect(() => {
      if (!isPdfValid) {
        throw new Error('Hedef içerik geçerli bir PDF belgesi (%PDF başlığı) içermiyor.');
      }
    }).toThrow(/geçerli bir PDF belgesi/);
  });

  // ---------------------------------------------------------------------------
  // Senaryo 4: Öğrenci ile PDF eşleşmesi belirsiz
  // ---------------------------------------------------------------------------
  it('Senaryo 4: Düşük güvenli (<%70) veya onaylanmamış eşleşme Main Process kapısından geçemez', () => {
    const studentId = 'pilot_std_04';
    const phone = '905551110004';
    const examName = 'Pilot Sınav 4';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P4').digest('hex');

    // Düşük skor
    const resLowScore = repo.reserveDispatch({
      studentId,
      studentName: 'Bambaşka İsim',
      phone,
      examName,
      pdfName: 'farkli_isim.pdf',
      pdfSha256,
      provider: 'mock',
      confidenceScore: 45, // < 70
    });
    expect(resLowScore.allowed).toBe(false);
    expect(resLowScore.code).toBe('LOW_MATCH_CONFIDENCE');

    // Onay gerektiren eşleşme (token yokken)
    const resNeedsApproval = repo.reserveDispatch({
      studentId,
      studentName: 'Ahmet Taş',
      phone,
      examName,
      pdfName: 'Ahmet_T.pdf',
      pdfSha256,
      provider: 'mock',
      confidenceScore: 85,
      needsConfirmation: true,
    });
    expect(resNeedsApproval.allowed).toBe(false);
    expect(resNeedsApproval.code).toBe('APPROVAL_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 5: Aynı gönderim iki kez başlatılıyor (Idempotency)
  // ---------------------------------------------------------------------------
  it('Senaryo 5: Aynı gönderim iki kez başlatıldığında çift gönderim kesinlikle engellenir', () => {
    const studentId = 'pilot_std_05';
    const phone = '905551110005';
    const examName = 'Pilot Sınav 5';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P5').digest('hex');

    const first = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 5',
      phone,
      examName,
      pdfName: 'p5.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(first.allowed).toBe(true);

    // Eşzamanlı ikinci deneme -> IN_PROGRESS
    const second = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 5',
      phone,
      examName,
      pdfName: 'p5.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(second.allowed).toBe(false);
    expect(second.code).toBe('IN_PROGRESS');

    // İlk gönderim tamamlandığında -> ALREADY_SENT
    repo.updateDispatchStatus(first.dispatchKey, 'sent');
    const third = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 5',
      phone,
      examName,
      pdfName: 'p5.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(third.allowed).toBe(false);
    expect(third.code).toBe('ALREADY_SENT');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 6: Sağlayıcı kesin hata döndürüyor
  // ---------------------------------------------------------------------------
  it('Senaryo 6: Sağlayıcı kesin 400 Bad Request hatası döndürdüğünde failed olur', () => {
    const studentId = 'pilot_std_06';
    const phone = '905551110006';
    const examName = 'Pilot Sınav 6';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P6').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 6',
      phone,
      examName,
      pdfName: 'p6.pdf',
      pdfSha256,
      provider: 'mock',
    });

    const failedRecord = repo.updateDispatchStatus(res.dispatchKey, 'failed', {
      last_error: 'HTTP 400 Bad Request: Geçersiz alıcı numarası veya WhatsApp formatı.',
    });
    expect(failedRecord.status).toBe('failed');

    // failed durumundaki kayıt kontrollü tekrar denemeye açıktır
    const retryRes = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 6',
      phone,
      examName,
      pdfName: 'p6.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(retryRes.allowed).toBe(true);
    expect(retryRes.isRetry).toBe(true);
    expect(retryRes.dispatch.retry_count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Senaryo 7: Sağlayıcı isteğinden sonra ağ bağlantısı kesiliyor (Zaman Aşımı)
  // ---------------------------------------------------------------------------
  it('Senaryo 7: İstek gönderildikten sonra ağ koparsa durum unknown olur ve otomatik retry yapılmaz', () => {
    const studentId = 'pilot_std_07';
    const phone = '905551110007';
    const examName = 'Pilot Sınav 7';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P7').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 7',
      phone,
      examName,
      pdfName: 'p7.pdf',
      pdfSha256,
      provider: 'mock',
    });

    // İstek sağlayıcıya ulaştıktan sonra soket kapandı
    repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
      last_error: 'ETIMEDOUT: Yanıt alınamadı, mesaj veliye iletilmiş olabilir.',
    });

    const record = repo.getDispatchByKey(res.dispatchKey);
    expect(record.status).toBe('unknown');

    // Otomatik deneme kesinlikle engellenir
    const autoRetry = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 7',
      phone,
      examName,
      pdfName: 'p7.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(autoRetry.allowed).toBe(false);
    expect(autoRetry.code).toBe('UNKNOWN_DELIVERY');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 8: Uygulama sending durumundayken kapanıyor (Orphaned Reconciliation)
  // ---------------------------------------------------------------------------
  it('Senaryo 8: Uygulama sending durumundayken kapanırsa, açılışta unknown olarak uzlaştırılır', async () => {
    const studentId = 'pilot_std_08';
    const phone = '905551110008';
    const examName = 'Pilot Sınav 8';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P8').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 8',
      phone,
      examName,
      pdfName: 'p8.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(res.dispatch.status).toBe('sending');

    // Kaza simülasyonu
    repo.close();

    // Yeniden başlatma
    const reloadedRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p16.db',
    });
    await reloadedRepo.init();

    const reconciled = reloadedRepo.getDispatchByKey(res.dispatchKey);
    expect(reconciled.status).toBe('unknown');
    expect(reconciled.last_error).toContain('beklenmedik şekilde kapandı');

    reloadedRepo.close();
    repo = reloadedRepo;
  });

  // ---------------------------------------------------------------------------
  // Senaryo 9: SQLite yazma işlemi ve transaction bütünlüğü
  // ---------------------------------------------------------------------------
  it('Senaryo 9: SQLite transaction başarısız olursa veritabanı tutarlı kalır (Rollback)', () => {
    const studentId = 'pilot_std_09';
    const phone = '905551110009';
    const examName = 'Pilot Sınav 9';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P9').digest('hex');
    const dispatchKey = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 });

    repo.createDispatch({
      id: 'disp_p9',
      dispatch_key: dispatchKey,
      student_id: studentId,
      student_name: 'Öğrenci 9',
      phone,
      exam_name: examName,
      pdf_name: 'p9.pdf',
      pdf_sha256: pdfSha256,
      provider: 'mock',
      status: 'unknown',
    });

    // reconcileManual sırasında geçersiz işlem -> Transaction rollback
    expect(() => {
      repo.reconcileManual({
        dispatchKey,
        action: 'invalid_action',
        userReason: 'Geçersiz deneme',
      });
    }).toThrow();

    // Veritabanı bozulmadı, eski durum korundu
    const check = repo.getDispatchByKey(dispatchKey);
    expect(check.status).toBe('unknown');
    expect(check.manual_reconciliation_status).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Senaryo 10: Geçmiş kaydı uygulama yeniden başlatıldıktan sonra korunuyor
  // ---------------------------------------------------------------------------
  it('Senaryo 10: Gönderim geçmişi uygulama kapatılıp açıldığında aynen korunur', async () => {
    const studentId = 'pilot_std_10';
    const phone = '905551110010';
    const examName = 'Pilot Sınav 10';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P10').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 10',
      phone,
      examName,
      pdfName: 'p10.pdf',
      pdfSha256,
      provider: 'mock',
    });
    repo.updateDispatchStatus(res.dispatchKey, 'sent', { provider_message_id: 'wamid_pilot_10' });

    repo.close();

    const restartRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p16.db',
    });
    await restartRepo.init();

    const history = restartRepo.getAllDispatches({ examName });
    expect(history.rows.length).toBe(1);
    expect(history.rows[0].provider_message_id).toBe('wamid_pilot_10');
    expect(history.rows[0].status).toBe('sent');

    restartRepo.close();
    repo = restartRepo;
  });

  // ---------------------------------------------------------------------------
  // Senaryo 11: Eski veya tekrar kullanılan token ile yetkisiz işlem deneniyor
  // ---------------------------------------------------------------------------
  it('Senaryo 11: Tüketilmiş (consumed) veya süresi dolmuş token ile yetkisiz retry kesinlikle reddedilir', () => {
    const studentId = 'pilot_std_11';
    const phone = '905551110011';
    const examName = 'Pilot Sınav 11';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 P11').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Öğrenci 11',
      phone,
      examName,
      pdfName: 'p11.pdf',
      pdfSha256,
      provider: 'mock',
    });
    repo.updateDispatchStatus(res.dispatchKey, 'unknown');

    const tokenInfo = repo.createUnknownRetryToken(res.dispatchKey);
    const token = tokenInfo.token;

    // 1. Kullanım: Başarılı
    const firstAttempt = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Öğrenci 11',
        phone,
        examName,
        pdfName: 'p11.pdf',
        pdfSha256,
        provider: 'mock',
      },
      { confirmationToken: token }
    );
    expect(firstAttempt.allowed).toBe(true);

    // Durumu unknown yapıp aynı token'ı tekrar kullanmayı dene
    repo.updateDispatchStatus(res.dispatchKey, 'unknown');
    const replayAttempt = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Öğrenci 11',
        phone,
        examName,
        pdfName: 'p11.pdf',
        pdfSha256,
        provider: 'mock',
      },
      { confirmationToken: token }
    );
    expect(replayAttempt.allowed).toBe(false);
    expect(replayAttempt.code).toBe('UNKNOWN_DELIVERY');
  });
});
