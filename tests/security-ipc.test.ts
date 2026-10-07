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

    it('sanitizes X-API-Key and prevents CRLF header injection', () => {
      const res = security.validateOpenWaRequest({
        url: 'http://127.0.0.1:2785/api/sessions',
        headers: {
          'X-API-Key': 'my-secret-key-123\r\nInjected-Header: evil',
        },
      });
      expect(res.valid).toBe(true);
      const key = res.sanitizedOptions.headers['X-API-Key'];
      expect(key).not.toContain('\r');
      expect(key).not.toContain('\n');
      expect(key).not.toContain('Injected-Header');
      expect(key).toBe('my-secret-key-123');
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
    it('sanitizes arbitrary baseUrl and falls back safely to loopback 2785', () => {
      const opts = security.validateDockerHealthOptions({
        baseUrl: 'http://evil-attacker.com:9999/api',
        apiKey: 'normal-key-123; rm -rf /',
      });
      // Should fallback to default 127.0.0.1:2785
      expect(opts.baseUrl).toBe('http://127.0.0.1:2785/api');
      // Should strip shell injection characters
      expect(opts.apiKey).not.toContain(';');
      expect(opts.apiKey).not.toContain(' ');
      expect(opts.apiKey).not.toContain('/');
      expect(opts.apiKey).toBe('normal-key-123rm-rf');
    });

    it('preserves valid loopback baseUrl', () => {
      const opts = security.validateDockerHealthOptions({
        baseUrl: 'http://localhost:2785/api',
        apiKey: 'testkey123',
      });
      expect(opts.baseUrl).toBe('http://localhost:2785/api');
      expect(opts.apiKey).toBe('testkey123');
    });
  });
});
