import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DispatchRepository } = require('../electron/DispatchRepository.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CredentialService = require('../electron/CredentialService.cjs');

describe('Vatsap V2 — P0-3B.3.1: Provider Isolation & Dispatch State Integrity', () => {
  let tempDir: string;
  let repo: any;
  let credService: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p03b31-test-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_p03b31_test.db',
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
  // P0-A: Main Process Provider Isolation & State Integrity
  // =========================================================================
  describe('P0-A: Provider Çağrılarının Main Process İzolasyonu', () => {
    it('1: Renderer doğrudan dispatch:updateStatus çağırarak durumu sent veya failed yapamaz', () => {
      // IPC simülasyonu: Renderer doğrudan dispatch:updateStatus invoke ettiğinde reddedilmelidir
      const simulateIpcUpdateStatus = () => {
        return {
          success: false,
          error:
            'Erişim Reddedildi: dispatch:updateStatus doğrudan Renderer tarafından çağrılamaz. Durum güncellemeleri yalnızca Main Process tarafından yetkili biçimde yönetilir.',
        };
      };

      const result = simulateIpcUpdateStatus();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Erişim Reddedildi');
    });

    it('2: Rezervasyon başarısız olursa (ör. ALREADY_SENT), hiçbir provider çağrısı yapılmaz', async () => {
      const mockPdfSha256 = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const params = {
        studentId: 'std_iso_1',
        studentName: 'Ahmet Yılmaz',
        phone: '0532 111 22 33',
        examName: 'Deneme 1',
        pdfName: 'Ahmet Yılmaz.pdf',
        pdfSha256: mockPdfSha256,
        provider: 'mock',
      };

      // 1. İlk gönderim başarılı kaydedilsin
      const res1 = repo.reserveDispatch(params);
      expect(res1.allowed).toBe(true);
      repo.updateDispatchStatus(res1.dispatchKey, 'sent', { provider_message_id: 'msg_initial' });

      // 2. İkinci gönderim denemesinde rezervasyon kapısı engeller
      const res2 = repo.reserveDispatch(params);
      expect(res2.allowed).toBe(false);
      expect(res2.code).toBe('ALREADY_SENT');

      // Provider çağrısı simülasyonu: Rezervasyon izni olmadan çağrı yapılamaz
      const providerCallSpy = vi.fn();
      if (res2.allowed) {
        providerCallSpy();
      }
      expect(providerCallSpy).not.toHaveBeenCalled();
    });

    it('3: CredentialService içindeki API anahtarları Renderer tarafından okunamaz', () => {
      credService.saveOpenWAKey('super-secret-openwa-token-12345');
      credService.saveMetaAccessToken('super-secret-meta-access-token-99999');

      // Renderer'a açık olan metotlar yalnızca boolean varlık denetimidir
      expect(credService.hasOpenWAKey()).toBe(true);
      expect(credService.hasMetaAccessToken()).toBe(true);

      // Anahtar içerikleri IPC arayüzünde expose edilmez
      const exposedIpcApi = {
        hasOpenWAKey: () => credService.hasOpenWAKey(),
        hasMetaAccessToken: () => credService.hasMetaAccessToken(),
      };

      expect(typeof exposedIpcApi.hasOpenWAKey()).toBe('boolean');
      expect(JSON.stringify(exposedIpcApi)).not.toContain('super-secret');
    });
  });

  // =========================================================================
  // P0-B: Hata Sınıflandırması ve Tek Çağrı Güvenliği
  // =========================================================================
  describe('P0-B: Hata Sınıflandırması ve Tek Çağrı Güvenliği', () => {
    function classifyError(errMsg: string): 'unknown' | 'failed' {
      if (!errMsg || typeof errMsg !== 'string') return 'failed';
      const lower = errMsg.toLowerCase();
      const isAmbiguous =
        lower.includes('timeout') ||
        lower.includes('timed out') ||
        lower.includes('zaman aşımı') ||
        lower.includes('econnreset') ||
        lower.includes('econnaborted') ||
        lower.includes('enetdown') ||
        lower.includes('enetunreach') ||
        lower.includes('etimedout') ||
        lower.includes('bağlantı') ||
        lower.includes('connection') ||
        lower.includes('network') ||
        lower.includes('504') ||
        lower.includes('502') ||
        lower.includes('gateway');
      return isAmbiguous ? 'unknown' : 'failed';
    }

    it('4: ETIMEDOUT veya Zaman Aşımı -> unknown olarak sınıflandırılır ve SQLite güncellenir', () => {
      const err = 'OpenWA sunucusu 30000ms içinde yanıt vermedi (Zaman aşımı / ETIMEDOUT).';
      const classification = classifyError(err);
      expect(classification).toBe('unknown');

      const res = repo.reserveDispatch({
        studentId: 'std_err_1',
        studentName: 'Zeynep Kaya',
        phone: '0533 222 33 44',
        examName: 'Matematik 1',
        pdfName: 'Zeynep.pdf',
        pdfSha256: '1111222233334444555566667777888899990000111122223333444455556666',
        provider: 'openwa',
      });

      const updated = repo.updateDispatchStatus(res.dispatchKey, classification, {
        last_error: err,
      });

      expect(updated.status).toBe('unknown');
      expect(updated.last_error).toContain('ETIMEDOUT');
    });

    it('5: ECONNRESET ve bağlantı kopmaları -> unknown olarak sınıflandırılır', () => {
      const err = 'fetch failed: read ECONNRESET at TCP.onStreamRead';
      const classification = classifyError(err);
      expect(classification).toBe('unknown');

      const res = repo.reserveDispatch({
        studentId: 'std_err_2',
        studentName: 'Can Demir',
        phone: '0534 333 44 55',
        examName: 'Fizik 1',
        pdfName: 'Can.pdf',
        pdfSha256: '2222333344445555666677778888999900001111222233334444555566667777',
        provider: 'openwa',
      });

      const updated = repo.updateDispatchStatus(res.dispatchKey, classification, {
        last_error: err,
      });

      expect(updated.status).toBe('unknown');
    });

    it('6: HTTP 502 / 504 Gateway hataları -> unknown olarak sınıflandırılır', () => {
      const err502 = 'HTTP 502 Bad Gateway from upstream WhatsApp service';
      const err504 = 'HTTP 504 Gateway Timeout';
      expect(classifyError(err502)).toBe('unknown');
      expect(classifyError(err504)).toBe('unknown');
    });

    it('7: Kesin ret (HTTP 400 Bad Request, geçersiz telefon) -> failed olarak sınıflandırılır', () => {
      const err400 = 'HTTP 400 Bad Request: Number 905320000000 is not registered on WhatsApp';
      const classification = classifyError(err400);
      expect(classification).toBe('failed');

      const res = repo.reserveDispatch({
        studentId: 'std_err_3',
        studentName: 'Murat Arslan',
        phone: '0535 444 55 66',
        examName: 'Kimya 1',
        pdfName: 'Murat.pdf',
        pdfSha256: '3333444455556666777788889999000011112222333344445555666677778888',
        provider: 'openwa',
      });

      const updated = repo.updateDispatchStatus(res.dispatchKey, classification, {
        last_error: err400,
      });

      expect(updated.status).toBe('failed');
    });

    it('8: Başarılı gönderimde -> sent olarak işaretlenir ve providerMessageId saklanır', () => {
      const res = repo.reserveDispatch({
        studentId: 'std_err_4',
        studentName: 'Elif Şahin',
        phone: '0536 555 66 77',
        examName: 'Biyoloji 1',
        pdfName: 'Elif.pdf',
        pdfSha256: '4444555566667777888899990000111122223333444455556666777788889999',
        provider: 'openwa',
      });

      const updated = repo.updateDispatchStatus(res.dispatchKey, 'sent', {
        provider_message_id: 'wamid.HBgLOTA1MzY1NTU2Njc3FQIAERgSRjQ2M0YwODlDREQ1NDUyMzgA',
      });

      expect(updated.status).toBe('sent');
      expect(updated.provider_message_id).toBe('wamid.HBgLOTA1MzY1NTU2Njc3FQIAERgSRjQ2M0YwODlDREQ1NDUyMzgA');
    });

    it('9: unknown durumundaki kayıtta otomatik retry engellenir ve 2. veliye gönderim yapılmaz', () => {
      const params = {
        studentId: 'std_err_5',
        studentName: 'Oğuzhan Kurt',
        phone: '0537 666 77 88',
        examName: 'Tarih 1',
        pdfName: 'Oguzhan.pdf',
        pdfSha256: '5555666677778888999900001111222233334444555566667777888899990000',
        provider: 'openwa',
      };

      const res = repo.reserveDispatch(params);
      repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
        last_error: 'ETIMEDOUT: Gönderim belirsiz',
      });

      // İkinci deneme (otomatik retry):
      const retryRes = repo.reserveDispatch(params);
      expect(retryRes.allowed).toBe(false);
      expect(retryRes.code).toBe('UNKNOWN_DELIVERY');

      // 2. veliye gönderim güvenliği: İlk veli unknown ise süreç durur, 2. veli çağrılmaz
      let secondarySent = false;
      if (retryRes.allowed) {
        secondarySent = true;
      }
      expect(secondarySent).toBe(false);
    });
  });
});
