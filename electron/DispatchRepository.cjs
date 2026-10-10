const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

/**
 * Normalizes phone numbers to standard format (digits only, e.g. 905321112233).
 */
function normalizeRecipientPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0090')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('05')) {
    cleaned = '9' + cleaned;
  } else if (cleaned.startsWith('5') && cleaned.length === 10) {
    cleaned = '90' + cleaned;
  }
  return cleaned;
}

/**
 * Computes SHA-256 hash from Buffer or string.
 */
function computeSha256(data) {
  if (Buffer.isBuffer(data)) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  if (typeof data === 'string') {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }
  throw new Error('computeSha256: Veri Buffer veya string olmalıdır.');
}

/**
 * Computes deterministic SHA-256 dispatch_key from normalized identity fields.
 * Canonical representation uses versioned JSON with alphabetically sorted keys:
 * {
 *   examName: string,
 *   pdfSha256: string (lowercase 64-char hex),
 *   phone: string (normalized digits, e.g. 905321112233),
 *   studentId: string,
 *   v: 1
 * }
 */
function computeDeterministicDispatchKey({ studentId, examName, phone, pdfSha256 }) {
  if (!studentId || typeof studentId !== 'string') {
    throw new Error('computeDeterministicDispatchKey: studentId alanı zorunludur.');
  }
  if (!examName || typeof examName !== 'string') {
    throw new Error('computeDeterministicDispatchKey: examName alanı zorunludur.');
  }
  if (!phone || typeof phone !== 'string') {
    throw new Error('computeDeterministicDispatchKey: phone alanı zorunludur.');
  }
  if (!pdfSha256 || typeof pdfSha256 !== 'string') {
    throw new Error('computeDeterministicDispatchKey: pdfSha256 alanı zorunludur.');
  }

  const normalizedPhone = normalizeRecipientPhone(phone);
  const normalizedExam = examName.trim();
  const normalizedStudentId = studentId.trim();
  const normalizedPdfSha256 = pdfSha256.trim().toLowerCase();

  const canonicalObj = {
    examName: normalizedExam,
    pdfSha256: normalizedPdfSha256,
    phone: normalizedPhone,
    studentId: normalizedStudentId,
    v: 1,
  };

  const canonicalJson = JSON.stringify(canonicalObj);
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

/**
 * Valid delivery states defined in V2 Architecture (P0-3B).
 */
const ALLOWED_DISPATCH_STATUSES = new Set([
  'pending',
  'sending',
  'sent',
  'delivered',
  'failed',
  'unknown',
]);

/**
 * Valid state transitions for Vatsap V2 (P0-3B.3)
 * Enforces unidirectional progression and prevents unauthorized regression.
 */
const VALID_STATE_TRANSITIONS = {
  pending: new Set(['pending', 'sending', 'sent', 'failed']),
  sending: new Set(['sending', 'sent', 'failed', 'unknown']),
  sent: new Set(['sent', 'delivered']),
  delivered: new Set(['delivered']),
  failed: new Set(['failed', 'sending']),
  unknown: new Set(['unknown', 'sending']),
};

/**
 * Migration definitions for Karne Gönderici SQLite database.
 * Each migration is strictly idempotent and runs in a transaction.
 */
const MIGRATIONS = [
  {
    version: 1,
    name: '001_initial_dispatches',
    up: (db) => {
      // 1. Core dispatches table with strict check constraints & unique dispatch_key
      db.run(`
        CREATE TABLE IF NOT EXISTS dispatches (
          id TEXT PRIMARY KEY,
          dispatch_key TEXT NOT NULL UNIQUE,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          exam_name TEXT NOT NULL,
          pdf_name TEXT NOT NULL,
          pdf_sha256 TEXT NOT NULL,
          provider TEXT NOT NULL,
          provider_message_id TEXT,
          status TEXT NOT NULL CHECK(status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'unknown')),
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // 2. Performance indexes
      // Note: UNIQUE constraint on dispatch_key automatically creates an index in SQLite,
      // so we do not create a duplicate redundant index on dispatch_key.
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_dispatches_status ON dispatches(status);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_dispatches_exam_student ON dispatches(exam_name, student_id);
      `);
    },
  },
];

/**
 * Vatsap V2 DispatchRepository (Main Process Only)
 *
 * Security & Architecture Invariants:
 * 1. Database is managed exclusively by the Electron Main Process.
 * 2. Renderer Process never has direct filesystem access or raw SQL query execution.
 * 3. All SQL statements use parameterized bindings to prevent injection.
 * 4. Database file is stored under Electron app.getPath('userData')/karne_v2.db.
 * 5. Migrations are tracked in schema_migrations table and are strictly idempotent.
 * 6. Changes are flushed atomically to disk using temp-file rename.
 */
class DispatchRepository {
  constructor(options = {}) {
    this.storageDir = options.storageDir || null;
    this.dbFileName = options.dbFileName || 'karne_v2.db';
    this.customDbPath = options.dbPath || null;
    this.db = null;
    this.SQL = null;
    this.isLoaded = false;
    this.unknownRetryTokens = new Map();
  }

  setStorageDir(dirPath) {
    this.storageDir = dirPath;
    this.isLoaded = false;
  }

  getDbPath() {
    if (this.customDbPath) {
      return this.customDbPath;
    }
    if (!this.storageDir) {
      throw new Error('DispatchRepository: Depolama dizini (storageDir) tanımlanmamış.');
    }
    return path.join(this.storageDir, this.dbFileName);
  }

  isInitialized() {
    return Boolean(this.db && this.isLoaded);
  }

  /**
   * Initializes the SQLite database engine, loads or creates database file,
   * configures SQLite pragmas, and applies pending migrations.
   */
  async init() {
    if (this.isInitialized()) {
      return;
    }

    const dbPath = this.getDbPath();
    const parentDir = path.dirname(dbPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (!this.SQL) {
      let sqlOptions = {};
      try {
        const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
        if (fs.existsSync(wasmPath)) {
          const wasmBinary = fs.readFileSync(wasmPath);
          sqlOptions = { wasmBinary };
        }
      } catch {
        // Fallback to default initSqlJs loader
      }
      this.SQL = await initSqlJs(sqlOptions);
    }

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
    }

    // Enable foreign keys
    this.db.run('PRAGMA foreign_keys = ON;');

    // Run schema migrations
    this.runMigrations();

    this.isLoaded = true;

    // Reconcile orphaned 'sending' dispatches from crash or unclean shutdown (P0-3B.3)
    this.reconcileStartupState();

    // Persist initial schema to disk
    this.saveToDisk();
  }

  /**
   * Runs pending migrations within transactions and records them into schema_migrations.
   */
  runMigrations() {
    if (!this.db) {
      throw new Error('DispatchRepository: Veritabanı başlatılmadan migration çalıştırılamaz.');
    }

    // 1. Ensure schema_migrations table exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    // 2. Read already applied versions
    const appliedVersions = new Set();
    const result = this.db.exec('SELECT version FROM schema_migrations ORDER BY version ASC;');
    if (result.length > 0 && result[0].values) {
      for (const row of result[0].values) {
        appliedVersions.add(row[0]);
      }
    }

    // 3. Apply pending migrations in order
    for (const migration of MIGRATIONS) {
      if (!appliedVersions.has(migration.version)) {
        try {
          this.db.run('BEGIN TRANSACTION;');
          migration.up(this.db);
          this.db.run(
            'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);',
            [migration.version, migration.name, new Date().toISOString()]
          );
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback secondary error
          }
          throw new Error(
            `DispatchRepository Migration Hatası [${migration.name}]: ${err.message || String(err)}`
          );
        }
      }
    }
  }

  /**
   * Flushes in-memory SQLite state to disk atomically.
   * If writing to temporary file or rename fails, cleans up the temporary file,
   * preserves the original valid database on disk, and throws the error.
   */
  saveToDisk() {
    if (!this.db) return;
    const dbPath = this.getDbPath();
    const data = this.db.export();
    const buffer = Buffer.from(data);

    const tempPath = `${dbPath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    try {
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, dbPath);
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore secondary cleanup error
        }
      }
      throw new Error(`DispatchRepository: Diske yazma hatası (${dbPath}): ${err.message || String(err)}`);
    }
  }

  /**
   * Closes the SQLite database handle and flushes any pending writes.
   */
  close() {
    if (this.db) {
      try {
        this.saveToDisk();
      } catch (err) {
        console.error('[DispatchRepository] Kapanış sırasında diske yazma hatası:', err);
      }
      try {
        this.db.close();
      } catch (err) {
        console.error('[DispatchRepository] Veritabanı kapatma hatası:', err);
      }
      this.db = null;
      this.isLoaded = false;
    }
  }

  /**
   * Reconciles orphaned 'sending' dispatches from previous crash / unclean shutdown (P0-3B.3).
   * Since the state cannot be proven, any dispatch left in 'sending' state upon startup
   * is safely converted to 'unknown'. It will NOT be automatically retried.
   */
  reconcileStartupState() {
    if (!this.db) {
      throw new Error('DispatchRepository: Veritabanı başlatılmadan reconcile yapılamaz.');
    }
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM dispatches WHERE status = 'sending';");
    let orphanCount = 0;
    try {
      if (stmt.step()) {
        orphanCount = Number(stmt.getAsObject().count || 0);
      }
    } finally {
      stmt.free();
    }

    if (orphanCount > 0) {
      const updatedAt = new Date().toISOString();
      this.db.run(
        `
        UPDATE dispatches
        SET status = 'unknown',
            last_error = 'Uygulama önceki oturumda beklenmedik şekilde kapandı; gönderim durumu belirsiz (unknown) olarak uzlaştırıldı.',
            updated_at = ?
        WHERE status = 'sending';
        `,
        [updatedAt]
      );
      this.saveToDisk();
      console.log(`[DispatchRepository] ${orphanCount} adet sahipsiz (orphaned) 'sending' kaydı 'unknown' olarak uzlaştırıldı.`);
    }
    return orphanCount;
  }

  /**
   * Creates a cryptographically secure, single-use, time-limited authorization token
   * for retrying an 'unknown' dispatch (P0-3B.3).
   * Token is bound to the specific dispatchKey and expires in 5 minutes.
   */
  createUnknownRetryToken(dispatchKey) {
    this.assertInitialized();
    if (!dispatchKey || typeof dispatchKey !== 'string') {
      throw new Error('createUnknownRetryToken: dispatchKey zorunludur.');
    }
    const record = this.getDispatchByKey(dispatchKey);
    if (!record) {
      throw new Error(`createUnknownRetryToken: dispatch_key "${dispatchKey}" bulunamadı.`);
    }
    if (record.status !== 'unknown') {
      throw new Error(
        `createUnknownRetryToken: Yalnızca 'unknown' durumundaki kayıtlar için onay belirteci üretilebilir. Mevcut durum: "${record.status}".`
      );
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 dakika geçerli
    this.unknownRetryTokens.set(token, {
      dispatchKey,
      expiresAt,
    });

    return {
      token,
      expiresAt,
      dispatchKey,
      warning:
        'DİKKAT: Önceki gönderim WhatsApp sunucularına ulaşmış ve veliye iletilmiş olabilir. Yeniden gönderim yapıldığında veliye aynı karnenin mükerrer (çift) olarak gitmesi riski kabul edilmiş sayılır.',
    };
  }

  /**
   * Verifies and consumes a single-use authorization token for 'unknown' retry (P0-3B.3).
   */
  verifyAndConsumeUnknownRetryToken(token, dispatchKey) {
    if (!token || typeof token !== 'string') return false;
    const entry = this.unknownRetryTokens.get(token);
    if (!entry) return false;

    // Single use: Immediately delete token from memory
    this.unknownRetryTokens.delete(token);

    if (entry.expiresAt < Date.now()) {
      return false; // Expired
    }
    if (entry.dispatchKey !== dispatchKey) {
      return false; // Mismatched dispatchKey
    }

    return true;
  }

  // =========================================================================
  // Parameterized Repository CRUD Methods
  // =========================================================================

  /**
   * Inserts a new dispatch record.
   * Throws if dispatch_key is duplicate or validation fails.
   */
  createDispatch(dispatchData) {
    this.assertInitialized();

    const {
      id,
      dispatch_key,
      student_id,
      student_name,
      phone,
      exam_name,
      pdf_name,
      pdf_sha256,
      provider,
      provider_message_id = null,
      status = 'pending',
      retry_count = 0,
      last_error = null,
      created_at = new Date().toISOString(),
      updated_at = new Date().toISOString(),
    } = dispatchData || {};

    if (!id || typeof id !== 'string') {
      throw new Error('DispatchRepository: id alanı zorunludur.');
    }
    if (!dispatch_key || typeof dispatch_key !== 'string') {
      throw new Error('DispatchRepository: dispatch_key alanı zorunludur.');
    }
    if (!student_id || typeof student_id !== 'string') {
      throw new Error('DispatchRepository: student_id alanı zorunludur.');
    }
    if (!student_name || typeof student_name !== 'string') {
      throw new Error('DispatchRepository: student_name alanı zorunludur.');
    }
    if (!phone || typeof phone !== 'string') {
      throw new Error('DispatchRepository: phone alanı zorunludur.');
    }
    if (!exam_name || typeof exam_name !== 'string') {
      throw new Error('DispatchRepository: exam_name alanı zorunludur.');
    }
    if (!pdf_name || typeof pdf_name !== 'string') {
      throw new Error('DispatchRepository: pdf_name alanı zorunludur.');
    }
    if (!pdf_sha256 || typeof pdf_sha256 !== 'string') {
      throw new Error('DispatchRepository: pdf_sha256 alanı zorunludur.');
    }
    if (!provider || typeof provider !== 'string') {
      throw new Error('DispatchRepository: provider alanı zorunludur.');
    }
    if (!ALLOWED_DISPATCH_STATUSES.has(status)) {
      throw new Error(
        `DispatchRepository: Geçersiz status değeri "${status}". İzin verilenler: ${Array.from(ALLOWED_DISPATCH_STATUSES).join(', ')}`
      );
    }

    const sql = `
      INSERT INTO dispatches (
        id,
        dispatch_key,
        student_id,
        student_name,
        phone,
        exam_name,
        pdf_name,
        pdf_sha256,
        provider,
        provider_message_id,
        status,
        retry_count,
        last_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    this.db.run(sql, [
      id,
      dispatch_key,
      student_id,
      student_name,
      phone,
      exam_name,
      pdf_name,
      pdf_sha256,
      provider,
      provider_message_id,
      status,
      retry_count,
      last_error,
      created_at,
      updated_at,
    ]);

    this.saveToDisk();

    return this.getDispatchByKey(dispatch_key);
  }

  /**
   * Retrieves a dispatch by its unique dispatch_key.
   * Returns null if not found.
   */
  getDispatchByKey(dispatchKey) {
    this.assertInitialized();
    if (!dispatchKey || typeof dispatchKey !== 'string') return null;

    const stmt = this.db.prepare('SELECT * FROM dispatches WHERE dispatch_key = ?;');
    try {
      stmt.bind([dispatchKey]);
      if (stmt.step()) {
        return stmt.getAsObject();
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  /**
   * Retrieves a dispatch by its primary key ID.
   * Returns null if not found.
   */
  getDispatchById(id) {
    this.assertInitialized();
    if (!id || typeof id !== 'string') return null;

    const stmt = this.db.prepare('SELECT * FROM dispatches WHERE id = ?;');
    try {
      stmt.bind([id]);
      if (stmt.step()) {
        return stmt.getAsObject();
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  /**
   * Updates status and optional metadata for a dispatch identified by dispatch_key.
   */
  updateDispatchStatus(dispatchKey, status, extra = {}) {
    this.assertInitialized();
    if (!dispatchKey || typeof dispatchKey !== 'string') {
      throw new Error('DispatchRepository: dispatchKey zorunludur.');
    }
    if (!ALLOWED_DISPATCH_STATUSES.has(status)) {
      throw new Error(`DispatchRepository: Geçersiz status değeri "${status}".`);
    }

    const existing = this.getDispatchByKey(dispatchKey);
    if (!existing) {
      throw new Error(`DispatchRepository: dispatch_key "${dispatchKey}" bulunamadı.`);
    }

    // State Transition Matrix Verification (P0-3B.3)
    if (existing.status !== status) {
      const allowedTargets = VALID_STATE_TRANSITIONS[existing.status];
      if (!allowedTargets || !allowedTargets.has(status)) {
        throw new Error(
          `DispatchRepository: Geçersiz durum geçişi: "${existing.status}" -> "${status}". Bu geçişe izin verilmez.`
        );
      }
    }

    // Delivery Proof Invariant (P0-3B.3)
    if (status === 'delivered' && extra && extra.requireDeliveryProof) {
      const hasProof = Boolean(
        (extra.delivery_proof && String(extra.delivery_proof).trim().length > 0) ||
        (extra.provider_message_id && String(extra.provider_message_id).trim().length > 0) ||
        extra.webhookVerified === true
      );
      if (!hasProof) {
        throw new Error(
          'DispatchRepository: "delivered" durumu için doğrulanmış teslimat kanıtı veya mesaj kimliği zorunludur.'
        );
      }
    }

    const updatedAt = new Date().toISOString();
    const providerMessageId = extra.provider_message_id !== undefined ? extra.provider_message_id : existing.provider_message_id;
    const retryCount = extra.retry_count !== undefined ? extra.retry_count : existing.retry_count;
    const lastError = extra.last_error !== undefined ? extra.last_error : existing.last_error;

    this.db.run(
      `
      UPDATE dispatches
      SET status = ?,
          provider_message_id = ?,
          retry_count = ?,
          last_error = ?,
          updated_at = ?
      WHERE dispatch_key = ?;
      `,
      [status, providerMessageId, retryCount, lastError, updatedAt, dispatchKey]
    );

    this.saveToDisk();

    return this.getDispatchByKey(dispatchKey);
  }

  /**
   * Returns all dispatches for a given exam name ordered by creation date.
   */
  getDispatchesByExam(examName) {
    this.assertInitialized();
    if (!examName || typeof examName !== 'string') return [];

    const stmt = this.db.prepare(
      'SELECT * FROM dispatches WHERE exam_name = ? ORDER BY created_at ASC;'
    );
    const rows = [];
    try {
      stmt.bind([examName]);
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /**
   * Returns dispatches filtered by status.
   */
  getDispatchesByStatus(status) {
    this.assertInitialized();
    if (!ALLOWED_DISPATCH_STATUSES.has(status)) return [];

    const stmt = this.db.prepare(
      'SELECT * FROM dispatches WHERE status = ? ORDER BY created_at ASC;'
    );
    const rows = [];
    try {
      stmt.bind([status]);
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /**
   * Returns dispatches that are currently pending or sending.
   */
  getPendingOrSendingDispatches() {
    this.assertInitialized();
    const stmt = this.db.prepare(
      "SELECT * FROM dispatches WHERE status IN ('pending', 'sending') ORDER BY created_at ASC;"
    );
    const rows = [];
    try {
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /**
   * Returns total count of dispatches.
   */
  countDispatches() {
    this.assertInitialized();
    const result = this.db.exec('SELECT COUNT(*) as count FROM dispatches;');
    if (result.length > 0 && result[0].values && result[0].values[0]) {
      return Number(result[0].values[0][0]);
    }
    return 0;
  }

  /**
   * Main Process Dispatch Reservation (P0-3B.2)
   *
   * Atomically reserves a dispatch attempt before any provider API call is made.
   * Guarantees:
   * 1. If dispatch is already 'sent' or 'delivered', blocks with ALREADY_SENT.
   * 2. If dispatch is currently 'sending', blocks with IN_PROGRESS to prevent concurrent duplicate delivery.
   * 3. If dispatch was 'unknown' delivery, blocks with UNKNOWN_DELIVERY unless explicitly overridden.
   * 4. If dispatch was 'failed', permits retry (isRetry: true) and increments retry_count.
   * 5. If new dispatch, creates record with status 'sending' and unique dispatch_key.
   * 6. Handles race conditions with SQLite unique constraint error catching.
   */
  reserveDispatch(params, options = {}) {
    this.assertInitialized();

    const {
      studentId,
      studentName,
      phone,
      examName,
      pdfName,
      pdfSha256,
      provider,
      id,
    } = params || {};

    if (!studentId || typeof studentId !== 'string') {
      throw new Error('DispatchRepository.reserveDispatch: studentId zorunludur.');
    }
    if (!studentName || typeof studentName !== 'string') {
      throw new Error('DispatchRepository.reserveDispatch: studentName zorunludur.');
    }
    if (!phone || typeof phone !== 'string') {
      throw new Error('DispatchRepository.reserveDispatch: phone zorunludur.');
    }
    if (!examName || typeof examName !== 'string') {
      throw new Error('DispatchRepository.reserveDispatch: examName zorunludur.');
    }
    if (!pdfName || typeof pdfName !== 'string') {
      throw new Error('DispatchRepository.reserveDispatch: pdfName zorunludur.');
    }
    if (!pdfSha256 || typeof pdfSha256 !== 'string') {
      throw new Error('DispatchRepository.reserveDispatch: pdfSha256 zorunludur.');
    }
    if (!provider || typeof provider !== 'string') {
      throw new Error('DispatchRepository.reserveDispatch: provider zorunludur.');
    }

    const dispatchKey = computeDeterministicDispatchKey({
      studentId,
      examName,
      phone,
      pdfSha256,
    });

    const existing = this.getDispatchByKey(dispatchKey);

    if (existing) {
      if (existing.status === 'sent' || existing.status === 'delivered') {
        return {
          allowed: false,
          code: 'ALREADY_SENT',
          reason: 'Bu öğrenci ve sınav için karne daha önce başarıyla gönderilmiş.',
          dispatchKey,
          existing,
        };
      }

      if (existing.status === 'sending') {
        return {
          allowed: false,
          code: 'IN_PROGRESS',
          reason: 'Bu karne için gönderim şu anda aktif olarak işleniyor.',
          dispatchKey,
          existing,
        };
      }

      if (existing.status === 'unknown') {
        const { confirmationToken, allowUnknownRetry, isFromRenderer } = options || {};
        const hasValidToken = confirmationToken && this.verifyAndConsumeUnknownRetryToken(confirmationToken, dispatchKey);
        const isExplicitRepoOverride = Boolean(allowUnknownRetry && !isFromRenderer);

        if (!hasValidToken && !isExplicitRepoOverride) {
          return {
            allowed: false,
            code: 'UNKNOWN_DELIVERY',
            reason: 'Önceki gönderim sonucu belirsiz (unknown). Mükerrer gönderimi önlemek için Main Process tek kullanımlık onay belirteci (confirmationToken) zorunludur.',
            dispatchKey,
            existing,
          };
        }
      }

      // If 'failed', 'pending', or explicitly allowed unknown retry:
      const updated = this.updateDispatchStatus(dispatchKey, 'sending', {
        retry_count: (existing.retry_count || 0) + 1,
        last_error: null,
      });

      return {
        allowed: true,
        isRetry: true,
        dispatchKey,
        dispatch: updated,
      };
    }

    // No existing record found: create fresh reservation
    const recordId = id || `disp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const cleanPhone = normalizeRecipientPhone(phone);

    try {
      const created = this.createDispatch({
        id: recordId,
        dispatch_key: dispatchKey,
        student_id: studentId.trim(),
        student_name: studentName.trim(),
        phone: cleanPhone,
        exam_name: examName.trim(),
        pdf_name: pdfName.trim(),
        pdf_sha256: pdfSha256.trim().toLowerCase(),
        provider: provider.trim(),
        status: 'sending',
        retry_count: 0,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return {
        allowed: true,
        isRetry: false,
        dispatchKey,
        dispatch: created,
      };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        const raceExisting = this.getDispatchByKey(dispatchKey);
        const isSent = raceExisting && (raceExisting.status === 'sent' || raceExisting.status === 'delivered');
        return {
          allowed: false,
          code: isSent ? 'ALREADY_SENT' : 'IN_PROGRESS',
          reason: 'Eşzamanlı rezervasyon çakışması tespit edildi.',
          dispatchKey,
          existing: raceExisting,
        };
      }
      throw err;
    }
  }

  assertInitialized() {
    if (!this.isInitialized()) {
      throw new Error(
        'DispatchRepository başlatılmamış. Lütfen işlem yapmadan önce await repo.init() çağırın.'
      );
    }
  }
}

module.exports = {
  DispatchRepository,
  ALLOWED_DISPATCH_STATUSES,
  VALID_STATE_TRANSITIONS,
  MIGRATIONS,
  computeSha256,
  computeDeterministicDispatchKey,
  normalizeRecipientPhone,
};
