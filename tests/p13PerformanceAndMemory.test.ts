import { describe, it, expect, vi } from 'vitest';
import {
  performHybridPdfScanMatching,
  MAX_PDF_FILE_SIZE_BYTES,
} from '../src/services/pdfTextExtractor';
import { Student } from '../src/types/student';
import { LocalPdfFile, MatchedItem } from '../src/types/pdf';

function createSyntheticPdf(text: string): Uint8Array {
  const content = `%PDF-1.4\n1 0 obj\n<< /Length ${text.length + 20} >>\nstream\nBT\n/F1 12 Tf\n(${text}) Tj\nET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`;
  return new TextEncoder().encode(content);
}

function createMockFile(name: string, content: Uint8Array): File {
  const blob = new Blob([content.buffer as ArrayBuffer], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

interface BenchmarkMetrics {
  pdfCount: number;
  durationMs: number;
  avgMsPerPdf: number;
  // Disjoint Final Outcome Categories (Must strictly sum to pdfCount)
  digitalMatched: number;
  ocrMatched: number;
  failedCount: number;
  totalSumChecked: number;
  // Stage-based operational counters
  ocrFallbackCount: number;
  heapStartMb: number;
  heapPeakMb: number;
  heapDeltaMb: number;
}

export const benchmarkResults: BenchmarkMetrics[] = [];

describe('Vatsap V2 — P1.3 Aşama 3: Performans ve Bellek Ölçümü (10, 50, 100 PDF)', () => {
  const FIRST_NAMES = [
    'Ahmet', 'Mehmet', 'Ayse', 'Fatma', 'Ali', 'Zeynep', 'Mustafa', 'Elif', 'Can', 'Burak',
    'Huseyin', 'Emre', 'Gamze', 'Busra', 'Selin', 'Oguz', 'Murat', 'Deniz', 'Derya', 'Kerem',
    'Baris', 'Cem', 'Ece', 'Irem', 'Kaan', 'Leyla', 'Mert', 'Nazli', 'Onur', 'Pelin',
  ];
  const LAST_NAMES = [
    'Yilmaz', 'Kaya', 'Demir', 'Celik', 'Sahin', 'Yildiz', 'Yildirim', 'Ozturk', 'Aydin', 'Ozdemir',
    'Arslan', 'Dogan', 'Kilic', 'Aslan', 'Cetin', 'Kara', 'Koc', 'Kurt', 'Ozkan', 'Simsek',
    'Polat', 'Korkmaz', 'Erdogan', 'Guler', 'Yavuz', 'Aksoy', 'Gunes', 'Bozkurt', 'Ucar', 'Avci',
  ];

  function runSyntheticBatch(count: number): {
    students: Student[];
    pdfFiles: LocalPdfFile[];
    matchedItems: MatchedItem[];
  } {
    const students: Student[] = [];
    const pdfFiles: LocalPdfFile[] = [];

    // Realistic distribution: 70% digital text layer, 25% scanned image only, 5% corrupted/unreadable
    const digitalCount = Math.floor(count * 0.7);
    const scannedCount = Math.floor(count * 0.25);

    for (let i = 0; i < count; i++) {
      const fName = FIRST_NAMES[i % FIRST_NAMES.length];
      const lName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
      const suffix = Math.floor(i / (FIRST_NAMES.length * LAST_NAMES.length)) > 0
        ? `_${Math.floor(i / (FIRST_NAMES.length * LAST_NAMES.length))}`
        : '';
      const studentName = `${fName} ${lName}${suffix}`;

      students.push({
        id: `std_${i + 1}`,
        studentName,
        parentName: `Veli ${fName}`,
        phone: `90532${String(1000000 + i).slice(0, 7)}`,
      });
    }

    // 1. Digital Text PDFs
    for (let i = 0; i < digitalCount; i++) {
      const student = students[i];
      const text = `T.C. Milli Egitim Bakanligi Karne Raporu Ogrenci ${student.studentName} Sinif 8-A Notu 95`;
      const bytes = createSyntheticPdf(text);
      pdfFiles.push({
        name: `karne_digital_${i + 1}.pdf`,
        size: bytes.byteLength,
        file: createMockFile(`karne_digital_${i + 1}.pdf`, bytes),
      });
    }

    // 2. Scanned Image PDFs (empty text layer, triggers OCR fallback)
    for (let i = digitalCount; i < digitalCount + scannedCount; i++) {
      const bytes = createSyntheticPdf(''); // no text layer
      pdfFiles.push({
        name: `karne_scanned_${i + 1}.pdf`,
        size: bytes.byteLength,
        file: createMockFile(`karne_scanned_${i + 1}.pdf`, bytes),
      });
    }

    // 3. Corrupted / Broken PDFs
    for (let i = digitalCount + scannedCount; i < count; i++) {
      const bytes = new TextEncoder().encode('Bozuk gecersiz veri');
      pdfFiles.push({
        name: `karne_corrupted_${i + 1}.pdf`,
        size: bytes.byteLength,
        file: createMockFile(`karne_corrupted_${i + 1}.pdf`, bytes),
      });
    }

    const matchedItems: MatchedItem[] = students.map((s) => ({
      id: s.id,
      student: s,
      pdfFile: null,
      status: 'missing_pdf',
      sendingStatus: 'idle',
    }));

    return { students, pdfFiles, matchedItems };
  }

  function setupOcrMock(students: Student[]) {
    // Index missing students by normalized name for accurate OCR candidate matching
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body as string);
      const candidates = (body.studentCandidates || []) as string[];
      const firstCandidate = candidates[0] || 'Bilinmeyen Öğrenci';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          isOcrAvailable: true,
          data: {
            detectedStudentName: firstCandidate,
            matchedStudentName: firstCandidate,
            extractedText: `Karne Belgesi ${firstCandidate}`,
            confidence: 90,
            isScanned: true,
          },
        }),
      } as Response;
    });
  }

  it('1. Sentetik 10 PDF Benchmark Testi', async () => {
    const { students, pdfFiles, matchedItems } = runSyntheticBatch(10);
    setupOcrMock(students);

    if (global.gc) global.gc();
    const heapStart = process.memoryUsage().heapUsed;
    const start = performance.now();

    const result = await performHybridPdfScanMatching(matchedItems, pdfFiles);

    const duration = performance.now() - start;
    const heapEnd = process.memoryUsage().heapUsed;
    const heapPeak = Math.max(heapStart, heapEnd);

    const digitalMatched = result.stats?.digitalMatched || 0;
    const ocrMatched = result.stats?.ocrMatched || 0;
    const failedCount = result.stats?.failedCount || 0;
    const totalSum = digitalMatched + ocrMatched + failedCount;

    const metrics: BenchmarkMetrics = {
      pdfCount: 10,
      durationMs: Math.round(duration),
      avgMsPerPdf: Number((duration / 10).toFixed(2)),
      digitalMatched,
      ocrMatched,
      failedCount,
      totalSumChecked: totalSum,
      ocrFallbackCount: result.scannedImagePdfs.length,
      heapStartMb: Number((heapStart / 1024 / 1024).toFixed(2)),
      heapPeakMb: Number((heapPeak / 1024 / 1024).toFixed(2)),
      heapDeltaMb: Number(((heapEnd - heapStart) / 1024 / 1024).toFixed(2)),
    };

    benchmarkResults.push(metrics);

    expect(result.updatedMatches.length).toBe(10);
    // Disjoint outcome assertion: every single PDF falls into exactly ONE final category
    expect(totalSum).toBe(10);
    expect(metrics.digitalMatched + metrics.ocrMatched + metrics.failedCount).toBe(10);
    expect(metrics.digitalMatched).toBeGreaterThanOrEqual(5);
    expect(metrics.ocrFallbackCount).toBeGreaterThanOrEqual(2);
    expect(metrics.avgMsPerPdf).toBeLessThan(100);
  });

  it('2. Sentetik 50 PDF Benchmark Testi', async () => {
    const { students, pdfFiles, matchedItems } = runSyntheticBatch(50);
    setupOcrMock(students);

    if (global.gc) global.gc();
    const heapStart = process.memoryUsage().heapUsed;
    const start = performance.now();

    const result = await performHybridPdfScanMatching(matchedItems, pdfFiles);

    const duration = performance.now() - start;
    const heapEnd = process.memoryUsage().heapUsed;
    const heapPeak = Math.max(heapStart, heapEnd);

    const digitalMatched = result.stats?.digitalMatched || 0;
    const ocrMatched = result.stats?.ocrMatched || 0;
    const failedCount = result.stats?.failedCount || 0;
    const totalSum = digitalMatched + ocrMatched + failedCount;

    const metrics: BenchmarkMetrics = {
      pdfCount: 50,
      durationMs: Math.round(duration),
      avgMsPerPdf: Number((duration / 50).toFixed(2)),
      digitalMatched,
      ocrMatched,
      failedCount,
      totalSumChecked: totalSum,
      ocrFallbackCount: result.scannedImagePdfs.length,
      heapStartMb: Number((heapStart / 1024 / 1024).toFixed(2)),
      heapPeakMb: Number((heapPeak / 1024 / 1024).toFixed(2)),
      heapDeltaMb: Number(((heapEnd - heapStart) / 1024 / 1024).toFixed(2)),
    };

    benchmarkResults.push(metrics);

    expect(result.updatedMatches.length).toBe(50);
    // Disjoint outcome assertion: strictly sums to 50
    expect(totalSum).toBe(50);
    expect(metrics.digitalMatched + metrics.ocrMatched + metrics.failedCount).toBe(50);
    expect(metrics.digitalMatched).toBeGreaterThanOrEqual(30);
    expect(metrics.ocrFallbackCount).toBeGreaterThanOrEqual(10);
    expect(metrics.avgMsPerPdf).toBeLessThan(100);
  });

  it('3. Sentetik 100 PDF Benchmark Testi', async () => {
    const { students, pdfFiles, matchedItems } = runSyntheticBatch(100);
    setupOcrMock(students);

    if (global.gc) global.gc();
    const heapStart = process.memoryUsage().heapUsed;
    const start = performance.now();

    const result = await performHybridPdfScanMatching(matchedItems, pdfFiles);

    const duration = performance.now() - start;
    const heapEnd = process.memoryUsage().heapUsed;
    const heapPeak = Math.max(heapStart, heapEnd);

    const digitalMatched = result.stats?.digitalMatched || 0;
    const ocrMatched = result.stats?.ocrMatched || 0;
    const failedCount = result.stats?.failedCount || 0;
    const totalSum = digitalMatched + ocrMatched + failedCount;

    const metrics: BenchmarkMetrics = {
      pdfCount: 100,
      durationMs: Math.round(duration),
      avgMsPerPdf: Number((duration / 100).toFixed(2)),
      digitalMatched,
      ocrMatched,
      failedCount,
      totalSumChecked: totalSum,
      ocrFallbackCount: result.scannedImagePdfs.length,
      heapStartMb: Number((heapStart / 1024 / 1024).toFixed(2)),
      heapPeakMb: Number((heapPeak / 1024 / 1024).toFixed(2)),
      heapDeltaMb: Number(((heapEnd - heapStart) / 1024 / 1024).toFixed(2)),
    };

    benchmarkResults.push(metrics);

    expect(result.updatedMatches.length).toBe(100);
    // Disjoint outcome assertion: strictly sums to 100
    expect(totalSum).toBe(100);
    expect(metrics.digitalMatched + metrics.ocrMatched + metrics.failedCount).toBe(100);
    expect(metrics.digitalMatched).toBeGreaterThanOrEqual(60);
    expect(metrics.ocrFallbackCount).toBeGreaterThanOrEqual(20);
    expect(metrics.avgMsPerPdf).toBeLessThan(100);

    // Print summary table to standard output for reporting
    console.log('\n========================================================================================');
    console.log('--- VATSAP V2 P1.3 SENTETİK PDF İŞLEME VE BELLEK PERFORMANS TABLOSU (NİHAİ AYRIK) ---');
    console.log('========================================================================================');
    console.table(benchmarkResults);
    console.log('========================================================================================\n');
  });
});
