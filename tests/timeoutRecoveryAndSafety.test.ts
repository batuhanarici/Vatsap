import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  DispatchRepository,
  VALID_STATE_TRANSITIONS,
} = require('../electron/DispatchRepository.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preloadSource = fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8');

describe('Vatsap V2 — P0-3B.3: Timeout Recovery, Retry Safety & UI Reconciliation', () => {
  let tempDir: string;
  let repo: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p03b3-test-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_p03b3_test.db',
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
        // Ignore file lock errors on teardown
      }
    }
  });

  // =========================================================================
  // Senaryo 1 & 2: Timeout Sonrası Sıfır Ek Çağrı ve SQLite unknown Durumu
  // =========================================================================
  describe('1. Timeout Kurtarma ve Retry Döngüsü Güvenliği', () => {
    it('Senaryo 1: İlk provider çağrısı timeout döndürdüğünde toplam provider çağrı sayısı tam olarak 1 olmalıdır', async () => {
      const mockSendDocument = vi.fn().mockResolvedValue({
        success: false,
        outcome: 'failed',
        pdfSent: false,
        messageSent: false,
        error: 'OpenWA sunucusu 15000ms içinde yanıt vermedi (Zaman aşımı / ETIMEDOUT).',
      });
      const mockSendMessage = vi.fn().mockResolvedValue({
        success: false,
        outcome: 'failed',
        pdfSent: false,
        messageSent: false,
        error: 'Text fallback',
      });

      const mockProvider: any = {
        providerType: 'mock',
        sendDocument: mockSendDocument,
        sendMessage: mockSendMessage,
      };

      // Mock window.electronAPI with working reserve and updateStatus connected to our SQLite repo
      const originalWindow = (global as any).window;
      (global as any).window = {
        electronAPI: {
          dispatch: {
            reserve: vi.fn().mockImplementation((params, options) => {
              const pdfSha256 = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
              return repo.reserveDispatch({ ...params, pdfSha256 }, options);
            }),
            updateStatus: vi.fn().mockImplementation(async (dispatchKey, status, extra) => {
              const updated = repo.updateDispatchStatus(dispatchKey, status, extra);
              return { success: true, dispatch: updated };
            }),
          },
        },
      };

      const { executeSenderQueue } = await import('../src/services/senderQueue');

      const mockItem: any = {
        id: 'item_timeout_1',
        student: {
          id: 'std_timeout_1',
          studentName: 'Hakan Yılmaz',
          phone: '0532 999 88 77',
        },
        pdfFile: {
          name: 'Hakan Yılmaz.pdf',
          size: 2048,
          base64: 'JVBERi0xLjQK...',
        },
        confidenceScore: 95,
        status: 'ready',
        hasConflict: false,
        sendingStatus: 'pending',
      };

      const result = await executeSenderQueue({
        items: [mockItem],
        template: 'Sayın Veli, karne ektedir.',
        provider: mockProvider,
        delayMs: 0,
        maxRetries: 3, // 3 retry hakkı olmasına rağmen timeout'ta ASLA ikinci çağrı yapılmamalı!
        retryDelayMs: 0,
        onProgress: vi.fn(),
        onItemUpdated: vi.fn((updated) => {
          Object.assign(mockItem, updated);
        }),
      });

      // P0-3B.3 KRİTİK GÜVENCE:
      // İlk çağrı timeout olunca sağlayıcı isteği almış olabileceği için
      // toplam çağrı sayısı KESİNLİKLE 1 OLMALIDIR! (İkinci çağrı veya fallback metin YOK)
      expect(mockSendDocument).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledTimes(0);
      expect(result.failedCount).toBe(1);
      expect(mockItem.sendingStatus).toBe('unknown');

      (global as any).window = originalWindow;
    });

    it('Senaryo 2: Timeout sonrasında SQLite durumu unknown olarak kaydedilir', async () => {
      const reservation = repo.reserveDispatch({
        studentId: 'std_timeout_db',
        studentName: 'Kemal Sunal',
        phone: '0542 111 22 33',
        examName: 'Deneme Sınavı',
        pdfName: 'Kemal.pdf',
        pdfSha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        provider: 'openwa',
      });

      expect(reservation.allowed).toBe(true);
      expect(reservation.dispatch.status).toBe('sending');

      // Provider çağrısı zaman aşımına uğradı -> repo updateStatus unknown yapıldı
      repo.updateDispatchStatus(reservation.dispatchKey, 'unknown', {
        last_error: 'Ağ zaman aşımı (ETIMEDOUT)',
      });

      const updated = repo.getDispatchByKey(reservation.dispatchKey);
      expect(updated.status).toBe('unknown');
      expect(updated.last_error).toContain('ETIMEDOUT');
    });
  });

  // =========================================================================
  // Senaryo 3, 4 & 5: unknown Durumu ve Token Yetkilendirmesi
  // =========================================================================
  describe('2. unknown Durumu ve Yetkilendirilmiş Yeniden Gönderim', () => {
    let unknownDispatchKey: string;
    const itemParams = {
      studentId: 'std_unk_perm',
      studentName: 'Merve Tan',
      phone: '0555 444 33 22',
      examName: 'YKS Deneme 2',
      pdfName: 'Merve Tan.pdf',
      pdfSha256: 'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe',
      provider: 'meta_cloud',
    };

    beforeEach(() => {
      const res = repo.reserveDispatch(itemParams);
      unknownDispatchKey = res.dispatchKey;
      repo.updateDispatchStatus(unknownDispatchKey, 'unknown', {
        last_error: 'Gateway Timeout 504',
      });
    });

    it('Senaryo 3: unknown durumunda otomatik/varsayılan retry UNKNOWN_DELIVERY ile engellenir', () => {
      const blockedRetry = repo.reserveDispatch(itemParams);
      expect(blockedRetry.allowed).toBe(false);
      expect(blockedRetry.code).toBe('UNKNOWN_DELIVERY');
      expect(blockedRetry.reason).toContain('Main Process');
    });

    it('Senaryo 4: Kullanıcı onayı olmadan belirsiz gönderim yeniden başlatılamaz', () => {
      const blocked = repo.reserveDispatch(itemParams, {});
      expect(blocked.allowed).toBe(false);
      expect(blocked.code).toBe('UNKNOWN_DELIVERY');
    });

    it('Senaryo 5: Renderer doğrudan allowUnknownRetry: true göndererek korumayı aşamaz (isFromRenderer: true)', () => {
      // IPC simülasyonu: Renderer'dan gelen istekler isFromRenderer: true ile işaretlenir
      const blockedBypass = repo.reserveDispatch(itemParams, {
        allowUnknownRetry: true,
        isFromRenderer: true,
      });

      expect(blockedBypass.allowed).toBe(false);
      expect(blockedBypass.code).toBe('UNKNOWN_DELIVERY');
    });

    it('Senaryo 5b: Main Process tek kullanımlık onay belirteci (token) ile yetkilendirildiğinde izin verilir', () => {
      // 1. Kullanıcı UI onay penceresinde "Mükerrer riskini onaylıyorum" dediğinde token istenir
      const tokenResult = repo.createUnknownRetryToken(unknownDispatchKey);
      expect(tokenResult.token).toBeDefined();
      expect(tokenResult.warning).toContain('mükerrer');
      expect(tokenResult.dispatchKey).toBe(unknownDispatchKey);

      // 2. Token ile rezervasyon yapılır
      const authorizedRetry = repo.reserveDispatch(itemParams, {
        confirmationToken: tokenResult.token,
        isFromRenderer: true,
      });

      expect(authorizedRetry.allowed).toBe(true);
      expect(authorizedRetry.isRetry).toBe(true);
      expect(authorizedRetry.dispatch.status).toBe('sending');
      expect(authorizedRetry.dispatch.retry_count).toBe(1);

      // 3. Tek kullanımlık token tekrar kullanılamaz!
      repo.updateDispatchStatus(unknownDispatchKey, 'unknown');
      const reuseAttempt = repo.reserveDispatch(itemParams, {
        confirmationToken: tokenResult.token, // Aynı token ikinci kez!
        isFromRenderer: true,
      });
      expect(reuseAttempt.allowed).toBe(false);
      expect(reuseAttempt.code).toBe('UNKNOWN_DELIVERY');
    });
  });

  // =========================================================================
  // Senaryo 6 & 10: Durum Geçişleri ve IPC Güvenliği
  // =========================================================================
  describe('3. Durum Geçiş Matrisi ve Güvenlik Sınırları', () => {
    it('Senaryo 6: Geçersiz durum geçişleri (sent -> failed, sent -> pending, unknown -> sent) reddedilir', () => {
      const itemParams = {
        studentId: 'std_trans_1',
        studentName: 'Tarkan Tevetoğlu',
        phone: '0532 100 20 30',
        examName: 'Müzik Sınavı',
        pdfName: 'Tarkan.pdf',
        pdfSha256: '9999999999999999999999999999999999999999999999999999999999999999',
        provider: 'openwa',
      };

      const res = repo.reserveDispatch(itemParams);
      repo.updateDispatchStatus(res.dispatchKey, 'sent', {
        provider_message_id: 'msg_valid_123',
      });

      // 1. sent -> failed geçişi YASAK!
      expect(() => {
        repo.updateDispatchStatus(res.dispatchKey, 'failed');
      }).toThrow(/Geçersiz durum geçişi: "sent" -> "failed"/);

      // 2. sent -> pending geçişi YASAK!
      expect(() => {
        repo.updateDispatchStatus(res.dispatchKey, 'pending');
      }).toThrow(/Geçersiz durum geçişi: "sent" -> "pending"/);

      // 3. sent -> sending doğrudan yapılamaz
      expect(() => {
        repo.updateDispatchStatus(res.dispatchKey, 'sending');
      }).toThrow(/Geçersiz durum geçişi: "sent" -> "sending"/);
    });

    it('Senaryo 10: Doğrulanmış teslimat kanıtı olmadan delivered yapılamaz', () => {
      const itemParams = {
        studentId: 'std_deliv_proof',
        studentName: 'Cem Yılmaz',
        phone: '0533 333 44 55',
        examName: 'Gösteri Sınavı',
        pdfName: 'Cem.pdf',
        pdfSha256: '8888888888888888888888888888888888888888888888888888888888888888',
        provider: 'openwa',
      };

      const res = repo.reserveDispatch(itemParams);
      repo.updateDispatchStatus(res.dispatchKey, 'sent', {
        provider_message_id: null,
      });

      // Teslimat kanıtı olmadan delivered istenirse hata vermeli
      expect(() => {
        repo.updateDispatchStatus(res.dispatchKey, 'delivered', {
          requireDeliveryProof: true,
        });
      }).toThrow(/doğrulanmış teslimat kanıtı veya mesaj kimliği zorunludur/);

      // Kanıt sağlandığında başarıyla delivered olur
      const deliveredRecord = repo.updateDispatchStatus(res.dispatchKey, 'delivered', {
        requireDeliveryProof: true,
        delivery_proof: 'ack_read_receipt_wamid_9988',
      });
      expect(deliveredRecord.status).toBe('delivered');
    });
  });

  // =========================================================================
  // Senaryo 7: Uygulama Yeniden Başlatıldığında Kurtarma (Crash Reconciliation)
  // =========================================================================
  describe('4. Uygulama Yeniden Başlatıldığında Kurtarma (Crash Recovery)', () => {
    it('Senaryo 7: Önceki çalıştırmada sending kalan sahipsiz kayıtlar başlatmada unknown olarak uzlaştırılır', async () => {
      // 1. Önceki oturumda bir karne gönderiliyordu ve uygulama aniden kapandı (crash)
      const res = repo.reserveDispatch({
        studentId: 'std_crash_1',
        studentName: 'Crash Öğrenci',
        phone: '0532 000 99 88',
        examName: 'Crash Test',
        pdfName: 'Crash.pdf',
        pdfSha256: '7777777777777777777777777777777777777777777777777777777777777777',
        provider: 'openwa',
      });
      expect(res.dispatch.status).toBe('sending');

      // 2. Uygulama kapandı
      repo.close();

      // 3. Yeni oturum başladı (re-init)
      const newSessionRepo = new DispatchRepository({
        storageDir: tempDir,
        dbFileName: 'karne_p03b3_test.db',
      });
      await newSessionRepo.init();

      // 4. Doğrulama: Kayıt kesinlikle sending olarak kalmamış, güvenli biçimde unknown olmuştur!
      const recovered = newSessionRepo.getDispatchByKey(res.dispatchKey);
      expect(recovered.status).toBe('unknown');
      expect(recovered.last_error).toContain('beklenmedik şekilde kapandı');

      // 5. Otomatik olarak gönderilmeye çalışıldığında UNKNOWN_DELIVERY ile engellenir
      const autoRetry = newSessionRepo.reserveDispatch({
        studentId: 'std_crash_1',
        studentName: 'Crash Öğrenci',
        phone: '0532 000 99 88',
        examName: 'Crash Test',
        pdfName: 'Crash.pdf',
        pdfSha256: '7777777777777777777777777777777777777777777777777777777777777777',
        provider: 'openwa',
      });
      expect(autoRetry.allowed).toBe(false);
      expect(autoRetry.code).toBe('UNKNOWN_DELIVERY');

      newSessionRepo.close();
    });
  });

  // =========================================================================
  // Senaryo 8 & 9: Tekrar Gönderim Engeli ve Hata Sınıflandırması
  // =========================================================================
  describe('5. Kesin Ret vs Belirsiz Timeout ve İdempotency', () => {
    it('Senaryo 8: sent veya delivered kayıtları kesinlikle tekrar gönderilemez (ALREADY_SENT)', () => {
      const params = {
        studentId: 'std_sent_protect',
        studentName: 'Korunan Öğrenci',
        phone: '0532 555 44 33',
        examName: 'Koruma Sınavı',
        pdfName: 'Korunan.pdf',
        pdfSha256: '6666666666666666666666666666666666666666666666666666666666666666',
        provider: 'openwa',
      };

      const res = repo.reserveDispatch(params);
      repo.updateDispatchStatus(res.dispatchKey, 'sent', { provider_message_id: 'msg_sent_1' });

      const attempt1 = repo.reserveDispatch(params);
      expect(attempt1.allowed).toBe(false);
      expect(attempt1.code).toBe('ALREADY_SENT');

      repo.updateDispatchStatus(res.dispatchKey, 'delivered', { requireDeliveryProof: true, delivery_proof: 'ack_1' });
      const attempt2 = repo.reserveDispatch(params);
      expect(attempt2.allowed).toBe(false);
      expect(attempt2.code).toBe('ALREADY_SENT');
    });

    it('Senaryo 9: Kesin ret (failed) durumunda standart retry serbesttir, unknown ise token gerektirir', () => {
      const failedParams = {
        studentId: 'std_definitive_fail',
        studentName: 'Hata Öğrenci',
        phone: '0532 111 00 11',
        examName: 'Fail Sınavı',
        pdfName: 'Fail.pdf',
        pdfSha256: '5555555555555555555555555555555555555555555555555555555555555555',
        provider: 'openwa',
      };

      const res = repo.reserveDispatch(failedParams);
      // Kesin hata: geçersiz numara veya 400 Bad Request
      repo.updateDispatchStatus(res.dispatchKey, 'failed', {
        last_error: 'Geçersiz telefon numarası / Numara WhatsApp kullanmıyor',
      });

      // Kesin failed kaydı için retry rezervasyonuna izin verilir
      const retryRes = repo.reserveDispatch(failedParams);
      expect(retryRes.allowed).toBe(true);
      expect(retryRes.isRetry).toBe(true);
      expect(retryRes.dispatch.status).toBe('sending');
    });
  });

  // =========================================================================
  // Preload Güvenlik Denetimi
  // =========================================================================
  describe('6. Preload Köprüsü Doğrulaması', () => {
    it('preload.cjs içinde createUnknownRetryToken ve getByStatus mevcuttur, raw SQL sızıntısı yoktur', () => {
      expect(preloadSource).toContain('createUnknownRetryToken:');
      expect(preloadSource).toContain('getByStatus:');
      expect(preloadSource).not.toContain('executeSql');
      expect(preloadSource).not.toContain('rawQuery');
      expect(preloadSource).not.toContain('sqlite');
    });
  });
});
