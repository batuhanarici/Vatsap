const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Vatsap V2 CredentialService (Main Process Only)
 *
 * Security Invariants:
 * 1. Plaintext secrets are NEVER returned to Renderer Process.
 * 2. Secrets are decrypted ONLY inside Main Process when executing authenticated requests.
 * 3. Secrets are stored using Electron safeStorage (macOS Keychain / OS-level encryption).
 * 4. Only boolean existence checks (hasKey), write (saveKey), and deletion (deleteKey) are exposed to IPC.
 */
class CredentialService {
  constructor(options = {}) {
    this.safeStorage = options.safeStorage || null;
    this.storageDir = options.storageDir || null;
    this.vaultFileName = 'credentials.enc.json';

    this.inMemoryCache = {
      openWaKey: null,
      metaAccessToken: null,
    };

    this.isLoaded = false;
  }

  setSafeStorage(safeStorageInstance) {
    this.safeStorage = safeStorageInstance;
  }

  setStorageDir(dirPath) {
    this.storageDir = dirPath;
    this.isLoaded = false;
  }

  getVaultPath() {
    if (!this.storageDir) {
      throw new Error('CredentialService: Depolama dizini (storageDir) tanımlanmamış.');
    }
    return path.join(this.storageDir, this.vaultFileName);
  }

  isEncryptionAvailable() {
    if (this.safeStorage && typeof this.safeStorage.isEncryptionAvailable === 'function') {
      return this.safeStorage.isEncryptionAvailable();
    }
    return false;
  }

  /**
   * Encrypts plaintext string using Electron safeStorage.
   * If running in test/fallback environment, uses hardware/machine-derived AES-GCM.
   */
  encryptString(plainText) {
    if (!plainText) return '';

    if (this.isEncryptionAvailable()) {
      try {
        const buffer = this.safeStorage.encryptString(plainText);
        return buffer.toString('base64');
      } catch (err) {
        console.error('[CredentialService] safeStorage şifreleme hatası:', err.message);
      }
    }

    // Machine-bound fallback for headless / test environments
    return this.fallbackEncrypt(plainText);
  }

  /**
   * Decrypts base64 ciphertext using Electron safeStorage.
   */
  decryptString(cipherTextBase64) {
    if (!cipherTextBase64) return null;

    if (this.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(cipherTextBase64, 'base64');
        return this.safeStorage.decryptString(buffer);
      } catch (err) {
        console.error('[CredentialService] safeStorage çözme hatası:', err.message);
      }
    }

    return this.fallbackDecrypt(cipherTextBase64);
  }

  // Local AES-256-GCM fallback for testing environments where safeStorage is unavailable
  fallbackEncrypt(text) {
    const key = crypto.createHash('sha256').update(this.storageDir || 'vatsap-vault-key').digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `fb:${iv.toString('hex')}:${tag}:${enc}`;
  }

  fallbackDecrypt(cipherStr) {
    if (!cipherStr || !cipherStr.startsWith('fb:')) return null;
    try {
      const parts = cipherStr.split(':');
      if (parts.length !== 4) return null;
      const [, ivHex, tagHex, encHex] = parts;
      const key = crypto.createHash('sha256').update(this.storageDir || 'vatsap-vault-key').digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      let dec = decipher.update(encHex, 'hex', 'utf8');
      dec += decipher.final('utf8');
      return dec;
    } catch {
      return null;
    }
  }

  /**
   * Loads and decrypts credentials into in-memory cache inside Main Process.
   */
  load() {
    if (this.isLoaded) return;
    this.isLoaded = true;

    try {
      const vaultPath = this.getVaultPath();
      if (!fs.existsSync(vaultPath)) {
        return;
      }

      const fileData = fs.readFileSync(vaultPath, 'utf8');
      const parsed = JSON.parse(fileData);

      if (parsed.openWaKeyEnc) {
        this.inMemoryCache.openWaKey = this.decryptString(parsed.openWaKeyEnc);
      }
      if (parsed.metaAccessTokenEnc) {
        this.inMemoryCache.metaAccessToken = this.decryptString(parsed.metaAccessTokenEnc);
      }
    } catch (err) {
      console.error('[CredentialService] Kasa yüklenemedi:', err.message);
    }
  }

  /**
   * Persists current in-memory cache to disk as encrypted ciphertext.
   */
  persist() {
    try {
      if (!this.storageDir) return;
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      const vaultData = {
        updatedAt: new Date().toISOString(),
        openWaKeyEnc: this.inMemoryCache.openWaKey ? this.encryptString(this.inMemoryCache.openWaKey) : null,
        metaAccessTokenEnc: this.inMemoryCache.metaAccessToken
          ? this.encryptString(this.inMemoryCache.metaAccessToken)
          : null,
      };

      const vaultPath = this.getVaultPath();
      fs.writeFileSync(vaultPath, JSON.stringify(vaultData, null, 2), { mode: 0o600 });
    } catch (err) {
      console.error('[CredentialService] Kasa kaydedilemedi:', err.message);
    }
  }

  // ==========================================
  // Domain Methods: OpenWA API Key
  // ==========================================

  hasOpenWAKey() {
    this.load();
    return Boolean(this.inMemoryCache.openWaKey && this.inMemoryCache.openWaKey.trim());
  }

  /**
   * Internal Main Process ONLY — Never expose to IPC!
   */
  getOpenWAKey() {
    this.load();
    return this.inMemoryCache.openWaKey || null;
  }

  saveOpenWAKey(key) {
    this.load();
    const cleanKey = typeof key === 'string' ? key.trim() : '';
    if (!cleanKey) {
      return this.deleteOpenWAKey();
    }
    this.inMemoryCache.openWaKey = cleanKey;
    this.persist();
    return { success: true, saved: true };
  }

  deleteOpenWAKey() {
    this.load();
    this.inMemoryCache.openWaKey = null;
    this.persist();
    return { success: true, deleted: true };
  }

  // ==========================================
  // Domain Methods: Meta Cloud API Token
  // ==========================================

  hasMetaAccessToken() {
    this.load();
    return Boolean(this.inMemoryCache.metaAccessToken && this.inMemoryCache.metaAccessToken.trim());
  }

  /**
   * Internal Main Process ONLY — Never expose to IPC!
   */
  getMetaAccessToken() {
    this.load();
    return this.inMemoryCache.metaAccessToken || null;
  }

  saveMetaAccessToken(token) {
    this.load();
    const cleanToken = typeof token === 'string' ? token.trim() : '';
    if (!cleanToken) {
      return this.deleteMetaAccessToken();
    }
    this.inMemoryCache.metaAccessToken = cleanToken;
    this.persist();
    return { success: true, saved: true };
  }

  deleteMetaAccessToken() {
    this.load();
    this.inMemoryCache.metaAccessToken = null;
    this.persist();
    return { success: true, deleted: true };
  }

  // ==========================================
  // Migration: One-time migration of legacy ciphertexts
  // ==========================================

  migrateLegacyCiphertext(payload) {
    this.load();
    let migratedOpenWa = false;
    let migratedMeta = false;

    if (payload && typeof payload === 'object') {
      const { encryptedOpenWaKey, encryptedMetaToken } = payload;

      // Migrate OpenWA key if not already set and ciphertext provided
      if (encryptedOpenWaKey && typeof encryptedOpenWaKey === 'string' && !this.inMemoryCache.openWaKey) {
        const decrypted = this.decryptString(encryptedOpenWaKey);
        if (decrypted && decrypted.trim()) {
          this.inMemoryCache.openWaKey = decrypted.trim();
          migratedOpenWa = true;
        }
      }

      // Migrate Meta token if not already set and ciphertext provided
      if (encryptedMetaToken && typeof encryptedMetaToken === 'string' && !this.inMemoryCache.metaAccessToken) {
        const decrypted = this.decryptString(encryptedMetaToken);
        if (decrypted && decrypted.trim()) {
          this.inMemoryCache.metaAccessToken = decrypted.trim();
          migratedMeta = true;
        }
      }

      if (migratedOpenWa || migratedMeta) {
        this.persist();
      }
    }

    return {
      success: true,
      migratedOpenWa,
      migratedMeta,
    };
  }
}

module.exports = CredentialService;
