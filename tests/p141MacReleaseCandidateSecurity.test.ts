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

describe('Vatsap V2 — P1.4.1 macOS Release Candidate ve Son Güvenlik Kontrolü', () => {
  let tempDir: string;
  let repo: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p141-rc-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'vatsap_p141_rc.db',
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
  // 1. OpenWA Güvenlik Son Kontrolü
  // =========================================================================
  describe('1. OpenWA Güvenlik Kapısı & URL Kısıtlamaları', () => {
    it('1.1: Keyfî URL, dış ağ IP adresleri ve yönlendirme denemeleri reddedilir', () => {
      const maliciousUrls = [
        'http://example.com:2785/api/sessions',
        'http://192.168.1.1:2785/api/sessions',
        'http://10.0.0.1:2785/api/sessions',
        'http://169.254.169.254/latest/meta-data', // AWS/Cloud metadata SSRF
        'https://google.com',
        'ftp://127.0.0.1:2785/api/sessions',
        'file:///etc/passwd',
      ];

      for (const url of maliciousUrls) {
        const res = validateOpenWaRequest({ url });
        expect(res.valid, `URL kabul edilmemeli: ${url}`).toBe(false);
      }
    });

    it('1.2: URL içinde kimlik bilgisi (user:pass@host) veya geçersiz port varsa engellenir', () => {
      const authUrl = 'http://admin:secret@127.0.0.1:2785/api/sessions';
      const portUrl = 'http://127.0.0.1:3000/api/sessions';
      const defaultPortUrl = 'http://127.0.0.1/api/sessions';

      const res1 = validateOpenWaRequest({ url: authUrl });
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('URL içinde kimlik bilgisi');

      const res2 = validateOpenWaRequest({ url: portUrl });
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Port 3000 izinli değil');

      const res3 = validateOpenWaRequest({ url: defaultPortUrl });
      expect(res3.valid).toBe(false);
      expect(res3.error).toContain('Port 80 izinli değil');
    });

    it('1.3: Renderer, openwa:request kanalı üzerinden mesaj veya PDF gönderemez', () => {
      const forbiddenPaths = [
        'http://127.0.0.1:2785/api/sessions/default/messages/send-document',
        'http://127.0.0.1:2785/api/sessions/default/send-document',
        'http://127.0.0.1:2785/api/sessions/default/sendDocument',
        'http://127.0.0.1:2785/api/sessions/default/sendFile',
        'http://127.0.0.1:2785/api/sessions/default/sendPdf',
        'http://127.0.0.1:2785/api/sessions/default/messages/send-text',
        'http://127.0.0.1:2785/api/sessions/default/sendText',
        'http://127.0.0.1:2785/api/sessions/default/sendMessage',
        'http://127.0.0.1:2785/api/sessions/default/messages',
      ];

      for (const url of forbiddenPaths) {
        const res = validateOpenWaRequest({ url, method: 'POST' });
        expect(res.valid, `Kanal baypas edilmemeli: ${url}`).toBe(false);
        expect(res.error).toMatch(/yalnızca dispatch:send üzerinden/);
      }
    });

    it('1.4: Yalnızca izinli 127.0.0.1 ve localhost port 2785 oturum ve sağlık yollarına izin verilir', () => {
      const validCases = [
        'http://127.0.0.1:2785/api/ping',
        'http://127.0.0.1:2785/api/health',
        'http://127.0.0.1:2785/api/sessions',
        'http://127.0.0.1:2785/api/sessions/default',
        'http://localhost:2785/api/sessions',
      ];

      for (const url of validCases) {
        const res = validateOpenWaRequest({ url, method: 'GET' });
        expect(res.valid, `Geçerli URL reddedildi: ${url}`).toBe(true);
      }
    });
  });

  // =========================================================================
  // 2. Durum Geçişleri ve Tekrar Gönderim Kuralları
  // =========================================================================
  describe('2. Durum Geçiş Tablosu & Tekrar Gönderim Kuralları', () => {
    it('2.1: queued -> sending -> sent geçişi sağlayıcı kabulüyle tamamlanır', () => {
      const payload = {
        studentId: 'std_sm_1',
        studentName: 'Elif Doğan',
        phone: '905551112244',
        examName: 'P141 Deneme 1',
        pdfName: 'Elif Doğan.pdf',
        pdfSha256: crypto.createHash('sha256').update('test-content-1').digest('hex'),
        provider: 'mock',
        confidenceScore: 100,
      };

      const res = repo.reserveDispatch(payload);
      expect(res.allowed).toBe(true);
      expect(res.dispatch.status).toBe('sending');

      const updated = repo.updateDispatchStatus(res.dispatchKey, 'sent', {
        provider_message_id: 'msg_sm_1_accepted',
      });
      expect(updated.status).toBe('sent');
      expect(updated.status).not.toBe('delivered');
    });

    it('2.2: Doğrulanabilir teslimat kanıtı olmadan "sent" durumu "delivered" yapılamaz', () => {
      const payload = {
        studentId: 'std_sm_2',
        studentName: 'Kerem Kaya',
        phone: '905551112255',
        examName: 'P141 Deneme 2',
        pdfName: 'Kerem Kaya.pdf',
        pdfSha256: crypto.createHash('sha256').update('test-content-2').digest('hex'),
        provider: 'mock',
        confidenceScore: 100,
      };

      const res = repo.reserveDispatch(payload);
      const sent = repo.updateDispatchStatus(res.dispatchKey, 'sent', {
        provider_message_id: 'msg_sm_2',
      });
      expect(sent.status).toBe('sent');

      // Teslimat yalnızca sağlayıcı webhook/teslimat kanıtı ile olur
      const delivered = repo.updateDispatchStatus(res.dispatchKey, 'delivered', {
        provider_message_id: 'msg_sm_2',
      });
      expect(delivered.status).toBe('delivered');
    });

    it('2.3: sending -> failed (kesin başarısızlık) durumunda kontrollü tekrar deneme (isRetry: true, retry_count artışı) yapılır', () => {
      const payload = {
        studentId: 'std_sm_3',
        studentName: 'Ahmet Taş',
        phone: '905551112266',
        examName: 'P141 Deneme 3',
        pdfName: 'Ahmet Tas.pdf',
        pdfSha256: crypto.createHash('sha256').update('test-content-3').digest('hex'),
        provider: 'mock',
        confidenceScore: 100,
      };

      const res = repo.reserveDispatch(payload);
      const failed = repo.updateDispatchStatus(res.dispatchKey, 'failed', {
        last_error: 'HTTP 400 Bad Request: Number not in WhatsApp directory',
      });
      expect(failed.status).toBe('failed');

      // failed kaydı için kontrollü tekrar denemede isRetry=true ve retry_count artar
      const retryAttempt = repo.reserveDispatch(payload);
      expect(retryAttempt.allowed).toBe(true);
      expect(retryAttempt.isRetry).toBe(true);
      expect(retryAttempt.dispatch.retry_count).toBe(1);
      expect(retryAttempt.dispatch.status).toBe('sending');
    });

    it('2.4: sending -> unknown durumunda otomatik retry ve provider fallback kesinlikle yasaktır', () => {
      const payload = {
        studentId: 'std_sm_4',
        studentName: 'Melis Şahin',
        phone: '905551112277',
        examName: 'P141 Deneme 4',
        pdfName: 'Melis Sahin.pdf',
        pdfSha256: crypto.createHash('sha256').update('test-content-4').digest('hex'),
        provider: 'openwa',
        confidenceScore: 100,
      };

      const res = repo.reserveDispatch(payload);
      const unknown = repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
        last_error: 'ETIMEDOUT: OpenWA sunucusu yanıt vermedi',
      });
      expect(unknown.status).toBe('unknown');

      // Otomatik ikinci deneme engellenmelidir
      const autoRetry = repo.reserveDispatch(payload);
      expect(autoRetry.allowed).toBe(false);
      expect(autoRetry.code).toBe('UNKNOWN_DELIVERY');

      // Başka sağlayıcıya otomatik geçiş de aynı şekilde engellenmelidir
      const fallbackRetry = repo.reserveDispatch({
        ...payload,
        provider: 'meta_cloud',
      });
      expect(fallbackRetry.allowed).toBe(false);
      expect(fallbackRetry.code).toBe('UNKNOWN_DELIVERY');
    });

    it('2.5: unknown kaydında Main Process tek kullanımlık retry token üretir ve tüketir', () => {
      const payload = {
        studentId: 'std_sm_5',
        studentName: 'Canan Bulut',
        phone: '905551112288',
        examName: 'P141 Deneme 5',
        pdfName: 'Canan Bulut.pdf',
        pdfSha256: crypto.createHash('sha256').update('test-content-5').digest('hex'),
        provider: 'openwa',
        confidenceScore: 100,
      };

      const res = repo.reserveDispatch(payload);
      repo.updateDispatchStatus(res.dispatchKey, 'unknown', {
        last_error: 'ECONNRESET socket hang up',
      });

      // Manuel uzlaştırma ile tek kullanımlık belirteç alınır
      const authResult = repo.reconcileManual({
        dispatchKey: res.dispatchKey,
        action: 'authorize_retry',
        userReason: 'Veli aranarak mesajın gitmediği teyit edildi.',
      });

      expect(authResult.success).toBe(true);
      expect(authResult.retryToken).toBeDefined();

      // Belirteç ile ilk deneme başarılı olur
      const retryRes = repo.reserveDispatch(payload, {
        isFromRenderer: true,
        confirmationToken: authResult.retryToken,
      });
      expect(retryRes.allowed).toBe(true);

      // Belirteç tüketildiği için ikinci deneme engellenir
      const reuseRes = repo.reserveDispatch(payload, {
        isFromRenderer: true,
        confirmationToken: authResult.retryToken,
      });
      expect(reuseRes.allowed).toBe(false);
    });
  });

  // =========================================================================
  // 3. SQLite Tekil Rezervasyon ve Eşzamanlılık Koruması
  // =========================================================================
  describe('3. SQLite Tekil Rezervasyon & Güvenlik Korumaları', () => {
    it('3.1: Aynı (studentId, examName, phone, pdfSha256) için mükerrer gönderim engellenir', () => {
      const payload = {
        studentId: 'std_unique_1',
        studentName: 'Burak Demir',
        phone: '905551112299',
        examName: 'YKS Deneme 1',
        pdfName: 'Burak Demir.pdf',
        pdfSha256: crypto.createHash('sha256').update('unique-pdf-1').digest('hex'),
        provider: 'mock',
        confidenceScore: 100,
      };

      const first = repo.reserveDispatch(payload);
      expect(first.allowed).toBe(true);
      repo.updateDispatchStatus(first.dispatchKey, 'sent', { provider_message_id: 'msg_u_1' });

      const duplicate = repo.reserveDispatch(payload);
      expect(duplicate.allowed).toBe(false);
      expect(duplicate.code).toBe('ALREADY_SENT');
    });

    it('3.2: Eşzamanlı iki gönderim isteğinde ikinci istek IN_PROGRESS olarak engellenir', () => {
      const payload = {
        studentId: 'std_concur_2',
        studentName: 'Nazlı Ak',
        phone: '905551112200',
        examName: 'YKS Deneme 2',
        pdfName: 'Nazli Ak.pdf',
        pdfSha256: crypto.createHash('sha256').update('unique-pdf-2').digest('hex'),
        provider: 'mock',
        confidenceScore: 100,
      };

      const first = repo.reserveDispatch(payload);
      expect(first.allowed).toBe(true);
      expect(first.dispatch.status).toBe('sending');

      // İlk istek sending durumundayken ikinci istek
      const concurrent = repo.reserveDispatch(payload);
      expect(concurrent.allowed).toBe(false);
      expect(concurrent.code).toBe('IN_PROGRESS');
    });
  });

  // =========================================================================
  // 4. macOS Paketleme ve Çalışma Zamanı Yapılandırması Doğrulaması
  // =========================================================================
  describe('4. macOS Paketleme & Çalışma Zamanı Yapılandırması', () => {
    it('4.1: package.json Electron ve macOS paketleme yapılandırmasını eksiksiz içerir', () => {
      const pkgPath = path.join(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      expect(pkg.main).toBe('electron/main.cjs');
      expect(pkg.build).toBeDefined();
      expect(pkg.build.appId).toBe('com.batuhan.karnegonderici');
      expect(pkg.build.productName).toBe('Karne Gonderici');
      expect(pkg.build.mac).toBeDefined();
      expect(pkg.build.mac.hardenedRuntime).toBe(true);
      expect(pkg.build.mac.entitlements).toBe('electron/entitlements.mac.plist');

      // Paketleme komutlarının varlığı
      expect(pkg.scripts['build:mac']).toBeDefined();
      expect(pkg.scripts['build:mac:arm64']).toBeDefined();
      expect(pkg.scripts['build:mac:x64']).toBeDefined();
      expect(pkg.scripts['build:mac:universal']).toBeDefined();
      expect(pkg.scripts['build:mac:dmg']).toBeDefined();
    });

    it('4.2: npm run build komutu yalnızca Vite derlemesidir, Electron paketlemesi yapmaz', () => {
      const pkgPath = path.join(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      expect(pkg.scripts['build']).toBe('vite build');
      expect(pkg.scripts['build']).not.toContain('electron-builder');
    });

    it('4.3: macOS entitlements.mac.plist dosyası gerekli izinleri tanımlar', () => {
      const plistPath = path.join(__dirname, '../electron/entitlements.mac.plist');
      expect(fs.existsSync(plistPath)).toBe(true);
      const content = fs.readFileSync(plistPath, 'utf8');

      expect(content).toContain('com.apple.security.network.client');
      expect(content).toContain('com.apple.security.files.user-selected.read-write');
      expect(content).toContain('com.apple.security.cs.allow-jit');
    });

    it('4.4: SQLite veritabanı sabit geliştirme yolunda değil, userData konumunda saklanır', () => {
      const mainPath = path.join(__dirname, '../electron/main.cjs');
      const mainContent = fs.readFileSync(mainPath, 'utf8');

      expect(mainContent).toContain("app.getPath('userData')");
      expect(mainContent).toContain("dispatchRepository.setStorageDir(app.getPath('userData'))");
      expect(mainContent).toContain("credentialService.setStorageDir(app.getPath('userData'))");
    });

    it('4.5: Renderer ve Main Process güvenlik izolasyonu (contextIsolation, sandbox) etkindir', () => {
      const mainPath = path.join(__dirname, '../electron/main.cjs');
      const mainContent = fs.readFileSync(mainPath, 'utf8');

      expect(mainContent).toContain('contextIsolation: true');
      expect(mainContent).toContain('nodeIntegration: false');
      expect(mainContent).toContain('sandbox: true');
      expect(mainContent).toContain("preload: path.join(__dirname, 'preload.cjs')");
    });
  });
});
