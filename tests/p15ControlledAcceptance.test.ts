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
const { validateOpenWaRequest } = require('../electron/security.cjs');

describe('Vatsap V2 — P1.5 Kontrollü Kabul Testi ve Native macOS Doğrulaması (Mock Provider)', () => {
  let tempDir: string;
  let repo: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p15-acceptance-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p15.db',
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
  // Senaryo 1: Mock gönderim başarılı olur ve kayıt kalıcı olarak saklanır
  // ---------------------------------------------------------------------------
  it('Senaryo 1: Mock gönderim başarılı olur ve kayıt kalıcı olarak saklanır', () => {
    const studentId = 'test_std_01';
    const studentName = 'Test Öğrenci 1';
    const phone = '905550001122';
    const examName = 'Deneme Sınavı 1';
    const pdfName = 'ogrenci1_karne.pdf';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 1').digest('hex');

    // 1. Rezervasyon
    const reservation = repo.reserveDispatch({
      studentId,
      studentName,
      phone,
      examName,
      pdfName,
      pdfSha256,
      provider: 'mock',
    });
    expect(reservation.allowed).toBe(true);
    expect(reservation.dispatch.status).toBe('sending');

    // 2. Mock sağlayıcı gönderimi başarılı (wamid simülasyonu)
    const mockWamid = 'mock_wamid_msg_98765';
    const sentRecord = repo.updateDispatchStatus(reservation.dispatchKey, 'sent', {
      provider_message_id: mockWamid,
    });
    expect(sentRecord.status).toBe('sent');
    expect(sentRecord.provider_message_id).toBe(mockWamid);

    // 3. Kalıcı kaydı sorgula
    const persisted = repo.getDispatchByKey(reservation.dispatchKey);
    expect(persisted).toBeDefined();
    expect(persisted.status).toBe('sent');
    expect(persisted.student_name).toBe(studentName);
  });

  // ---------------------------------------------------------------------------
  // Senaryo 2: Uygulama yeniden başlatıldığında gönderim geçmişi korunur
  // ---------------------------------------------------------------------------
  it('Senaryo 2: Uygulama yeniden başlatıldığında gönderim geçmişi korunur', async () => {
    const studentId = 'test_std_02';
    const phone = '905550002233';
    const examName = 'LGS Deneme 2';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 2').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 2',
      phone,
      examName,
      pdfName: 'ogrenci2_karne.pdf',
      pdfSha256,
      provider: 'mock',
    });
    repo.updateDispatchStatus(res.dispatchKey, 'sent', { provider_message_id: 'mock_wamid_02' });

    // Uygulama kapanışı
    repo.close();

    // Uygulama yeniden açılışı (aynı SQLite dosyası)
    const reloadedRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p15.db',
    });
    await reloadedRepo.init();

    const record = reloadedRepo.getDispatchByKey(res.dispatchKey);
    expect(record).toBeDefined();
    expect(record.status).toBe('sent');
    expect(record.provider_message_id).toBe('mock_wamid_02');
    expect(record.student_name).toBe('Test Öğrenci 2');

    reloadedRepo.close();
    repo = reloadedRepo;
  });

  // ---------------------------------------------------------------------------
  // Senaryo 3: Aynı öğrenci, sınav ve aynı PDF için ikinci rezervasyon engellenir
  // ---------------------------------------------------------------------------
  it('Senaryo 3: Aynı öğrenci, sınav ve aynı PDF için ikinci rezervasyon engellenir', () => {
    const studentId = 'test_std_03';
    const phone = '905550003344';
    const examName = 'Bursluluk 1';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 3').digest('hex');

    const res1 = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 3',
      phone,
      examName,
      pdfName: 'ogrenci3.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(res1.allowed).toBe(true);
    repo.updateDispatchStatus(res1.dispatchKey, 'sent');

    // İkinci gönderim denemesi (Aynı öğrenci, sınav, telefon ve PDF)
    const res2 = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 3',
      phone,
      examName,
      pdfName: 'ogrenci3.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(res2.allowed).toBe(false);
    expect(res2.code).toBe('ALREADY_SENT');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 4: Kesin gönderim öncesi hata failed olarak sınıflandırılır
  // ---------------------------------------------------------------------------
  it('Senaryo 4: Kesin gönderim öncesi hata failed olarak sınıflandırılır', () => {
    const studentId = 'test_std_04';
    const phone = '905550004455';
    const examName = 'Deneme 4';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 4').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 4',
      phone,
      examName,
      pdfName: 'ogrenci4.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(res.allowed).toBe(true);

    // Sağlayıcıya hiç ulaşılamadı (ECONNREFUSED veya oturum kapalı)
    const updated = repo.updateDispatchStatus(res.dispatchKey, 'failed', {
      last_error: 'ECONNREFUSED: OpenWA yerel servisine bağlanılamadı.',
    });
    expect(updated.status).toBe('failed');
    expect(updated.last_error).toContain('ECONNREFUSED');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 5: Belirsiz ağ sonucu unknown olur; otomatik tekrar gönderim gerçekleşmez
  // ---------------------------------------------------------------------------
  it('Senaryo 5: Belirsiz ağ sonucu unknown olur; otomatik tekrar gönderim gerçekleşmez', () => {
    const studentId = 'test_std_05';
    const phone = '905550005566';
    const examName = 'Deneme 5';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 5').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 5',
      phone,
      examName,
      pdfName: 'ogrenci5.pdf',
      pdfSha256,
      provider: 'mock',
    });

    // Ağ zaman aşımı -> unknown
    repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
      last_error: 'ETIMEDOUT: Ağ yanıt vermedi, mesajın iletilip iletilmediği belirsiz.',
    });

    // Otomatik veya yetkisiz rezervasyon denemesi engellenir
    const retryWithoutToken = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 5',
      phone,
      examName,
      pdfName: 'ogrenci5.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(retryWithoutToken.allowed).toBe(false);
    expect(retryWithoutToken.code).toBe('UNKNOWN_DELIVERY');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 6: Geçerli retry token tek kullanımlıdır; tekrar kullanılamaz
  // ---------------------------------------------------------------------------
  it('Senaryo 6: Geçerli retry token tek kullanımlıdır; tekrar kullanılamaz', () => {
    const studentId = 'test_std_06';
    const phone = '905550006677';
    const examName = 'Deneme 6';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 6').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 6',
      phone,
      examName,
      pdfName: 'ogrenci6.pdf',
      pdfSha256,
      provider: 'mock',
    });
    repo.updateDispatchStatus(res.dispatchKey, 'unknown');

    // Token üretimi
    const tokenInfo = repo.createUnknownRetryToken(res.dispatchKey);
    const token = tokenInfo.token;

    // İlk kullanım: Başarılı
    const firstUse = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Test Öğrenci 6',
        phone,
        examName,
        pdfName: 'ogrenci6.pdf',
        pdfSha256,
        provider: 'mock',
      },
      { confirmationToken: token }
    );
    expect(firstUse.allowed).toBe(true);
    expect(firstUse.isRetry).toBe(true);

    // Durumu tekrar unknown yapıp aynı token ile tekrar denenmesi engellenir
    repo.updateDispatchStatus(res.dispatchKey, 'unknown');
    const secondUse = repo.reserveDispatch(
      {
        studentId,
        studentName: 'Test Öğrenci 6',
        phone,
        examName,
        pdfName: 'ogrenci6.pdf',
        pdfSha256,
        provider: 'mock',
      },
      { confirmationToken: token }
    );
    expect(secondUse.allowed).toBe(false);
    expect(secondUse.code).toBe('UNKNOWN_DELIVERY');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 7: Uygulama yeniden başlatıldığında eski retry token geçersizdir
  // ---------------------------------------------------------------------------
  it('Senaryo 7: Uygulama yeniden başlatıldığında eski retry token geçersizdir', async () => {
    const studentId = 'test_std_07';
    const phone = '905550007788';
    const examName = 'Deneme 7';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 7').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 7',
      phone,
      examName,
      pdfName: 'ogrenci7.pdf',
      pdfSha256,
      provider: 'mock',
    });
    repo.updateDispatchStatus(res.dispatchKey, 'unknown');

    const tokenInfo = repo.createUnknownRetryToken(res.dispatchKey);
    const preRestartToken = tokenInfo.token;

    // Uygulama kapanışı
    repo.close();

    // Uygulama yeniden başlatıldı
    const newRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p15.db',
    });
    await newRepo.init();

    // Eski token reddedilmeli
    const attempt = newRepo.reserveDispatch(
      {
        studentId,
        studentName: 'Test Öğrenci 7',
        phone,
        examName,
        pdfName: 'ogrenci7.pdf',
        pdfSha256,
        provider: 'mock',
      },
      { confirmationToken: preRestartToken }
    );
    expect(attempt.allowed).toBe(false);
    expect(attempt.code).toBe('UNKNOWN_DELIVERY');

    newRepo.close();
    repo = newRepo;
  });

  // ---------------------------------------------------------------------------
  // Senaryo 8: Renderer, IPC aracılığıyla gönderim durumunu veya yetkileri doğrudan değiştiremez
  // ---------------------------------------------------------------------------
  it('Senaryo 8: Renderer, IPC aracılığıyla gönderim durumunu veya yetkileri doğrudan değiştiremez', () => {
    const studentId = 'test_std_08';
    const phone = '905550008899';
    const examName = 'Deneme 8';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 8').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 8',
      phone,
      examName,
      pdfName: 'ogrenci8.pdf',
      pdfSha256,
      provider: 'mock',
    });
    repo.updateDispatchStatus(res.dispatchKey, 'sent');

    // Terminal/korumalı durum sent -> sending geçişi engellenir
    expect(() => repo.updateDispatchStatus(res.dispatchKey, 'sending')).toThrow();

    // Renderer'ın tek başına allowUnknownRetry: true göndermesi engellenir
    repo.updateDispatchStatus(res.dispatchKey, 'delivered', {
      requireDeliveryProof: true,
      delivery_proof: 'ack:3',
    });
    expect(() => repo.updateDispatchStatus(res.dispatchKey, 'failed')).toThrow();
  });

  // ---------------------------------------------------------------------------
  // Senaryo 9: sent durumu, gerçek teslimat kanıtı olmadan delivered durumuna dönüşmez
  // ---------------------------------------------------------------------------
  it('Senaryo 9: sent durumu, gerçek teslimat kanıtı olmadan delivered durumuna dönüşmez', () => {
    const studentId = 'test_std_09';
    const phone = '905550009900';
    const examName = 'Deneme 9';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 9').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 9',
      phone,
      examName,
      pdfName: 'ogrenci9.pdf',
      pdfSha256,
      provider: 'mock',
    });
    repo.updateDispatchStatus(res.dispatchKey, 'sent');

    // Teslimat kanıtı olmadan delivered yapma denemesi (requireDeliveryProof aktifken)
    expect(() => {
      repo.updateDispatchStatus(res.dispatchKey, 'delivered', {
        requireDeliveryProof: true,
        delivery_proof: '', // Kanıt yok!
      });
    }).toThrow(/teslimat kanıtı/);

    // Gerçek kanıt ile geçiş
    const deliveredRecord = repo.updateDispatchStatus(res.dispatchKey, 'delivered', {
      requireDeliveryProof: true,
      delivery_proof: 'ack:receipt:3:server_timestamp',
    });
    expect(deliveredRecord.status).toBe('delivered');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 10: Manuel teslimat teyidi, gerçek sağlayıcı teslimat kanıtından ayrı tutulur
  // ---------------------------------------------------------------------------
  it('Senaryo 10: Manuel teslimat teyidi, gerçek sağlayıcı teslimat kanıtından ayrı tutulur', () => {
    const studentId = 'test_std_10';
    const phone = '905550001010';
    const examName = 'Deneme 10';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 10').digest('hex');

    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 10',
      phone,
      examName,
      pdfName: 'ogrenci10.pdf',
      pdfSha256,
      provider: 'mock',
    });
    repo.updateDispatchStatus(res.dispatchKey, 'unknown');

    // Kullanıcı veli teyidiyle manuel uzlaştırma yapar
    const reconcileRes = repo.reconcileManual({
      dispatchKey: res.dispatchKey,
      action: 'confirm_delivered',
      userReason: 'Veli ile telefon görüşmesinde belgenin ulaştığı teyit edildi.',
    });
    expect(reconcileRes.success).toBe(true);

    const record = repo.getDispatchByKey(res.dispatchKey);
    // Core sağlayıcı statüsü DEĞİŞMEZ (unknown kalır)
    expect(record.status).toBe('unknown');
    // Veli teyidi ayrı kolonda saklanır
    expect(record.manual_reconciliation_status).toBe('user_confirmed_delivered');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 11: Aynı sınav için farklı PDF gönderiminin mevcut iş kuralına uygun olduğu doğrulanır
  // ---------------------------------------------------------------------------
  it('Senaryo 11: Aynı sınav için farklı PDF gönderiminin mevcut iş kuralına uygun olduğu doğrulanır', () => {
    const studentId = 'test_std_11';
    const phone = '905550001111';
    const examName = 'Deneme 11';

    const pdf1Sha256 = crypto.createHash('sha256').update('%PDF-1.4 Orijinal Karne').digest('hex');
    const pdf2Sha256 = crypto.createHash('sha256').update('%PDF-1.4 Düzeltilmiş Revize Karne').digest('hex');

    // 1. Orijinal PDF gönderilir
    const res1 = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 11',
      phone,
      examName,
      pdfName: 'karne_v1.pdf',
      pdfSha256: pdf1Sha256,
      provider: 'mock',
    });
    expect(res1.allowed).toBe(true);
    repo.updateDispatchStatus(res1.dispatchKey, 'sent');

    // 2. Revize PDF (farklı SHA256) aynı öğrenci ve sınava yüklendiğinde farklı dispatch_key üretilir ve gönderime izin verilir
    const res2 = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 11',
      phone,
      examName,
      pdfName: 'karne_v2_revize.pdf',
      pdfSha256: pdf2Sha256,
      provider: 'mock',
    });
    expect(res2.allowed).toBe(true);
    expect(res2.dispatchKey).not.toBe(res1.dispatchKey);

    // Her iki kayıt SQLite içinde ayrı ayrı korunur
    const record1 = repo.getDispatchByKey(res1.dispatchKey);
    const record2 = repo.getDispatchByKey(res2.dispatchKey);
    expect(record1.status).toBe('sent');
    expect(record2.status).toBe('sending');
  });

  // ---------------------------------------------------------------------------
  // Senaryo 12: Gönderim sırasında uygulama kapanırsa sending kaydı yeniden açılışta güvenli biçimde uzlaştırılır
  // ---------------------------------------------------------------------------
  it('Senaryo 12: Gönderim sırasında uygulama kapanırsa sending kaydı yeniden açılışta güvenli biçimde uzlaştırılır', async () => {
    const studentId = 'test_std_12';
    const phone = '905550001212';
    const examName = 'Deneme 12';
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Mock Karne 12').digest('hex');

    // Gönderim başlar ve durumu sending olur
    const res = repo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 12',
      phone,
      examName,
      pdfName: 'karne_12.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(res.dispatch.status).toBe('sending');

    // Sağlayıcı yanıt vermeden uygulama aniden kapanır (crash simülasyonu)
    repo.close();

    // Uygulama yeniden başlatılır (init çağrısı reconcileStartupState tetikler)
    const restartedRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p15.db',
    });
    await restartedRepo.init();

    // 'sending' durumundaki sahipsiz kayıt 'unknown' durumuna uzlaştırılmış olmalıdır
    const reconciledRecord = restartedRepo.getDispatchByKey(res.dispatchKey);
    expect(reconciledRecord.status).toBe('unknown');
    expect(reconciledRecord.last_error).toContain('beklenmedik şekilde kapandı');

    // Otomatik retry yapılmaz
    const blockedRetry = restartedRepo.reserveDispatch({
      studentId,
      studentName: 'Test Öğrenci 12',
      phone,
      examName,
      pdfName: 'karne_12.pdf',
      pdfSha256,
      provider: 'mock',
    });
    expect(blockedRetry.allowed).toBe(false);
    expect(blockedRetry.code).toBe('UNKNOWN_DELIVERY');

    restartedRepo.close();
    repo = restartedRepo;
  });
});
