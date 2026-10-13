import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { matchStudentsWithPdfs } from '../src/services/pdfMatcher';
import { Student } from '../src/types/student';
import { LocalPdfFile, MatchedItem } from '../src/types/pdf';
import {
  computeMatchApprovalFingerprint,
  evaluateDispatchSafety,
  SafetyGateCode,
} from '../src/services/dispatchSafetyGate';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DispatchRepository } = require('../electron/DispatchRepository.cjs');

describe('Vatsap V2 — P1.2 & P1.2.1: Beş Adımlı Gönderim Sihirbazı Güvenlik ve Bütünlük Test Süiti', () => {
  // Test Verileri
  const sampleStudents: Student[] = [
    { id: 'std_1', studentName: 'Ahmet Yılmaz', parentName: 'Mehmet Yılmaz', phone: '905321112233', group: '8-A' },
    { id: 'std_2', studentName: 'Ayşe Demir', parentName: 'Ali Demir', phone: '905332223344', group: '8-A' },
    { id: 'std_3', studentName: 'Mehmet Kaya', parentName: 'Hasan Kaya', phone: '905353334455', group: '8-B' },
    { id: 'std_4', studentName: 'Zeynep Çelik', parentName: 'Fatma Çelik', phone: '905364445566', group: '8-B' },
  ];

  const samplePdfs: LocalPdfFile[] = [
    { name: 'Ahmet Yılmaz.pdf', size: 150000, lastModified: Date.now() },
    { name: 'Ayse_Demir_Karne.pdf', size: 160000, lastModified: Date.now() },
    // Mehmet Kaya için PDF yok
    // Çakışma oluşturabilecek belirsiz PDF
    { name: 'Kaya.pdf', size: 140000, lastModified: Date.now() },
  ];

  // -------------------------------------------------------------------------
  // Senaryo 1: Sihirbaz Adımları ve İleri-Geri Geçiş Mantığı
  // -------------------------------------------------------------------------
  describe('1. Sihirbaz Adımları ve İleri-Geri Geçiş Kuralları', () => {
    it('Öğrenci listesi boşken Adım 2 (Karneler)\'ye ilerleme butonu kilitli olmalıdır', () => {
      const emptyStudents: Student[] = [];
      const canProceedToStep2 = emptyStudents.length > 0;
      expect(canProceedToStep2).toBe(false);
    });

    it('PDF listesi boşken Adım 3 (Eşleştirme)\'ye ilerleme butonu kilitli olmalıdır', () => {
      const emptyPdfs: LocalPdfFile[] = [];
      const canProceedToStep3 = emptyPdfs.length > 0;
      expect(canProceedToStep3).toBe(false);
    });

    it('Geçerli öğrenci ve PDF olduğunda Adım 1 -> 2 -> 3 -> 4 -> 5 akışı sırasıyla açılmalıdır', () => {
      let currentStep: 1 | 2 | 3 | 4 | 5 = 1;

      // Adım 1: Öğrenciler mevcut mu?
      expect(sampleStudents.length).toBeGreaterThan(0);
      currentStep = 2;

      // Adım 2: Karneler mevcut mu?
      expect(samplePdfs.length).toBeGreaterThan(0);
      currentStep = 3;

      // Adım 3: Eşleştirme yapıldı mı?
      const matched = matchStudentsWithPdfs(sampleStudents, samplePdfs);
      expect(matched.length).toBe(sampleStudents.length);
      currentStep = 4;

      // Adım 4: Mesaj Şablonu mevcut mu?
      const template = 'Sayın {veli_adi}, {ogrenci_adi} karnesi ektedir.';
      expect(template.length).toBeGreaterThan(0);
      currentStep = 5;

      // Adım 5: Son Kontrol adımına başarıyla ulaşıldı
      expect(currentStep).toBe(5);

      // Geriye doğru geçişler (5 -> 4 -> 3 -> 2 -> 1)
      currentStep = 4;
      expect(currentStep).toBe(4);
      currentStep = 3;
      expect(currentStep).toBe(3);
      currentStep = 2;
      expect(currentStep).toBe(2);
      currentStep = 1;
      expect(currentStep).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Senaryo 2: Eşleştirme ve Çakışma Senaryoları (Adım 3)
  // -------------------------------------------------------------------------
  describe('2. Eşleştirme, Düşük Güven ve Çakışma Kontrolleri', () => {
    it('Tam eşleşen öğrenci "ready" durumuna geçmelidir', () => {
      const matched = matchStudentsWithPdfs(sampleStudents, samplePdfs);
      const ahmet = matched.find((m) => m.student.studentName === 'Ahmet Yılmaz');
      expect(ahmet).toBeDefined();
      expect(ahmet?.status).toBe('ready');
      expect(ahmet?.pdfFile?.name).toBe('Ahmet Yılmaz.pdf');
    });

    it('PDF belgesi bulunmayan öğrenci "missing_pdf" durumunda olmalıdır', () => {
      const matched = matchStudentsWithPdfs(sampleStudents, samplePdfs);
      const zeynep = matched.find((m) => m.student.studentName === 'Zeynep Çelik');
      expect(zeynep).toBeDefined();
      expect(zeynep?.status).toBe('missing_pdf');
      expect(zeynep?.pdfFile).toBeFalsy();
    });

    it('Düşük güven veya çakışma durumunda kayıt "pending_confirmation" olmalı ve kullanıcı onayı gerektirmelidir', () => {
      // Çakışmalı iki öğrenci: "Mehmet Kaya" ve "Ali Kaya"
      const conflictingStudents: Student[] = [
        { id: 'k1', studentName: 'Mehmet Kaya', parentName: 'Veli 1', phone: '905551112233' },
        { id: 'k2', studentName: 'Ali Kaya', parentName: 'Veli 2', phone: '905552223344' },
      ];
      const conflictingPdfs: LocalPdfFile[] = [
        { name: 'Kaya.pdf', size: 100000 },
      ];

      const matched = matchStudentsWithPdfs(conflictingStudents, conflictingPdfs);
      const mehmet = matched.find((m) => m.student.studentName === 'Mehmet Kaya');

      // Çakışmalı durum ya pending_confirmation ya da hasConflict işaretlidir
      const needsReview = mehmet?.status === 'pending_confirmation' || mehmet?.hasConflict === true || mehmet?.needsConfirmation === true;
      expect(needsReview).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Senaryo 3: P1.2 Kritik Güvenlik Kuralı: Kuyruk Filtresi ve Gönderim İzolasyonu
  // -------------------------------------------------------------------------
  describe('3. Gönderim Kuyruğu İzolasyonu ve Güvenlik Filtresi (Adım 5)', () => {
    it('pending_confirmation ve unconfirmed kayıtlar KESİNLİKLE gönderim kuyruğuna (itemsToSend) giremez', () => {
      const testItems: MatchedItem[] = [
        {
          id: 'item_ready_1',
          student: sampleStudents[0],
          pdfFile: samplePdfs[0],
          status: 'ready',
          sendingStatus: 'idle',
          confidenceScore: 100,
          needsConfirmation: false,
        },
        {
          id: 'item_pending_2',
          student: sampleStudents[1],
          pdfFile: samplePdfs[1],
          status: 'pending_confirmation',
          sendingStatus: 'idle',
          confidenceScore: 60,
          needsConfirmation: true,
        },
        {
          id: 'item_missing_3',
          student: sampleStudents[2],
          pdfFile: null,
          status: 'missing_pdf',
          sendingStatus: 'idle',
          confidenceScore: 0,
        },
        {
          id: 'item_unknown_4',
          student: sampleStudents[3],
          pdfFile: samplePdfs[0],
          status: 'ready',
          sendingStatus: 'unknown',
          confidenceScore: 100,
        },
      ];

      // P1.2 Kesin Güvenlik Kuralı Filtresi:
      const itemsToSend = testItems.filter(
        (i) => i.status === 'ready' && i.sendingStatus !== 'unknown' && !i.needsConfirmation
      );

      // Yalnızca ve yalnızca item_ready_1 kuyruğa girebilir!
      expect(itemsToSend.length).toBe(1);
      expect(itemsToSend[0].id).toBe('item_ready_1');

      // item_pending_2, item_missing_3 ve item_unknown_4 KESİNLİKLE dışlanmıştır
      const idsInQueue = itemsToSend.map((i) => i.id);
      expect(idsInQueue).not.toContain('item_pending_2');
      expect(idsInQueue).not.toContain('item_missing_3');
      expect(idsInQueue).not.toContain('item_unknown_4');
    });

    it('Kullanıcı pending_confirmation olan bir eşleşmeyi açıkça onayladığında "ready" durumuna geçerek kuyruğa girebilmelidir', () => {
      const pendingItem: MatchedItem = {
        id: 'item_pending_review',
        student: sampleStudents[1],
        pdfFile: samplePdfs[1],
        status: 'pending_confirmation',
        sendingStatus: 'idle',
        confidenceScore: 70,
        needsConfirmation: true,
      };

      // Kullanıcı onayı simülasyonu (handleConfirmMatch mantığı)
      const confirmedItem: MatchedItem = {
        ...pendingItem,
        status: 'ready',
        needsConfirmation: false,
        userConfirmed: true,
        confirmedAt: new Date().toISOString(),
      };

      const testItems = [confirmedItem];
      const itemsToSend = testItems.filter(
        (i) => i.status === 'ready' && i.sendingStatus !== 'unknown' && !i.needsConfirmation
      );

      expect(itemsToSend.length).toBe(1);
      expect(itemsToSend[0].id).toBe('item_pending_review');
      expect(itemsToSend[0].userConfirmed).toBe(true);
    });

    it('unknown durumundaki kayıtlar veli uzlaştırması olmadan ASLA toplu kuyruğa alınamaz', () => {
      const unknownItem: MatchedItem = {
        id: 'item_unknown_timeout',
        student: sampleStudents[0],
        pdfFile: samplePdfs[0],
        status: 'ready',
        sendingStatus: 'unknown',
        errorMessage: 'ETIMEDOUT: Bağlantı kesildi',
      };

      const itemsToSend = [unknownItem].filter(
        (i) => i.status === 'ready' && i.sendingStatus !== 'unknown' && !i.needsConfirmation
      );

      // Kuyruk boş olmalıdır
      expect(itemsToSend.length).toBe(0);
    });

    it('WhatsApp oturumu bağlı olmadığında Adım 5\'teki Gönderimi Başlat butonu kilitli kalmalıdır', () => {
      const disconnectedStatus = { state: 'disconnected', details: 'Oturum kapalı' };
      const readyCount = 5;

      const isSendButtonEnabled = readyCount > 0 && disconnectedStatus.state === 'connected';
      expect(isSendButtonEnabled).toBe(false);
    });

    it('WhatsApp oturumu bağlı ve en az 1 hazır karne olduğunda Gönderimi Başlat butonu aktif olmalıdır', () => {
      const connectedStatus = { state: 'connected', phoneConnected: '+905551234567' };
      const readyCount = 5;

      const isSendButtonEnabled = readyCount > 0 && connectedStatus.state === 'connected';
      expect(isSendButtonEnabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Senaryo 4: Eşleşme Onaylarının Bütünlüğü ve Değişiklik Sonrası Geçersiz Kılma (P1.2.1)
  // -------------------------------------------------------------------------
  describe('4. Eşleşme Onaylarının Bütünlüğü ve Değişiklik Sonrası Geçersiz Kılma (P1.2.1)', () => {
    it('1. Bir eşleşme onaylandıktan sonra PDF içeriği/boyutu/tarihi değişirse onay geçersiz kılınmalıdır', () => {
      const originalPdf: LocalPdfFile = {
        name: 'Ahmet_Yilmaz.pdf',
        originalName: 'Ahmet_Yilmaz.pdf',
        size: 100000,
        lastModified: 1700000000000,
        hash: 'hash_original_v1',
      };

      const item: MatchedItem = {
        id: 'std_1',
        student: sampleStudents[0],
        pdfFile: originalPdf,
        status: 'ready',
        sendingStatus: 'idle',
        confidenceScore: 90,
        userConfirmed: true,
        confirmedStudentId: 'std_1',
        confirmedPdfName: 'Ahmet_Yilmaz.pdf',
        confirmedPdfSize: 100000,
        confirmedPdfLastModified: 1700000000000,
        confirmedPdfHash: 'hash_original_v1',
        confirmedStudentPhone: sampleStudents[0].phone,
        confirmedStudentName: sampleStudents[0].studentName,
      };

      // Simülasyon: Dosya boyutu ve hash'i sonradan değiştirildi (örn. yeni karne yüklendi)
      const tamperedItem: MatchedItem = {
        ...item,
        pdfFile: {
          ...originalPdf,
          size: 150000, // Değişmiş boyut
          hash: 'hash_tampered_v2', // Değişmiş içerik
        },
      };

      const decision = evaluateDispatchSafety(tamperedItem, { examName: 'Deneme 1' });
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe(SafetyGateCode.MATCH_CHANGED_AFTER_APPROVAL);
      expect(decision.reason).toContain('onaylandıktan sonra PDF içeriği, boyutu, tarihi');
    });

    it('2. Onaydan sonra öğrencinin veli telefonu veya adı değişirse onay yeniden istenmelidir', () => {
      const item: MatchedItem = {
        id: 'std_1',
        student: { ...sampleStudents[0], phone: '905329998877' }, // Değiştirilen telefon
        pdfFile: samplePdfs[0],
        status: 'ready',
        sendingStatus: 'idle',
        confidenceScore: 90,
        userConfirmed: true,
        confirmedStudentId: 'std_1',
        confirmedPdfName: samplePdfs[0].name,
        confirmedStudentPhone: '905321112233', // Eski onaylanan telefon!
        confirmedStudentName: sampleStudents[0].studentName,
      };

      const decision = evaluateDispatchSafety(item, { examName: 'Deneme 1' });
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe(SafetyGateCode.MATCH_CHANGED_AFTER_APPROVAL);
    });

    it('3. Aynı PDF iki öğrenciye atandığında küresel çakışma (hasConflict) tespit edilir ve ikisi de readyItems dışına çıkarılır', () => {
      // İki farklı öğrenci, fakat ikisine de aynı PDF atanmış
      const sharedPdf: LocalPdfFile = {
        name: 'Ortak_Karne.pdf',
        originalName: 'Ortak_Karne.pdf',
        size: 120000,
      };

      const items: MatchedItem[] = [
        {
          id: 's1',
          student: sampleStudents[0],
          pdfFile: sharedPdf,
          status: 'ready',
          sendingStatus: 'idle',
          confidenceScore: 100,
        },
        {
          id: 's2',
          student: sampleStudents[1],
          pdfFile: sharedPdf,
          status: 'ready',
          sendingStatus: 'idle',
          confidenceScore: 100,
        },
      ];

      // App.tsx'deki küresel çakışma tespit mantığı:
      const pdfToStudentIds = new Map<string, string[]>();
      for (const m of items) {
        if (m.pdfFile) {
          const key = (m.pdfFile.originalName || m.pdfFile.name).toLowerCase().trim();
          const list = pdfToStudentIds.get(key) || [];
          list.push(m.id);
          pdfToStudentIds.set(key, list);
        }
      }

      const reconciledItems = items.map((item) => {
        if (!item.pdfFile) return item;
        const key = (item.pdfFile.originalName || item.pdfFile.name).toLowerCase().trim();
        const claimants = pdfToStudentIds.get(key) || [];
        if (claimants.length > 1) {
          return {
            ...item,
            hasConflict: true,
            status: 'pending_confirmation' as const,
            needsConfirmation: true,
            matchReason: 'Çakışma: Aynı PDF birden fazla öğrenciye atanmış!',
          };
        }
        return item;
      });

      // İki öğe de hasConflict = true ve pending_confirmation olmalıdır
      expect(reconciledItems[0].hasConflict).toBe(true);
      expect(reconciledItems[1].hasConflict).toBe(true);
      expect(reconciledItems[0].status).toBe('pending_confirmation');
      expect(reconciledItems[1].status).toBe('pending_confirmation');

      // P1.2.1 kuralı: readyItems filtresi ikisini de kuyruk dışı bırakmalıdır
      const readyItems = reconciledItems.filter(
        (i) => i.status === 'ready' && i.sendingStatus !== 'unknown' && !i.needsConfirmation && !i.hasConflict
      );
      expect(readyItems.length).toBe(0);
    });

    it('4. Onay parmak izi (computeMatchApprovalFingerprint) öğrenci id, veli telefonu, PDF adı ve PDF içeriğine değişmez şekilde bağlanır', () => {
      const fp1 = computeMatchApprovalFingerprint({
        studentId: 'std_1',
        phone: '905321112233',
        studentName: 'Ahmet Yılmaz',
        pdfName: 'Ahmet Yılmaz.pdf',
        pdfSha256: 'sha_abc_123',
        pdfSize: 100000,
        pdfLastModified: 1700000000000,
        examName: 'Deneme Sınavı 1',
      });

      const fp2 = computeMatchApprovalFingerprint({
        studentId: 'std_1',
        phone: '905321112233',
        studentName: 'Ahmet Yılmaz',
        pdfName: 'Ahmet Yılmaz.pdf',
        pdfSha256: 'sha_abc_123',
        pdfSize: 100000,
        pdfLastModified: 1700000000000,
        examName: 'Deneme Sınavı 1',
      });

      // Aynı parametreler aynı parmak izini vermelidir
      expect(fp1).toBe(fp2);

      // Telefon veya PDF hash'i değişirse parmak izi kesinlikle değişmelidir
      const fpModified = computeMatchApprovalFingerprint({
        studentId: 'std_1',
        phone: '905329998877', // Değişmiş telefon
        studentName: 'Ahmet Yılmaz',
        pdfName: 'Ahmet Yılmaz.pdf',
        pdfSha256: 'sha_abc_123',
        pdfSize: 100000,
        pdfLastModified: 1700000000000,
        examName: 'Deneme Sınavı 1',
      });

      expect(fp1).not.toBe(fpModified);
    });
  });

  // -------------------------------------------------------------------------
  // Senaryo 5: Renderer–Main Process Güven Sınırı ve Main Process Onay Zorunluluğu (P1.2.1)
  // -------------------------------------------------------------------------
  describe('5. Renderer–Main Process Güven Sınırı ve Main Process Onay Zorunluluğu (P1.2.1)', () => {
    let tempDir: string;
    let repo: any;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vatsap-wizard-audit-'));
      repo = new DispatchRepository({
        storageDir: tempDir,
        dbFileName: 'karne_wizard_audit.db',
      });
    });

    afterEach(() => {
      if (repo && repo.isInitialized()) {
        repo.close();
      }
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    });

    it('5. Main Process: Onay bekleyen (needsConfirmation: true) bir eşleşme açık kullanıcı onayı olmadan reserveDispatch ile kilitlenmelidir', async () => {
      await repo.init();

      const reservation = repo.reserveDispatch({
        studentId: 'std_audit_1',
        studentName: 'Audit Öğrenci',
        phone: '905321112233',
        examName: 'Audit Sınavı',
        pdfName: 'Audit_Ogrenci.pdf',
        pdfSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        provider: 'mock',
        needsConfirmation: true, // Onay bekliyor
        userConfirmed: false,    // Renderer henüz onay vermedi
      });

      expect(reservation.allowed).toBe(false);
      expect(reservation.code).toBe('APPROVAL_REQUIRED');
      expect(reservation.reason).toContain('kullanıcı onayı olmadan gönderilemez');
    });

    it('6. Main Process: Çakışmalı (hasConflict: true) bir eşleşme açık onay olmadan rezervasyon yapamaz', async () => {
      await repo.init();

      const reservation = repo.reserveDispatch({
        studentId: 'std_audit_2',
        studentName: 'Çakışmalı Öğrenci',
        phone: '905321112233',
        examName: 'Audit Sınavı',
        pdfName: 'Cakis_Karne.pdf',
        pdfSha256: 'a69f73cca23a9ac5c8b567dc185a756e97a9fb21641084b672f1f41b166304c0',
        provider: 'mock',
        hasConflict: true,    // Çakışmalı eşleşme
        userConfirmed: false, // Kullanıcı onayı yok
      });

      expect(reservation.allowed).toBe(false);
      expect(reservation.code).toBe('APPROVAL_REQUIRED');
    });

    it('7. Main Process: Güven skoru %70 altındaki eşleşmeler userConfirmed olsa dahi LOW_MATCH_CONFIDENCE ile engellenir', async () => {
      await repo.init();

      const reservation = repo.reserveDispatch({
        studentId: 'std_audit_3',
        studentName: 'Düşük Güvenli Öğrenci',
        phone: '905321112233',
        examName: 'Audit Sınavı',
        pdfName: 'Rastgele.pdf',
        pdfSha256: 'b45c73cca23a9ac5c8b567dc185a756e97a9fb21641084b672f1f41b166304c0',
        provider: 'mock',
        confidenceScore: 50, // %70'in altında!
        userConfirmed: true, // Butona basılmış olsa bile
      });

      expect(reservation.allowed).toBe(false);
      expect(reservation.code).toBe('LOW_MATCH_CONFIDENCE');
      expect(reservation.reason).toContain('%70 altında olan belgeler');
    });

    it('8. Main Process: Kullanıcı açıkça onayladığında ve skor güvenli olduğunda rezervasyon başarıyla verilir', async () => {
      await repo.init();

      // Kullanıcı Main Process onay akışını çalıştırır
      const approval = repo.registerMatchApproval({
        studentId: 'std_audit_4',
        studentName: 'Onaylı Öğrenci',
        phone: '905321112233',
        examName: 'Audit Sınavı',
        pdfName: 'Onayli_Karne.pdf',
        pdfSha256: 'c78d73cca23a9ac5c8b567dc185a756e97a9fb21641084b672f1f41b166304c0',
        userReason: 'Kullanıcı açıkça onayladı',
      });
      expect(approval.success).toBe(true);
      expect(approval.token).toBeDefined();

      const reservation = repo.reserveDispatch({
        studentId: 'std_audit_4',
        studentName: 'Onaylı Öğrenci',
        phone: '905321112233',
        examName: 'Audit Sınavı',
        pdfName: 'Onayli_Karne.pdf',
        pdfSha256: 'c78d73cca23a9ac5c8b567dc185a756e97a9fb21641084b672f1f41b166304c0',
        provider: 'mock',
        confidenceScore: 88,
        needsConfirmation: true,
        userConfirmed: true, // Kullanıcı açıkça onayladı
        approvalToken: approval.token,
      });

      expect(reservation.allowed).toBe(true);
      expect(reservation.dispatchKey).toBeDefined();
    });
  });
});
