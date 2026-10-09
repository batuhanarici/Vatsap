import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  evaluateDispatchSafety,
  evaluateBatchDispatchSafety,
  SafetyGateCode,
} from '../src/services/dispatchSafetyGate';
import { executeSenderQueue } from '../src/services/senderQueue';
import { MatchedItem } from '../src/types/pdf';
import { Student } from '../src/types/student';
import { WhatsAppProvider } from '../src/services/whatsapp/types';
import { SendResult } from '../src/types/whatsapp';

function createMockStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'student_101',
    studentName: 'Ahmet Yılmaz',
    parentName: 'Mehmet Yılmaz',
    phone: '905321112233',
    group: '8-A',
    ...overrides,
  };
}

function createMockItem(overrides: Partial<MatchedItem> = {}): MatchedItem {
  const student = overrides.student || createMockStudent();
  return {
    id: student.id,
    student,
    pdfFile: {
      name: `${student.studentName}.pdf`,
      originalName: `${student.studentName}.pdf`,
      size: 1024,
      base64: 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDY4L0ZpbHRlci9GbGF0ZURlY29kZT4+c3RyZWFtCg==',
    },
    status: 'ready',
    sendingStatus: 'idle',
    confidenceScore: 95,
    hasConflict: false,
    userConfirmed: false,
    ...overrides,
  };
}

function createMockProvider(): WhatsAppProvider & {
  sendDocumentCalls: any[];
  sendMessageCalls: any[];
} {
  const sendDocumentCalls: any[] = [];
  const sendMessageCalls: any[] = [];

  return {
    sendDocumentCalls,
    sendMessageCalls,
    async sendDocument(phone: string, base64: string, filename: string, caption?: string): Promise<SendResult> {
      sendDocumentCalls.push({ phone, base64, filename, caption });
      return { success: true, pdfSent: true, messageSent: true, outcome: 'success' };
    },
    async sendMessage(phone: string, message: string): Promise<SendResult> {
      sendMessageCalls.push({ phone, message });
      return { success: true, pdfSent: false, messageSent: true, outcome: 'success' };
    },
    async getStatus() {
      return { state: 'connected' as const, sessionId: 'default' };
    },
    async getQrCode() {
      return null;
    },
  };
}

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe('Vatsap V2 — P0-3A: Dispatch Safety Gates Test Suite', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  // -------------------------------------------------------------
  // Senaryo 1: Tek aday ve skor >= 95 -> İzin
  // -------------------------------------------------------------
  it('Senaryo 1: Tek aday ve skor >= 95 diğer kontroller de geçiyorsa izin verir', () => {
    const item = createMockItem({
      confidenceScore: 95,
      hasConflict: false,
      userConfirmed: false,
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(SafetyGateCode.ALLOWED);
  });

  it('Senaryo 1b: Skor 100 ve çakışmasız eşleşme doğrudan onay gerektirmeden izin verilir', () => {
    const item = createMockItem({
      confidenceScore: 100,
      hasConflict: false,
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(SafetyGateCode.ALLOWED);
  });

  // -------------------------------------------------------------
  // Senaryo 2: Skor 85–94 -> Onaysız engelleme
  // -------------------------------------------------------------
  it('Senaryo 2: Skor 85–94 aralığında kullanıcı onayı olmadan gönderimi engeller', () => {
    const item = createMockItem({
      confidenceScore: 90,
      userConfirmed: false,
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.APPROVAL_REQUIRED);
    expect(decision.reason).toContain('açık kullanıcı onayı gereklidir');
  });

  // -------------------------------------------------------------
  // Senaryo 3: Skor 85–94 -> Geçerli kullanıcı onayıyla izin
  // -------------------------------------------------------------
  it('Senaryo 3: Skor 85–94 aralığında geçerli kullanıcı onayı varsa izin verir', () => {
    const item = createMockItem({
      confidenceScore: 88,
      userConfirmed: true,
      confirmedPdfName: 'Ahmet Yılmaz.pdf',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ahmet Yılmaz',
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(SafetyGateCode.ALLOWED);
  });

  // -------------------------------------------------------------
  // Senaryo 4: Skor 70–84 -> Onaysız veya manuel eşleştirmesiz engelleme
  // -------------------------------------------------------------
  it('Senaryo 4a: Skor 70–84 aralığında onaysız gönderimi engeller', () => {
    const item = createMockItem({
      confidenceScore: 75,
      userConfirmed: false,
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.APPROVAL_REQUIRED);
  });

  it('Senaryo 4b: Skor 70–84 aralığında manuel eşleştirme ve açık onay varsa izin verir', () => {
    const item = createMockItem({
      confidenceScore: 80,
      matchMethod: 'manual',
      isManuallyAssigned: true,
      userConfirmed: true,
      confirmedPdfName: 'Ahmet Yılmaz.pdf',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ahmet Yılmaz',
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(SafetyGateCode.ALLOWED);
  });

  // -------------------------------------------------------------
  // Senaryo 5: Skor < 70 -> Engelleme
  // -------------------------------------------------------------
  it('Senaryo 5: Skor < 70 olduğunda kritik eşik altında olduğu için engeller', () => {
    const item = createMockItem({
      confidenceScore: 65,
      userConfirmed: false,
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.LOW_MATCH_CONFIDENCE);
    expect(decision.reason).toContain('70');
  });

  // -------------------------------------------------------------
  // Senaryo 6: Birden fazla aday (hasConflict: true) -> Yüksek skorda bile engelleme
  // -------------------------------------------------------------
  it('Senaryo 6: Birden fazla aday çakışması varsa skor %100 olsa bile otomatik gönderimi engeller', () => {
    const item = createMockItem({
      confidenceScore: 100,
      hasConflict: true,
      userConfirmed: false,
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.AMBIGUOUS_MATCH);
    expect(decision.reason).toContain('birden fazla aday');
  });

  it('Senaryo 6b: Çakışmalı aday kullanıcı tarafından açıkça incelenip onaylanmışsa izin verir', () => {
    const item = createMockItem({
      confidenceScore: 95,
      hasConflict: true,
      userConfirmed: true,
      confirmedPdfName: 'Ahmet Yılmaz.pdf',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ahmet Yılmaz',
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(SafetyGateCode.ALLOWED);
  });

  // -------------------------------------------------------------
  // Senaryo 7: Skor null, NaN, negatif veya geçersiz ölçekte -> Engelleme
  // -------------------------------------------------------------
  it('Senaryo 7: Skor null, NaN, negatif veya > 100 olduğunda engeller', () => {
    const nullScoreItem = createMockItem({ confidenceScore: null as any });
    expect(evaluateDispatchSafety(nullScoreItem).code).toBe(SafetyGateCode.INVALID_SCORE);

    const nanScoreItem = createMockItem({ confidenceScore: NaN });
    expect(evaluateDispatchSafety(nanScoreItem).code).toBe(SafetyGateCode.INVALID_SCORE);

    const negativeScoreItem = createMockItem({ confidenceScore: -10 });
    expect(evaluateDispatchSafety(negativeScoreItem).code).toBe(SafetyGateCode.INVALID_SCORE);

    const overScaleScoreItem = createMockItem({ confidenceScore: 150 });
    expect(evaluateDispatchSafety(overScaleScoreItem).code).toBe(SafetyGateCode.INVALID_SCORE);

    const undefinedScoreItem = createMockItem({ confidenceScore: undefined });
    expect(evaluateDispatchSafety(undefinedScoreItem).code).toBe(SafetyGateCode.INVALID_SCORE);
  });

  // -------------------------------------------------------------
  // Senaryo 8: Eksik öğrenci -> Engelleme
  // -------------------------------------------------------------
  it('Senaryo 8: Öğrenci bilgisi veya id eksikse engeller', () => {
    const noStudentItem = createMockItem({ student: null as any });
    expect(evaluateDispatchSafety(noStudentItem).code).toBe(SafetyGateCode.MISSING_RECIPIENT);

    const noIdStudentItem = createMockItem({ student: { ...createMockStudent(), id: '' } });
    expect(evaluateDispatchSafety(noIdStudentItem).code).toBe(SafetyGateCode.MISSING_RECIPIENT);
  });

  // -------------------------------------------------------------
  // Senaryo 9: Eksik telefon -> Engelleme
  // -------------------------------------------------------------
  it('Senaryo 9: Telefon numarası tanımsız veya boşsa engeller', () => {
    const emptyPhoneItem = createMockItem({
      student: createMockStudent({ phone: '' }),
    });
    const decision = evaluateDispatchSafety(emptyPhoneItem);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.MISSING_RECIPIENT);
  });

  // -------------------------------------------------------------
  // Senaryo 10: Geçersiz telefon -> Engelleme
  // -------------------------------------------------------------
  it('Senaryo 10: Geçersiz telefon formatında (ör. 12345, harf vb.) gönderimi engeller', () => {
    const invalidPhoneItem = createMockItem({
      student: createMockStudent({ phone: '123456' }),
    });
    const decision = evaluateDispatchSafety(invalidPhoneItem);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.INVALID_PHONE);
    expect(decision.reason).toContain('geçersiz formatta');

    const lettersPhoneItem = createMockItem({
      student: createMockStudent({ phone: '0532ABCDEF' }),
    });
    expect(evaluateDispatchSafety(lettersPhoneItem).code).toBe(SafetyGateCode.INVALID_PHONE);
  });

  // -------------------------------------------------------------
  // Senaryo 11: Onaydan sonra PDF veya öğrenci değişmiş -> Yeniden onay
  // -------------------------------------------------------------
  it('Senaryo 11: Onaydan sonra PDF dosyası değiştirilmişse eski onayı geçersiz sayar', () => {
    const item = createMockItem({
      confidenceScore: 90,
      userConfirmed: true,
      confirmedPdfName: 'Eski_Karne.pdf',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ahmet Yılmaz',
      pdfFile: {
        name: 'Yeni_Farkli_Karne.pdf',
        originalName: 'Yeni_Farkli_Karne.pdf',
        size: 2048,
      },
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.MATCH_CHANGED_AFTER_APPROVAL);
    expect(decision.reason).toContain('onaylandıktan sonra PDF');
  });

  it('Senaryo 11b: Onaydan sonra alıcı telefon numarası değişmişse eski onayı geçersiz sayar', () => {
    const item = createMockItem({
      confidenceScore: 90,
      userConfirmed: true,
      confirmedPdfName: 'Ahmet Yılmaz.pdf',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ahmet Yılmaz',
      student: createMockStudent({ phone: '905334445566' }), // Değişen telefon
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.MATCH_CHANGED_AFTER_APPROVAL);
  });

  // -------------------------------------------------------------
  // Senaryo 12: Daha önce gönderilmiş iş -> Engelleme
  // -------------------------------------------------------------
  it('Senaryo 12: Aynı oturumda veya aynı günün geçmişinde gönderilmiş işi engeller', () => {
    const item = createMockItem({ confidenceScore: 100 });

    // a) Oturum içi kontrol
    const sessionSentDecision = evaluateDispatchSafety(item, {
      sentStudentIds: new Set([item.student.id]),
    });
    expect(sessionSentDecision.allowed).toBe(false);
    expect(sessionSentDecision.code).toBe(SafetyGateCode.ALREADY_SENT_OR_IN_PROGRESS);

    // b) Günlük geçmiş kontrolü
    const historyDecision = evaluateDispatchSafety(item, {
      examName: 'Deneme 1',
      history: [
        {
          id: 'h1',
          studentId: item.student.id,
          studentName: item.student.studentName,
          parentName: 'Mehmet Yılmaz',
          phone: item.student.phone,
          maskedPhone: '90532***',
          pdfFileName: 'karne.pdf',
          date: new Date().toISOString(),
          status: 'success',
          outcome: 'success',
          examName: 'Deneme 1',
        },
      ],
      preventDuplicateSends: true,
    });
    expect(historyDecision.allowed).toBe(false);
    expect(historyDecision.code).toBe(SafetyGateCode.ALREADY_SENT_OR_IN_PROGRESS);
  });

  // -------------------------------------------------------------
  // Senaryo 13: Halen gönderiliyor olan iş (inProgress) -> Engelleme
  // -------------------------------------------------------------
  it('Senaryo 13: Halen gönderiliyor olan işi (inProgress) mükerrer gönderim olarak engeller', () => {
    const item = createMockItem({ confidenceScore: 100 });

    const decision = evaluateDispatchSafety(item, {
      inProgressStudentIds: new Set([item.student.id]),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.ALREADY_SENT_OR_IN_PROGRESS);
    expect(decision.reason).toContain('şu anda kuyrukta işlenmektedir');
  });

  // -------------------------------------------------------------
  // Senaryo 14: Tekli gönderim Safety Gate'i atlayamıyor
  // -------------------------------------------------------------
  it('Senaryo 14: Tekli gönderim (executeSenderQueue([item])) Safety Gate engellerini atlayamaz', async () => {
    const mockProvider = createMockProvider();
    const unsafeItem = createMockItem({
      confidenceScore: 60, // Güvenli olmayan skor (<70)
      userConfirmed: false,
    });

    const onItemUpdated = vi.fn();

    const summary = await executeSenderQueue({
      items: [unsafeItem],
      template: 'Sayın {veli_adi}',
      provider: mockProvider,
      delayMs: 0,
      onProgress: () => {},
      onItemUpdated,
    });

    expect(summary.failedCount).toBe(1);
    expect(summary.successCount).toBe(0);
    expect(mockProvider.sendDocumentCalls.length).toBe(0);
    expect(mockProvider.sendMessageCalls.length).toBe(0);
    expect(onItemUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        sendingStatus: 'failed',
        errorMessage: expect.stringContaining(SafetyGateCode.LOW_MATCH_CONFIDENCE),
      })
    );
  });

  // -------------------------------------------------------------
  // Senaryo 15: Toplu gönderim Safety Gate'i atlayamıyor
  // -------------------------------------------------------------
  it('Senaryo 15: Toplu gönderimde yalnızca Gate geçenler iletilir; geçemeyenler provider çağrılmadan elenir', async () => {
    const mockProvider = createMockProvider();

    const validItem = createMockItem({
      student: createMockStudent({ id: 's_valid', studentName: 'Geçerli Öğrenci' }),
      confidenceScore: 98,
      hasConflict: false,
    });

    const invalidItemPhone = createMockItem({
      student: createMockStudent({ id: 's_bad_phone', phone: '00000' }),
      confidenceScore: 98,
    });

    const unconfirmedItem = createMockItem({
      student: createMockStudent({ id: 's_unconf', studentName: 'Onaysız Öğrenci' }),
      confidenceScore: 88,
      userConfirmed: false,
    });

    const summary = await executeSenderQueue({
      items: [validItem, invalidItemPhone, unconfirmedItem],
      template: 'Sayın {veli_adi}',
      provider: mockProvider,
      delayMs: 0,
      onProgress: () => {},
      onItemUpdated: () => {},
    });

    expect(summary.successCount).toBe(1);
    expect(summary.failedCount).toBe(2);
    // Provider yalnızca validItem için tam olarak 1 kez çağrılmış olmalı
    expect(mockProvider.sendDocumentCalls.length).toBe(1);
    expect(mockProvider.sendDocumentCalls[0].phone).toBe(validItem.student.phone);
  });

  // -------------------------------------------------------------
  // Senaryo 16: Gate başarısız olduğunda provider ASLA çağrılmıyor
  // -------------------------------------------------------------
  it('Senaryo 16: Gate başarısız olduğunda hiçbir provider metodu çağrılmaz', async () => {
    const mockProvider = createMockProvider();

    const missingPdfItem = createMockItem({
      pdfFile: null,
      confidenceScore: 100,
    });

    await executeSenderQueue({
      items: [missingPdfItem],
      template: 'Merhaba',
      provider: mockProvider,
      delayMs: 0,
      onProgress: () => {},
      onItemUpdated: () => {},
    });

    expect(mockProvider.sendDocumentCalls.length).toBe(0);
    expect(mockProvider.sendMessageCalls.length).toBe(0);
  });

  // -------------------------------------------------------------
  // Batch Safety Gate Helper Test
  // -------------------------------------------------------------
  it('evaluateBatchDispatchSafety tüm listeyi önceden denetleyip geçenleri ve reddedilenleri ayırır', () => {
    const okItem = createMockItem({ confidenceScore: 100 });
    const badItem = createMockItem({
      student: createMockStudent({ id: 's2', phone: 'invalid' }),
    });

    const { passed, rejected } = evaluateBatchDispatchSafety([okItem, badItem]);
    expect(passed.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].decision.code).toBe(SafetyGateCode.INVALID_PHONE);
  });

  // =============================================================
  // P0-3A.1 Safety Gate Audit: Ek Güvenlik Doğrulama Testleri
  // =============================================================

  it('Audit 1: Aynı ada sahip PDF dosyasının boyutu veya hash içeriği değiştiğinde onay düşer', () => {
    const item = createMockItem({
      confidenceScore: 90,
      userConfirmed: true,
      confirmedStudentId: 'student_101',
      confirmedPdfName: 'Ahmet Yılmaz.pdf',
      confirmedPdfSize: 1024,
      confirmedPdfHash: 'hash_original_content_v1',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ahmet Yılmaz',
      pdfFile: {
        name: 'Ahmet Yılmaz.pdf',
        originalName: 'Ahmet Yılmaz.pdf',
        size: 5120, // Boyut değişmiş!
        hash: 'hash_tampered_content_v2',
      },
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.MATCH_CHANGED_AFTER_APPROVAL);
    expect(decision.reason).toContain('onaylandıktan sonra PDF içeriği, boyutu, tarihi');
  });

  it('Audit 2: Onaydan sonra öğrenci kimliği (student.id) değiştiğinde onay geçersiz sayılır', () => {
    const item = createMockItem({
      confidenceScore: 90,
      userConfirmed: true,
      confirmedStudentId: 'student_101', // Onay bu id için verildi
      confirmedPdfName: 'Ahmet Yılmaz.pdf',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ahmet Yılmaz',
      student: createMockStudent({ id: 'student_999' }), // Farklı id'ye taşındı
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.MATCH_CHANGED_AFTER_APPROVAL);
  });

  it('Audit 3: Skor 70–84 aralığında userConfirmed: true olsa bile isManuallyAssigned olmadan geçemez', () => {
    const item = createMockItem({
      confidenceScore: 78,
      userConfirmed: true, // Kullanıcı tıklamış
      isManuallyAssigned: false, // Fakat manuel atanmamış, otomatik kalmış
      confirmedStudentId: 'student_101',
      confirmedPdfName: 'Ahmet Yılmaz.pdf',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ahmet Yılmaz',
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.APPROVAL_REQUIRED);
    expect(decision.reason).toContain('manuel kontrol ve açık kullanıcı onayı zorunludur');
  });

  it('Audit 4: Skor < 70 olduğunda onay verilmiş olsa dahi gönderim kesinlikle engellenir', () => {
    const item = createMockItem({
      confidenceScore: 50,
      userConfirmed: true,
      isManuallyAssigned: false,
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.LOW_MATCH_CONFIDENCE);
  });

  it('Audit 5: Çakışmalı adayda Öğrenci A için onay verilmesi Öğrenci B için geçerli değildir', () => {
    const itemStudentA = createMockItem({
      student: createMockStudent({ id: 's_A', studentName: 'Ali Demir 1' }),
      confidenceScore: 95,
      hasConflict: true,
      userConfirmed: true,
      confirmedStudentId: 's_A',
      confirmedPdfName: 'Ali Demir 1.pdf',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ali Demir 1',
    });

    const itemStudentB = createMockItem({
      student: createMockStudent({ id: 's_B', studentName: 'Ali Demir 2' }),
      confidenceScore: 95,
      hasConflict: true,
      userConfirmed: false, // B henüz onaylanmadı
    });

    expect(evaluateDispatchSafety(itemStudentA).allowed).toBe(true);
    const decisionB = evaluateDispatchSafety(itemStudentB);
    expect(decisionB.allowed).toBe(false);
    expect(decisionB.code).toBe(SafetyGateCode.AMBIGUOUS_MATCH);
  });

  it('Audit 6: Geçerli Türkiye telefon formatları (+90, 0090, 05, 5, boşluklu) doğrulanır', () => {
    const formats = [
      '+90 532 111 22 33',
      '+905321112233',
      '00905321112233',
      '0532 111 22 33',
      '05321112233',
      '532 111 22 33',
      '5321112233',
      '905321112233',
    ];

    for (const phone of formats) {
      const item = createMockItem({
        student: createMockStudent({ phone }),
        confidenceScore: 100,
      });
      const decision = evaluateDispatchSafety(item);
      expect(decision.allowed, `Phone failed: ${phone}`).toBe(true);
    }
  });

  it('Audit 7: Kuyruk çalıştırıldığında provider çağrısına ham numara değil kesinlikle normalize numara iletilir', async () => {
    const mockProvider = createMockProvider();
    const itemWithMessyPhone = createMockItem({
      student: createMockStudent({ phone: '0532 111 22 33' }),
      confidenceScore: 100,
    });

    await executeSenderQueue({
      items: [itemWithMessyPhone],
      template: 'Sayın veli',
      provider: mockProvider,
      delayMs: 0,
      onProgress: () => {},
      onItemUpdated: () => {},
    });

    expect(mockProvider.sendDocumentCalls.length).toBe(1);
    expect(mockProvider.sendDocumentCalls[0].phone).toBe('905321112233');
    expect(mockProvider.sendDocumentCalls[0].phone).not.toContain(' ');
    expect(mockProvider.sendDocumentCalls[0].phone.startsWith('05')).toBe(false);
  });

  it('Audit 8: Farklı sınavlar veya farklı PDFler aynı oturumda yanlışlıkla engellenmez', () => {
    const itemExam1 = createMockItem({ confidenceScore: 100 });
    const itemExam2 = createMockItem({
      confidenceScore: 100,
      pdfFile: {
        name: 'Deneme2_Ahmet.pdf',
        originalName: 'Deneme2_Ahmet.pdf',
        size: 2048,
      },
    });

    // Oturumda Sınav 1 başarıyla gönderilmiş olsun
    const sentDispatchKeys = new Set<string>();
    sentDispatchKeys.add('student_101::Deneme 1::Ahmet Yılmaz.pdf');

    // Sınav 1 tekrar gönderilmeye çalışılırsa: engellenmeli
    const dupDecision = evaluateDispatchSafety(itemExam1, {
      examName: 'Deneme 1',
      sentDispatchKeys,
    });
    expect(dupDecision.allowed).toBe(false);
    expect(dupDecision.code).toBe(SafetyGateCode.ALREADY_SENT_OR_IN_PROGRESS);

    // Aynı oturumda Sınav 2 gönderilmeye çalışılırsa: İZİN VERİLMELİ
    const nextExamDecision = evaluateDispatchSafety(itemExam2, {
      examName: 'Deneme 2',
      sentDispatchKeys,
    });
    expect(nextExamDecision.allowed).toBe(true);
    expect(nextExamDecision.code).toBe(SafetyGateCode.ALLOWED);
  });

  // =============================================================
  // P0-3A.2 Final Security Checks Tests
  // =============================================================

  it('Audit 9: Dosya adı, boyutu ve değiştirilme tarihi aynı kalsa bile yalnızca hash/içerik değiştiğinde onay kesinlikle düşer', () => {
    const originalBase64 = 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDY4';
    const tamperedBase64 = 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDY5'; // 1 byte farklı içerik

    const item = createMockItem({
      confidenceScore: 90,
      userConfirmed: true,
      confirmedStudentId: 'student_101',
      confirmedPdfName: 'Ahmet Yılmaz.pdf',
      confirmedPdfSize: 2048,
      confirmedPdfLastModified: 1700000000000,
      confirmedPdfHash: 'hash_v1_original',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ahmet Yılmaz',
      pdfFile: {
        name: 'Ahmet Yılmaz.pdf',
        originalName: 'Ahmet Yılmaz.pdf',
        size: 2048, // Tıpatıp aynı boyut!
        lastModified: 1700000000000, // Tıpatıp aynı mtime!
        hash: 'hash_v2_tampered', // İçerik hash'i değişmiş!
        base64: tamperedBase64,
      },
    });

    const decision = evaluateDispatchSafety(item);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(SafetyGateCode.MATCH_CHANGED_AFTER_APPROVAL);
  });

  it('Audit 10: Çakışmalı adayda sahte aktarılmış onay confirmedStudentId uyuşmazlığından reddedilir ve provider çağrısı 0 kalır', async () => {
    const mockProvider = createMockProvider();

    // Öğrenci B için, Öğrenci A'nın onayı taklit edilerek gönderilmeye çalışılıyor
    const maliciousItemB = createMockItem({
      student: createMockStudent({ id: 'student_B', studentName: 'Ali Demir (2)' }),
      confidenceScore: 95,
      hasConflict: true,
      userConfirmed: true,
      confirmedStudentId: 'student_A', // Onay A için verilmişti!
      confirmedPdfName: 'Ali Demir.pdf',
      confirmedStudentPhone: '905321112233',
      confirmedStudentName: 'Ali Demir (1)',
      pdfFile: {
        name: 'Ali Demir.pdf',
        originalName: 'Ali Demir.pdf',
        size: 1024,
      },
    });

    let updatedItemB: any = null;

    const summary = await executeSenderQueue({
      items: [maliciousItemB],
      template: 'Sayın veli',
      provider: mockProvider,
      delayMs: 0,
      onProgress: () => {},
      onItemUpdated: (u) => {
        updatedItemB = u;
      },
    });

    // Provider ASLA çağrılmamalıdır
    expect(mockProvider.sendDocumentCalls.length).toBe(0);
    expect(mockProvider.sendMessageCalls.length).toBe(0);
    expect(summary.failedCount).toBe(1);
    expect(updatedItemB).not.toBeNull();
    expect(updatedItemB.sendingStatus).toBe('failed');
    expect(updatedItemB.errorMessage).toContain(SafetyGateCode.MATCH_CHANGED_AFTER_APPROVAL);
  });

  it('Audit 11: Çakışmalı adayda kullanıcı onayı yoksa provider çağrısı kesinlikle 0 kez yapılır', async () => {
    const mockProvider = createMockProvider();

    const ambiguousUnconfirmedItem = createMockItem({
      student: createMockStudent({ id: 'student_C', studentName: 'Canan Kaya' }),
      confidenceScore: 95,
      hasConflict: true,
      userConfirmed: false,
    });

    let updatedItemC: any = null;

    const summary = await executeSenderQueue({
      items: [ambiguousUnconfirmedItem],
      template: 'Sayın veli',
      provider: mockProvider,
      delayMs: 0,
      onProgress: () => {},
      onItemUpdated: (u) => {
        updatedItemC = u;
      },
    });

    expect(mockProvider.sendDocumentCalls.length).toBe(0);
    expect(mockProvider.sendMessageCalls.length).toBe(0);
    expect(summary.failedCount).toBe(1);
    expect(updatedItemC).not.toBeNull();
    expect(updatedItemC.sendingStatus).toBe('failed');
    expect(updatedItemC.errorMessage).toContain(SafetyGateCode.AMBIGUOUS_MATCH);
  });
});
