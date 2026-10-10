import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  DispatchRepository,
  computeSha256,
  computeDeterministicDispatchKey,
  normalizeRecipientPhone,
} = require('../electron/DispatchRepository.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preloadSource = fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8');

describe('Vatsap V2 — P0-3B.2: Deterministic Idempotency & Dispatch Reservation Test Suite', () => {
  let tempDir: string;
  let repo: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-reservation-test-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_reservation_test.db',
    });
  });

  afterEach(() => {
    if (repo && repo.isInitialized()) {
      repo.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore file lock errors during test teardown
      }
    }
  });

  // =========================================================================
  // 1. Deterministik SHA-256 ve Dispatch Key Doğrulaması
  // =========================================================================
  describe('1. Deterministik SHA-256 ve Kanonik Dispatch Key', () => {
    it('aynı girdi alanları için her zaman birebir aynı 64-karakter SHA-256 anahtarı üretir', () => {
      const inputs = {
        studentId: 'std_42',
        examName: '1. Dönem Ortak Sınavı',
        phone: '0532 111 22 33',
        pdfSha256: 'a69f73cca23a9ac5c8b567dc185a756e97a9fb21641084b672f1f41b166304c0',
      };

      const key1 = computeDeterministicDispatchKey(inputs);
      const key2 = computeDeterministicDispatchKey(inputs);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('telefon numarası farklı yazılsa dahi normalizasyon sayesinde aynı deterministik anahtarı üretir', () => {
      const baseSha = 'a69f73cca23a9ac5c8b567dc185a756e97a9fb21641084b672f1f41b166304c0';
      const keyFormatted = computeDeterministicDispatchKey({
        studentId: 'std_101',
        examName: 'Deneme 1',
        phone: '+90 (532) 111-22-33',
        pdfSha256: baseSha,
      });

      const keyStandard = computeDeterministicDispatchKey({
        studentId: 'std_101',
        examName: 'Deneme 1',
        phone: '05321112233',
        pdfSha256: baseSha,
      });

      const keyInternational = computeDeterministicDispatchKey({
        studentId: 'std_101',
        examName: 'Deneme 1',
        phone: '905321112233',
        pdfSha256: baseSha,
      });

      expect(keyFormatted).toBe(keyStandard);
      expect(keyFormatted).toBe(keyInternational);
    });

    it('öğrenci, sınav veya PDF içeriği değiştiğinde farklı bir anahtar üretir', () => {
      const base = {
        studentId: 'std_101',
        examName: 'Deneme 1',
        phone: '905321112233',
        pdfSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      const keyBase = computeDeterministicDispatchKey(base);

      const keyDifferentStudent = computeDeterministicDispatchKey({
        ...base,
        studentId: 'std_102',
      });
      const keyDifferentExam = computeDeterministicDispatchKey({
        ...base,
        examName: 'Deneme 2',
      });
      const keyDifferentPdf = computeDeterministicDispatchKey({
        ...base,
        pdfSha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      });

      expect(keyBase).not.toBe(keyDifferentStudent);
      expect(keyBase).not.toBe(keyDifferentExam);
      expect(keyBase).not.toBe(keyDifferentPdf);
    });

    it('PDF baytlarından computeSha256 ile gerçek SHA-256 hesaplanır', () => {
      const buffer = Buffer.from('%PDF-1.4 sample content for student Ali', 'utf8');
      const expectedSha = crypto.createHash('sha256').update(buffer).digest('hex');

      const computed = computeSha256(buffer);
      expect(computed).toBe(expectedSha);

      // 1 bayt değiştiğinde hash tamamen değişmeli
      const modifiedBuffer = Buffer.from('%PDF-1.4 sample content for student Ali!', 'utf8');
      expect(computeSha256(modifiedBuffer)).not.toBe(expectedSha);
    });
  });

  // =========================================================================
  // 2. Main Process Reservation Mekanizması (reserveDispatch)
  // =========================================================================
  describe('2. Main Process Reservation Kapısı (reserveDispatch)', () => {
    beforeEach(async () => {
      await repo.init();
    });

    it('yeni bir karne için ilk rezervasyon başarılı olur ve durum sending olarak işaretlenir', () => {
      const params = {
        studentId: 'std_201',
        studentName: 'Zeynep Kaya',
        phone: '0542 333 44 55',
        examName: 'Bursluluk Sınavı',
        pdfName: 'Zeynep Kaya.pdf',
        pdfSha256: '1111111111111111111111111111111111111111111111111111111111111111',
        provider: 'openwa',
      };

      const result = repo.reserveDispatch(params);

      expect(result.allowed).toBe(true);
      expect(result.isRetry).toBe(false);
      expect(result.dispatchKey).toBeDefined();
      expect(result.dispatch.status).toBe('sending');
      expect(result.dispatch.student_id).toBe('std_201');
      expect(result.dispatch.phone).toBe('905423334455');

      // Diske yazıldığını ve okunabildiğini doğrula
      const saved = repo.getDispatchByKey(result.dispatchKey);
      expect(saved).not.toBeNull();
      expect(saved.status).toBe('sending');
    });

    it('başarıyla gönderilmiş (sent) bir karne için rezervasyon kesinlikle ALREADY_SENT ile reddedilir', () => {
      const params = {
        studentId: 'std_202',
        studentName: 'Mehmet Öz',
        phone: '0533 999 88 77',
        examName: 'LGS Deneme 3',
        pdfName: 'Mehmet Öz.pdf',
        pdfSha256: '2222222222222222222222222222222222222222222222222222222222222222',
        provider: 'meta_cloud',
      };

      // 1. İlk rezervasyon
      const firstReservation = repo.reserveDispatch(params);
      expect(firstReservation.allowed).toBe(true);

      // 2. Sağlayıcı gönderimi başarılı oldu -> sent yapıldı
      repo.updateDispatchStatus(firstReservation.dispatchKey, 'sent', {
        provider_message_id: 'wamid.HBgLMTIzNDU2',
      });

      // 3. Aynı karne için ikinci rezervasyon denemesi
      const secondReservation = repo.reserveDispatch(params);

      expect(secondReservation.allowed).toBe(false);
      expect(secondReservation.code).toBe('ALREADY_SENT');
      expect(secondReservation.reason).toContain('daha önce başarıyla gönderilmiş');
      expect(secondReservation.existing.status).toBe('sent');
      expect(secondReservation.existing.provider_message_id).toBe('wamid.HBgLMTIzNDU2');
    });

    it('şu anda gönderilmekte olan (sending) bir karne için eşzamanlı ikinci rezervasyon IN_PROGRESS ile engellenir', () => {
      const params = {
        studentId: 'std_203',
        studentName: 'Ayşe Çelik',
        phone: '0555 123 45 67',
        examName: 'TYT Deneme 1',
        pdfName: 'Ayşe Çelik.pdf',
        pdfSha256: '3333333333333333333333333333333333333333333333333333333333333333',
        provider: 'openwa',
      };

      // İlk istek sending durumunda
      const first = repo.reserveDispatch(params);
      expect(first.allowed).toBe(true);

      // İkinci istek hemen ardından geldi (ilk iş henüz bitmedi)
      const duplicate = repo.reserveDispatch(params);

      expect(duplicate.allowed).toBe(false);
      expect(duplicate.code).toBe('IN_PROGRESS');
      expect(duplicate.reason).toContain('aktif olarak işleniyor');
    });

    it('başarısız olmuş (failed) bir gönderim için retry talebinde rezervasyona izin verilir ve retry_count artırılır', () => {
      const params = {
        studentId: 'std_204',
        studentName: 'Burak Tan',
        phone: '0505 555 66 77',
        examName: 'YDT Deneme',
        pdfName: 'Burak Tan.pdf',
        pdfSha256: '4444444444444444444444444444444444444444444444444444444444444444',
        provider: 'openwa',
      };

      // 1. İlk rezervasyon
      const first = repo.reserveDispatch(params);
      expect(first.allowed).toBe(true);

      // 2. Ağ hatası nedeniyle failed oldu
      repo.updateDispatchStatus(first.dispatchKey, 'failed', {
        last_error: 'HTTP 500 Internal Server Error',
      });

      const failedRecord = repo.getDispatchByKey(first.dispatchKey);
      expect(failedRecord.status).toBe('failed');
      expect(failedRecord.retry_count).toBe(0);

      // 3. Retry için tekrar rezerve et
      const retryResult = repo.reserveDispatch(params);

      expect(retryResult.allowed).toBe(true);
      expect(retryResult.isRetry).toBe(true);
      expect(retryResult.dispatch.status).toBe('sending');
      expect(retryResult.dispatch.retry_count).toBe(1);
    });

    it('belirsiz (unknown) teslimat durumunda kullanıcı açıkça izin vermedikçe UNKNOWN_DELIVERY ile engellenir', () => {
      const params = {
        studentId: 'std_205',
        studentName: 'Ece Vural',
        phone: '0530 000 11 22',
        examName: 'Deneme 5',
        pdfName: 'Ece Vural.pdf',
        pdfSha256: '5555555555555555555555555555555555555555555555555555555555555555',
        provider: 'openwa',
      };

      const first = repo.reserveDispatch(params);
      expect(first.allowed).toBe(true);

      // WhatsApp sunucusuna istek gönderildi ancak timeout nedeniyle yanıt alınamadı -> unknown
      repo.updateDispatchStatus(first.dispatchKey, 'unknown', {
        last_error: 'Ağ zaman aşımı (ETIMEDOUT)',
      });

      // Normal retry denemesi engellenmeli
      const blockedRetry = repo.reserveDispatch(params);
      expect(blockedRetry.allowed).toBe(false);
      expect(blockedRetry.code).toBe('UNKNOWN_DELIVERY');

      // allowUnknownRetry: true bayrağı ile açık kullanıcı onayı verilirse izin verilmeli
      const allowedRetry = repo.reserveDispatch(params, { allowUnknownRetry: true });
      expect(allowedRetry.allowed).toBe(true);
      expect(allowedRetry.isRetry).toBe(true);
      expect(allowedRetry.dispatch.status).toBe('sending');
    });

    it('aynı öğrencinin FARKLI bir sınavı veya FARKLI bir PDF içeriği engellenmez', () => {
      const exam1Params = {
        studentId: 'std_300',
        studentName: 'Can Yıldız',
        phone: '0532 777 88 99',
        examName: '1. Deneme',
        pdfName: 'Can Yıldız Deneme 1.pdf',
        pdfSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        provider: 'openwa',
      };

      const res1 = repo.reserveDispatch(exam1Params);
      expect(res1.allowed).toBe(true);
      repo.updateDispatchStatus(res1.dispatchKey, 'sent');

      // Aynı öğrencinin 2. Deneme sınavı
      const exam2Params = {
        studentId: 'std_300',
        studentName: 'Can Yıldız',
        phone: '0532 777 88 99',
        examName: '2. Deneme',
        pdfName: 'Can Yıldız Deneme 2.pdf',
        pdfSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        provider: 'openwa',
      };

      const res2 = repo.reserveDispatch(exam2Params);
      expect(res2.allowed).toBe(true);
      expect(res2.dispatchKey).not.toBe(res1.dispatchKey);
    });
  });

  // =========================================================================
  // 3. Preload Köprüsü Güvenlik Denetimi
  // =========================================================================
  describe('3. Preload Köprüsü & Güvenlik Sınırı', () => {
    it('preload.cjs içinde dispatch API mevcuttur ve raw SQL barındırmaz', () => {
      expect(preloadSource).toContain('dispatch: {');
      expect(preloadSource).toContain('reserve:');
      expect(preloadSource).toContain('updateStatus:');
      expect(preloadSource).toContain('getByKey:');
      expect(preloadSource).toContain('getByExam:');
      expect(preloadSource).toContain('computeKey:');

      // Güvenlik sınırları: Asla raw SQL sızdırılmamalı
      expect(preloadSource).not.toContain('executeSql');
      expect(preloadSource).not.toContain('rawQuery');
      expect(preloadSource).not.toContain('runSql');
      expect(preloadSource).not.toContain('sqlite');
    });
  });

  // =========================================================================
  // 4. Kuyruk ve Sıfır Sağlayıcı Çağrısı Güvencesi
  // =========================================================================
  describe('4. Rezervasyon Reddedildiğinde Sıfır Sağlayıcı Çağrısı', () => {
    it('Main Process rezervasyonu reddettiğinde provider kesinlikle sıfır (0) kez çağrılır', async () => {
      // Mock window.electronAPI
      const mockSendDocument = vi.fn().mockResolvedValue({
        success: true,
        outcome: 'success',
        pdfSent: true,
        messageSent: true,
      });

      const mockProvider: any = {
        providerType: 'mock',
        sendDocument: mockSendDocument,
        sendMessage: vi.fn(),
      };

      // Mock electronAPI with a rejected reservation
      const originalWindow = (global as any).window;
      (global as any).window = {
        electronAPI: {
          dispatch: {
            reserve: vi.fn().mockResolvedValue({
              allowed: false,
              code: 'ALREADY_SENT',
              reason: 'Bu karne daha önce başarıyla gönderildi.',
            }),
            updateStatus: vi.fn(),
          },
        },
      };

      // Import executeSenderQueue
      const { executeSenderQueue } = await import('../src/services/senderQueue');

      const mockItem: any = {
        id: 'item_test_1',
        student: {
          id: 'std_999',
          studentName: 'Ali Demir',
          phone: '0532 111 22 33',
        },
        pdfFile: {
          name: 'Ali Demir.pdf',
          size: 1024,
          base64: 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoK...',
        },
        confidenceScore: 98,
        status: 'ready',
        hasConflict: false,
        sendingStatus: 'pending',
      };

      const result = await executeSenderQueue({
        items: [mockItem],
        template: 'Merhaba {AD_SOYAD}',
        provider: mockProvider,
        delayMs: 0,
        maxRetries: 0,
        onProgress: vi.fn(),
        onItemUpdated: vi.fn(),
      });

      // Doğrulama: Sağlayıcıya ASLA gidilmemeli!
      expect(mockSendDocument).toHaveBeenCalledTimes(0);
      expect(mockProvider.sendMessage).toHaveBeenCalledTimes(0);
      expect(result.failedCount).toBe(1);
      expect(result.successCount).toBe(0);

      // Cleanup
      (global as any).window = originalWindow;
    });
  });
});
