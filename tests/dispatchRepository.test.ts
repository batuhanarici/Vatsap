import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// CommonJS require for Main Process modules
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DispatchRepository, ALLOWED_DISPATCH_STATUSES } = require('../electron/DispatchRepository.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preloadSource = fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8');

describe('Vatsap V2 — P0-3B.1: Main Process SQLite Foundation Test Suite', () => {
  let tempDir: string;
  let repo: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-sqlite-test-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_v2_test.db',
    });
  });

  afterEach(() => {
    if (repo && repo.isInitialized()) {
      repo.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup on windows/locked handles
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test 1: Veritabanı ilk açılışta oluşturuluyor
  // -------------------------------------------------------------------------
  it('Test 1: Veritabanı ilk açılışta diskte oluşturulur ve şema hazırlanır', async () => {
    const expectedDbPath = path.join(tempDir, 'karne_v2_test.db');
    expect(fs.existsSync(expectedDbPath)).toBe(false);

    await repo.init();

    expect(repo.isInitialized()).toBe(true);
    expect(fs.existsSync(expectedDbPath)).toBe(true);
    expect(fs.statSync(expectedDbPath).size).toBeGreaterThan(0);
    expect(repo.countDispatches()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 2: Uygulama yeniden başlatıldığında kayıtlar kalıcı
  // -------------------------------------------------------------------------
  it('Test 2: Uygulama yeniden başlatıldığında (close -> re-init) kayıtlar disktan okunur ve kalıcıdır', async () => {
    await repo.init();

    repo.createDispatch({
      id: 'disp_001',
      dispatch_key: 'key_student_101_deneme1',
      student_id: 'std_101',
      student_name: 'Ahmet Yılmaz',
      phone: '905321112233',
      exam_name: 'Deneme 1',
      pdf_name: 'Ahmet Yılmaz.pdf',
      pdf_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      provider: 'openwa',
      status: 'pending',
    });

    expect(repo.countDispatches()).toBe(1);

    // Kapat
    repo.close();
    expect(repo.isInitialized()).toBe(false);

    // Yeni repo örneği aç (Uygulama yeniden başlatılmış gibi)
    const secondRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_v2_test.db',
    });

    await secondRepo.init();
    expect(secondRepo.isInitialized()).toBe(true);
    expect(secondRepo.countDispatches()).toBe(1);

    const loaded = secondRepo.getDispatchByKey('key_student_101_deneme1');
    expect(loaded).not.toBeNull();
    expect(loaded.id).toBe('disp_001');
    expect(loaded.student_name).toBe('Ahmet Yılmaz');
    expect(loaded.phone).toBe('905321112233');
    expect(loaded.status).toBe('pending');

    secondRepo.close();
  });

  // -------------------------------------------------------------------------
  // Test 3: Migration iki kez çalıştırıldığında hata oluşmuyor (idempotency)
  // -------------------------------------------------------------------------
  it('Test 3: Migration iki veya daha fazla kez çalıştırıldığında hata oluşmaz (idempotent)', async () => {
    await repo.init();

    // İkinci kez doğrudan migration runner'ı tetikle
    expect(() => repo.runMigrations()).not.toThrow();

    // Üçüncü kez doğrudan tetikle
    expect(() => repo.runMigrations()).not.toThrow();

    // schema_migrations tablosunda version 1 yalnızca bir kez kayıtlı olmalı
    const res = repo.db.exec('SELECT version, name FROM schema_migrations WHERE version = 1;');
    expect(res.length).toBe(1);
    expect(res[0].values.length).toBe(1);
    expect(res[0].values[0][0]).toBe(1);
    expect(res[0].values[0][1]).toBe('001_initial_dispatches');
  });

  // -------------------------------------------------------------------------
  // Test 4: dispatch_key benzersizliği SQLite tarafından uygulanıyor
  // -------------------------------------------------------------------------
  it('Test 4: dispatch_key benzersizliği SQLite UNIQUE kısıtı tarafından zorlanır', async () => {
    await repo.init();

    repo.createDispatch({
      id: 'disp_101',
      dispatch_key: 'unique_dispatch_key_xyz',
      student_id: 'std_1',
      student_name: 'Ayşe Demir',
      phone: '905332223344',
      exam_name: 'Deneme Sınavı 1',
      pdf_name: 'Ayse.pdf',
      pdf_sha256: 'hash_123',
      provider: 'meta_cloud',
      status: 'sending',
    });

    // Aynı dispatch_key ile ikinci kayıt eklenmeye çalışıldığında SQLite hata fırlatmalıdır
    expect(() => {
      repo.createDispatch({
        id: 'disp_102', // Farklı primary key id
        dispatch_key: 'unique_dispatch_key_xyz', // Aynı dispatch_key!
        student_id: 'std_2',
        student_name: 'Ayşe Demir 2',
        phone: '905332223344',
        exam_name: 'Deneme Sınavı 1',
        pdf_name: 'Ayse.pdf',
        pdf_sha256: 'hash_123',
        provider: 'meta_cloud',
        status: 'pending',
      });
    }).toThrow(/UNIQUE constraint failed: dispatches.dispatch_key/i);

    expect(repo.countDispatches()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 5: Geçersiz status değerleri reddediliyor
  // -------------------------------------------------------------------------
  it('Test 5: Geçersiz status değerleri hem repository hem de SQLite CHECK kısıtı tarafından reddedilir', async () => {
    await repo.init();

    // 1. Repository katmanı doğrulama testi
    expect(() => {
      repo.createDispatch({
        id: 'disp_invalid_1',
        dispatch_key: 'key_invalid_1',
        student_id: 'std_1',
        student_name: 'Ali Kaya',
        phone: '905351112233',
        exam_name: 'Deneme 1',
        pdf_name: 'Ali.pdf',
        pdf_sha256: 'hash_val',
        provider: 'openwa',
        status: 'hacker_status_not_allowed', // Geçersiz status!
      });
    }).toThrow(/Geçersiz status değeri/);

    // 2. Doğrudan SQL seviyesinde CHECK kısıtı testi
    expect(() => {
      repo.db.run(`
        INSERT INTO dispatches (
          id, dispatch_key, student_id, student_name, phone, exam_name,
          pdf_name, pdf_sha256, provider, status, created_at, updated_at
        ) VALUES (
          'raw_id_1', 'raw_key_1', 'std_1', 'Ali', '905351112233', 'Ex1',
          'A.pdf', 'hash', 'openwa', 'invalid_enum', '2026-10-09', '2026-10-09'
        );
      `);
    }).toThrow(/CHECK constraint failed/i);

    // İzin verilen tüm status'lar başarıyla kabul edilmeli
    for (const validStatus of ALLOWED_DISPATCH_STATUSES) {
      const created = repo.createDispatch({
        id: `disp_status_${validStatus}`,
        dispatch_key: `key_status_${validStatus}`,
        student_id: 'std_test',
        student_name: 'Test Öğrenci',
        phone: '905351112233',
        exam_name: 'Deneme 1',
        pdf_name: 'Test.pdf',
        pdf_sha256: 'hash_test',
        provider: 'openwa',
        status: validStatus,
      });
      expect(created.status).toBe(validStatus);
    }
  });

  // -------------------------------------------------------------------------
  // Test 6: Parametreli sorgular doğru çalışıyor
  // -------------------------------------------------------------------------
  it('Test 6: Parametreli SQL sorguları (getDispatchByKey, updateDispatchStatus, getDispatchesByExam) doğru çalışır', async () => {
    await repo.init();

    repo.createDispatch({
      id: 'disp_param_1',
      dispatch_key: 'key_param_1',
      student_id: 'std_10',
      student_name: 'Can Öztürk',
      phone: '905375556677',
      exam_name: 'LGS Deneme 4',
      pdf_name: 'Can.pdf',
      pdf_sha256: 'hash_can',
      provider: 'openwa',
      status: 'pending',
    });

    // SQL injection denemesi parametre içinde zararsız string olarak ele alınmalı
    const sqlInjectionAttempt = "key_param_1' OR '1'='1";
    const injectionResult = repo.getDispatchByKey(sqlInjectionAttempt);
    expect(injectionResult).toBeNull();

    // Doğru anahtar ile çekildiğinde
    const found = repo.getDispatchByKey('key_param_1');
    expect(found).not.toBeNull();
    expect(found.student_name).toBe('Can Öztürk');

    // updateDispatchStatus ile durum güncellemesi
    const updated = repo.updateDispatchStatus('key_param_1', 'sent', {
      provider_message_id: 'msg_openwa_9999',
      retry_count: 1,
    });
    expect(updated.status).toBe('sent');
    expect(updated.provider_message_id).toBe('msg_openwa_9999');
    expect(updated.retry_count).toBe(1);

    // Sınav bazlı sorgu
    const examList = repo.getDispatchesByExam('LGS Deneme 4');
    expect(examList.length).toBe(1);
    expect(examList[0].id).toBe('disp_param_1');
  });

  // -------------------------------------------------------------------------
  // Test 7: Bağlantı kapatılıp yeniden açılabiliyor
  // -------------------------------------------------------------------------
  it('Test 7: Bağlantı close() ile kapatıldığında kaynaklar bırakılır ve yeniden init() edilebilir', async () => {
    await repo.init();
    expect(repo.isInitialized()).toBe(true);

    repo.close();
    expect(repo.isInitialized()).toBe(false);

    // Kapatılmış veritabanında işlem yapmaya çalışıldığında hata vermeli
    expect(() => repo.countDispatches()).toThrow(/DispatchRepository başlatılmamış/);

    // Yeniden init edilebilir
    await repo.init();
    expect(repo.isInitialized()).toBe(true);
    expect(repo.countDispatches()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 8: Başlatma veya migration hatası sessizce başarılı gibi gösterilmiyor
  // -------------------------------------------------------------------------
  it('Test 8: Başlatma hatası durumunda sahte/boş veritabanı ile devam edilmez, hata fırlatılır', async () => {
    // Depolama dizini atanmamış repository
    const invalidRepo = new DispatchRepository({
      storageDir: null,
    });

    await expect(invalidRepo.init()).rejects.toThrow(/Depolama dizini \(storageDir\) tanımlanmamış/);
    expect(invalidRepo.isInitialized()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 9: Renderer'a genel SQL erişimi sunulmuyor
  // -------------------------------------------------------------------------
  it('Test 9: Renderer preload köprüsünde genel SQL erişimi (executeSql, rawQuery vb.) kesinlikle yoktur', () => {
    // preload.cjs dosyasını incele
    expect(preloadSource).not.toContain('executeSql');
    expect(preloadSource).not.toContain('rawQuery');
    expect(preloadSource).not.toContain('runSql');
    expect(preloadSource).not.toContain('sqlite');
    expect(preloadSource).not.toContain('better-sqlite3');
  });

  // -------------------------------------------------------------------------
  // Test 10: updateDispatchStatus sonrası değişiklik derhal diske yazılır ve yeniden açılışta korunur
  // -------------------------------------------------------------------------
  it('Test 10: updateDispatchStatus sonrası değişiklik derhal diske yazılır ve repo yeniden açıldığında korunur', async () => {
    await repo.init();

    repo.createDispatch({
      id: 'disp_update_1',
      dispatch_key: 'key_update_test',
      student_id: 'std_upd',
      student_name: 'Zeynep Çelik',
      phone: '905364445566',
      exam_name: 'Deneme 2',
      pdf_name: 'Zeynep.pdf',
      pdf_sha256: 'sha_zeynep_123',
      provider: 'openwa',
      status: 'pending',
    });

    // Durumu güncelle
    repo.updateDispatchStatus('key_update_test', 'sent', {
      provider_message_id: 'wamid_123456789',
      retry_count: 2,
      last_error: 'İlk deneme gecikti',
    });

    // Repository'yi kapatıp yeni örnekle aç
    repo.close();

    const secondRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_v2_test.db',
    });
    await secondRepo.init();

    const reloaded = secondRepo.getDispatchByKey('key_update_test');
    expect(reloaded).not.toBeNull();
    expect(reloaded.status).toBe('sent');
    expect(reloaded.provider_message_id).toBe('wamid_123456789');
    expect(reloaded.retry_count).toBe(2);
    expect(reloaded.last_error).toBe('İlk deneme gecikti');

    secondRepo.close();
  });

  // -------------------------------------------------------------------------
  // Test 11: Yazma hatasında önceki geçerli veritabanı korunur
  // -------------------------------------------------------------------------
  it('Test 11: saveToDisk hatası oluştuğunda önceki geçerli veritabanı korunur ve geçici dosya temizlenir', async () => {
    await repo.init();

    repo.createDispatch({
      id: 'disp_safe_1',
      dispatch_key: 'key_safe_test',
      student_id: 'std_safe',
      student_name: 'Mehmet Kaya',
      phone: '905353334455',
      exam_name: 'Deneme 1',
      pdf_name: 'Mehmet.pdf',
      pdf_sha256: 'hash_safe',
      provider: 'meta_cloud',
      status: 'sent',
    });

    const dbPath = repo.getDbPath();
    const originalContent = fs.readFileSync(dbPath);

    // saveToDisk sırasında writeFileSync metodunun hata fırlattığını simüle et
    const originalWriteFileSync = fs.writeFileSync;
    let writeAttempts = 0;

    try {
      fs.writeFileSync = ((targetPath: fs.PathOrFileDescriptor, data: any, options: any) => {
        if (typeof targetPath === 'string' && targetPath.includes('.tmp.')) {
          writeAttempts++;
          throw new Error('Simüle edilmiş disk yazma / kota hatası (ENOSPC)');
        }
        return originalWriteFileSync(targetPath as any, data, options);
      }) as typeof fs.writeFileSync;

      // Hatanın çağırana fırlatıldığını doğrula
      expect(() => {
        repo.updateDispatchStatus('key_safe_test', 'delivered');
      }).toThrow(/Diske yazma hatası/);

      expect(writeAttempts).toBeGreaterThan(0);
    } finally {
      fs.writeFileSync = originalWriteFileSync;
    }

    // Orijinal veritabanı dosyasının bozulmadığını ve önceki halinin korunduğunu doğrula
    const currentContent = fs.readFileSync(dbPath);
    expect(Buffer.compare(originalContent, currentContent)).toBe(0);

    // Dizinde sahte geçici .tmp dosyası kalmadığını doğrula
    const files = fs.readdirSync(tempDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 12: Ardışık birden fazla yazma çağrısında veri kaybı veya dosya bozulması yaşanmaz
  // -------------------------------------------------------------------------
  it('Test 12: Çok sayıda ardışık yazma ve güncelleme çağrısında dosya bozulmaz ve tüm kayıtlar eksiksiz saklanır', async () => {
    await repo.init();

    const RECORD_COUNT = 15;
    for (let i = 0; i < RECORD_COUNT; i++) {
      repo.createDispatch({
        id: `disp_bulk_${i}`,
        dispatch_key: `key_bulk_${i}`,
        student_id: `std_bulk_${i}`,
        student_name: `Öğrenci ${i}`,
        phone: `9053211122${String(i).padStart(2, '0')}`,
        exam_name: 'Toplu Deneme',
        pdf_name: `Ogrenci_${i}.pdf`,
        pdf_sha256: `sha_${i}`,
        provider: 'openwa',
        status: 'pending',
      });

      // Hemen ardından güncelleme yap
      repo.updateDispatchStatus(`key_bulk_${i}`, i % 2 === 0 ? 'sent' : 'failed', {
        retry_count: i % 3,
      });
    }

    expect(repo.countDispatches()).toBe(RECORD_COUNT);

    // Kapat ve baştan oku
    repo.close();

    const reloadRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_v2_test.db',
    });
    await reloadRepo.init();

    expect(reloadRepo.countDispatches()).toBe(RECORD_COUNT);
    const examList = reloadRepo.getDispatchesByExam('Toplu Deneme');
    expect(examList.length).toBe(RECORD_COUNT);

    for (let i = 0; i < RECORD_COUNT; i++) {
      const item = reloadRepo.getDispatchByKey(`key_bulk_${i}`);
      expect(item).not.toBeNull();
      expect(item.status).toBe(i % 2 === 0 ? 'sent' : 'failed');
      expect(item.retry_count).toBe(i % 3);
    }

    reloadRepo.close();
  });

  // -------------------------------------------------------------------------
  // Test 13: sql.js WASM ikili dosyasının yolu ve çözünürlüğü doğrulanır
  // -------------------------------------------------------------------------
  it('Test 13: sql.js paketinin sql-wasm.wasm dosyası require.resolve ile deterministik olarak mevcuttur', () => {
    const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
    expect(fs.existsSync(wasmPath)).toBe(true);
    expect(fs.statSync(wasmPath).size).toBeGreaterThan(100000); // ~658 KB
  });
});
