const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

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
      this.SQL = await initSqlJs();
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

    // Persist initial schema to disk
    this.saveToDisk();

    this.isLoaded = true;
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
   */
  saveToDisk() {
    if (!this.db) return;
    const dbPath = this.getDbPath();
    const data = this.db.export();
    const buffer = Buffer.from(data);

    const tempPath = `${dbPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, dbPath);
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
  MIGRATIONS,
};
