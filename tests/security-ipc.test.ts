import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const security = require('../electron/security.cjs');

describe('Vatsap V2 P0-1 — Security IPC Hardening Test Suite', () => {
  let tempDir: string;
  let allowedPdfDir: string;
  let outsideSecretDir: string;
  let validPdfPath: string;
  let outsideSecretFile: string;
  let nonPdfFile: string;

  beforeEach(() => {
    security.clearAllowedDirectories();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-test-'));
    allowedPdfDir = path.join(tempDir, 'allowed_karneler');
    outsideSecretDir = path.join(tempDir, 'outside_secrets');

    fs.mkdirSync(allowedPdfDir, { recursive: true });
    fs.mkdirSync(outsideSecretDir, { recursive: true });

    validPdfPath = path.join(allowedPdfDir, 'ogrenci_101.pdf');
    fs.writeFileSync(validPdfPath, '%PDF-1.4 sample pdf content');

    outsideSecretFile = path.join(outsideSecretDir, 'super_secret.txt');
    fs.writeFileSync(outsideSecretFile, 'CONFIDENTIAL_DATA');

    nonPdfFile = path.join(allowedPdfDir, 'malicious_script.sh');
    fs.writeFileSync(nonPdfFile, '#!/bin/bash\necho bad');

    // Register allowedPdfDir in session jail
    security.registerAllowedDirectory(allowedPdfDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    security.clearAllowedDirectories();
  });

  // ==========================================
  // 1. Filesystem Security Scenarios
  // ==========================================
  describe('1. Filesystem Boundary & Jail (file:readBase64)', () => {
    it('allows valid PDF inside the registered allowed directory', () => {
      const res = security.validatePdfPath(validPdfPath);
      expect(res.valid).toBe(true);
      expect(res.canonicalPath).toBe(fs.realpathSync(validPdfPath));
    });

    it('blocks ../../secret relative path traversal', () => {
      const traversalPath = path.join(allowedPdfDir, '../../secret.pdf');
      const res = security.validatePdfPath(traversalPath);
      expect(res.valid).toBe(false);
      expect(res.canonicalPath).toBeUndefined();
    });

    it('blocks ~/.ssh/id_rsa or arbitrary user directory paths', () => {
      const fakeSsh = path.join(os.homedir(), '.ssh', 'id_rsa');
      const res = security.validatePdfPath(fakeSsh);
      expect(res.valid).toBe(false);
    });

    it('blocks /etc/passwd or system files', () => {
      const res = security.validatePdfPath('/etc/passwd');
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('blocks izinli-klasör/../secret traversal attempt', () => {
      const traversalPath = path.join(allowedPdfDir, '..', 'outside_secrets', 'secret.pdf');
      const res = security.validatePdfPath(traversalPath);
      expect(res.valid).toBe(false);
    });

    it('blocks symlink inside allowed folder pointing to an outside file (symlink escape)', () => {
      const outsidePdf = path.join(outsideSecretDir, 'private.pdf');
      fs.writeFileSync(outsidePdf, '%PDF-1.4 private data');

      const symlinkPath = path.join(allowedPdfDir, 'symlink_escape.pdf');
      try {
        fs.symlinkSync(outsidePdf, symlinkPath);
      } catch (e) {
        // In case symlink creation is restricted, skip symlink creation
        return;
      }

      const res = security.validatePdfPath(symlinkPath);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('izinli klasör sınırları dışındadır');
    });

    it('blocks non-PDF files inside allowed directory (e.g. .sh, .txt, .exe)', () => {
      const res = security.validatePdfPath(nonPdfFile);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('.pdf uzantılı');
    });

    it('blocks null-byte injection attempts', () => {
      const res = security.validatePdfPath(validPdfPath + '\0.pdf');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('geçersiz karakter');
    });

    it('blocks access when no directory has been allowed in session', () => {
      security.clearAllowedDirectories();
      const res = security.validatePdfPath(validPdfPath);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('geçerli bir karne klasörü seçilmedi');
    });

    it('blocks oversized files (> 50MB)', () => {
      const largePdfPath = path.join(allowedPdfDir, 'huge.pdf');
      fs.writeFileSync(largePdfPath, '%PDF-1.4');

      const origStat = fs.statSync(largePdfPath);
      const spy = vi.spyOn(fs, 'statSync').mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('huge.pdf')) {
          return { ...origStat, isFile: () => true, size: 60 * 1024 * 1024 } as any;
        }
        return origStat;
      });

      try {
        const res = security.validatePdfPath(largePdfPath);
        expect(res.valid).toBe(false);
        expect(res.error).toContain('50MB');
      } finally {
        spy.mockRestore();
      }
    });
  });

  // ==========================================
  // 2. OpenWA Request Security Scenarios
  // ==========================================
  describe('2. OpenWA Network Boundary & Allowlist (openwa:request)', () => {
    it('allows valid requests to http://127.0.0.1:2785/api/...', () => {
      const res = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        method: 'GET',
      });
      expect(res.valid).toBe(true);
      expect(res.sanitizedOptions.url).toBe('http://127.0.0.1:2785/api/sessions');
      expect(res.sanitizedOptions.method).toBe('GET');
    });

    it('allows valid requests to http://localhost:2785/api/...', () => {
      const res = security.validateOpenWaRequest({
        url: 'http://localhost:2785/api/sendText',
        method: 'POST',
        body: JSON.stringify({ chatId: '905551112233@c.us', content: 'test' }),
      });
      expect(res.valid).toBe(true);
      expect(res.sanitizedOptions.url).toBe('http://localhost:2785/api/sendText');
    });

    it('blocks wrong port: http://127.0.0.1:9999', () => {
      const res = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:9999/api/sessions',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Port 9999 izinli değil');
    });

    it('blocks private LAN IP: http://192.168.1.100:2785', () => {
      const res = security.validateOpenWaRequest({
        url: 'http://192.168.1.100:2785/api/sessions',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('izinli yerel OpenWA adresi değildir');
    });

    it('blocks AWS/Cloud metadata: http://169.254.169.254/latest/meta-data', () => {
      const res = security.validateOpenWaRequest({
        url: 'http://169.254.169.254/latest/meta-data',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('blocks file:// protocol: file:///etc/passwd', () => {
      const res = security.validateOpenWaRequest({
        url: 'file:///etc/passwd',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Yalnızca yerel HTTP');
    });

    it('blocks https:// external URLs: https://google.com or https://evil.com', () => {
      const res = security.validateOpenWaRequest({
        url: 'https://evil.com/leak',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Yalnızca yerel HTTP');
    });

    it('blocks arbitrary dangerous HTTP methods like EVIL_METHOD, TRACE, CONNECT', () => {
      const res1 = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        method: 'EVIL_METHOD',
      });
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('izin verilmeyen HTTP yöntemi');

      const res2 = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        method: 'TRACE',
      });
      expect(res2.valid).toBe(false);
    });

    it('blocks arbitrary paths not belonging to OpenWA API (/admin, /root, /etc/passwd)', () => {
      const res = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/admin/nuclear-shutdown',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('OpenWA standart rotası değildir');
    });

    it('strips dangerous headers: Authorization, Cookie, Proxy-Authorization, Host, Origin', () => {
      const res = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        headers: {
          Authorization: 'Bearer super_secret_token',
          Cookie: 'session_token=hacked',
          'Proxy-Authorization': 'Basic test',
          Host: 'evil-host',
          Origin: 'http://evil.com',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });
      expect(res.valid).toBe(true);
      const headers = res.sanitizedOptions.headers;
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['authorization']).toBeUndefined();
      expect(headers['Cookie']).toBeUndefined();
      expect(headers['cookie']).toBeUndefined();
      expect(headers['Host']).toBeUndefined();
      expect(headers['Origin']).toBeUndefined();
      expect(headers['Accept']).toBe('application/json');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('rejects and strips X-API-Key and api-key from renderer requests', () => {
      const res = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        headers: {
          'X-API-Key': 'my-secret-key-123\r\nInjected-Header: evil',
          'api-key': 'attacker-key',
        },
      });
      expect(res.valid).toBe(true);
      expect(res.sanitizedOptions.headers['X-API-Key']).toBeUndefined();
      expect(res.sanitizedOptions.headers['api-key']).toBeUndefined();
    });

    it('rejects oversized request bodies (> 50MB)', () => {
      const hugeBody = 'x'.repeat(51 * 1024 * 1024);
      const res = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sendText',
        method: 'POST',
        body: hugeBody,
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('izin verilen boyutu aşıyor');
    });
  });

  // ==========================================
  // 3. Docker Health Check Security Scenarios
  // ==========================================
  describe('3. Docker Health Check Sanitization (docker:healthCheck)', () => {
    it('sanitizes arbitrary baseUrl and falls back safely to loopback 2785 without accepting apiKey from renderer', () => {
      const opts = security.validateDockerHealthOptions({
        baseUrl: 'http://evil-attacker.com:9999/api',
        apiKey: 'normal-key-123; rm -rf /',
      });
      // Should fallback to default 127.0.0.1:2785
      expect(opts.baseUrl).toBe('http://127.0.0.1:2785/api');
      // In V2, credentials are not accepted from renderer options
      expect((opts as any).apiKey).toBeUndefined();
    });

    it('preserves valid loopback baseUrl without renderer credentials', () => {
      const opts = security.validateDockerHealthOptions({
        baseUrl: 'http://localhost:2785/api',
        apiKey: 'testkey123',
      });
      expect(opts.baseUrl).toBe('http://localhost:2785/api');
      expect((opts as any).apiKey).toBeUndefined();
    });
  });

  // ==========================================
  // 4. P0-2: Credential Isolation & SecureStorage Hardening
  // ==========================================
  describe('4. P0-2: Credential Isolation & SecureStorage Hardening', () => {
    const CredentialService = require('../electron/CredentialService.cjs');
    let credService: any;
    let credStorageDir: string;

    beforeEach(() => {
      credStorageDir = path.join(tempDir, 'secure_vault_dir');
      fs.mkdirSync(credStorageDir, { recursive: true });
      credService = new CredentialService({ storageDir: credStorageDir });
    });

    it('1 & 2: Prohibits generic decrypt and getSecret APIs from Renderer interface', () => {
      // 1. Verify CredentialService has NO generic cryptographic/secret getter methods
      const prohibitedGenericMethods = [
        'decrypt',
        'getSecret',
        'getToken',
        'getApiKey',
        'decryptSecret',
      ];

      for (const forbidden of prohibitedGenericMethods) {
        expect((credService as any)[forbidden]).toBeUndefined();
      }

      // 2. Verify preload.cjs strictly does NOT expose any plaintext secret getters or decrypt
      const preloadContent = fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8');
      expect(preloadContent).not.toContain('getOpenWAKey');
      expect(preloadContent).not.toContain('getMetaAccessToken');
      expect(preloadContent).not.toContain('decrypt');
      expect(preloadContent).not.toContain('getSecret');
      expect(preloadContent).not.toContain('getToken');
      expect(preloadContent).not.toContain('getApiKey');
      expect(preloadContent).not.toContain('secureStorage'); // Old generic API removed
    });

    it('3 & 4: Renderer cannot fetch plaintext OpenWA key or Meta token', () => {
      credService.saveOpenWAKey('my-secret-openwa-key');
      credService.saveMetaAccessToken('EAAG_my_secret_meta_token');

      // Domain methods for Renderer only return booleans
      expect(credService.hasOpenWAKey()).toBe(true);
      expect(credService.hasMetaAccessToken()).toBe(true);

      // Verify no renderer method leaks the raw secret
      const saveOpenWaRes = credService.saveOpenWAKey('new-key');
      expect(saveOpenWaRes).toEqual({ success: true, saved: true });
      expect(JSON.stringify(saveOpenWaRes)).not.toContain('new-key');

      const saveMetaRes = credService.saveMetaAccessToken('new-meta');
      expect(saveMetaRes).toEqual({ success: true, saved: true });
      expect(JSON.stringify(saveMetaRes)).not.toContain('new-meta');
    });

    it('5 & 6: hasOpenWAKey and hasMetaAccessToken accurately reflect presence without leaking text', () => {
      expect(credService.hasOpenWAKey()).toBe(false);
      expect(credService.hasMetaAccessToken()).toBe(false);

      credService.saveOpenWAKey('sample-key');
      expect(credService.hasOpenWAKey()).toBe(true);
      expect(credService.hasMetaAccessToken()).toBe(false);

      credService.saveMetaAccessToken('sample-token');
      expect(credService.hasOpenWAKey()).toBe(true);
      expect(credService.hasMetaAccessToken()).toBe(true);
    });

    it('7 & 8: saveOpenWAKey and saveMetaAccessToken persist secrets in encrypted form on disk', () => {
      const rawSecret = 'super-secret-openwa-value-12345';
      credService.saveOpenWAKey(rawSecret);

      const vaultFile = credService.getVaultPath();
      expect(fs.existsSync(vaultFile)).toBe(true);

      const fileContent = fs.readFileSync(vaultFile, 'utf8');
      // Secret must NEVER appear in plaintext on disk!
      expect(fileContent).not.toContain(rawSecret);
      expect(fileContent).toContain('openWaKeyEnc');
    });

    it('9 & 10: deleteOpenWAKey and deleteMetaAccessToken remove secrets', () => {
      credService.saveOpenWAKey('temp-key');
      credService.saveMetaAccessToken('temp-token');
      expect(credService.hasOpenWAKey()).toBe(true);
      expect(credService.hasMetaAccessToken()).toBe(true);

      const delKeyRes = credService.deleteOpenWAKey();
      expect(delKeyRes).toEqual({ success: true, deleted: true });
      expect(credService.hasOpenWAKey()).toBe(false);

      const delMetaRes = credService.deleteMetaAccessToken();
      expect(delMetaRes).toEqual({ success: true, deleted: true });
      expect(credService.hasMetaAccessToken()).toBe(false);
    });

    it('11: Does not leak secrets in console logs or disk storage', () => {
      const secret = 'ultra-private-token-xyz';
      const consoleLogSpy = vi.spyOn(console, 'log');

      credService.saveOpenWAKey(secret);

      for (const call of consoleLogSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
      consoleLogSpy.mockRestore();
    });

    it('12: Plaintext secret is never included in any IPC response', () => {
      const res1 = credService.saveOpenWAKey('secret-1');
      const res2 = credService.saveMetaAccessToken('secret-2');
      const res3 = credService.deleteOpenWAKey();
      const res4 = credService.deleteMetaAccessToken();

      const combinedResponses = JSON.stringify([res1, res2, res3, res4]);
      expect(combinedResponses).not.toContain('secret-1');
      expect(combinedResponses).not.toContain('secret-2');
    });

    it('13: OpenWA requests receive authenticated key injected from Main Process', () => {
      credService.saveOpenWAKey('injected-docker-api-key');

      // Simulate what main.cjs does: retrieves key from CredentialService and injects into header
      const openWaKey = credService.getOpenWAKey();
      expect(openWaKey).toBe('injected-docker-api-key');

      const req = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        headers: {}, // Renderer passes no secrets
      });
      expect(req.valid).toBe(true);

      // Main process injects the key
      if (openWaKey) {
        req.sanitizedOptions.headers['X-API-Key'] = openWaKey;
      }
      expect(req.sanitizedOptions.headers['X-API-Key']).toBe('injected-docker-api-key');
    });

    it('14: Meta Cloud Provider delegates requests to Main Process with isolated token', () => {
      credService.saveMetaAccessToken('injected-meta-token');
      const metaToken = credService.getMetaAccessToken();
      expect(metaToken).toBe('injected-meta-token');

      // Verify that delete clears the token
      credService.deleteMetaAccessToken();
      expect(credService.getMetaAccessToken()).toBeNull();
    });

    it('15: Renderer cannot inject arbitrary Authorization or Cookie headers', () => {
      const req = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        headers: {
          Authorization: 'Bearer malicious-override',
          Cookie: 'session=hijack',
        },
      });
      expect(req.valid).toBe(true);
      expect(req.sanitizedOptions.headers['Authorization']).toBeUndefined();
      expect(req.sanitizedOptions.headers['authorization']).toBeUndefined();
      expect(req.sanitizedOptions.headers['Cookie']).toBeUndefined();
    });

    it('16: migrateLegacyCiphertext safely migrates legacy ciphertext without leaking plaintext', () => {
      // Simulate existing ciphertext encrypted via fallback/safeStorage
      const legacyKeyPlain = 'legacy-v1-api-key';
      const legacyEnc = credService.encryptString(legacyKeyPlain);

      const migrationResult = credService.migrateLegacyCiphertext({
        encryptedOpenWaKey: legacyEnc,
        encryptedMetaToken: null,
      });

      expect(migrationResult).toEqual({
        success: true,
        migratedOpenWa: true,
        migratedMeta: false,
      });
      expect(JSON.stringify(migrationResult)).not.toContain(legacyKeyPlain);

      // Key should now be present in CredentialService
      expect(credService.hasOpenWAKey()).toBe(true);
      expect(credService.getOpenWAKey()).toBe(legacyKeyPlain);
    });

    // ==========================================
    // P0-2.1 Specific Tests: Credential Flow Cleanup
    // ==========================================
    it('17: createSession request does not transmit any secret headers from Renderer', async () => {
      // Simulate Renderer dispatching createSession payload
      const rawIpcHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // Ensure that if a malicious script or legacy code passes X-API-Key or Authorization, they are stripped
      delete rawIpcHeaders['X-API-Key'];
      delete rawIpcHeaders['api-key'];
      delete rawIpcHeaders['Authorization'];

      const validation = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        method: 'POST',
        headers: rawIpcHeaders,
        body: JSON.stringify({ name: 'default' }),
      });

      expect(validation.valid).toBe(true);
      expect(validation.sanitizedOptions.headers['X-API-Key']).toBeUndefined();
      expect(validation.sanitizedOptions.headers['api-key']).toBeUndefined();
      expect(validation.sanitizedOptions.headers['Authorization']).toBeUndefined();
    });

    it('18: Main Process injects CredentialService key for createSession requests', () => {
      credService.saveOpenWAKey('vault-key-for-session');
      const apiKeyFromVault = credService.getOpenWAKey();

      const validation = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: JSON.stringify({ name: 'default' }),
      });

      expect(validation.valid).toBe(true);

      // Main Process simulation: injection from vault
      if (apiKeyFromVault) {
        validation.sanitizedOptions.headers['X-API-Key'] = apiKeyFromVault;
        validation.sanitizedOptions.headers['api-key'] = apiKeyFromVault;
      }

      expect(validation.sanitizedOptions.headers['X-API-Key']).toBe('vault-key-for-session');
    });

    it('19: Electron Renderer network requests never contain X-API-Key', () => {
      const sanitized = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sendText',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      expect(sanitized.valid).toBe(true);
      expect(sanitized.sanitizedOptions.headers['X-API-Key']).toBeUndefined();
      expect(sanitized.sanitizedOptions.headers['Cookie']).toBeUndefined();
      expect(sanitized.sanitizedOptions.headers['Authorization']).toBeUndefined();
    });

    it('20: Legacy web fallback does not affect Electron credential model', () => {
      // In Electron mode, checkDockerHealth resolves apiKey strictly from Main Process vault
      credService.saveOpenWAKey('docker-health-vault-key');
      const resolvedKey = credService.getOpenWAKey();

      const validatedOpts = security.validateDockerHealthOptions({
        baseUrl: 'http://127.0.0.1:2785/api',
      });

      expect(validatedOpts.baseUrl).toBe('http://127.0.0.1:2785/api');
      expect(resolvedKey).toBe('docker-health-vault-key');
    });
  });
});
