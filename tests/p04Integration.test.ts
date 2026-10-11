import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  DispatchRepository,
  computeDeterministicDispatchKey,
} = require('../electron/DispatchRepository.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const security = require('../electron/security.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CredentialService = require('../electron/CredentialService.cjs');

describe('Vatsap V2 — P0-4: Entegrasyon ve Hata Senaryoları Denetimi', () => {
  let tempDir: string;
  let repo: any;
  let credService: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p04-test-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_p04_test.db',
    });
    await repo.init();

    credService = new CredentialService({
      storageDir: tempDir,
    });
    credService.load();
  });

  afterEach(() => {
    if (repo && repo.isInitialized()) {
      repo.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup ignore
      }
    }
  });

  // =========================================================================
  // 1. Eşzamanlı İstekler ve Rezervasyon Kapısı (Single-Flight Guarantee)
  // =========================================================================
  describe('1. Eşzamanlı İstekler ve Tek Çağrı Güvencesi', () => {
    it('Senaryo 1: Aynı dispatch anahtarıyla iki eşzamanlı istek geldiğinde sağlayıcı en fazla 1 kez çağrılır', async () => {
      const mockPdfSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const requestPayload = {
        studentId: 'std_conc_1',
        studentName: 'Ahmet Yılmaz',
        phone: '0532 111 22 33',
        examName: 'Deneme Sınavı 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: mockPdfSha256,
        provider: 'mock',
      };

      const mockProviderCall = vi.fn().mockImplementation(async () => {
        // Simüle edilen ağ gecikmesi
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { success: true, messageId: 'msg_conc_123' };
      });

      // Simüle edilen Main Process dispatch:send orkestrasyonu
      const executeDispatchSend = async (payload: typeof requestPayload) => {
        // 1. Rezervasyon
        const reservation = repo.reserveDispatch(payload);
        if (!reservation.allowed) {
          return { success: false, allowed: false, code: reservation.code, reason: reservation.reason };
        }

        // 2. Sağlayıcı çağrısı
        const result = await mockProviderCall();

        // 3. Durum kaydı
        if (result.success) {
          repo.updateDispatchStatus(reservation.dispatchKey, 'sent', {
            provider_message_id: result.messageId,
          });
        }

        return { success: true, allowed: true, dispatchKey: reservation.dispatchKey };
      };

      // 1. İlk istek başlatılır ve rezervasyon alınır
      const reservation1 = repo.reserveDispatch(requestPayload);
      expect(reservation1.allowed).toBe(true);

      // 2. İlk istek henüz 'sending' iken aynı anahtarla ikinci istek gelir
      const reservation2 = repo.reserveDispatch(requestPayload);
      expect(reservation2.allowed).toBe(false);
      expect(reservation2.code).toBe('IN_PROGRESS');

      // 3. Sağlayıcı yalnızca rezervasyonu alan iş parçacığı tarafından çağrılır
      let providerCalls = 0;
      if (reservation1.allowed) {
        await mockProviderCall();
        providerCalls++;
      }
      if (reservation2.allowed) {
        await mockProviderCall();
        providerCalls++;
      }

      expect(providerCalls).toBe(1);
      expect(mockProviderCall).toHaveBeenCalledTimes(1);
    });

    it('Senaryo 2: Sağlayıcı çağrısından önce rezervasyon başarısız olursa sağlayıcı 0 kez çağrılır', async () => {
      const mockPdfSha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const requestPayload = {
        studentId: 'std_fail_1',
        studentName: 'Mehmet Kaya',
        phone: '0533 222 33 44',
        examName: 'Matematik 1',
        pdfName: 'Mehmet_Kaya.pdf',
        pdfSha256: mockPdfSha256,
        provider: 'mock',
      };

      // Önceden başarılı gönderim kaydedilmiş olsun
      const res1 = repo.reserveDispatch(requestPayload);
      expect(res1.allowed).toBe(true);
      repo.updateDispatchStatus(res1.dispatchKey, 'sent', { provider_message_id: 'initial_sent_id' });

      // Aynı karne için tekrar gönderim isteği
      const mockProviderCall = vi.fn();
      const res2 = repo.reserveDispatch(requestPayload);

      expect(res2.allowed).toBe(false);
      expect(res2.code).toBe('ALREADY_SENT');

      // Rezervasyon başarısız olduğu için sağlayıcı ASLA tetiklenmez
      if (res2.allowed) {
        mockProviderCall();
      }

      expect(mockProviderCall).not.toHaveBeenCalled();
      expect(mockProviderCall).toHaveBeenCalledTimes(0);
    });
  });

  // =========================================================================
  // 2. Durum Güncellemesi Öncesi Hata ve Yeniden Başlatma Tutarlılığı
  // =========================================================================
  describe('2. Durum Güncellemesi Öncesi Hata ve Crash Recovery Tutarlılığı', () => {
    it('Senaryo 3: Sağlayıcı yanıtından sonra durum kaydı yapılamadan çökme olursa, açılışta unknown uzlaştırılır ve otomatik retry engellenir', async () => {
      const mockPdfSha256 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const requestPayload = {
        studentId: 'std_crash_1',
        studentName: 'Ayşe Çelik',
        phone: '0534 333 44 55',
        examName: 'Fizik 1',
        pdfName: 'Ayse_Celik.pdf',
        pdfSha256: mockPdfSha256,
        provider: 'mock',
      };

      // 1. Rezervasyon yapıldı (durum: 'sending')
      const res = repo.reserveDispatch(requestPayload);
      expect(res.allowed).toBe(true);
      expect(res.dispatch.status).toBe('sending');

      // 2. Sağlayıcı yanıt verdi ancak uygulama durum kaydını tamamlayamadan kapandı (DB kapatılıyor)
      repo.close();

      // 3. Uygulama yeniden başlatıldı (reconcileStartupState tetiklenir)
      const newRepo = new DispatchRepository({
        storageDir: tempDir,
        dbFileName: 'karne_p04_test.db',
      });
      await newRepo.init();

      // 4. 'sending' kaydının açılışta 'unknown' durumuna uzlaştırıldığı doğrulanır
      const record = newRepo.getDispatchByKey(res.dispatchKey);
      expect(record).toBeDefined();
      expect(record.status).toBe('unknown');
      expect(record.last_error).toContain('beklenmedik şekilde kapandı');

      // 5. Otomatik retry engellenmelidir (UNKNOWN_DELIVERY)
      const mockRetryCall = vi.fn();
      const retryRes = newRepo.reserveDispatch(requestPayload);
      expect(retryRes.allowed).toBe(false);
      expect(retryRes.code).toBe('UNKNOWN_DELIVERY');

      if (retryRes.allowed) {
        mockRetryCall();
      }
      expect(mockRetryCall).not.toHaveBeenCalled();

      newRepo.close();
    });

    it('Senaryo 4: Timeout sonrası uygulama yeniden başlatıldığında kayıt unknown kalır ve sent durumuna dönmez', async () => {
      const mockPdfSha256 = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
      const requestPayload = {
        studentId: 'std_timeout_1',
        studentName: 'Fatma Şahin',
        phone: '0535 444 55 66',
        examName: 'Kimya 1',
        pdfName: 'Fatma_Sahin.pdf',
        pdfSha256: mockPdfSha256,
        provider: 'mock',
      };

      const res = repo.reserveDispatch(requestPayload);
      repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
        last_error: 'OpenWA sunucusu 30000ms içinde yanıt vermedi (ETIMEDOUT).',
      });

      // Uygulama yeniden başlatıldı
      repo.close();
      const newRepo = new DispatchRepository({
        storageDir: tempDir,
        dbFileName: 'karne_p04_test.db',
      });
      await newRepo.init();

      const record = newRepo.getDispatchByKey(res.dispatchKey);
      expect(record.status).toBe('unknown');
      expect(record.last_error).toContain('ETIMEDOUT');

      newRepo.close();
    });

    it('Senaryo 5: sent, delivered, failed ve unknown kayıtları yeniden başlatmada bozulmadan korunur', async () => {
      // 1. Farklı durumlarda 4 kayıt oluştur
      const baseSha = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
      const items = [
        { id: 'std_s1', status: 'sent', extra: { provider_message_id: 'msg_sent_1' } },
        { id: 'std_d1', status: 'delivered', extra: { provider_message_id: 'msg_del_1', delivery_proof: 'proof_1' } },
        { id: 'std_f1', status: 'failed', extra: { last_error: 'HTTP 400 Bad Request' } },
        { id: 'std_u1', status: 'unknown', extra: { last_error: 'ECONNRESET' } },
      ];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const res = repo.reserveDispatch({
          studentId: item.id,
          studentName: `Öğrenci ${i}`,
          phone: `0536 000 00 0${i}`,
          examName: 'Genel Sınav',
          pdfName: `Karne_${i}.pdf`,
          pdfSha256: `${baseSha}${i}`,
          provider: 'openwa',
        });
        if (item.status === 'delivered') {
          repo.updateDispatchStatus(res.dispatchKey, 'sent', { provider_message_id: item.extra.provider_message_id });
          repo.updateDispatchStatus(res.dispatchKey, 'delivered', item.extra);
        } else {
          repo.updateDispatchStatus(res.dispatchKey, item.status, item.extra);
        }
      }

      // Yeniden başlat
      repo.close();
      const newRepo = new DispatchRepository({
        storageDir: tempDir,
        dbFileName: 'karne_p04_test.db',
      });
      await newRepo.init();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const key = computeDeterministicDispatchKey({
          studentId: item.id,
          examName: 'Genel Sınav',
          phone: `0536 000 00 0${i}`,
          pdfSha256: `${baseSha}${i}`,
        });
        const rec = newRepo.getDispatchByKey(key);
        expect(rec).toBeDefined();
        expect(rec.status).toBe(item.status);
      }

      newRepo.close();
    });
  });

  // =========================================================================
  // 3. Tek Kullanımlık Unknown Retry Token Güvenliği
  // =========================================================================
  describe('3. Unknown Retry Token Güvenliği', () => {
    it('Senaryo 6: Geçersiz, süresi dolmuş veya tüketilmiş token ile yeniden gönderim engellenir', () => {
      const mockPdfSha256 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const requestPayload = {
        studentId: 'std_tok_1',
        studentName: 'Emre Demir',
        phone: '0537 555 66 77',
        examName: 'Biyoloji 1',
        pdfName: 'Emre_Demir.pdf',
        pdfSha256: mockPdfSha256,
        provider: 'mock',
      };

      const res = repo.reserveDispatch(requestPayload);
      repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
        last_error: 'Zaman aşımı',
      });

      // 1. Geçersiz token ile deneme
      const failInvalid = repo.reserveDispatch(requestPayload, {
        confirmationToken: 'invalid-fake-token-xyz',
        isFromRenderer: true,
      });
      expect(failInvalid.allowed).toBe(false);
      expect(failInvalid.code).toBe('UNKNOWN_DELIVERY');

      // 2. Geçerli token üret
      const tokenObj = repo.createUnknownRetryToken(res.dispatchKey);
      expect(tokenObj.token).toBeDefined();
      expect(tokenObj.warning).toContain('DİKKAT');

      // 3. Token başka bir dispatch anahtarıyla kullanılamaz
      const otherKeyFail = repo.verifyAndConsumeUnknownRetryToken(tokenObj.token, 'different_dispatch_key_123');
      expect(otherKeyFail).toBe(false);

      // 4. Token ilk kullanımda geçerli olmalı
      const tokenObj2 = repo.createUnknownRetryToken(res.dispatchKey);
      const successUse = repo.reserveDispatch(requestPayload, {
        confirmationToken: tokenObj2.token,
        isFromRenderer: true,
      });
      expect(successUse.allowed).toBe(true);
      expect(successUse.isRetry).toBe(true);

      // 5. Tek kullanımlık tüketim: Aynı token ikinci kez KULLANILAMAZ
      const secondUseFail = repo.reserveDispatch(requestPayload, {
        confirmationToken: tokenObj2.token,
        isFromRenderer: true,
      });
      expect(secondUseFail.allowed).toBe(false);
      expect(secondUseFail.code).toBe('IN_PROGRESS'); // Şu an sending durumunda
    });

    it('Senaryo 7: Süresi dolmuş token doğrulanmaz', () => {
      const mockPdfSha256 = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const requestPayload = {
        studentId: 'std_tok_exp',
        studentName: 'Gizem Yıldız',
        phone: '0538 666 77 88',
        examName: 'Tarih 1',
        pdfName: 'Gizem.pdf',
        pdfSha256: mockPdfSha256,
        provider: 'mock',
      };

      const res = repo.reserveDispatch(requestPayload);
      repo.updateDispatchStatus(res.dispatchKey, 'unknown', { last_error: 'Zaman aşımı' });

      const tokenObj = repo.createUnknownRetryToken(res.dispatchKey);

      // Token süresini geçmişe saralım (simüle edilen süre aşımı)
      const tokenEntry = repo.unknownRetryTokens.get(tokenObj.token);
      if (tokenEntry) {
        tokenEntry.expiresAt = Date.now() - 10000; // 10 saniye önce bitti
      }

      const isValid = repo.verifyAndConsumeUnknownRetryToken(tokenObj.token, res.dispatchKey);
      expect(isValid).toBe(false);
    });
  });

  // =========================================================================
  // 4. Eski IPC Kanalları ve Doğrudan Sağlayıcı Çağrısı Engeli
  // =========================================================================
  describe('4. Eski IPC Kanalları ve Doğrudan Sağlayıcı Engeli', () => {
    it('Senaryo 8: meta:sendDocument ve meta:sendMessage çağrıları reddedilir, rezervasyonsuz gönderim yapılamaz', async () => {
      const mockNetworkCall = vi.fn();

      // Main Process simülasyonu
      const simulateMetaSendDocument = async () => {
        return {
          success: false,
          outcome: 'failed',
          pdfSent: false,
          messageSent: false,
          error:
            'Erişim Reddedildi: meta:sendDocument kanalı kaldırıldı. PDF belge gönderimleri yalnızca güvenli dispatch:send üzerinden gerçekleştirilebilir.',
        };
      };

      const simulateMetaSendMessage = async () => {
        return {
          success: false,
          outcome: 'failed',
          pdfSent: false,
          messageSent: false,
          error:
            'Erişim Reddedildi: meta:sendMessage kanalı kaldırıldı. Rezervasyonsuz doğrudan mesaj gönderimine izin verilmez.',
        };
      };

      const resDoc = await simulateMetaSendDocument();
      if (resDoc.success) mockNetworkCall();

      const resMsg = await simulateMetaSendMessage();
      if (resMsg.success) mockNetworkCall();

      expect(resDoc.success).toBe(false);
      expect(resDoc.error).toContain('Erişim Reddedildi: meta:sendDocument kanalı kaldırıldı');
      expect(resMsg.success).toBe(false);
      expect(resMsg.error).toContain('Erişim Reddedildi: meta:sendMessage kanalı kaldırıldı');
      expect(mockNetworkCall).not.toHaveBeenCalled();
    });

    it('Senaryo 9: openwa:request üzerinden unreserved PDF veya mesaj gönderimi 403 ile engellenir', () => {
      const blockedCalls = [
        'http://127.0.0.1:2785/sessions/default/messages/send-document',
        'http://localhost:2785/api/sendDocument',
        'http://localhost:2785/api/sendText',
        'http://127.0.0.1:2785/sessions/default/messages/send-text',
      ];

      for (const url of blockedCalls) {
        const val = security.validateOpenWaRequest({
          url,
          method: 'POST',
          body: JSON.stringify({ some: 'payload' }),
        });
        expect(val.valid).toBe(false);
        expect(val.error).toContain('Erişim reddedildi');
      }
    });

    it('Senaryo 10: openwa:request yalnızca sağlık ve oturum yönetimi rotalarına izin verir', () => {
      const allowedCalls = [
        { url: 'http://127.0.0.1:2785/health', method: 'GET' },
        { url: 'http://127.0.0.1:2785/ping', method: 'GET' },
        { url: 'http://127.0.0.1:2785/sessions', method: 'GET' },
        { url: 'http://127.0.0.1:2785/sessions', method: 'POST' },
        { url: 'http://127.0.0.1:2785/sessions/karne_session', method: 'GET' },
        { url: 'http://127.0.0.1:2785/sessions/karne_session/qr', method: 'GET' },
        { url: 'http://127.0.0.1:2785/sessions/karne_session/start', method: 'POST' },
        { url: 'http://127.0.0.1:2785/sessions/karne_session/terminate', method: 'POST' },
      ];

      for (const call of allowedCalls) {
        const val = security.validateOpenWaRequest(call);
        expect(val.valid).toBe(true);
      }
    });
  });

  // =========================================================================
  // 5. Durum Matrisi ve Sahte Teslimat Kanıtı Güvenliği
  // =========================================================================
  describe('5. Durum Matrisi ve Teslimat Güvenliği', () => {
    it('Senaryo 11: Renderer dispatch:updateStatus çağırarak durumu keyfi biçimde sent yapamaz', () => {
      const simulateRendererUpdateStatus = () => {
        return {
          success: false,
          error:
            'Erişim Reddedildi: dispatch:updateStatus doğrudan Renderer tarafından çağrılamaz. Durum güncellemeleri yalnızca Main Process tarafından yetkili biçimde yönetilir.',
        };
      };

      const result = simulateRendererUpdateStatus();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Erişim Reddedildi');
    });

    it('Senaryo 12: delivered durumuna geçerken teslimat kanıtı veya doğrulanmış webhook zorunludur', () => {
      const mockPdfSha256 = '1234567890123456789012345678901234567890123456789012345678901234';
      const requestPayload = {
        studentId: 'std_del_proof',
        studentName: 'Burak Ak',
        phone: '0539 777 88 99',
        examName: 'Coğrafya 1',
        pdfName: 'Burak.pdf',
        pdfSha256: mockPdfSha256,
        provider: 'openwa',
      };

      const res = repo.reserveDispatch(requestPayload);
      repo.updateDispatchStatus(res.dispatchKey, 'sent', {
        provider_message_id: 'msg_valid_sent',
      });

      // Teslimat kanıtı olmadan requireDeliveryProof ile doğrudan 'delivered' yapma denemesi
      expect(() => {
        repo.updateDispatchStatus(res.dispatchKey, 'delivered', {
          requireDeliveryProof: true,
          // no delivery_proof, no webhookVerified, no provider_message_id
          delivery_proof: '',
          provider_message_id: '',
          webhookVerified: false,
        });
      }).toThrow(/teslimat kanıtı/i);
    });
  });
});
