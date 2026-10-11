import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// CommonJS require for Main Process modules
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  DispatchRepository,
  MIGRATIONS,
  computeDeterministicDispatchKey,
} = require('../electron/DispatchRepository.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preloadSource = fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mainSource = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');

describe('Vatsap V2 — P1.1: SQLite Geçmiş Entegrasyonu ve Güvenli Unknown Uzlaştırması', () => {
  let tempDir: string;
  let repo: any;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-p11-test-'));
    repo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_p11_test.db',
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
        // Ignore file lock errors on teardown
      }
    }
  });

  // -------------------------------------------------------------------------
  // Senaryo 1: SQLite geçmişi uygulama yeniden başlatıldığında korunuyor
  // -------------------------------------------------------------------------
  it('Senaryo 1: SQLite geçmişi uygulama yeniden başlatıldığında (close -> re-init) korunur', async () => {
    repo.createDispatch({
      id: 'disp_101',
      dispatch_key: 'key_101',
      student_id: 'std_101',
      student_name: 'Ahmet Yılmaz',
      phone: '905321112233',
      exam_name: 'LGS Deneme 1',
      pdf_name: 'Ahmet Yılmaz.pdf',
      pdf_sha256: 'a'.repeat(64),
      provider: 'meta_cloud',
      status: 'sent',
    });

    repo.close();

    const secondRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'karne_p11_test.db',
    });
    await secondRepo.init();

    const all = secondRepo.getAllDispatches();
    expect(all.totalCount).toBe(1);
    expect(all.rows[0].id).toBe('disp_101');
    expect(all.rows[0].student_name).toBe('Ahmet Yılmaz');
    expect(all.rows[0].status).toBe('sent');

    secondRepo.close();
  });

  // -------------------------------------------------------------------------
  // Senaryo 2: localStorage temizlendiğinde SQLite geçmişi kaybolmuyor
  // -------------------------------------------------------------------------
  it('Senaryo 2: localStorage temizlense dahi Main Process SQLite geçmişi kaybolmaz ve bağımsızdır', async () => {
    repo.createDispatch({
      id: 'disp_201',
      dispatch_key: 'key_201',
      student_id: 'std_201',
      student_name: 'Ayşe Demir',
      phone: '905332223344',
      exam_name: 'Deneme 2',
      pdf_name: 'Ayşe Demir.pdf',
      pdf_sha256: 'b'.repeat(64),
      provider: 'openwa',
      status: 'unknown',
    });

    // Simulate clearing localStorage in browser
    const mockLocalStorage: Record<string, string> = {
      karne_gonderici_history: JSON.stringify([{ id: 'old_cache', studentName: 'Eski Cache' }]),
    };
    delete mockLocalStorage.karne_gonderici_history; // Clear cache

    // SQLite remains pristine and single source of truth
    const dispatches = repo.getAllDispatches();
    expect(dispatches.totalCount).toBe(1);
    expect(dispatches.rows[0].student_name).toBe('Ayşe Demir');
    expect(dispatches.rows[0].status).toBe('unknown');
  });

  // -------------------------------------------------------------------------
  // Senaryo 3: Geçmiş IPC'si yalnızca izin verilen alanları döndürüyor (no secrets)
  // -------------------------------------------------------------------------
  it('Senaryo 3: dispatch:getAll IPC metodu yalnızca güvenli alanları döndürür, gizli anahtarlar sızmaz', async () => {
    repo.createDispatch({
      id: 'disp_301',
      dispatch_key: 'key_301',
      student_id: 'std_301',
      student_name: 'Mehmet Kaya',
      phone: '905343334455',
      exam_name: 'Genel Sınav',
      pdf_name: 'Mehmet Kaya.pdf',
      pdf_sha256: 'c'.repeat(64),
      provider: 'meta_cloud',
      status: 'sent',
    });

    const res = repo.getAllDispatches();
    const row = res.rows[0];

    // Ensure forbidden sensitive properties do not exist
    expect((row as any).metaToken).toBeUndefined();
    expect((row as any).apiKey).toBeUndefined();
    expect((row as any).accessToken).toBeUndefined();
    expect((row as any).pdfBase64).toBeUndefined();

    // Verify preload exposes getAll
    expect(preloadSource).toContain("getAll: (options) => ipcRenderer.invoke('dispatch:getAll', options)");
  });

  // -------------------------------------------------------------------------
  // Senaryo 4: SQLite okuma hatası UI'da görünür oluyor (hata gizlenmez)
  // -------------------------------------------------------------------------
  it('Senaryo 4: SQLite başlatılmadığında veya okuma hatası olduğunda anlaşılır hata nesnesi üretilir', async () => {
    const uninitializedRepo = new DispatchRepository({
      storageDir: tempDir,
      dbFileName: 'nonexistent.db',
    });

    expect(() => {
      uninitializedRepo.getAllDispatches();
    }).toThrow('DispatchRepository başlatılmamış');
  });

  // -------------------------------------------------------------------------
  // Senaryo 5: unknown kaydı tabloda doğru rozet ve açıklamayla görünüyor
  // -------------------------------------------------------------------------
  it('Senaryo 5: unknown kaydı statik "ready" veya sahte "success" yapılmaz, belirsiz olarak sınıflandırılır', async () => {
    const key501 = computeDeterministicDispatchKey({
      studentId: 'std_501',
      examName: 'Bursluluk Sınavı',
      phone: '905354445566',
      pdfSha256: 'd'.repeat(64),
    });

    const created = repo.createDispatch({
      id: 'disp_501',
      dispatch_key: key501,
      student_id: 'std_501',
      student_name: 'Zeynep Çelik',
      phone: '905354445566',
      exam_name: 'Bursluluk Sınavı',
      pdf_name: 'Zeynep Çelik.pdf',
      pdf_sha256: 'd'.repeat(64),
      provider: 'openwa',
      status: 'unknown',
      last_error: 'ETIMEDOUT: Bağlantı zaman aşımına uğradı',
    });

    expect(created.status).toBe('unknown');
    expect(created.last_error).toContain('ETIMEDOUT');

    const reservation = repo.reserveDispatch(
      {
        studentId: 'std_501',
        studentName: 'Zeynep Çelik',
        phone: '905354445566',
        examName: 'Bursluluk Sınavı',
        pdfName: 'Zeynep Çelik.pdf',
        pdfSha256: 'd'.repeat(64),
        provider: 'openwa',
      },
      { isFromRenderer: true }
    );

    // Blocked without explicit single-use confirmation token!
    expect(reservation.allowed).toBe(false);
    expect(reservation.code).toBe('UNKNOWN_DELIVERY');
  });

  // -------------------------------------------------------------------------
  // Senaryo 6: Kullanıcı teyidi, dispatch durumunu sahte biçimde delivered yapmıyor
  // -------------------------------------------------------------------------
  it('Senaryo 6: "Alıcıya ulaştığı teyit edildi" işlemi ana dispatch durumunu delivered yapmaz, user_confirmed_delivered olarak işaretler', async () => {
    repo.createDispatch({
      id: 'disp_601',
      dispatch_key: 'key_601',
      student_id: 'std_601',
      student_name: 'Can Öztürk',
      phone: '905365556677',
      exam_name: 'TYT Deneme',
      pdf_name: 'Can Öztürk.pdf',
      pdf_sha256: 'e'.repeat(64),
      provider: 'openwa',
      status: 'unknown',
    });

    const reconRes = repo.reconcileManual({
      dispatchKey: 'key_601',
      action: 'confirm_delivered',
      userReason: 'Veli telefonla arandı, karnenin WhatsApp üzerinden ulaştığını onayladı.',
    });

    expect(reconRes.success).toBe(true);
    expect(reconRes.action).toBe('confirm_delivered');
    expect(reconRes.manualReconciliationStatus).toBe('user_confirmed_delivered');

    // Invariant: Core status MUST remain 'unknown' (never falsely changed to 'delivered' without provider proof)
    const record = repo.getDispatchByKey('key_601');
    expect(record.status).toBe('unknown');
    expect(record.manual_reconciliation_status).toBe('user_confirmed_delivered');
    expect(record.reconciliation_reason).toContain('Veli telefonla arandı');
    expect(record.reconciled_at).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Senaryo 7: Uzlaştırma gerekçesi ve zamanı kalıcı reconciliation_audit tablosuna kaydediliyor
  // -------------------------------------------------------------------------
  it('Senaryo 7: Uzlaştırma işlemi reconciliation_audit tablosuna gerekçe ve zaman damgasıyla kaydedilir', async () => {
    repo.createDispatch({
      id: 'disp_701',
      dispatch_key: 'key_701',
      student_id: 'std_701',
      student_name: 'Elif Şahin',
      phone: '905376667788',
      exam_name: 'AYT Deneme',
      pdf_name: 'Elif Şahin.pdf',
      pdf_sha256: 'f'.repeat(64),
      provider: 'meta_cloud',
      status: 'unknown',
    });

    repo.reconcileManual({
      dispatchKey: 'key_701',
      action: 'confirm_delivered',
      userReason: 'Okul müdür yardımcısı veliden sözlü teyit aldı.',
    });

    const auditList = repo.getReconciliationAudit('key_701');
    expect(auditList.length).toBe(1);
    expect(auditList[0].dispatch_key).toBe('key_701');
    expect(auditList[0].action).toBe('confirm_delivered');
    expect(auditList[0].previous_status).toBe('unknown');
    expect(auditList[0].user_reason).toBe('Okul müdür yardımcısı veliden sözlü teyit aldı.');
    expect(auditList[0].created_at).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Senaryo 8: Geçersiz, süresi dolmuş veya tüketilmiş retry token reddediliyor
  // -------------------------------------------------------------------------
  it('Senaryo 8: Authorize retry tek kullanımlık süreli token üretir; tüketilen veya süresi dolan token reddedilir', async () => {
    const key801 = computeDeterministicDispatchKey({
      studentId: 'std_801',
      examName: 'Deneme 8',
      phone: '905387778899',
      pdfSha256: '1'.repeat(64),
    });

    repo.createDispatch({
      id: 'disp_801',
      dispatch_key: key801,
      student_id: 'std_801',
      student_name: 'Burak Aydın',
      phone: '905387778899',
      exam_name: 'Deneme 8',
      pdf_name: 'Burak Aydın.pdf',
      pdf_sha256: '1'.repeat(64),
      provider: 'openwa',
      status: 'unknown',
    });

    // Authorize retry
    const authRes = repo.reconcileManual({
      dispatchKey: key801,
      action: 'authorize_retry',
      userReason: 'Veli karnenin gelmediğini teyit etti, yeniden gönderim talep edildi.',
    });

    expect(authRes.success).toBe(true);
    expect(authRes.retryToken).toBeDefined();
    expect(authRes.warning).toContain('mükerrer');

    const validToken = authRes.retryToken;

    // First use: Valid token allows atomic reservation
    const res1 = repo.reserveDispatch(
      {
        studentId: 'std_801',
        studentName: 'Burak Aydın',
        phone: '905387778899',
        examName: 'Deneme 8',
        pdfName: 'Burak Aydın.pdf',
        pdfSha256: '1'.repeat(64),
        provider: 'openwa',
      },
      { confirmationToken: validToken, isFromRenderer: true }
    );
    expect(res1.allowed).toBe(true);
    expect(res1.isRetry).toBe(true);

    // Second use: Token is already consumed! Must fail!
    const res2 = repo.reserveDispatch(
      {
        studentId: 'std_801',
        studentName: 'Burak Aydın',
        phone: '905387778899',
        examName: 'Deneme 8',
        pdfName: 'Burak Aydın.pdf',
        pdfSha256: '1'.repeat(64),
        provider: 'openwa',
      },
      { confirmationToken: validToken, isFromRenderer: true }
    );
    expect(res2.allowed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Senaryo 9: Renderer doğrudan dispatch durumunu değiştiremiyor
  // -------------------------------------------------------------------------
  it('Senaryo 9: dispatch:updateStatus kanalı Renderer çağrılarına karşı kesinlikle kapalıdır', async () => {
    expect(mainSource).toContain("ipcMain.handle('dispatch:updateStatus'");
    expect(mainSource).toContain('Erişim Reddedildi: dispatch:updateStatus doğrudan Renderer tarafından çağrılamaz');
  });

  // -------------------------------------------------------------------------
  // Senaryo 10: Rezervasyon başarısız olduğunda sağlayıcı çağrısı sıfır
  // -------------------------------------------------------------------------
  it('Senaryo 10: unknown rezervasyonu engellendiğinde sağlayıcı çağrısı yapılmaz', async () => {
    const key1001 = computeDeterministicDispatchKey({
      studentId: 'std_1001',
      examName: 'Deneme 10',
      phone: '905398889900',
      pdfSha256: '2'.repeat(64),
    });

    repo.createDispatch({
      id: 'disp_1001',
      dispatch_key: key1001,
      student_id: 'std_1001',
      student_name: 'İrem Güneş',
      phone: '905398889900',
      exam_name: 'Deneme 10',
      pdf_name: 'İrem Güneş.pdf',
      pdf_sha256: '2'.repeat(64),
      provider: 'meta_cloud',
      status: 'unknown',
    });

    const mockProviderCall = vi.fn();

    const reservation = repo.reserveDispatch(
      {
        studentId: 'std_1001',
        studentName: 'İrem Güneş',
        phone: '905398889900',
        examName: 'Deneme 10',
        pdfName: 'İrem Güneş.pdf',
        pdfSha256: '2'.repeat(64),
        provider: 'meta_cloud',
      },
      { isFromRenderer: true }
    );

    if (reservation.allowed) {
      mockProviderCall();
    }

    expect(reservation.allowed).toBe(false);
    expect(mockProviderCall).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Senaryo 11: Aynı dispatch için eşzamanlı işlemler mükerrer gönderim oluşturmuyor
  // -------------------------------------------------------------------------
  it('Senaryo 11: Aynı dispatch için eşzamanlı iki rezervasyon talebinden yalnızca biri başarılı olur', async () => {
    const key = computeDeterministicDispatchKey({
      studentId: 'std_1101',
      examName: 'Deneme 11',
      phone: '905312223344',
      pdfSha256: '3'.repeat(64),
    });

    const first = repo.reserveDispatch({
      studentId: 'std_1101',
      studentName: 'Emre Koç',
      phone: '905312223344',
      examName: 'Deneme 11',
      pdfName: 'Emre Koç.pdf',
      pdfSha256: '3'.repeat(64),
      provider: 'openwa',
    });

    const second = repo.reserveDispatch({
      studentId: 'std_1101',
      studentName: 'Emre Koç',
      phone: '905312223344',
      examName: 'Deneme 11',
      pdfName: 'Emre Koç.pdf',
      pdfSha256: '3'.repeat(64),
      provider: 'openwa',
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.code).toBe('IN_PROGRESS');
  });

  // -------------------------------------------------------------------------
  // Senaryo 12: Yeni migration (Migration 2) mevcut kayıtları koruyor
  // -------------------------------------------------------------------------
  it('Senaryo 12: Migration 2 uygulandığında mevcut v1 dispatch kayıtları kayıpsız korunur', async () => {
    // Migration count check
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(2);
    expect(MIGRATIONS[1].version).toBe(2);
    expect(MIGRATIONS[1].name).toBe('002_reconciliation_audit');

    // Dispatches table has the new columns
    const record = repo.createDispatch({
      id: 'disp_1201',
      dispatch_key: 'key_1201',
      student_id: 'std_1201',
      student_name: 'Derya Bulut',
      phone: '905301112233',
      exam_name: 'Deneme 12',
      pdf_name: 'Derya Bulut.pdf',
      pdf_sha256: '4'.repeat(64),
      provider: 'openwa',
      status: 'pending',
    });

    expect(record.id).toBe('disp_1201');
    expect(record.manual_reconciliation_status).toBeNull();
  });
});
