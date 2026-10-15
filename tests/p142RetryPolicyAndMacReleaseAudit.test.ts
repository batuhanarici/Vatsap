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

describe('Vatsap V2 — P1.4.2 Retry Politikası, Güvenlik ve macOS Release Audit', () => {
  let tempDir: string;
  let repo: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p142-audit-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p142.db',
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

  // =========================================================================
  // 1. Retry Token ve Onay Belirteci Denetimi
  // =========================================================================
  describe('1. Retry Token ve Onay Belirteci Yaşam Döngüsü', () => {
    it('1.1: Eşleşme onayı belirteci (approvalToken) ile belirsiz retry belirteci (confirmationToken) ayrı havuzlardadır ve birbirinin yerine kullanılamaz', () => {
      const studentId = 'std_101';
      const studentName = 'Ali Yılmaz';
      const phone = '905551234567';
      const examName = '1. Deneme Sınavı';
      const pdfName = 'Ali_Yilmaz_Karne.pdf';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Ali Content').digest('hex');

      // 1. Generate an approvalToken for match
      const approvalRes = repo.registerMatchApproval({
        studentId,
        studentName,
        phone,
        examName,
        pdfName,
        pdfSha256,
        userReason: 'Öğretmen açık onayı',
      });
      expect(approvalRes.success).toBe(true);
      expect(approvalRes.token).toBeDefined();

      // Create an unknown dispatch in DB
      const dispatchKey = approvalRes.dispatchKey;
      repo.createDispatch({
        id: 'disp_101',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: studentName,
        phone,
        exam_name: examName,
        pdf_name: pdfName,
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'unknown',
        last_error: 'ETIMEDOUT: Ağ yanıt vermedi',
      });

      // 2. Try to use approvalToken as confirmationToken to retry the unknown dispatch
      const retryWithApprovalToken = repo.reserveDispatch(
        {
          studentId,
          studentName,
          phone,
          examName,
          pdfName,
          pdfSha256,
          provider: 'openwa',
        },
        {
          confirmationToken: approvalRes.token, // WRONG TOKEN TYPE!
        }
      );
      expect(retryWithApprovalToken.allowed).toBe(false);
      expect(retryWithApprovalToken.code).toBe('UNKNOWN_DELIVERY');

      // 3. Generate a genuine unknown retry token
      const retryTokenInfo = repo.createUnknownRetryToken(dispatchKey);
      expect(retryTokenInfo.token).toBeDefined();

      // 4. Try to use unknownRetryToken as match approvalToken
      const verifyApprovalWithRetryToken = repo.verifyAndConsumeMatchApproval(retryTokenInfo.token, {
        studentId,
        phone,
        examName,
        pdfSha256,
      });
      expect(verifyApprovalWithRetryToken.valid).toBe(false);
      expect(verifyApprovalWithRetryToken.code).toBe('APPROVAL_NOT_FOUND');
    });

    it('1.2: Retry yetkisi yalnızca Main Process tarafından üretilir; sahte token reddedilir', () => {
      const studentId = 'std_fake';
      const phone = '905559998877';
      const examName = 'Deneme Fake';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Fake').digest('hex');
      const dispatchKey = computeDeterministicDispatchKey({
        studentId,
        examName,
        phone,
        pdfSha256,
      });

      repo.createDispatch({
        id: 'disp_fake',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: 'Fake Öğrenci',
        phone,
        exam_name: examName,
        pdf_name: 'fake.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'unknown',
      });

      // Renderer passes arbitrary forged tokens
      const forgedTokens = [
        'fake_token_123',
        'c'.repeat(48),
        '1234567890abcdef1234567890abcdef',
        'true',
      ];

      for (const fakeToken of forgedTokens) {
        const res = repo.reserveDispatch(
          {
            studentId,
            studentName: 'Fake Öğrenci',
            phone,
            examName,
            pdfName: 'fake.pdf',
            pdfSha256,
            provider: 'openwa',
          },
          { confirmationToken: fakeToken }
        );
        expect(res.allowed).toBe(false);
        expect(res.code).toBe('UNKNOWN_DELIVERY');
      }
    });

    it('1.3: Belirteç tek kullanımlıktır (single-use replay attack önlenir)', () => {
      const studentId = 'std_replay';
      const phone = '905557776655';
      const examName = 'Matematik 1';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Replay').digest('hex');
      const dispatchKey = computeDeterministicDispatchKey({
        studentId,
        examName,
        phone,
        pdfSha256,
      });

      repo.createDispatch({
        id: 'disp_replay',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: 'Replay Test',
        phone,
        exam_name: examName,
        pdf_name: 'test.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'unknown',
      });

      const tokenInfo = repo.createUnknownRetryToken(dispatchKey);
      const token = tokenInfo.token;

      // First use: Valid and succeeds
      const firstAttempt = repo.reserveDispatch(
        {
          studentId,
          studentName: 'Replay Test',
          phone,
          examName,
          pdfName: 'test.pdf',
          pdfSha256,
          provider: 'openwa',
        },
        { confirmationToken: token }
      );
      expect(firstAttempt.allowed).toBe(true);
      expect(firstAttempt.isRetry).toBe(true);

      // Now set back to unknown to test token replay
      repo.updateDispatchStatus(dispatchKey, 'unknown');

      // Second use with the same token: Must fail
      const secondAttempt = repo.reserveDispatch(
        {
          studentId,
          studentName: 'Replay Test',
          phone,
          examName,
          pdfName: 'test.pdf',
          pdfSha256,
          provider: 'openwa',
        },
        { confirmationToken: token }
      );
      expect(secondAttempt.allowed).toBe(false);
      expect(secondAttempt.code).toBe('UNKNOWN_DELIVERY');
    });

    it('1.4: Başka bir öğrenci veya sınav için üretilen token ile işlem yapılamaz (cross-record token rejection)', () => {
      const studentA = 'std_A';
      const studentB = 'std_B';
      const phoneA = '905551111111';
      const phoneB = '905552222222';
      const examName = 'Kimya';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Shared').digest('hex');

      const keyA = computeDeterministicDispatchKey({ studentId: studentA, examName, phone: phoneA, pdfSha256 });
      const keyB = computeDeterministicDispatchKey({ studentId: studentB, examName, phone: phoneB, pdfSha256 });

      repo.createDispatch({
        id: 'disp_A',
        dispatch_key: keyA,
        student_id: studentA,
        student_name: 'Öğrenci A',
        phone: phoneA,
        exam_name: examName,
        pdf_name: 'a.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'unknown',
      });

      repo.createDispatch({
        id: 'disp_B',
        dispatch_key: keyB,
        student_id: studentB,
        student_name: 'Öğrenci B',
        phone: phoneB,
        exam_name: examName,
        pdf_name: 'b.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'unknown',
      });

      // Generate token specifically for Record A
      const tokenA = repo.createUnknownRetryToken(keyA).token;

      // Attempt to use tokenA to retry Record B
      const res = repo.reserveDispatch(
        {
          studentId: studentB,
          studentName: 'Öğrenci B',
          phone: phoneB,
          examName,
          pdfName: 'b.pdf',
          pdfSha256,
          provider: 'openwa',
        },
        { confirmationToken: tokenA }
      );

      expect(res.allowed).toBe(false);
      expect(res.code).toBe('UNKNOWN_DELIVERY');
    });

    it('1.5: Süresi dolmuş belirteç reddedilir', () => {
      const studentId = 'std_expired';
      const phone = '905553334455';
      const examName = 'Fizik';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Expired').digest('hex');
      const dispatchKey = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 });

      repo.createDispatch({
        id: 'disp_exp',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: 'Süre Test',
        phone,
        exam_name: examName,
        pdf_name: 'exp.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'unknown',
      });

      const tokenInfo = repo.createUnknownRetryToken(dispatchKey);
      // Manually advance expiry to the past
      repo.unknownRetryTokens.get(tokenInfo.token).expiresAt = Date.now() - 1000;

      const res = repo.reserveDispatch(
        {
          studentId,
          studentName: 'Süre Test',
          phone,
          examName,
          pdfName: 'exp.pdf',
          pdfSha256,
          provider: 'openwa',
        },
        { confirmationToken: tokenInfo.token }
      );

      expect(res.allowed).toBe(false);
      expect(res.code).toBe('UNKNOWN_DELIVERY');
    });

    it('1.6: Renderer üzerinden allowUnknownRetry: true bayrağı gelse bile isFromRenderer koruması atlatılamaz', () => {
      const studentId = 'std_bypass';
      const phone = '905558887766';
      const examName = 'Bypass Deneme';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Bypass').digest('hex');
      const dispatchKey = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 });

      repo.createDispatch({
        id: 'disp_bypass',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: 'Bypass Öğrenci',
        phone,
        exam_name: examName,
        pdf_name: 'bypass.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'unknown',
      });

      const res = repo.reserveDispatch(
        {
          studentId,
          studentName: 'Bypass Öğrenci',
          phone,
          examName,
          pdfName: 'bypass.pdf',
          pdfSha256,
          provider: 'openwa',
        },
        {
          allowUnknownRetry: true,
          isFromRenderer: true, // Simulating sanitized call from Main Process handling renderer
        }
      );

      expect(res.allowed).toBe(false);
      expect(res.code).toBe('UNKNOWN_DELIVERY');
    });

    it('1.7: Uygulama yeniden başlatıldığında bellekteki retry belirteçleri geçersiz kalır (in-memory isolation)', async () => {
      const studentId = 'std_restart';
      const phone = '905559990011';
      const examName = 'Geometri';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Restart').digest('hex');
      const dispatchKey = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 });

      repo.createDispatch({
        id: 'disp_restart',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: 'Restart Öğrenci',
        phone,
        exam_name: examName,
        pdf_name: 'geom.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'unknown',
      });

      // Create retry token in active session
      const tokenInfo = repo.createUnknownRetryToken(dispatchKey);
      const preRestartToken = tokenInfo.token;

      // Close repository simulating app shutdown
      repo.close();

      // Start new repository instance from the same directory & database file (App Restart)
      const newRepo = new DispatchRepository({
        storageDir: tempDir,
        dbFileName: 'vatsap_p142.db',
      });
      await newRepo.init();

      // SQLite record is preserved
      const persistedRecord = newRepo.getDispatchByKey(dispatchKey);
      expect(persistedRecord).toBeDefined();
      expect(persistedRecord.status).toBe('unknown');

      // The pre-restart token MUST NOT work in the new app instance!
      const attempt = newRepo.reserveDispatch(
        {
          studentId,
          studentName: 'Restart Öğrenci',
          phone,
          examName,
          pdfName: 'geom.pdf',
          pdfSha256,
          provider: 'openwa',
        },
        { confirmationToken: preRestartToken }
      );

      expect(attempt.allowed).toBe(false);
      expect(attempt.code).toBe('UNKNOWN_DELIVERY');

      newRepo.close();
      // Reassign repo so afterEach doesn't fail
      repo = newRepo;
    });
  });

  // =========================================================================
  // 2. Durum Geçişleri ve Idempotency
  // =========================================================================
  describe('2. Durum Geçişleri, Idempotency ve PDF Tekillik Analizi', () => {
    it('2.1: İzin verilen temel durum geçişleri: pending -> sending -> sent -> delivered', () => {
      const studentId = 'std_valid_flow';
      const phone = '905553332211';
      const examName = 'Biyoloji 1';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Bio').digest('hex');
      const dispatchKey = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 });

      const d = repo.createDispatch({
        id: 'disp_bio',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: 'Bio Öğrenci',
        phone,
        exam_name: examName,
        pdf_name: 'bio.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'pending',
      });
      expect(d.status).toBe('pending');

      // pending -> sending
      const s1 = repo.updateDispatchStatus(dispatchKey, 'sending');
      expect(s1.status).toBe('sending');

      // sending -> sent
      const s2 = repo.updateDispatchStatus(dispatchKey, 'sent', { provider_message_id: 'wamid_123' });
      expect(s2.status).toBe('sent');

      // sent -> delivered (with proof)
      const s3 = repo.updateDispatchStatus(dispatchKey, 'delivered', {
        requireDeliveryProof: true,
        delivery_proof: 'ack:3:delivered',
      });
      expect(s3.status).toBe('delivered');
    });

    it('2.2: Geçersiz ve yetkisiz durum geçişleri engellenir (terminal delivered & sent regression)', () => {
      const studentId = 'std_invalid_flow';
      const phone = '905554443322';
      const examName = 'Tarih 1';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 History').digest('hex');
      const dispatchKey = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 });

      repo.createDispatch({
        id: 'disp_history',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: 'Tarih Öğrenci',
        phone,
        exam_name: examName,
        pdf_name: 'tarih.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'delivered',
      });

      // Terminal state delivered cannot transition to sending or failed
      expect(() => repo.updateDispatchStatus(dispatchKey, 'sending')).toThrow();
      expect(() => repo.updateDispatchStatus(dispatchKey, 'failed')).toThrow();
      expect(() => repo.updateDispatchStatus(dispatchKey, 'pending')).toThrow();
    });

    it('2.3: failed -> sending geçişi: Kesin başarısızlık durumunda kontrollü tekrar deneme (retry_count artışı)', () => {
      const studentId = 'std_failed_flow';
      const phone = '905551122334';
      const examName = 'Türkçe 1';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Tur').digest('hex');
      const dispatchKey = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 });

      repo.createDispatch({
        id: 'disp_tur',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: 'Türkçe Öğrenci',
        phone,
        exam_name: examName,
        pdf_name: 'tur.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'failed',
        retry_count: 0,
        last_error: 'ECONNREFUSED: OpenWA sunucusuna bağlanılamadı',
      });

      // reserveDispatch on failed record: succeeds without needing unknown token, increments retry_count
      const res = repo.reserveDispatch({
        studentId,
        studentName: 'Türkçe Öğrenci',
        phone,
        examName,
        pdfName: 'tur.pdf',
        pdfSha256,
        provider: 'openwa',
      });

      expect(res.allowed).toBe(true);
      expect(res.isRetry).toBe(true);
      expect(res.dispatch.status).toBe('sending');
      expect(res.dispatch.retry_count).toBe(1);
    });

    it('2.4: Manuel confirm_delivered: core status "unknown" olarak kalır, asla sahte "delivered" yapılmaz', () => {
      const studentId = 'std_manual_confirm';
      const phone = '905556667788';
      const examName = 'Coğrafya';
      const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.4 Geo').digest('hex');
      const dispatchKey = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 });

      repo.createDispatch({
        id: 'disp_geo',
        dispatch_key: dispatchKey,
        student_id: studentId,
        student_name: 'Coğrafya Öğrenci',
        phone,
        exam_name: examName,
        pdf_name: 'geo.pdf',
        pdf_sha256: pdfSha256,
        provider: 'openwa',
        status: 'unknown',
      });

      const reconcileResult = repo.reconcileManual({
        dispatchKey,
        action: 'confirm_delivered',
        userReason: 'Veli ile telefonda görüşüldü, karnenin WhatsApp üzerinden ulaştığı teyit edildi.',
      });

      expect(reconcileResult.success).toBe(true);
      expect(reconcileResult.manualReconciliationStatus).toBe('user_confirmed_delivered');

      const updated = repo.getDispatchByKey(dispatchKey);
      // Invariant: Core status MUST stay unknown because no provider ACK/receipt exists
      expect(updated.status).toBe('unknown');
      expect(updated.manual_reconciliation_status).toBe('user_confirmed_delivered');
      expect(updated.reconciliation_reason).toContain('telefonda görüşüldü');

      // Once confirmed delivered, retry authorization is permanently blocked
      expect(() => {
        repo.reconcileManual({
          dispatchKey,
          action: 'authorize_retry',
          userReason: 'Yeniden gönderme denemesi',
        });
      }).toThrow(/daha önce veli teyidiyle \("user_confirmed_delivered"\) onaylanmıştır/);
    });

    it('2.5: Idempotency & dispatch_key PDF Analizi: Aynı öğrenci ve sınav için farklı PDF dosyalarının davranışı', () => {
      const studentId = 'std_same_student';
      const phone = '905558889900';
      const examName = 'LGS Deneme 1';

      const pdf1Content = '%PDF-1.4 Original Report Card';
      const pdf1Sha256 = crypto.createHash('sha256').update(pdf1Content).digest('hex');

      const pdf2Content = '%PDF-1.4 Revised Corrected Report Card';
      const pdf2Sha256 = crypto.createHash('sha256').update(pdf2Content).digest('hex');

      // 1. Two different PDF contents produce two different dispatch_keys
      const key1 = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256: pdf1Sha256 });
      const key2 = computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256: pdf2Sha256 });

      expect(key1).not.toBe(key2);

      // 2. Reserve and send PDF 1
      const res1 = repo.reserveDispatch({
        studentId,
        studentName: 'Aynı Öğrenci',
        phone,
        examName,
        pdfName: 'Karne_v1.pdf',
        pdfSha256: pdf1Sha256,
        provider: 'openwa',
      });
      expect(res1.allowed).toBe(true);
      repo.updateDispatchStatus(key1, 'sent');

      // Trying to re-reserve PDF 1 is strictly blocked (Idempotency)
      const res1Duplicate = repo.reserveDispatch({
        studentId,
        studentName: 'Aynı Öğrenci',
        phone,
        examName,
        pdfName: 'Karne_v1.pdf',
        pdfSha256: pdf1Sha256,
        provider: 'openwa',
      });
      expect(res1Duplicate.allowed).toBe(false);
      expect(res1Duplicate.code).toBe('ALREADY_SENT');

      // 3. What happens if a revised PDF (PDF 2) is submitted for the same student & exam?
      // Because dispatch_key includes pdfSha256, key2 is unique in SQLite.
      const res2 = repo.reserveDispatch({
        studentId,
        studentName: 'Aynı Öğrenci',
        phone,
        examName,
        pdfName: 'Karne_v2_Revize.pdf',
        pdfSha256: pdf2Sha256,
        provider: 'openwa',
      });
      expect(res2.allowed).toBe(true);

      // Both records exist in SQLite history with distinct dispatch_key
      const row1 = repo.getDispatchByKey(key1);
      const row2 = repo.getDispatchByKey(key2);
      expect(row1).toBeDefined();
      expect(row2).toBeDefined();
      expect(row1.status).toBe('sent');
      expect(row2.status).toBe('sending');
    });
  });

  // =========================================================================
  // 3. OpenWA Güvenlik Garantileri
  // =========================================================================
  describe('3. OpenWA Güvenlik Garantileri ve IPC Koruması', () => {
    it('3.1: Yalnızca izin verilen yerel 127.0.0.1:2785 adresi kabul edilir; harici adresler ve yönlendirmeler reddedilir', () => {
      expect(validateOpenWaRequest({ url: 'http://127.0.0.1:2785/api/sessions' }).valid).toBe(true);
      expect(validateOpenWaRequest({ url: 'http://localhost:2785/api/sessions' }).valid).toBe(true);

      // Disallowed ports or external hosts
      expect(validateOpenWaRequest({ url: 'http://127.0.0.1:8080/api/sessions' }).valid).toBe(false);
      expect(validateOpenWaRequest({ url: 'http://127.0.0.1:3000/api/sessions' }).valid).toBe(false);
      expect(validateOpenWaRequest({ url: 'http://attacker.com:2785/api/sessions' }).valid).toBe(false);
      expect(validateOpenWaRequest({ url: 'https://evil.com' }).valid).toBe(false);
      expect(validateOpenWaRequest({ url: 'http://user:pass@127.0.0.1:2785/api' }).valid).toBe(false);
    });
  });
});
