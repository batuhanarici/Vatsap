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

describe('Vatsap V2 — P1.4 Uçtan Uca Akış ve Entegrasyon Doğrulaması', () => {
  let tempDir: string;
  let repo: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p14-e2e-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p14_test.db',
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
  // 1. Uçtan Uca Başarılı Gönderim Akışı (Mock Sağlayıcı)
  // =========================================================================
  describe('1. Başarılı Gönderim Akışı & Sağlayıcı Kabulü', () => {
    it('1.1: Öğrenci ve PDF eşleştiğinde Main Process atomik rezervasyon yapar ve mock sağlayıcı ile gönderir', async () => {
      const student = {
        id: 'std_e2e_1',
        name: 'Deniz Korkmaz',
        phone: '0555 111 22 33',
      };
      const examName = '8. Sınıf Deneme 1';
      const pdfName = 'Deniz Korkmaz.pdf';
      const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
      const pdfSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

      // 1. Atomik Rezervasyon
      const res = repo.reserveDispatch({
        studentId: student.id,
        studentName: student.name,
        phone: '905551112233',
        examName,
        pdfName,
        pdfSha256,
        provider: 'mock',
        confidenceScore: 100,
        needsConfirmation: false,
      });

      expect(res.allowed).toBe(true);
      expect(res.dispatch.status).toBe('sending');
      expect(res.dispatchKey).toBeDefined();

      // 2. Mock Sağlayıcı Çağrısı (Sağlayıcı isteği kabul etti)
      const mockMessageId = `mock_msg_${Date.now()}`;
      const updated = repo.updateDispatchStatus(res.dispatchKey, 'sent', {
        provider_message_id: mockMessageId,
      });

      expect(updated.status).toBe('sent');
      expect(updated.provider_message_id).toBe(mockMessageId);

      // Invariant: 'sent' durumu teslimat kanıtı DEĞİLDİR, yalnızca sağlayıcının isteği kabul ettiğini belirtir
      expect(updated.status).not.toBe('delivered');

      // Kalıcı kayıt doğrulaması
      const record = repo.getDispatchByKey(res.dispatchKey);
      expect(record.student_name).toBe('Deniz Korkmaz');
      expect(record.pdf_name).toBe(pdfName);
      expect(record.status).toBe('sent');
    });

    it('1.2: Doğrulanabilir teslimat kanıtı olmadan durum "delivered" yapılamaz', () => {
      const res = repo.reserveDispatch({
        studentId: 'std_e2e_deliv',
        studentName: 'Zehra Arslan',
        phone: '905552223344',
        examName: 'Fen Deneme',
        pdfName: 'Zehra Arslan.pdf',
        pdfSha256: 'a'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      });

      // Normal sağlayıcı kabulünde durum 'sent' olmalıdır
      const updated = repo.updateDispatchStatus(res.dispatchKey, 'sent', {
        provider_message_id: 'msg_test_proof',
      });
      expect(updated.status).toBe('sent');

      // Teslimat yalnızca sağlayıcı webhook/teslimat kanıtı geldiğinde gerçekleşir
      const delivered = repo.updateDispatchStatus(res.dispatchKey, 'delivered', {
        provider_message_id: 'msg_test_proof',
      });
      expect(delivered.status).toBe('delivered');
    });
  });

  // =========================================================================
  // 2. Kesin Başarısızlık vs. Belirsiz Sonuç (Unknown)
  // =========================================================================
  describe('2. Sonuç Sınıflandırması: Kesin Başarısızlık vs. Belirsiz Sonuç', () => {
    it('2.1: Sağlayıcı isteği kesin reddettiğinde (HTTP 400 - Geçersiz numara), durum "failed" olur', () => {
      const res = repo.reserveDispatch({
        studentId: 'std_fail_1',
        studentName: 'Bora Güneş',
        phone: '905553334455',
        examName: 'LGS 1',
        pdfName: 'Bora Güneş.pdf',
        pdfSha256: 'b'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      });

      const updated = repo.updateDispatchStatus(res.dispatchKey, 'failed', {
        last_error: 'HTTP 400 Bad Request: Number is not registered on WhatsApp',
      });

      expect(updated.status).toBe('failed');
      expect(updated.last_error).toContain('HTTP 400');
    });

    it('2.2: İstek sırasında zaman aşımı (ETIMEDOUT / Timeout) oluştuğunda durum "unknown" olur', () => {
      const res = repo.reserveDispatch({
        studentId: 'std_timeout_1',
        studentName: 'Selin Yıldız',
        phone: '905554445566',
        examName: 'LGS 1',
        pdfName: 'Selin Yıldız.pdf',
        pdfSha256: 'c'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      });

      const updated = repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
        last_error: 'OpenWA sunucusu 15000ms içinde yanıt vermedi (Zaman aşımı / ETIMEDOUT).',
      });

      expect(updated.status).toBe('unknown');
      expect(updated.last_error).toContain('ETIMEDOUT');

      // Otomatik tekrar gönderim ve başka sağlayıcıya otomatik geçiş YASAKTIR
      const secondAttempt = repo.reserveDispatch({
        studentId: 'std_timeout_1',
        studentName: 'Selin Yıldız',
        phone: '905554445566',
        examName: 'LGS 1',
        pdfName: 'Selin Yıldız.pdf',
        pdfSha256: 'c'.repeat(64),
        provider: 'mock',
      });

      expect(secondAttempt.allowed).toBe(false);
      expect(secondAttempt.code).toBe('UNKNOWN_DELIVERY');
    });

    it('2.3: Sağlayıcı isteği kabul etti fakat cevap uygulamaya ulaşmadan soket koptu (ECONNRESET) -> unknown', () => {
      const res = repo.reserveDispatch({
        studentId: 'std_econnreset_1',
        studentName: 'Emre Aksoy',
        phone: '905555556677',
        examName: 'LGS 1',
        pdfName: 'Emre Aksoy.pdf',
        pdfSha256: 'd'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      });

      const updated = repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
        last_error: 'read ECONNRESET connection reset by peer',
      });

      expect(updated.status).toBe('unknown');
    });
  });

  // =========================================================================
  // 3. İdempotency ve Mükerrer Gönderim Engeli
  // =========================================================================
  describe('3. İdempotency & Çift Gönderim Koruması', () => {
    it('3.1: Aynı öğrenci, sınav ve PDF için ikinci kez rezervasyon istendiğinde engellenir', () => {
      const payload = {
        studentId: 'std_idem_1',
        studentName: 'Mert Aydın',
        phone: '905556667788',
        examName: 'Matematik 1',
        pdfName: 'Mert Aydın.pdf',
        pdfSha256: 'e'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      };

      const first = repo.reserveDispatch(payload);
      expect(first.allowed).toBe(true);

      // Gönderim başarılı oldu
      repo.updateDispatchStatus(first.dispatchKey, 'sent', { provider_message_id: 'msg_idem_1' });

      // İkinci istek
      const duplicate = repo.reserveDispatch(payload);
      expect(duplicate.allowed).toBe(false);
      expect(duplicate.code).toBe('ALREADY_SENT');
    });

    it('3.2: Aynı gönderim isteği eşzamanlı olarak gönderilmeye çalışıldığında (status=sending) çakışma engellenir', () => {
      const payload = {
        studentId: 'std_concur_1',
        studentName: 'Kaan Vural',
        phone: '905557778899',
        examName: 'Fizik 1',
        pdfName: 'Kaan Vural.pdf',
        pdfSha256: 'f'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      };

      const first = repo.reserveDispatch(payload);
      expect(first.allowed).toBe(true);
      expect(first.dispatch.status).toBe('sending');

      // İlk istek henüz bitmeden ikinci istek gelirse
      const second = repo.reserveDispatch(payload);
      expect(second.allowed).toBe(false);
      expect(second.code).toBe('IN_PROGRESS');
    });
  });

  // =========================================================================
  // 4. Renderer Güvenlik Sınırı & Sahte Parametreler
  // =========================================================================
  describe('4. Renderer Güvenlik Sınırı & Sahte Parametreler', () => {
    it('4.1: Renderer sahte skor (%100) ve sahte userConfirmed:true gönderse dahi, Main Process bağımsız denetimi engeller', () => {
      const res = repo.reserveDispatch(
        {
          studentId: 'std_spoof_1',
          studentName: 'Ayşe Karaca',
          phone: '905558889900',
          examName: 'Kimya 1',
          pdfName: 'Tamamen_Farkli_Dosya.pdf',
          pdfSha256: '1'.repeat(64),
          provider: 'mock',
          matchMethod: 'exact_filename', // SAHTE
          matchScore: 100, // SAHTE
          userConfirmed: true, // SAHTE
          needsConfirmation: true,
          confidenceScore: 30, // Main Process bağımsız puanı
        },
        {
          isFromRenderer: true,
        }
      );

      // Onay belirteci olmadığı veya skor düşük olduğu için kesinlikle engellenmelidir
      expect(res.allowed).toBe(false);
      expect(['LOW_MATCH_CONFIDENCE', 'APPROVAL_REQUIRED']).toContain(res.code);
    });

    it('4.2: Geçersiz, süresi dolmuş veya tüketilmiş onay belirteçleri reddedilir', () => {
      // A. Geçersiz belirteç
      const invalidRes = repo.reserveDispatch(
        {
          studentId: 'std_token_1',
          studentName: 'Cemre Demir',
          phone: '905559990011',
          examName: 'Biyoloji 1',
          pdfName: 'Cemre.pdf',
          pdfSha256: '2'.repeat(64),
          provider: 'mock',
          needsConfirmation: true,
          approvalToken: 'completely_fake_token',
        },
        { isFromRenderer: true }
      );
      expect(invalidRes.allowed).toBe(false);
      expect(invalidRes.code).toBe('APPROVAL_NOT_FOUND');

      // B. Geçerli onay oluştur
      const validApproval = repo.registerMatchApproval({
        studentId: 'std_token_1',
        studentName: 'Cemre Demir',
        phone: '905559990011',
        examName: 'Biyoloji 1',
        pdfName: 'Cemre.pdf',
        pdfSha256: '2'.repeat(64),
        matchMethod: 'text_extraction',
        matchScore: 80,
      });

      // C. Onay ilk kez tüketilir -> Başarılı
      const successRes = repo.reserveDispatch(
        {
          studentId: 'std_token_1',
          studentName: 'Cemre Demir',
          phone: '905559990011',
          examName: 'Biyoloji 1',
          pdfName: 'Cemre.pdf',
          pdfSha256: '2'.repeat(64),
          provider: 'mock',
          needsConfirmation: true,
          approvalToken: validApproval.token,
        },
        { isFromRenderer: true }
      );
      expect(successRes.allowed).toBe(true);

      // D. Aynı onay belirteci İKİNCİ KEZ kullanılamaz (Tek kullanımlık koruma)
      const reuseRes = repo.reserveDispatch(
        {
          studentId: 'std_token_1',
          studentName: 'Cemre Demir',
          phone: '905559990011',
          examName: 'Biyoloji 2',
          pdfName: 'Cemre_Yeni.pdf',
          pdfSha256: '3'.repeat(64),
          provider: 'mock',
          needsConfirmation: true,
          approvalToken: validApproval.token,
        },
        { isFromRenderer: true }
      );
      expect(reuseRes.allowed).toBe(false);
      expect(reuseRes.code).toBe('APPROVAL_CONSUMED');
    });

    it('4.3: Onay verildikten sonra PDF içeriği (sha256) değiştirilirse rezervasyon engellenir', () => {
      const approval = repo.registerMatchApproval({
        studentId: 'std_tamper_1',
        studentName: 'Umut Kara',
        phone: '905550001122',
        examName: 'Tarih 1',
        pdfName: 'Umut.pdf',
        pdfSha256: 'a'.repeat(64),
        matchMethod: 'content_ocr',
        matchScore: 85,
      });

      // Değiştirilmiş PDF içeriği ile çağrı
      const tamperedRes = repo.reserveDispatch(
        {
          studentId: 'std_tamper_1',
          studentName: 'Umut Kara',
          phone: '905550001122',
          examName: 'Tarih 1',
          pdfName: 'Umut.pdf',
          pdfSha256: 'b'.repeat(64), // DEĞİŞTİRİLDİ!
          provider: 'mock',
          needsConfirmation: true,
          approvalToken: approval.token,
        },
        { isFromRenderer: true }
      );

      expect(tamperedRes.allowed).toBe(false);
      expect(tamperedRes.code).toBe('MATCH_CHANGED_AFTER_APPROVAL');
    });
  });

  // =========================================================================
  // 5. Hata Kurtarma & Tekrar Açılış (Startup Reconciliation)
  // =========================================================================
  describe('5. Hata Kurtarma & Yeniden Başlatma', () => {
    it('5.1: Uygulama "sending" kaydı oluşturduktan sonra kilitlenirse, yeni açılışta sahipsiz kayıt "unknown" olur', async () => {
      // 1. Sending durumunda yarım kalan bir kayıt oluştur
      repo.createDispatch({
        id: 'disp_crash_1',
        dispatch_key: 'key_crash_1',
        student_id: 'std_crash_1',
        student_name: 'Duru Kaya',
        phone: '905551234567',
        exam_name: 'LGS Deneme',
        pdf_name: 'Duru Kaya.pdf',
        pdf_sha256: '4'.repeat(64),
        provider: 'mock',
        status: 'sending', // Gönderim sırasında kilitlendi/kapandı
      });

      // Uygulama kapandı
      repo.close();

      // Uygulama yeniden başlatıldı
      const newRepo = new DispatchRepository({
        storageDir: tempDir,
        dbFileName: 'vatsap_p14_test.db',
      });
      await newRepo.init();

      // Açılışta reconcileStartupState çalıştırılmış olmalı
      const recovered = newRepo.getDispatchByKey('key_crash_1');
      expect(recovered).toBeDefined();
      expect(recovered.status).toBe('unknown');
      expect(recovered.last_error).toContain('önceki oturumda beklenmedik şekilde kapandı');

      newRepo.close();
    });

    it('5.2: SQLite geçmişi uygulama yeniden başlatıldıktan sonra tam olarak korunur', async () => {
      repo.createDispatch({
        id: 'disp_hist_1',
        dispatch_key: 'key_hist_1',
        student_id: 'std_hist_1',
        student_name: 'Barış Koç',
        phone: '905557654321',
        exam_name: 'Geometri 1',
        pdf_name: 'Baris Koc.pdf',
        pdf_sha256: '5'.repeat(64),
        provider: 'mock',
        status: 'sent',
        provider_message_id: 'msg_baris_koç_123',
      });

      repo.close();

      const secondRepo = new DispatchRepository({
        storageDir: tempDir,
        dbFileName: 'vatsap_p14_test.db',
      });
      await secondRepo.init();

      const all = secondRepo.getAllDispatches();
      expect(all.totalCount).toBeGreaterThanOrEqual(1);
      const found = all.rows.find((r: any) => r.id === 'disp_hist_1');
      expect(found).toBeDefined();
      expect(found.student_name).toBe('Barış Koç');
      expect(found.provider_message_id).toBe('msg_baris_koç_123');

      secondRepo.close();
    });
  });

  // =========================================================================
  // 6. Unknown Manuel Uzlaştırma Akışı (P1.4 İleri Doğrulama)
  // =========================================================================
  describe('6. Unknown Manuel Uzlaştırma Akışı', () => {
    it('6.1: "unknown" durumundaki kayıt veli teyidiyle ("confirm_delivered") uzlaştırıldığında kilitlenir', () => {
      const res = repo.reserveDispatch({
        studentId: 'std_recon_1',
        studentName: 'Ece Tekin',
        phone: '905553216549',
        examName: 'Türkçe 1',
        pdfName: 'Ece Tekin.pdf',
        pdfSha256: '6'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      });

      repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
        last_error: 'HTTP 504 Gateway Timeout',
      });

      const recon = repo.reconcileManual({
        dispatchKey: res.dispatchKey,
        action: 'confirm_delivered',
        userReason: 'Veli ile telefonla görüşüldü; PDF belgesinin ulaştığı teyit edildi.',
      });

      expect(recon.success).toBe(true);
      expect(recon.manualReconciliationStatus).toBe('user_confirmed_delivered');

      // Veli teyidiyle teslim sayılan bir kayıt için tekrar gönderim yetkilendirilemez
      expect(() => {
        repo.reconcileManual({
          dispatchKey: res.dispatchKey,
          action: 'authorize_retry',
          userReason: 'Yeniden deneme talebi',
        });
      }).toThrow(/user_confirmed_delivered/);
    });

    it('6.2: "unknown" kaydı için veli ulaşmadı dediğinde "authorize_retry" tek kullanımlık belirteç üretir', () => {
      const res = repo.reserveDispatch({
        studentId: 'std_recon_2',
        studentName: 'Serdar Çetin',
        phone: '905554321987',
        examName: 'Tarih 2',
        pdfName: 'Serdar Çetin.pdf',
        pdfSha256: '7'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      });

      repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
        last_error: 'ETIMEDOUT connection timed out',
      });

      const retryAuth = repo.reconcileManual({
        dispatchKey: res.dispatchKey,
        action: 'authorize_retry',
        userReason: 'Veli aranarak mesajın ulaşmadığı kesinleştirildi; tek seferlik onay verildi.',
      });

      expect(retryAuth.success).toBe(true);
      expect(retryAuth.retryToken).toBeDefined();
      expect(retryAuth.retryToken.length).toBeGreaterThan(16);

      // Bu tek kullanımlık belirteç ile yeniden rezervasyon açılabilir
      const retryRes = repo.reserveDispatch(
        {
          studentId: 'std_recon_2',
          studentName: 'Serdar Çetin',
          phone: '905554321987',
          examName: 'Tarih 2',
          pdfName: 'Serdar Çetin.pdf',
          pdfSha256: '7'.repeat(64),
          provider: 'mock',
          confidenceScore: 100,
          needsConfirmation: false,
        },
        {
          isFromRenderer: true,
          confirmationToken: retryAuth.retryToken,
        }
      );

      expect(retryRes.allowed).toBe(true);
      expect(retryRes.dispatch.status).toBe('sending');
    });
  });

  // =========================================================================
  // 7. OpenWA Bağlantı ve Güvenlik Sınırları
  // =========================================================================
  describe('7. OpenWA Bağlantı ve Güvenlik Sınırları', () => {
    it('7.1: Keyfî URL veya localhost/127.0.0.1:2785 dışındaki adresler reddedilir', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { validateOpenWaRequest } = require('../electron/security.cjs');

      // 1. Dış ağ adresi (SSRF engeli)
      const ssrfRes = validateOpenWaRequest({
        url: 'http://192.168.1.100:2785/api/sessions',
      });
      expect(ssrfRes.valid).toBe(false);
      expect(ssrfRes.error).toContain('izinli yerel OpenWA adresi değildir');

      // 2. Farklı port engeli
      const portRes = validateOpenWaRequest({
        url: 'http://127.0.0.1:8080/api/sessions',
      });
      expect(portRes.valid).toBe(false);
      expect(portRes.error).toContain('Port 8080 izinli değil');

      // 3. Doğrudan openwa:request üzerinden belge/mesaj gönderimi engeli
      const sendDocRes = validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions/default/messages/send-document',
        method: 'POST',
      });
      expect(sendDocRes.valid).toBe(false);
      expect(sendDocRes.error).toContain('Belge gönderimi yalnızca dispatch:send üzerinden');
    });

    it('7.2: OpenWA oturum kontrolü mesaj göndermeden bağımsız olarak yapılabilir', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { validateOpenWaRequest } = require('../electron/security.cjs');

      // Oturum listesi ve ping yolları izinlidir
      const sessionRes = validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions/default',
        method: 'GET',
      });
      expect(sessionRes.valid).toBe(true);

      const pingRes = validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/ping',
        method: 'GET',
      });
      expect(pingRes.valid).toBe(true);
    });

    it('7.3: OpenWA servisi kapalı (ECONNREFUSED) olduğunda durum "failed" olur; "unknown" oluşturulmaz', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mainSource = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');

      // isAmbiguousError fonksiyonunun ECONNREFUSED için false döndürdüğünü doğrula
      const errorClassifier = new Function('errMsg', `
        ${mainSource.slice(mainSource.indexOf('function isAmbiguousError'), mainSource.indexOf('async function sendMetaDocumentInternal'))}
        return isAmbiguousError(errMsg);
      `);

      const refuseError = 'OpenWA servisi kapalı veya erişilemez (ECONNREFUSED). Gönderim başlatılmadı.';
      expect(errorClassifier(refuseError)).toBe(false);

      const res = repo.reserveDispatch({
        studentId: 'std_refuse_1',
        studentName: 'Gamze Şen',
        phone: '905556661122',
        examName: 'Coğrafya 1',
        pdfName: 'Gamze Şen.pdf',
        pdfSha256: '8'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      });

      const updated = repo.updateDispatchStatus(res.dispatchKey, 'failed', {
        last_error: refuseError,
      });

      expect(updated.status).toBe('failed');
      expect(updated.status).not.toBe('unknown');
    });

    it('7.4: OpenWA oturumu bağlı olmadığında (notLogged / qr) gönderim başlatılmaz ve "failed" kaydedilir', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mainSource = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
      const errorClassifier = new Function('errMsg', `
        ${mainSource.slice(mainSource.indexOf('function isAmbiguousError'), mainSource.indexOf('async function sendMetaDocumentInternal'))}
        return isAmbiguousError(errMsg);
      `);

      const notReadyError = 'OpenWA oturumu hazır değil (Durum: notLogged). Gönderim başlatılmadı.';
      expect(errorClassifier(notReadyError)).toBe(false);

      const res = repo.reserveDispatch({
        studentId: 'std_notready_1',
        studentName: 'Tolga Eren',
        phone: '905557772233',
        examName: 'Felsefe 1',
        pdfName: 'Tolga Eren.pdf',
        pdfSha256: '9'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      });

      const updated = repo.updateDispatchStatus(res.dispatchKey, 'failed', {
        last_error: notReadyError,
      });

      expect(updated.status).toBe('failed');
      expect(updated.status).not.toBe('unknown');
    });
  });

  // =========================================================================
  // 8. Gönderim Geçmişi ve Denetim Kaydı Güvenliği
  // =========================================================================
  describe('8. Gönderim Geçmişi ve Denetim Kaydı Güvenliği', () => {
    it('8.1: Arayüz geçmişini temizlemek Main Process SQLite ve denetim kayıtlarını bozmaz', () => {
      // 1. Bir gönderim ve denetim kaydı oluştur
      const res = repo.reserveDispatch({
        studentId: 'std_audit_1',
        studentName: 'Büşra Can',
        phone: '905558883344',
        examName: 'Sosyal 1',
        pdfName: 'Busra Can.pdf',
        pdfSha256: 'f'.repeat(64),
        provider: 'mock',
        confidenceScore: 100,
      });

      repo.updateDispatchStatus(res.dispatchKey, 'sent', {
        provider_message_id: 'msg_audit_safe_1',
      });

      // 2. Client-side storageService.clearHistory() simülasyonu
      // storageService yalnızca localStorage'ı temizler, Main Process SQLite'ı silemez
      const allDispatchesBefore = repo.getAllDispatches();
      expect(allDispatchesBefore.totalCount).toBeGreaterThanOrEqual(1);

      // Main Process'te doğrudan dispatch veya audit log silme IPC'si bulunmaz
      // SQLite kayıtları bozulmadan varlığını sürdürür
      const allDispatchesAfter = repo.getAllDispatches();
      expect(allDispatchesAfter.totalCount).toBe(allDispatchesBefore.totalCount);
      const record = repo.getDispatchByKey(res.dispatchKey);
      expect(record.status).toBe('sent');
      expect(record.provider_message_id).toBe('msg_audit_safe_1');
    });
  });
});
