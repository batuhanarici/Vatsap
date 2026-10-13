import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTextFromPdf,
  findAllCandidatesInPdfText,
  findStudentInPdfText,
  performDeepPdfContentMatching,
  performScannedPdfOcrMatching,
  performHybridPdfScanMatching,
  validatePdfBufferOrFile,
  MAX_PDF_FILE_SIZE_BYTES,
} from '../src/services/pdfTextExtractor';
import {
  normalizeTurkishText,
  simplifyForComparison,
} from '../src/services/normalizer';
import {
  evaluateDispatchSafety,
  SafetyGateCode,
} from '../src/services/dispatchSafetyGate';
import { Student } from '../src/types/student';
import { LocalPdfFile, MatchedItem } from '../src/types/pdf';

// Helper: Create synthetic PDF binary with minimal valid structure
function createSyntheticPdf(text: string): Uint8Array {
  const content = `%PDF-1.4\n1 0 obj\n<< /Length ${text.length + 20} >>\nstream\nBT\n/F1 12 Tf\n(${text}) Tj\nET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`;
  return new TextEncoder().encode(content);
}

// Helper: Create a fake File object
function createMockPdfFile(name: string, content: Uint8Array, size?: number): File {
  const blob = new Blob([content.buffer as ArrayBuffer], { type: 'application/pdf' });
  const file = new File([blob], name, { type: 'application/pdf' });
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

describe('Vatsap V2 — P1.3: OCR Güvenilirliği ve PDF Hibrit İşleme Regresyon Testleri', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Güvenlik Değişmezi: İçerik Metni ve OCR Eşleşmeleri Asla Onaysız "ready" Olamaz', () => {
    it('Dijital metin katmanı ile eşleşen kayıt doğrudan ready olamaz, pending_confirmation ve needsConfirmation olmalıdır', async () => {
      const student: Student = {
        id: 'std_text_1',
        studentName: 'Ahmet Yılmaz',
        parentName: 'Mehmet Yılmaz',
        phone: '905321112233',
      };

      const matchedItem: MatchedItem = {
        id: student.id,
        student,
        pdfFile: null,
        status: 'missing_pdf',
        sendingStatus: 'idle',
      };

      const pdfBytes = createSyntheticPdf('T.C. Milli Egitim Bakanligi Karne Belgesi Ogrenci Ahmet Yilmaz 8-A');
      const mockFile = createMockPdfFile('karne_1.pdf', pdfBytes);

      const localPdf: LocalPdfFile = {
        name: 'karne_1.pdf',
        size: pdfBytes.byteLength,
        file: mockFile,
      };

      const res = await performDeepPdfContentMatching([matchedItem], [localPdf]);

      expect(res.matchedCount).toBe(1);
      const updated = res.updatedMatches[0];
      expect(updated.student.id).toBe('std_text_1');
      expect(updated.matchMethod).toBe('text_extraction');
      // DEĞİŞMEZ KURAL: status ASLA 'ready' olamaz!
      expect(updated.status).toBe('pending_confirmation');
      expect(updated.needsConfirmation).toBe(true);

      // Safety Gate Kontrolü: Onaysız dispatch denenirse bloklanmalıdır
      const safetyDecision = evaluateDispatchSafety(updated);
      expect(safetyDecision.allowed).toBe(false);
      expect(safetyDecision.code).toBe(SafetyGateCode.APPROVAL_REQUIRED);
    });

    it('Görsel OCR ile eşleşen kayıt doğrudan ready olamaz, pending_confirmation ve needsConfirmation olmalıdır', async () => {
      const student: Student = {
        id: 'std_ocr_1',
        studentName: 'Zeynep Kaya',
        parentName: 'Fatma Kaya',
        phone: '905322223344',
      };

      const matchedItem: MatchedItem = {
        id: student.id,
        student,
        pdfFile: null,
        status: 'missing_pdf',
        sendingStatus: 'idle',
      };

      const pdfBytes = createSyntheticPdf(''); // Empty text layer (scanned image)
      const mockFile = createMockPdfFile('scanned_ocr.pdf', pdfBytes);

      const localPdf: LocalPdfFile = {
        name: 'scanned_ocr.pdf',
        size: pdfBytes.byteLength,
        file: mockFile,
      };

      // Mock fetch response for /api/ocr-scan
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          isOcrAvailable: true,
          data: {
            detectedStudentName: 'Zeynep Kaya',
            matchedStudentName: 'Zeynep Kaya',
            extractedText: 'Takdir Belgesi Zeynep Kaya Okul No: 542',
            confidence: 95,
            isScanned: true,
          },
        }),
      } as unknown as Response);

      const res = await performScannedPdfOcrMatching([matchedItem], [localPdf]);

      expect(res.matchedCount).toBe(1);
      const updated = res.updatedMatches[0];
      expect(updated.matchMethod).toBe('content_ocr');
      // DEĞİŞMEZ KURAL: status ASLA 'ready' olamaz!
      expect(updated.status).toBe('pending_confirmation');
      expect(updated.needsConfirmation).toBe(true);

      // Safety Gate Kontrolü: Onaysız dispatch denenirse bloklanmalıdır
      const safetyDecision = evaluateDispatchSafety(updated);
      expect(safetyDecision.allowed).toBe(false);
      expect(safetyDecision.code).toBe(SafetyGateCode.APPROVAL_REQUIRED);
    });
  });

  describe('2. Çoklu Aday ve Çakışma Yönetimi', () => {
    it('Aynı PDF metninde birden fazla makul aday öğrenci adı geçtiğinde çakışma (hasConflict) işaretlenmeli ve otomatik eşleşme engellenmelidir', () => {
      const candidates: Student[] = [
        { id: 'std_1', studentName: 'Ahmet Yılmaz', parentName: 'Veli 1', phone: '905321111111' },
        { id: 'std_2', studentName: 'Mehmet Ali Kaya', parentName: 'Veli 2', phone: '905322222222' },
        { id: 'std_3', studentName: 'Zeynep Demir', parentName: 'Veli 3', phone: '905323333333' },
      ];

      const pdfText = 'Bu karne hem Ahmet Yilmaz hem de Mehmet Ali Kaya adina duzenlenmis ortak liste icerir.';
      const matches = findAllCandidatesInPdfText(pdfText, candidates);

      expect(matches.length).toBe(2);
      expect(matches.map((m) => m.student.studentName)).toContain('Ahmet Yılmaz');
      expect(matches.map((m) => m.student.studentName)).toContain('Mehmet Ali Kaya');

      // findStudentInPdfText çakışma olduğunda tek öğrenci seçmemeli (null dönmeli)
      const singleCandidate = findStudentInPdfText(pdfText, candidates);
      expect(singleCandidate).toBeNull();
    });

    it('performDeepPdfContentMatching çakışmalı dosyada iki adaya da otomatik atama yapmamalı, conflict işaretlemelidir', async () => {
      const candidates: Student[] = [
        { id: 'std_c1', studentName: 'Ali Can', parentName: 'Veli 1', phone: '905321111111' },
        { id: 'std_c2', studentName: 'Burak Can', parentName: 'Veli 2', phone: '905322222222' },
      ];

      const matchedItems: MatchedItem[] = candidates.map((s) => ({
        id: s.id,
        student: s,
        pdfFile: null,
        status: 'missing_pdf',
        sendingStatus: 'idle',
      }));

      const pdfBytes = createSyntheticPdf('Ali Can ve Burak Can sinav sonuclari belgesi.');
      const localPdf: LocalPdfFile = {
        name: 'sinav_sonuc.pdf',
        size: pdfBytes.byteLength,
        file: createMockPdfFile('sinav_sonuc.pdf', pdfBytes),
      };

      const res = await performDeepPdfContentMatching(matchedItems, [localPdf]);

      // Çakışmalı adaylar kesinlikle matchedCount olarak sayılmamalı
      expect(res.matchedCount).toBe(0);
      expect(res.failedOcrItems.some((f) => f.errorCode === 'conflict_ambiguous')).toBe(true);

      // İki adayın da hasConflict alanı true olmalı
      res.updatedMatches.forEach((item) => {
        if (item.pdfFile) {
          expect(item.hasConflict).toBe(true);
          expect(item.status).toBe('pending_confirmation');
        }
      });
    });
  });

  describe('3. Benzer Öğrenci Adlarının Doğruluğu', () => {
    it('Soyadı farklı olan benzer öğrenci adları birbirine yanlış otomatik eşleşmemelidir', () => {
      const candidates: Student[] = [
        { id: 'std_a1', studentName: 'Ahmet Yılmaz', parentName: 'Veli', phone: '905321111111' },
        { id: 'std_a2', studentName: 'Ahmet Demir', parentName: 'Veli', phone: '905322222222' },
      ];

      const pdfText = 'Ogrenci: Ahmet Demir, No: 120, Sinif 8-B.';
      const matches = findAllCandidatesInPdfText(pdfText, candidates);

      expect(matches.length).toBe(1);
      expect(matches[0].student.studentName).toBe('Ahmet Demir');
      expect(matches.some((m) => m.student.studentName === 'Ahmet Yılmaz')).toBe(false);
    });

    it('Tek kelimelik kısmi eşleşmeler (örn. sadece "Ahmet") çok kelimeli isimleri yanlış eşleştirmemelidir', () => {
      const candidates: Student[] = [
        { id: 'std_b1', studentName: 'Ahmet Faruk Yılmaz', parentName: 'Veli', phone: '905321111111' },
      ];

      // Metinde sadece "Ahmet" geçiyor, "Faruk" ve "Yılmaz" yok
      const pdfText = 'Sayin Ogretmen Ahmet Bey veli toplantisi hakkinda duyuru.';
      const matches = findAllCandidatesInPdfText(pdfText, candidates);

      expect(matches.length).toBe(0);
    });
  });

  describe('4. Türkçe Karakter, Unicode Birleşimleri ve Varyasyonlar', () => {
    it('Büyük/küçük İ, I, ı, i ve Unicode NFD/NFC birleşimlerini hatasız normalize etmelidir', () => {
      // Decomposed combining dot above (I + \u0307)
      const decomposedI = 'I\u0307smail C\u0327ag\u0306lar';
      const precomposedI = 'İsmail Çağlar';
      const uppercaseTurkish = 'İSMAİL ÇAĞLAR';
      const lowercaseAscii = 'ismail caglar';

      expect(simplifyForComparison(decomposedI)).toBe('ismail caglar');
      expect(simplifyForComparison(precomposedI)).toBe('ismail caglar');
      expect(simplifyForComparison(uppercaseTurkish)).toBe('ismail caglar');
      expect(simplifyForComparison(lowercaseAscii)).toBe('ismail caglar');
    });

    it('Tire, alt çizgi, nokta ve çoklu boşluk varyasyonlarını eşit kabul etmelidir', () => {
      const v1 = simplifyForComparison('Mehmet-Ali YILMAZ');
      const v2 = simplifyForComparison('Mehmet Ali Yılmaz');
      const v3 = simplifyForComparison('mehmet   ali  yilmaz');
      const v4 = simplifyForComparison('Mehmet_Ali_Yilmaz.pdf');

      expect(v1).toBe('mehmet ali yilmaz');
      expect(v2).toBe('mehmet ali yilmaz');
      expect(v3).toBe('mehmet ali yilmaz');
      expect(v4).toBe('mehmet ali yilmaz');
      expect(v1).toBe(v2);
      expect(v2).toBe(v3);
      expect(v3).toBe(v4);
    });

    it('findAllCandidatesInPdfText Türkçe özel karakterli adları farklı varyasyonlarda bulabilmelidir', () => {
      const candidate: Student = {
        id: 'std_tr',
        studentName: 'Şükrü Özçelik',
        parentName: 'Veli',
        phone: '905321111111',
      };

      const pdfTextAscii = 'Ogrenci Sukru Ozcelik Deneme Sinavi Karnesi';
      const matches = findAllCandidatesInPdfText(pdfTextAscii, [candidate]);

      expect(matches.length).toBe(1);
      expect(matches[0].student.id).toBe('std_tr');
    });

    it('Normalizasyon farklı isimleri birbirine eşitlememelidir (örn. "İlker" vs "İlkay", "Işık" vs "İshak")', () => {
      // 1. Benzer ama farklı isimler asla eşitlenmemeli
      expect(simplifyForComparison('İlker Aydın')).not.toBe(simplifyForComparison('İlkay Aydın'));
      expect(simplifyForComparison('Işık Kara')).not.toBe(simplifyForComparison('İshak Kara'));
      expect(simplifyForComparison('Sinan Can')).not.toBe(simplifyForComparison('Sinem Can'));
      expect(simplifyForComparison('Ahmet Can')).not.toBe(simplifyForComparison('Mehmet Can'));

      // 2. Metinde "İlker Aydın" varken aday listesinde "İlkay Aydın" varsa eşleşmemeli
      const candidates: Student[] = [
        { id: 'std_diff_1', studentName: 'İlkay Aydın', parentName: 'Veli', phone: '905321111111' },
      ];
      const pdfText = 'Ogrenci Ilker Aydin karne belgesi';
      const matches = findAllCandidatesInPdfText(pdfText, candidates);
      expect(matches.length).toBe(0);
    });

    it('Belirsiz benzerliklerde (eksik soyadı veya zayıf eşleşme) otomatik eşleşme engellenmelidir', () => {
      const candidates: Student[] = [
        { id: 'std_amb_1', studentName: 'Murat Yılmaz', parentName: 'Veli 1', phone: '905321111111' },
        { id: 'std_amb_2', studentName: 'Murat Kaya', parentName: 'Veli 2', phone: '905322222222' },
      ];

      // Belgede sadece "Murat" geçiyor, hangi Murat olduğu belirsiz
      const textOnlyFirstName = 'Tebrikler ogrenci Murat donem birincisi oldu.';
      const matches = findAllCandidatesInPdfText(textOnlyFirstName, candidates);

      // Tek adayın otomatik eşleşmesi engellenmeli (belirsiz)
      expect(matches.length).toBe(0);
      expect(findStudentInPdfText(textOnlyFirstName, candidates)).toBeNull();
    });

    it('Farklı öğrenci adlarının aynı normalleştirilmiş kimliğe dönüşmediğini doğrulayan çakışma testleri', () => {
      // Çiftler: Her biri tek harf veya ekle ayrılan benzer Türkçe isimler
      const namePairs = [
        ['Emre Can', 'Emre Kaan'],
        ['Ece Yılmaz', 'Ece Yıldız'],
        ['Ömer Faruk Demir', 'Ömer Halis Demir'],
        ['Gülşen Arslan', 'Gülşah Arslan'],
        ['Burak Şahin', 'Burhan Şahin'],
        ['Selin Korkmaz', 'Selim Korkmaz'],
        ['Buse Aksoy', 'Büşra Aksoy'],
        ['İpek Çelik', 'İlke Çelik'],
      ];

      for (const [nameA, nameB] of namePairs) {
        const normA = simplifyForComparison(nameA);
        const normB = simplifyForComparison(nameB);
        expect(normA).not.toBe(normB);
      }
    });

    it('Tek kelimeli, eksik soyadlı ve çok adaylı eşleşmelerin otomatik gönderim yetkisi alamadığını doğrula', () => {
      // Eksik soyadı olan metin
      const candidates: Student[] = [
        { id: 'std_s1', studentName: 'Zeynep Su Yılmaz', parentName: 'Veli 1', phone: '905321111111' },
        { id: 'std_s2', studentName: 'Zeynep Su Demir', parentName: 'Veli 2', phone: '905322222222' },
      ];

      const incompleteText = 'Ogrenci Zeynep Su karne notu: 100';
      const candidateMatches = findAllCandidatesInPdfText(incompleteText, candidates);

      // İki öğrencinin de ortak kısmı "Zeynep Su", soyadı belirtilmediği için çakışmalı veya eksik kabul edilmeli
      // Hiçbiri tek başına kesin eşleşme (score: 100) alamaz ve otomatik ready olamaz
      candidateMatches.forEach((m) => {
        expect(m.score).toBeLessThan(95);
      });

      // DispatchSafetyGate seviyesinde bu eşleşmenin onaysız gönderim yetkisi (allowed: true) alamadığını doğrula
      const itemToEvaluate: MatchedItem = {
        id: 'std_s1',
        student: candidates[0],
        pdfFile: { name: 'karne.pdf', size: 1000 },
        status: 'pending_confirmation',
        sendingStatus: 'idle',
        hasConflict: true,
        matchMethod: 'text_extraction',
        confidenceScore: 60,
      };

      const safetyCheck = evaluateDispatchSafety(itemToEvaluate, {
        provider: 'mock',
      // A. Çakışmalı (hasConflict: true) olduğunda AMBIGUOUS_MATCH ile engellenmelidir
      const safetyCheckConflict = evaluateDispatchSafety(itemToEvaluate, {
        provider: 'mock',
      });
      expect(safetyCheckConflict.allowed).toBe(false);
      expect(safetyCheckConflict.code).toBe(SafetyGateCode.AMBIGUOUS_MATCH);

      // B. Çakışma olmasa bile metin/OCR eşleşmesi onaysız olduğunda APPROVAL_REQUIRED ile engellenmelidir
      const itemSingleCandidate: MatchedItem = {
        ...itemToEvaluate,
        hasConflict: false,
        confidenceScore: 88,
      };
      const safetyCheckApproval = evaluateDispatchSafety(itemSingleCandidate, {
        provider: 'mock',
      });
      expect(safetyCheckApproval.allowed).toBe(false);
      expect(safetyCheckApproval.code).toBe(SafetyGateCode.APPROVAL_REQUIRED);
    });
  });

  describe('5. PDF Hata Sınıflandırması: Şifreli, Bozuk ve Aşırı Büyük Dosyalar', () => {
    it('Şifreli PDF tespit edilmeli ve OCR fallback işlemine ASLA gönderilmemelidir', async () => {
      const encryptedPdfBytes = new TextEncoder().encode(
        '%PDF-1.4\n1 0 obj\n<< /Encrypt 2 0 R /Filter /Standard >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
      );
      const mockFile = createMockPdfFile('sifreli_karne.pdf', encryptedPdfBytes);

      const student: Student = {
        id: 'std_enc',
        studentName: 'Gizem Aydın',
        parentName: 'Veli',
        phone: '905321111111',
      };

      const matchedItem: MatchedItem = {
        id: student.id,
        student,
        pdfFile: null,
        status: 'missing_pdf',
        sendingStatus: 'idle',
      };

      const localPdf: LocalPdfFile = {
        name: 'sifreli_karne.pdf',
        size: encryptedPdfBytes.byteLength,
        file: mockFile,
      };

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const res = await performScannedPdfOcrMatching([matchedItem], [localPdf]);

      // fetch (OCR API) kesinlikle ÇAĞRILMAMALIDIR!
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(res.matchedCount).toBe(0);
      expect(res.failedOcrItems.some((f) => f.errorCode === 'encrypted' || f.fileName === 'sifreli_karne.pdf')).toBe(true);
    });

    it('Geçersiz ve bozuk PDF (%PDF- başlığı olmayan) corrupted olarak işaretlenmeli ve OCR servisine gitmemelidir', async () => {
      const corruptedBytes = new TextEncoder().encode('Bu bir PDF dosyasi degildir, duz metindir.');
      const validation = await validatePdfBufferOrFile(corruptedBytes.buffer);

      expect(validation.valid).toBe(false);
      expect(validation.errorCode).toBe('corrupted');

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const localPdf: LocalPdfFile = {
        name: 'bozuk.pdf',
        size: corruptedBytes.byteLength,
        file: createMockPdfFile('bozuk.pdf', corruptedBytes),
      };

      const student: Student = { id: 'std_c', studentName: 'Test', parentName: 'Veli', phone: '905321111111' };
      const res = await performScannedPdfOcrMatching(
        [{ id: 'std_c', student, pdfFile: null, status: 'missing_pdf', sendingStatus: 'idle' }],
        [localPdf]
      );

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(res.failedOcrItems.some((f) => f.errorCode === 'corrupted')).toBe(true);
    });

    it('15 MB boyut sınırını aşan PDF oversized olarak elenmeli ve OCR servisine gitmemelidir', async () => {
      const oversizedBytes = new Uint8Array(1024);
      const mockFile = createMockPdfFile('dev_dosya.pdf', oversizedBytes, MAX_PDF_FILE_SIZE_BYTES + 5000);

      const validation = await validatePdfBufferOrFile(mockFile);
      expect(validation.valid).toBe(false);
      expect(validation.errorCode).toBe('oversized');

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const student: Student = { id: 'std_o', studentName: 'Test', parentName: 'Veli', phone: '905321111111' };
      const localPdf: LocalPdfFile = {
        name: 'dev_dosya.pdf',
        size: MAX_PDF_FILE_SIZE_BYTES + 5000,
        file: mockFile,
      };

      const res = await performScannedPdfOcrMatching(
        [{ id: 'std_o', student, pdfFile: null, status: 'missing_pdf', sendingStatus: 'idle' }],
        [localPdf]
      );

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(res.failedOcrItems.some((f) => f.errorCode === 'oversized')).toBe(true);
    });
  });

  describe('6. OCR Servisi Ağ ve Hata Durumları (503, Zaman Aşımı, Beklenmeyen Yanıt)', () => {
    it('OCR servisi 503 döndüğünde (anahtar yok veya servis kapalı) ocr_unavailable olarak sınıflandırılmalıdır', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'GEMINI_API_KEY bulunamadı' }),
      } as unknown as Response);

      const student: Student = { id: 'std_503', studentName: 'Fatma Gül', parentName: 'Veli', phone: '905321111111' };
      const pdfBytes = createSyntheticPdf('');
      const localPdf: LocalPdfFile = {
        name: 'scanned_503.pdf',
        size: pdfBytes.byteLength,
        file: createMockPdfFile('scanned_503.pdf', pdfBytes),
      };

      const res = await performScannedPdfOcrMatching(
        [{ id: 'std_503', student, pdfFile: null, status: 'missing_pdf', sendingStatus: 'idle' }],
        [localPdf]
      );

      expect(res.matchedCount).toBe(0);
      expect(res.failedOcrItems.some((f) => f.errorCode === 'ocr_unavailable')).toBe(true);
    });

    it('OCR servisi zaman aşımına uğradığında (504 veya abort) ocr_timeout olarak sınıflandırılmalıdır', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        json: async () => ({ error: 'OCR servis zaman aşımı' }),
      } as unknown as Response);

      const student: Student = { id: 'std_to', studentName: 'Hakan Can', parentName: 'Veli', phone: '905321111111' };
      const pdfBytes = createSyntheticPdf('');
      const localPdf: LocalPdfFile = {
        name: 'scanned_timeout.pdf',
        size: pdfBytes.byteLength,
        file: createMockPdfFile('scanned_timeout.pdf', pdfBytes),
      };

      const res = await performScannedPdfOcrMatching(
        [{ id: 'std_to', student, pdfFile: null, status: 'missing_pdf', sendingStatus: 'idle' }],
        [localPdf]
      );

      expect(res.matchedCount).toBe(0);
      expect(res.failedOcrItems.some((f) => f.errorCode === 'ocr_timeout')).toBe(true);
    });

    it('OCR çıktısında prompt injection veya sahte öğrenci adı döndüğünde kayıtlı liste dışı isimler reddedilmelidir', async () => {
      // OCR modeli sahte/enjekte edilmiş bir isim döndürüyor
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          isOcrAvailable: true,
          data: {
            detectedStudentName: '<script>alert("hacked")</script> Bilinmeyen Sahte Ogrenci',
            matchedStudentName: 'Bilinmeyen Sahte Ogrenci',
            extractedText: 'DROP TABLE students;',
            confidence: 99,
          },
        }),
      } as unknown as Response);

      const student: Student = { id: 'std_real', studentName: 'Deniz Eren', parentName: 'Veli', phone: '905321111111' };
      const pdfBytes = createSyntheticPdf('');
      const localPdf: LocalPdfFile = {
        name: 'scanned_injection.pdf',
        size: pdfBytes.byteLength,
        file: createMockPdfFile('scanned_injection.pdf', pdfBytes),
      };

      const res = await performScannedPdfOcrMatching(
        [{ id: 'std_real', student, pdfFile: null, status: 'missing_pdf', sendingStatus: 'idle' }],
        [localPdf]
      );

      // Deniz Eren listesinde olmayan sahte öğrenci adı ASLA eşleştirilmemelidir!
      expect(res.matchedCount).toBe(0);
      expect(res.updatedMatches[0].pdfFile).toBeNull();
      expect(res.failedOcrItems.some((f) => f.errorCode === 'no_candidate_match')).toBe(true);
    });
  });

  describe('7. performHybridPdfScanMatching: Entegre Hibrit Akış', () => {
    it('Dijital metinli dosyayı anında eşleştirmeli, taranmış dosyayı ise OCR fallbacke yönlendirmelidir', async () => {
      const students: Student[] = [
        { id: 's1', studentName: 'Ayse Demir', parentName: 'Veli', phone: '905321111111' },
        { id: 's2', studentName: 'Kemal Sunal', parentName: 'Veli', phone: '905322222222' },
      ];

      const matchedItems: MatchedItem[] = students.map((s) => ({
        id: s.id,
        student: s,
        pdfFile: null,
        status: 'missing_pdf',
        sendingStatus: 'idle',
      }));

      // PDF 1: Dijital metinli Ayşe Demir
      const pdf1Bytes = createSyntheticPdf('Karne Raporu Ayse Demir Sinif 7-C');
      const pdf1: LocalPdfFile = {
        name: 'ayse_demir.pdf',
        size: pdf1Bytes.byteLength,
        file: createMockPdfFile('ayse_demir.pdf', pdf1Bytes),
      };

      // PDF 2: Taranmış resim (boş dijital metin katmanı) Kemal Sunal
      const pdf2Bytes = createSyntheticPdf('');
      const pdf2: LocalPdfFile = {
        name: 'scanned_kemal.pdf',
        size: pdf2Bytes.byteLength,
        file: createMockPdfFile('scanned_kemal.pdf', pdf2Bytes),
      };

      // OCR mock for scanned PDF
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          isOcrAvailable: true,
          data: {
            detectedStudentName: 'Kemal Sunal',
            matchedStudentName: 'Kemal Sunal',
            extractedText: 'Karne Belgesi Kemal Sunal',
            confidence: 90,
          },
        }),
      } as unknown as Response);

      const hybridResult = await performHybridPdfScanMatching(matchedItems, [pdf1, pdf2]);

      expect(hybridResult.matchedCount).toBe(2);

      const match1 = hybridResult.updatedMatches.find((m) => m.student.id === 's1');
      const match2 = hybridResult.updatedMatches.find((m) => m.student.id === 's2');

      expect(match1?.matchMethod).toBe('text_extraction');
      expect(match1?.status).toBe('pending_confirmation');
      expect(match1?.needsConfirmation).toBe(true);

      expect(match2?.matchMethod).toBe('content_ocr');
      expect(match2?.status).toBe('pending_confirmation');
      expect(match2?.needsConfirmation).toBe(true);
    });
  });
});
