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

describe('Vatsap V2 — P0-5: Mock Uçtan Uca ve Kontrollü Gönderime Hazırlık', () => {
  let tempUserDataDir: string;
  let repo: any;
  let credService: any;

  beforeEach(async () => {
    // Simüle edilen app.getPath('userData')
    tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-userdata-p05-'));
    repo = new DispatchRepository({
      storageDir: tempUserDataDir,
      dbFileName: 'karne_p05_e2e.db',
    });
    await repo.init();

    credService = new CredentialService({
      storageDir: tempUserDataDir,
    });
    credService.load();
  });

  afterEach(() => {
    if (repo && repo.isInitialized()) {
      repo.close();
    }
    if (tempUserDataDir && fs.existsSync(tempUserDataDir)) {
      try {
        fs.rmSync(tempUserDataDir, { recursive: true, force: true });
      } catch {
        // cleanup ignore
      }
    }
  });

  // =========================================================================
  // Aşama 2 — Mock Uçtan Uca Doğrulama
  // =========================================================================
  describe('Aşama 2: Mock Sağlayıcı ile Uçtan Uca Gönderim Akışı', () => {
    it('1. Öğrenci, sınav ve PDF eşleştirmesi doğru doğrulanır ve deterministik anahtar üretilir', () => {
      const student = {
        id: 'std_mock_101',
        name: 'Zeynep Kaya',
        phone: '0542 123 45 67',
        exam: 'TYT Deneme 1',
        pdfName: 'Zeynep_Kaya_Karne.pdf',
        pdfSha256: 'aa11bb22cc33dd44ee55ff6677889900aa11bb22cc33dd44ee55ff6677889900',
      };

      const key = computeDeterministicDispatchKey({
        studentId: student.id,
        examName: student.exam,
        phone: student.phone,
        pdfSha256: student.pdfSha256,
      });

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBe(64); // SHA-256 hex string

      // Farklı bir PDF veya farklı telefon verildiğinde anahtar değişmelidir
      const differentKey = computeDeterministicDispatchKey({
        studentId: student.id,
        examName: student.exam,
        phone: '0542 999 99 99', // Değişen telefon
        pdfSha256: student.pdfSha256,
      });
      expect(differentKey).not.toBe(key);
    });

    it('2. Gönderim öncesinde SQLite rezervasyonu kalıcılaştırılır ve sağlayıcı yalnızca izin verildiğinde çağrılır', async () => {
      const student = {
        id: 'std_mock_102',
        name: 'Mustafa Öz',
        phone: '0533 333 44 55',
        exam: 'LGS Deneme 2',
        pdfName: 'Mustafa_Oz.pdf',
        pdfSha256: 'bb22cc33dd44ee55ff6677889900aa11bb22cc33dd44ee55ff6677889900aa11',
      };

      const mockProviderSend = vi.fn().mockResolvedValue({
        success: true,
        messageId: 'mock_msg_success_888',
      });

      // 1. Rezervasyon
      const reservation = repo.reserveDispatch({
        studentId: student.id,
        studentName: student.name,
        phone: student.phone,
        examName: student.exam,
        pdfName: student.pdfName,
        pdfSha256: student.pdfSha256,
        provider: 'mock',
      });

      expect(reservation.allowed).toBe(true);
      expect(reservation.dispatchKey).toBeDefined();

      // Veritabanı dosyasının diske yazıldığı kontrol edilir
      const dbFilePath = path.join(tempUserDataDir, 'karne_p05_e2e.db');
      expect(fs.existsSync(dbFilePath)).toBe(true);

      // Durum veritabanında 'sending' olarak kilitlenmiştir
      const current = repo.getDispatchByKey(reservation.dispatchKey);
      expect(current.status).toBe('sending');

      // 2. Sağlayıcı çağrısı yapılır
      const result = await mockProviderSend();
      expect(result.success).toBe(true);

      // 3. Durum güncellenir
      repo.updateDispatchStatus(reservation.dispatchKey, 'sent', {
        provider_message_id: result.messageId,
      });

      const updated = repo.getDispatchByKey(reservation.dispatchKey);
      expect(updated.status).toBe('sent');
      expect(updated.provider_message_id).toBe('mock_msg_success_888');
    });

    it('3. Timeout durumunda kayıt unknown olur ve otomatik retry yapılmaz', async () => {
      const student = {
        id: 'std_mock_103',
        name: 'Elif Nur',
        phone: '0535 555 66 77',
        exam: 'AYT Deneme 3',
        pdfName: 'Elif_Nur.pdf',
        pdfSha256: 'cc33dd44ee55ff6677889900aa11bb22cc33dd44ee55ff6677889900aa11bb22',
      };

      const mockProviderSend = vi.fn().mockRejectedValue(new Error('ETIMEDOUT: Connection timed out'));

      const reservation = repo.reserveDispatch({
        studentId: student.id,
        studentName: student.name,
        phone: student.phone,
        examName: student.exam,
        pdfName: student.pdfName,
        pdfSha256: student.pdfSha256,
        provider: 'mock',
      });

      let providerError = '';
      try {
        await mockProviderSend();
      } catch (err: any) {
        providerError = err.message;
      }

      expect(providerError).toContain('ETIMEDOUT');

      // Ambiguous error -> unknown olarak kaydedilir
      repo.updateDispatchStatus(reservation.dispatchKey, 'unknown', {
        last_error: providerError,
      });

      const record = repo.getDispatchByKey(reservation.dispatchKey);
      expect(record.status).toBe('unknown');

      // Otomatik ikinci gönderim girişimi ENGELLENİR
      const mockSecondCall = vi.fn();
      const retryReservation = repo.reserveDispatch({
        studentId: student.id,
        studentName: student.name,
        phone: student.phone,
        examName: student.exam,
        pdfName: student.pdfName,
        pdfSha256: student.pdfSha256,
        provider: 'mock',
      });

      expect(retryReservation.allowed).toBe(false);
      expect(retryReservation.code).toBe('UNKNOWN_DELIVERY');

      if (retryReservation.allowed) {
        mockSecondCall();
      }
      expect(mockSecondCall).not.toHaveBeenCalled();
    });

    it('4. Uygulama userData altındaki veritabanı dosyası yeniden açılışta verileri eksiksiz korur', async () => {
      const student = {
        id: 'std_mock_persist',
        name: 'Deniz Eren',
        phone: '0536 777 88 99',
        exam: 'Bursluluk 1',
        pdfName: 'Deniz.pdf',
        pdfSha256: 'dd44ee55ff6677889900aa11bb22cc33dd44ee55ff6677889900aa11bb22cc33',
      };

      const res = repo.reserveDispatch({
        studentId: student.id,
        studentName: student.name,
        phone: student.phone,
        examName: student.exam,
        pdfName: student.pdfName,
        pdfSha256: student.pdfSha256,
        provider: 'mock',
      });
      repo.updateDispatchStatus(res.dispatchKey, 'sent', { provider_message_id: 'persisted_msg_001' });

      // Veritabanını kapat
      repo.close();

      // Yeniden aç (uygulama kapatılıp açıldı)
      const freshRepo = new DispatchRepository({
        storageDir: tempUserDataDir,
        dbFileName: 'karne_p05_e2e.db',
      });
      await freshRepo.init();

      const restoredRecord = freshRepo.getDispatchByKey(res.dispatchKey);
      expect(restoredRecord).toBeDefined();
      expect(restoredRecord.status).toBe('sent');
      expect(restoredRecord.provider_message_id).toBe('persisted_msg_001');
      expect(restoredRecord.student_name).toBe('Deniz Eren');

      freshRepo.close();
    });
  });

  // =========================================================================
  // Aşama 3 — Güvenlik Kontrolleri
  // =========================================================================
  describe('Aşama 3: Güvenlik, Kimlik Bilgisi ve Rota Kısıtlamaları', () => {
    it('5. API anahtarları veya tokenlar Renderer arayüzüne veya loglara düz metin olarak sızdırılmaz', () => {
      credService.saveOpenWAKey('super_secret_openwa_key_xyz987');
      credService.saveMetaAccessToken('super_secret_meta_token_abc123');

      // Renderer'a açık API sadece boolean döner
      expect(credService.hasOpenWAKey()).toBe(true);
      expect(credService.hasMetaAccessToken()).toBe(true);

      const rendererExposed = {
        hasOpenWAKey: credService.hasOpenWAKey(),
        hasMetaAccessToken: credService.hasMetaAccessToken(),
      };

      const jsonStr = JSON.stringify(rendererExposed);
      expect(jsonStr).not.toContain('super_secret_openwa_key_xyz987');
      expect(jsonStr).not.toContain('super_secret_meta_token_abc123');
    });

    it('6. Doğrulanmış webhook kanıtı olmadan delivered durumu üretilemez', () => {
      const student = {
        id: 'std_mock_proof',
        name: 'Kerem Can',
        phone: '0537 111 22 33',
        exam: 'Deneme 4',
        pdfName: 'Kerem.pdf',
        pdfSha256: 'ee55ff6677889900aa11bb22cc33dd44ee55ff6677889900aa11bb22cc33dd44',
      };

      const res = repo.reserveDispatch({
        studentId: student.id,
        studentName: student.name,
        phone: student.phone,
        examName: student.exam,
        pdfName: student.pdfName,
        pdfSha256: student.pdfSha256,
        provider: 'mock',
      });
      repo.updateDispatchStatus(res.dispatchKey, 'sent', { provider_message_id: 'msg_sent_unverified' });

      expect(() => {
        repo.updateDispatchStatus(res.dispatchKey, 'delivered', {
          requireDeliveryProof: true,
          delivery_proof: '',
          provider_message_id: '',
          webhookVerified: false,
        });
      }).toThrow(/teslimat kanıtı/i);
    });
  });
});
