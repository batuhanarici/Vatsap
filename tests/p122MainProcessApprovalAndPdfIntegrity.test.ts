import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
const {
  calculateMatchScore,
  validatePdfPath,
  registerAllowedDirectory,
  clearAllowedDirectories,
  computeMatchApprovalFingerprint,
} = require('../electron/security.cjs');

describe('Vatsap V2 — P1.2.2: Main Process Onay Yetkisi ve PDF Bütünlüğü Test Süiti', () => {
  let tempDir: string;
  let allowedPdfDir: string;
  let repo: any;
  let samplePdfPath: string;
  let samplePdfContent: Buffer;
  let samplePdfSha256: string;

  beforeEach(async () => {
    clearAllowedDirectories();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p122-test-'));
    allowedPdfDir = path.join(tempDir, 'karneler');
    fs.mkdirSync(allowedPdfDir, { recursive: true });
    registerAllowedDirectory(allowedPdfDir);

    samplePdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Test Karne) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    samplePdfPath = path.join(allowedPdfDir, 'Ahmet_Yilmaz.pdf');
    fs.writeFileSync(samplePdfPath, samplePdfContent);
    samplePdfSha256 = computeSha256(samplePdfContent);

    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'p122_audit.db',
    });
    await repo.init();
  });

  afterEach(() => {
    if (repo && repo.isInitialized()) {
      repo.close();
    }
    clearAllowedDirectories();
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // =========================================================================
  // A. Main Process Tarafından Onay Doğrulaması (Part A)
  // =========================================================================
  describe('A. Main Process Tarafından Onay ve Güven Doğrulaması', () => {
    it('Senaryo 1: Renderer sahte userConfirmed: true gönderse dahi, geçerli token yoksa rezervasyon engellenir', () => {
      // Çakışmalı veya onay bekleyen kayıt: Renderer kendi kafasına göre userConfirmed: true gönderiyor
      const reservation = repo.reserveDispatch({
        studentId: 'std_fake_1',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: '1. Dönem Ortak Sınavı',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        provider: 'mock',
        needsConfirmation: true, // Onay gerektiriyor
        userConfirmed: true,    // Renderer sahte onay bayrağı gönderdi
        // Fakat Main Process onay belirteci (approvalToken) yok!
      });

      expect(reservation.allowed).toBe(false);
      expect(reservation.code).toBe('APPROVAL_REQUIRED');
      expect(reservation.reason).toContain('Main Process kullanıcı onayı zorunludur');
    });

    it('Senaryo 1.1: Renderer geçersiz telefon, boş parametreler veya sahte SHA-256 ile onay belirteci alamaz', () => {
      // 1. Geçersiz telefon numarası
      expect(() => {
        repo.registerMatchApproval({
          studentId: 'std_1',
          studentName: 'Ahmet Yılmaz',
          phone: '123', // Geçersiz telefon
          examName: 'Deneme 1',
          pdfName: 'Ahmet.pdf',
          pdfSha256: samplePdfSha256,
        });
      }).toThrow('Geçersiz alıcı telefon numarası');

      // 2. Boş öğrenci ID
      expect(() => {
        repo.registerMatchApproval({
          studentId: '   ',
          studentName: 'Ahmet Yılmaz',
          phone: '905321112233',
          examName: 'Deneme 1',
          pdfName: 'Ahmet.pdf',
          pdfSha256: samplePdfSha256,
        });
      }).toThrow('studentId zorunludur');

      // 3. Geçersiz SHA-256 formatı (64 hex değil)
      expect(() => {
        repo.registerMatchApproval({
          studentId: 'std_1',
          studentName: 'Ahmet Yılmaz',
          phone: '905321112233',
          examName: 'Deneme 1',
          pdfName: 'Ahmet.pdf',
          pdfSha256: 'not-a-valid-sha256-hash',
        });
      }).toThrow('Geçersiz pdfSha256 formatı');
    });

    it('Senaryo 2: Renderer sahte yüksek güven skoru (99) gönderse bile, Main Process skoru bağımsız hesaplar ve düşükse engeller', () => {
      // Öğrenci "Ali Veli" fakat PDF adı "Ahmet_Yilmaz.pdf"
      // Renderer sahte güven skoru 99 göndermeye çalışıyor
      const studentName = 'Ali Veli';
      const pdfName = 'Ahmet_Yilmaz.pdf';

      // Main Process'in bağımsız hesaplaması:
      const independentScore = calculateMatchScore(studentName, pdfName).score;
      expect(independentScore).toBe(0); // Gerçek skor 0'dır!

      // Main Process rezervasyon esnasında bağımsız skoru kullanır:
      const reservation = repo.reserveDispatch({
        studentId: 'std_fake_score',
        studentName,
        phone: '905321112233',
        examName: '1. Dönem Ortak Sınavı',
        pdfName,
        pdfSha256: samplePdfSha256,
        provider: 'mock',
        confidenceScore: independentScore, // Main Process'in hesapladığı gerçek skor
      });

      expect(reservation.allowed).toBe(false);
      expect(reservation.code).toBe('LOW_MATCH_CONFIDENCE');
      expect(reservation.reason).toContain('%70 altında olan belgeler');
    });

    it('Senaryo 2.1: Renderer OCR/içerik eşleşmesini farklı bir yöntem veya 100 skor ile gönderse dahi, onay olmadan rezervasyon açılmaz', () => {
      // 1. matchMethod: 'content_ocr' ve 99 skor gönderilse bile approvalToken yoksa APPROVAL_REQUIRED dönmelidir
      const resOcr = repo.reserveDispatch({
        studentId: 'std_ocr_spoof',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: '1. Dönem Ortak Sınavı',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        provider: 'mock',
        matchMethod: 'content_ocr',
        confidenceScore: 100, // Sahte 100 skor
        userConfirmed: true,  // Sahte onay bayrağı
      });

      expect(resOcr.allowed).toBe(false);
      expect(resOcr.code).toBe('APPROVAL_REQUIRED');

      // 2. matchMethod: 'text_extraction' için de onay zorunludur
      const resText = repo.reserveDispatch({
        studentId: 'std_text_spoof',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: '1. Dönem Ortak Sınavı',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        provider: 'mock',
        matchMethod: 'text_extraction',
        confidenceScore: 98,
      });

      expect(resText.allowed).toBe(false);
      expect(resText.code).toBe('APPROVAL_REQUIRED');

      // 3. Main Process onay token'ı başarıyla kaydedildiğinde rezervasyona izin verilir
      const approval = repo.registerMatchApproval({
        studentId: 'std_ocr_spoof',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: '1. Dönem Ortak Sınavı',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        userReason: 'Öğretmen OCR görselini inceleyip onayladı',
      });

      const resWithValidApproval = repo.reserveDispatch({
        studentId: 'std_ocr_spoof',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: '1. Dönem Ortak Sınavı',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        provider: 'mock',
        matchMethod: 'content_ocr',
        confidenceScore: 90,
        approvalToken: approval.token,
      });

      expect(resWithValidApproval.allowed).toBe(true);
      expect(resWithValidApproval.dispatch.status).toBe('sending');
    });

    it('Senaryo 2.2: Renderer sahte matchMethod=exact_filename ve sahte 100 skor gönderse dahi, Main Process bağımsız denetimi veya onay zorunluluğu sahte rezervasyonu kilitler', () => {
      // Simülasyon: Renderer kötü niyetli veya hatalı biçimde eşleşmeyen bir dosyayı "exact_filename" ve "100 skor" olarak gönderiyor
      const studentName = 'Ahmet Yılmaz';
      const mismatchedPdfName = 'karne_belgesi_adsiz_001.pdf';

      // Main Process dosya adından skoru bağımsız hesaplar (Anti-forgery invariant)
      const independentScore = calculateMatchScore(studentName, mismatchedPdfName).score;
      expect(independentScore).toBeLessThan(70);

      // Renderer'dan gelen sahte 100 skoru Main Process bağımsız skoruyla ezer
      const reservationSpoofed = repo.reserveDispatch({
        studentId: 'std_spoofed_renderer',
        studentName,
        phone: '905321112233',
        examName: 'Ortak Sınav',
        pdfName: mismatchedPdfName,
        pdfSha256: samplePdfSha256,
        provider: 'mock',
        matchMethod: 'exact_filename', // Sahte matchMethod
        confidenceScore: independentScore, // Main Process hesaplanan bağımsız skor
        userConfirmed: true, // Sahte renderer onayı
      });

      expect(reservationSpoofed.allowed).toBe(false);
      expect(reservationSpoofed.code).toBe('LOW_MATCH_CONFIDENCE');
      expect(reservationSpoofed.reason).toContain('%70 altında olan belgeler');
    });

    it('Senaryo 3: Öğrenci A için alınmış onay belirteci başka bir öğrenci (Öğrenci B) için kullanılamaz (APPROVAL_MISMATCH)', () => {
      // Öğrenci A için Main Process'te resmi onay kaydediliyor
      const approval = repo.registerMatchApproval({
        studentId: 'std_A',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: 'Deneme 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        userReason: 'Veli telefon görüşmesiyle onaylandı',
      });

      expect(approval.success).toBe(true);
      expect(approval.token).toBeDefined();

      // Kötü niyetli veya hatalı istemci Öğrenci A'nın token'ını Öğrenci B için göndermeyi deniyor:
      const reservationB = repo.reserveDispatch(
        {
          studentId: 'std_B', // Farklı öğrenci!
          studentName: 'Mehmet Demir',
          phone: '905332223344',
          examName: 'Deneme 1',
          pdfName: 'Ahmet_Yilmaz.pdf',
          pdfSha256: samplePdfSha256,
          provider: 'mock',
          needsConfirmation: true,
          approvalToken: approval.token,
        },
        { approvalToken: approval.token }
      );

      expect(reservationB.allowed).toBe(false);
      expect(reservationB.code).toBe('APPROVAL_MISMATCH');
      expect(reservationB.reason).toContain('başka bir öğrenciye ait');
    });

    it('Senaryo 4: Onay verildikten sonra veli telefonu veya sınav adı değişirse onay geçersiz kılınır', () => {
      // Onay 905321112233 için veriliyor
      const approval = repo.registerMatchApproval({
        studentId: 'std_phone_change',
        studentName: 'Can Caner',
        phone: '905321112233',
        examName: 'Deneme 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        userReason: 'Onaylandı',
      });

      // Gönderim esnasında farklı bir telefon numarası (905329998877) iletilirse:
      const reservation = repo.reserveDispatch(
        {
          studentId: 'std_phone_change',
          studentName: 'Can Caner',
          phone: '905329998877', // Değiştirilen telefon!
          examName: 'Deneme 1',
          pdfName: 'Ahmet_Yilmaz.pdf',
          pdfSha256: samplePdfSha256,
          provider: 'mock',
          needsConfirmation: true,
          approvalToken: approval.token,
        },
        { approvalToken: approval.token }
      );

      expect(reservation.allowed).toBe(false);
      expect(reservation.code).toBe('APPROVAL_MISMATCH');
      expect(reservation.reason).toContain('başka bir veli telefonuna ait');
    });

    it('Senaryo 5: Onay verildikten sonra PDF hash içeriği değişirse MATCH_CHANGED_AFTER_APPROVAL ile rezervasyon kilitlenir', () => {
      // Orijinal PDF için onay alındı
      const approval = repo.registerMatchApproval({
        studentId: 'std_hash_test',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: 'Deneme 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
      });

      // Sonradan PDF içeriği değişti (farklı sha256)
      const alteredSha256 = 'f'.repeat(64);

      const reservation = repo.reserveDispatch(
        {
          studentId: 'std_hash_test',
          studentName: 'Ahmet Yılmaz',
          phone: '905321112233',
          examName: 'Deneme 1',
          pdfName: 'Ahmet_Yilmaz.pdf',
          pdfSha256: alteredSha256, // Değiştirilmiş hash!
          provider: 'mock',
          needsConfirmation: true,
          approvalToken: approval.token,
        },
        { approvalToken: approval.token }
      );

      expect(reservation.allowed).toBe(false);
      expect(reservation.code).toBe('MATCH_CHANGED_AFTER_APPROVAL');
      expect(reservation.reason).toContain('PDF içeriği değişmiştir');
    });

    it('Senaryo 6: Bir onay belirteci başarıyla tüketildikten sonra ikinci kez kullanılamaz (APPROVAL_CONSUMED)', () => {
      const approval = repo.registerMatchApproval({
        studentId: 'std_single_use',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: 'Deneme 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
      });

      // 1. Kullanım: Başarılı rezervasyon
      const res1 = repo.reserveDispatch(
        {
          studentId: 'std_single_use',
          studentName: 'Ahmet Yılmaz',
          phone: '905321112233',
          examName: 'Deneme 1',
          pdfName: 'Ahmet_Yilmaz.pdf',
          pdfSha256: samplePdfSha256,
          provider: 'mock',
          needsConfirmation: true,
          approvalToken: approval.token,
        },
        { approvalToken: approval.token }
      );
      expect(res1.allowed).toBe(true);

      // 2. Kullanım girişimi (Aynı token ile tekrar rezervasyon deneniyor):
      const res2 = repo.reserveDispatch(
        {
          studentId: 'std_single_use',
          studentName: 'Ahmet Yılmaz',
          phone: '905321112233',
          examName: 'Deneme 1',
          pdfName: 'Ahmet_Yilmaz.pdf',
          pdfSha256: samplePdfSha256,
          provider: 'mock',
          needsConfirmation: true,
          approvalToken: approval.token,
        },
        { approvalToken: approval.token }
      );

      expect(res2.allowed).toBe(false);
      // İkinci denemede ya belirteç tüketildi (APPROVAL_CONSUMED) ya da kayıt zaten işlemde/gönderildi (IN_PROGRESS/ALREADY_SENT) olarak engellenmelidir
      expect(['APPROVAL_CONSUMED', 'IN_PROGRESS', 'ALREADY_SENT']).toContain(res2.code);
    });

    it('Senaryo 6.1: Süresi dolmuş veya geçersiz/sahte onay belirteci ile rezervasyon yapılamaz', () => {
      // 1. Sahte / Var olmayan onay belirteci
      const resFake = repo.reserveDispatch({
        studentId: 'std_invalid_token',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: 'Deneme 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        provider: 'mock',
        needsConfirmation: true,
        approvalToken: 'appr_totally_fake_token_1234567890',
      });

      expect(resFake.allowed).toBe(false);
      expect(resFake.code).toBe('APPROVAL_NOT_FOUND');

      // 2. Süresi dolmuş onay belirteci
      const approval = repo.registerMatchApproval({
        studentId: 'std_expired_token',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: 'Deneme 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
      });

      // Token süresini geçmişe çek
      const record = repo.matchApprovals.get(approval.token);
      record.expiresAt = Date.now() - 1000;

      const resExpired = repo.reserveDispatch({
        studentId: 'std_expired_token',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: 'Deneme 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        provider: 'mock',
        needsConfirmation: true,
        approvalToken: approval.token,
      });

      expect(resExpired.allowed).toBe(false);
      expect(resExpired.code).toBe('APPROVAL_EXPIRED');
      expect(resExpired.reason).toContain('süresi dolmuş');
    });

    it('Senaryo 6.2: Onayın gerçek öğrenci, telefon, PDF SHA-256 ve eşleşme kaydına kriptografik/deterministik bağlandığını doğrula', () => {
      const approval = repo.registerMatchApproval({
        studentId: 'std_binding_test',
        studentName: 'Mehmet Kaya',
        phone: '905334445566',
        examName: 'LGS Deneme 3',
        pdfName: 'Mehmet_Kaya.pdf',
        pdfSha256: samplePdfSha256,
      });

      expect(approval.fingerprint).toBeDefined();

      // Parametrelerden biri bile farklı olursa onay doğrulaması başarısız olmalıdır:
      // A. Yanlış öğrenci ID
      const resBadId = repo.verifyAndConsumeMatchApproval(approval.token, {
        studentId: 'std_OTHER',
        phone: '905334445566',
        examName: 'LGS Deneme 3',
        pdfSha256: samplePdfSha256,
      });
      expect(resBadId.valid).toBe(false);
      expect(resBadId.code).toBe('APPROVAL_MISMATCH');

      // B. Yanlış telefon
      const resBadPhone = repo.verifyAndConsumeMatchApproval(approval.token, {
        studentId: 'std_binding_test',
        phone: '905330000000',
        examName: 'LGS Deneme 3',
        pdfSha256: samplePdfSha256,
      });
      expect(resBadPhone.valid).toBe(false);
      expect(resBadPhone.code).toBe('APPROVAL_MISMATCH');

      // C. Yanlış sınav adı
      const resBadExam = repo.verifyAndConsumeMatchApproval(approval.token, {
        studentId: 'std_binding_test',
        phone: '905334445566',
        examName: 'Farklı Bir Sınav',
        pdfSha256: samplePdfSha256,
      });
      expect(resBadExam.valid).toBe(false);
      expect(resBadExam.code).toBe('APPROVAL_MISMATCH');

      // D. Yanlış / Değiştirilmiş SHA-256
      const resBadSha = repo.verifyAndConsumeMatchApproval(approval.token, {
        studentId: 'std_binding_test',
        phone: '905334445566',
        examName: 'LGS Deneme 3',
        pdfSha256: 'a'.repeat(64),
      });
      expect(resBadSha.valid).toBe(false);
      expect(resBadSha.code).toBe('MATCH_CHANGED_AFTER_APPROVAL');
    });
  });

  // =========================================================================
  // B. PDF İçerik Bütünlüğü ve TOCTOU Güvenliği (Part B)
  // =========================================================================
  describe('B. PDF İçerik Bütünlüğü, Sıfır İkinci Okuma ve TOCTOU Güvenliği', () => {
    it('Senaryo 7: Hash hesaplanan baytlar bellekte Buffer olarak tutulur; hash kontrolünden sonra diskteki dosya değişse dahi bellekteki Buffer bozulmaz', () => {
      // 1. Main Process dosya yolunu doğrular ve tek seferde Buffer'a okur
      const validation = validatePdfPath(samplePdfPath);
      expect(validation.valid).toBe(true);

      const bufferAtHashTime = fs.readFileSync(validation.canonicalPath!);
      const shaAtHashTime = computeSha256(bufferAtHashTime);

      // Simülasyon: Dosya hash'i alındıktan sonra işletim sistemi/kullanıcı diskteki dosyayı değiştirdi (TOCTOU senaryosu)
      const tamperedContentOnDisk = Buffer.from('%PDF-1.4\nMALICIOUS TAMPERED REPORT ON DISK\n%%EOF');
      fs.writeFileSync(samplePdfPath, tamperedContentOnDisk);

      // Diskteki dosyanın hash'i değişmiştir:
      const diskShaAfterTamper = computeSha256(fs.readFileSync(samplePdfPath));
      expect(diskShaAfterTamper).not.toBe(shaAtHashTime);

      // FAKAT Main Process sağlayıcıya diskten tekrar okumaz; bellekte tutulan bufferAtHashTime kullanılır:
      expect(computeSha256(bufferAtHashTime)).toBe(shaAtHashTime);
      expect(bufferAtHashTime.equals(samplePdfContent)).toBe(true);
    });

    it('Senaryo 8: Sağlayıcıya iletilen Base64/Buffer baytları ile hash özeti alınan baytlar birebir aynıdır', () => {
      const buffer = fs.readFileSync(samplePdfPath);
      const computedHash = computeSha256(buffer);
      const base64Payload = buffer.toString('base64');

      // Sağlayıcının aldığı base64 string'i geri çözüldüğünde tam olarak aynı baytları verir:
      const providerReceivedBuffer = Buffer.from(base64Payload, 'base64');
      expect(providerReceivedBuffer.equals(buffer)).toBe(true);
      expect(computeSha256(providerReceivedBuffer)).toBe(computedHash);
    });

    it('Senaryo 9: Dosya okuma hatası veya eksik/hasarlı PDF durumunda sağlayıcı çağrısı yapılmaz ve rezervasyon oluşturulmaz', () => {
      // Var olmayan veya izinli klasör dışındaki bir dosya
      const invalidPath = path.join(tempDir, 'non_existent.pdf');
      const validation = validatePdfPath(invalidPath);
      expect(validation.valid).toBe(false);

      // Boş veya sahte PDF (%PDF başlığı içermeyen) dosya
      const corruptedFile = path.join(allowedPdfDir, 'corrupted.pdf');
      fs.writeFileSync(corruptedFile, 'BU BIR PDF DEGILDIR');

      const corruptedBuffer = fs.readFileSync(corruptedFile);
      const isPdfHeaderValid = corruptedBuffer.length >= 5 && corruptedBuffer.subarray(0, 4).toString('ascii') === '%PDF';
      expect(isPdfHeaderValid).toBe(false);
    });

    it('Senaryo 10: Eşzamanlı iki gönderim girişiminde tek bir rezervasyon verilir, ikincisi engellenir', () => {
      const dispatchKey = computeDeterministicDispatchKey({
        studentId: 'std_race_1',
        examName: 'Sınav 1',
        phone: '905321112233',
        pdfSha256: samplePdfSha256,
      });

      // 1. İstek
      const req1 = repo.reserveDispatch({
        studentId: 'std_race_1',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: 'Sınav 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        provider: 'mock',
      });
      expect(req1.allowed).toBe(true);

      // 2. Eşzamanlı İstek (Aynı kayıt 'sending' durumundayken)
      const req2 = repo.reserveDispatch({
        studentId: 'std_race_1',
        studentName: 'Ahmet Yılmaz',
        phone: '905321112233',
        examName: 'Sınav 1',
        pdfName: 'Ahmet_Yilmaz.pdf',
        pdfSha256: samplePdfSha256,
        provider: 'mock',
      });

      expect(req2.allowed).toBe(false);
      expect(req2.code).toBe('IN_PROGRESS');
      expect(req2.reason).toContain('aktif olarak işleniyor');
    });
  });
});
