import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Student } from '../types/student';
import { LocalPdfFile, MatchedItem } from '../types/pdf';
import { normalizeForMatching } from './normalizer';
import { fileToBase64 } from './pdfMatcher';

// Initialize PDF.js worker safely for Vite / Browser
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

// Limits and Constants for PDF Processing Safety
export const MAX_PDF_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MIN_DIGITAL_TEXT_CHARS = 15;
export const PDF_PROCESSING_CONCURRENCY_LIMIT = 2;

export type PdfErrorCode =
  | 'encrypted'
  | 'corrupted'
  | 'oversized'
  | 'unreadable'
  | 'ocr_unavailable'
  | 'ocr_timeout'
  | 'ocr_invalid_response'
  | 'scanned_image_only'
  | 'no_candidate_match'
  | 'conflict_ambiguous'
  | 'generic_error';

export interface PdfTextExtractionResult {
  text: string;
  hasTextLayer: boolean;
  isScannedImageOnly: boolean;
  pageCount: number;
  unsupportedOcrReason?: string;
  errorCode?: PdfErrorCode;
}

export interface OcrFailureItem {
  fileName: string;
  errorCode?: PdfErrorCode;
  reason: string;
  actionRecommendation: string;
  details?: string;
}

export interface ScannedPdfOcrResult {
  detectedStudentName?: string;
  matchedStudentName?: string | null;
  extractedText?: string;
  confidence?: number;
  isScanned?: boolean;
  notes?: string;
}

export interface CandidateMatch {
  student: Student;
  score: number;
  matchType: 'exact_full' | 'all_tokens';
  reason: string;
}

export interface PdfScanProgress {
  current: number;
  total: number;
  currentFileName: string;
  detectedStudentName?: string;
  isScannedImage?: boolean;
  scanType?: 'digital_text' | 'visual_ocr' | 'hybrid';
  errors?: string[];
}

export type OcrScanProgress = PdfScanProgress;

export interface DeepScanResult {
  updatedMatches: MatchedItem[];
  matchedCount: number;
  scannedImagePdfs: string[];
  failedOcrItems: OcrFailureItem[];
  errors: string[];
  stats?: {
    totalPdfs: number;
    // Disjoint Final Outcome Categories (Must strictly sum to totalPdfs)
    digitalMatched: number;
    ocrMatched: number;
    failedCount: number;
    // Stage-based operational counters (e.g. intermediate OCR attempts)
    ocrFallbackCount?: number;
    durationMs: number;
    peakHeapDeltaMb?: number;
  };
}

/**
 * Validates PDF raw bytes for size limit, magic bytes (%PDF-), and encryption flags.
 */
export async function validatePdfBufferOrFile(
  input: File | ArrayBuffer
): Promise<{
  valid: boolean;
  errorCode?: PdfErrorCode;
  errorReason?: string;
  arrayBuffer: ArrayBuffer;
}> {
  let arrayBuffer: ArrayBuffer;
  if (input instanceof File) {
    if (input.size > MAX_PDF_FILE_SIZE_BYTES) {
      return {
        valid: false,
        errorCode: 'oversized',
        errorReason: `Dosya boyutu (${(input.size / (1024 * 1024)).toFixed(1)} MB) izin verilen 15 MB sınırını aşıyor.`,
        arrayBuffer: new ArrayBuffer(0),
      };
    }
    arrayBuffer = await input.arrayBuffer();
  } else {
    arrayBuffer = input;
    if (arrayBuffer.byteLength > MAX_PDF_FILE_SIZE_BYTES) {
      return {
        valid: false,
        errorCode: 'oversized',
        errorReason: `Dosya boyutu (${(arrayBuffer.byteLength / (1024 * 1024)).toFixed(1)} MB) izin verilen 15 MB sınırını aşıyor.`,
        arrayBuffer,
      };
    }
  }

  // 1. Magic byte verification (%PDF-) within the first 1024 bytes
  const byteHeader = new Uint8Array(arrayBuffer.slice(0, Math.min(1024, arrayBuffer.byteLength)));
  const decoder = new TextDecoder('latin1');
  const headerStr = decoder.decode(byteHeader);

  if (!headerStr.includes('%PDF-')) {
    return {
      valid: false,
      errorCode: 'corrupted',
      errorReason: 'Dosya geçerli bir PDF formatında değil (başlıkta %PDF- imzası bulunamadı).',
      arrayBuffer,
    };
  }

  // 2. Encrypted / password-protected check in raw trailer / dictionary
  const fullSample = decoder.decode(new Uint8Array(arrayBuffer.slice(0, Math.min(8192, arrayBuffer.byteLength))));
  if (fullSample.includes('/Encrypt')) {
    return {
      valid: false,
      errorCode: 'encrypted',
      errorReason: 'PDF belgesi şifre korumalıdır (/Encrypt). Parola olmadan metin çıkarılamaz ve güvenlik gereği OCR servisine gönderilemez.',
      arrayBuffer,
    };
  }

  return {
    valid: true,
    arrayBuffer,
  };
}

/**
 * Extracts selectable digital text layer from a PDF.
 * This is instant, offline and distinct from raster image OCR.
 */
export async function extractTextFromPdf(input: File | ArrayBuffer): Promise<PdfTextExtractionResult> {
  const precheck = await validatePdfBufferOrFile(input);
  if (!precheck.valid) {
    return {
      text: '',
      hasTextLayer: false,
      isScannedImageOnly: false,
      pageCount: 0,
      errorCode: precheck.errorCode,
      unsupportedOcrReason: precheck.errorReason,
    };
  }

  const arrayBuffer = precheck.arrayBuffer;
  // Keep an isolated byte copy to guarantee fallback parsing even if PDF.js detaches arrayBuffer
  const rawBytesCopy = new Uint8Array(arrayBuffer).slice();
  let pageCount = 0;
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
  let pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;

  try {
    loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      useSystemFonts: true,
    });

    pdfDocument = await loadingTask.promise;
    pageCount = pdfDocument.numPages;
    const pageTexts: string[] = [];
    let totalItemsFound = 0;

    // Scan first 5 pages for text content
    const maxPages = Math.min(pdfDocument.numPages, 5);
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      totalItemsFound += textContent.items.length;

      const textItems = textContent.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ');
      pageTexts.push(textItems);

      // Clean page resources if possible
      page.cleanup();
    }

    const fullText = pageTexts.join('\n').trim();

    if (fullText.length >= MIN_DIGITAL_TEXT_CHARS) {
      return {
        text: fullText,
        hasTextLayer: true,
        isScannedImageOnly: false,
        pageCount,
      };
    }

    // If PDF.js did not find sufficient selectable text items, try binary stream fallback before declaring scanned image
    try {
      const bytes = rawBytesCopy;
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const rawString = decoder.decode(bytes);

      const matches = rawString.match(/\(([^()]{2,80})\)\s*T[jJ]/g);
      if (matches && matches.length > 0) {
        const fallbackText = matches
          .map((m) => m.replace(/^\(/, '').replace(/\)\s*T[jJ]$/, ''))
          .join(' ')
          .trim();

        if (fallbackText.length >= MIN_DIGITAL_TEXT_CHARS) {
          return {
            text: fallbackText,
            hasTextLayer: true,
            isScannedImageOnly: false,
            pageCount: Math.max(1, pageCount),
          };
        }
      }
    } catch {
      // Binary fallback failed
    }

    // If zero or insufficient selectable text items exist across pages, this is a scanned/image-only PDF
    return {
      text: fullText,
      hasTextLayer: false,
      isScannedImageOnly: true,
      pageCount,
      errorCode: 'scanned_image_only',
      unsupportedOcrReason:
        'Bu belge taranmış/fotoğraf formatında (görüntü tabanlı) bir PDF’tir ve seçilebilir dijital metin katmanı içermemektedir. Görsel OCR gerektirir.',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isPassword =
      errorMsg.toLowerCase().includes('password') ||
      (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'PasswordException');

    if (isPassword) {
      return {
        text: '',
        hasTextLayer: false,
        isScannedImageOnly: false,
        pageCount: 0,
        errorCode: 'encrypted',
        unsupportedOcrReason: 'PDF belgesi şifre korumalıdır. Parola girilmeden metin çıkarılamaz ve güvenlik gereği OCR servisine gönderilemez.',
      };
    }

    // Binary search fallback for uncompressed text streams
    try {
      const bytes = rawBytesCopy;
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const rawString = decoder.decode(bytes);

      const matches = rawString.match(/\(([^()]{2,80})\)\s*T[jJ]/g);
      if (matches && matches.length > 0) {
        const fallbackText = matches
          .map((m) => m.replace(/^\(/, '').replace(/\)\s*T[jJ]$/, ''))
          .join(' ')
          .trim();

        if (fallbackText.length >= MIN_DIGITAL_TEXT_CHARS) {
          return {
            text: fallbackText,
            hasTextLayer: true,
            isScannedImageOnly: false,
            pageCount: 1,
          };
        }
      }
    } catch {
      // Binary fallback failed
    }

    const isCorrupted = errorMsg.toLowerCase().includes('corrupt');
    if (isCorrupted) {
      return {
        text: '',
        hasTextLayer: false,
        isScannedImageOnly: false,
        pageCount: 0,
        errorCode: 'corrupted',
        unsupportedOcrReason: `PDF dosyası bozuk veya okunamıyor: ${errorMsg}`,
      };
    }

    return {
      text: '',
      hasTextLayer: false,
      isScannedImageOnly: true,
      pageCount: 0,
      errorCode: 'scanned_image_only',
      unsupportedOcrReason: 'PDF belgesinde seçilebilir dijital metin katmanı bulunamadı (taranmış görsel olabilir).',
    };
  } finally {
    if (pdfDocument) {
      pdfDocument.cleanup();
      (pdfDocument as unknown as { destroy?: () => Promise<void> }).destroy?.();
    }
    if (loadingTask) {
      loadingTask.destroy().catch(() => {});
    }
  }

  return {
    text: '',
    hasTextLayer: false,
    isScannedImageOnly: true,
    pageCount,
    errorCode: 'scanned_image_only',
    unsupportedOcrReason: 'PDF içinde seçilebilir metin katmanı bulunamadı (taranmış görsel olabilir).',
  };
}

/**
 * Renders the first page of a PDF file to a JPEG Base64 image using PDF.js and Canvas.
 * Ensures clean memory disposal of Canvas and PDF document objects.
 */
export async function renderPdfFirstPageToBase64(input: File | ArrayBuffer): Promise<string | null> {
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    let arrayBuffer: ArrayBuffer;
    if (input instanceof File) {
      arrayBuffer = await input.arrayBuffer();
    } else {
      arrayBuffer = input;
    }

    loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      useSystemFonts: true,
    });
    pdfDoc = await loadingTask.promise;
    if (pdfDoc.numPages < 1) return null;

    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });

    if (typeof document === 'undefined') {
      return null; // Node.js test environment without canvas
    }

    canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Render page
    const renderContext = {
      canvasContext: ctx,
      viewport,
      canvas,
    };
    await page.render(renderContext).promise;
    page.cleanup();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.split(',')[1] || null;
  } catch (err) {
    console.error('PDF sayfası resme dönüştürülemedi:', err);
    return null;
  } finally {
    // Explicitly release memory
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }
    if (pdfDoc) {
      pdfDoc.cleanup();
      (pdfDoc as unknown as { destroy?: () => Promise<void> }).destroy?.();
    }
    if (loadingTask) {
      loadingTask.destroy().catch(() => {});
    }
  }
}

/**
 * Calls server-side Gemini Vision OCR to analyze scanned PDFs.
 * Includes timeout protection and schema validation.
 */
export async function requestVisualOcr(params: {
  imageBase64?: string;
  pdfBase64?: string;
  studentCandidates?: string[];
}): Promise<{
  success: boolean;
  isOcrAvailable: boolean;
  data?: ScannedPdfOcrResult;
  error?: string;
  errorCode?: PdfErrorCode;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s client timeout

    const res = await fetch('/api/ocr-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 503) {
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        isOcrAvailable: false,
        errorCode: 'ocr_unavailable',
        error: errJson.error || 'Görsel OCR servisi yapılandırılmamış (503 Service Unavailable).',
      };
    }

    if (res.status === 504) {
      return {
        success: false,
        isOcrAvailable: true,
        errorCode: 'ocr_timeout',
        error: 'OCR servisi yanıt vermedi (Zaman aşımı - 504).',
      };
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        isOcrAvailable: res.status !== 503,
        errorCode: 'generic_error',
        error: errJson.error || `OCR istek hatası (HTTP ${res.status}).`,
      };
    }

    const json = await res.json();
    return json;
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      success: false,
      isOcrAvailable: true,
      errorCode: isAbort ? 'ocr_timeout' : 'generic_error',
      error: isAbort
        ? 'OCR servisi 30 saniye içinde yanıt vermedi (Zaman aşımı).'
        : `OCR servisine ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Searches the extracted PDF text to evaluate ALL candidate students.
 * Detects ambiguities and multiple matches to prevent wrong automatic assignments.
 */
export function findAllCandidatesInPdfText(
  pdfText: string,
  candidates: Student[]
): CandidateMatch[] {
  if (!pdfText || pdfText.trim().length === 0 || candidates.length === 0) {
    return [];
  }

  const normalizedPdfText = normalizeForMatching(pdfText);
  if (!normalizedPdfText) return [];

  const matches: CandidateMatch[] = [];

  for (const student of candidates) {
    const normalizedStudentName = normalizeForMatching(student.studentName);
    if (!normalizedStudentName) continue;

    // 1. Direct exact phrase match (e.g. "ahmet yilmaz" inside "ogrenci adi ahmet yilmaz sinifi 8 a")
    if (normalizedPdfText.includes(normalizedStudentName)) {
      matches.push({
        student,
        score: 90,
        matchType: 'exact_full',
        reason: `Tam isim eşleşti: "${student.studentName}"`,
      });
      continue;
    }

    // 2. All tokens match: Every part of the student name must be present in the text
    const nameParts = normalizedStudentName.split(' ').filter((p) => p.length >= 2);
    if (nameParts.length >= 2) {
      const allPartsExist = nameParts.every((part) => normalizedPdfText.includes(part));
      if (allPartsExist) {
        matches.push({
          student,
          score: 85,
          matchType: 'all_tokens',
          reason: `Tüm isim parçaları bulundu: [${nameParts.join(', ')}]`,
        });
      }
    }
  }

  return matches;
}

/**
 * Backward compatible helper: Returns a single candidate student only if unambiguous.
 * Returns null if no match or if multiple conflicting candidates exist.
 */
export function findStudentInPdfText(
  pdfText: string,
  unmatchedStudents: Student[]
): Student | null {
  const matches = findAllCandidatesInPdfText(pdfText, unmatchedStudents);
  if (matches.length === 1) {
    return matches[0].student;
  }
  return null;
}

/**
 * Concurrency-limited worker pool for processing items in batches
 */
async function processInParallelBatches<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 1. METHOD A: Hızlı PDF İçi Metin Katmanı Taraması (Dijital Metin Okuma)
 * Vektörel dijital metin katmanlarını kontrollü sırayla okur, taranmış fotoğrafları işaretler.
 * GÜVENLİK DEĞİŞMEZİ: Eşleşen kayıtlar doğrudan ready YAPILMAZ; pending_confirmation olarak atanır!
 */
export async function performDeepPdfContentMatching(
  currentMatches: MatchedItem[],
  allPdfs: LocalPdfFile[],
  onProgress?: (progress: PdfScanProgress) => void
): Promise<DeepScanResult> {
  const startTime = Date.now();
  const missingStudentItems = currentMatches.filter((item) => item.status === 'missing_pdf');
  if (missingStudentItems.length === 0) {
    return { updatedMatches: currentMatches, matchedCount: 0, scannedImagePdfs: [], failedOcrItems: [], errors: [] };
  }

  const assignedPdfNames = new Set(
    currentMatches.filter((i) => i.pdfFile !== null).map((i) => i.pdfFile!.name)
  );

  const unassignedPdfs = allPdfs.filter((pdf) => !assignedPdfNames.has(pdf.name));
  if (unassignedPdfs.length === 0) {
    return { updatedMatches: currentMatches, matchedCount: 0, scannedImagePdfs: [], failedOcrItems: [], errors: [] };
  }

  const remainingStudents = [...missingStudentItems.map((item) => item.student)];
  const newlyMatched: Record<
    string,
    { pdf: LocalPdfFile; student: Student; score: number; reason: string; hasConflict: boolean }
  > = {};
  const scanErrors: string[] = [];
  const scannedImagePdfs: string[] = [];
  const failedOcrItems: OcrFailureItem[] = [];

  let processedCount = 0;
  const total = unassignedPdfs.length;

  await processInParallelBatches(unassignedPdfs, PDF_PROCESSING_CONCURRENCY_LIMIT, async (pdf) => {
    processedCount++;

    if (onProgress) {
      onProgress({
        current: processedCount,
        total,
        currentFileName: pdf.name,
        scanType: 'digital_text',
        errors: scanErrors,
      });
    }

    if (!pdf.file) {
      failedOcrItems.push({
        fileName: pdf.name,
        errorCode: 'unreadable',
        reason: 'Dosya verisi hafızada mevcut değil.',
        actionRecommendation: 'Klasörü yeniden seçerek dosyaları yükleyin.',
      });
      return;
    }

    // Pre-check for size and corruption
    const precheck = await validatePdfBufferOrFile(pdf.file);
    if (!precheck.valid) {
      failedOcrItems.push({
        fileName: pdf.name,
        errorCode: precheck.errorCode,
        reason: precheck.errorReason || 'Geçersiz PDF dosyası.',
        actionRecommendation:
          precheck.errorCode === 'encrypted'
            ? 'Şifreli PDF dosyaları güvenlik gereği OCR fallback işlemine gönderilemez. Şifresiz sürümünü temin edin.'
            : 'Dosyayı kontrol edip yeniden yükleyin.',
      });
      return;
    }

    let textContent = pdf.extractedText || '';
    if (!textContent) {
      const extraction = await extractTextFromPdf(pdf.file);
      textContent = extraction.text;
      pdf.extractedText = textContent;

      if (extraction.errorCode === 'encrypted') {
        failedOcrItems.push({
          fileName: pdf.name,
          errorCode: 'encrypted',
          reason: extraction.unsupportedOcrReason || 'PDF şifrelidir.',
          actionRecommendation: 'Şifreli PDF belgeleri güvenlik gereği işlenemez. Şifresiz sürüm yükleyin.',
        });
        return;
      }

      if (extraction.errorCode === 'corrupted' || extraction.errorCode === 'oversized') {
        failedOcrItems.push({
          fileName: pdf.name,
          errorCode: extraction.errorCode,
          reason: extraction.unsupportedOcrReason || 'Bozuk veya aşırı büyük PDF.',
          actionRecommendation: 'Dosyayı inceleyip geçerli bir PDF ile değiştirin.',
        });
        return;
      }

      if (extraction.isScannedImageOnly) {
        scannedImagePdfs.push(pdf.name);
        failedOcrItems.push({
          fileName: pdf.name,
          errorCode: 'scanned_image_only',
          reason: 'Seçilebilir dijital metin katmanı içermiyor (taranmış görsel/fotoğraf formatında).',
          actionRecommendation: 'Bu belge için "Taranmış Belge Görsel OCR" butonunu çalıştırabilir veya manuel eşleştirebilirsiniz.',
        });

        if (onProgress) {
          onProgress({
            current: processedCount,
            total,
            currentFileName: pdf.name,
            isScannedImage: true,
            scanType: 'digital_text',
            errors: scanErrors,
          });
        }
        return;
      }
    }

    if (textContent) {
      const candidateMatches = findAllCandidatesInPdfText(textContent, remainingStudents);

      if (candidateMatches.length === 1) {
        const found = candidateMatches[0];
        newlyMatched[found.student.id] = {
          pdf,
          student: found.student,
          score: found.score,
          reason: `PDF içi dijital metin katmanı okuması ile tespit edildi (${found.reason})`,
          hasConflict: false,
        };

        const sIdx = remainingStudents.findIndex((s) => s.id === found.student.id);
        if (sIdx !== -1) {
          remainingStudents.splice(sIdx, 1);
        }

        if (onProgress) {
          onProgress({
            current: processedCount,
            total,
            currentFileName: pdf.name,
            detectedStudentName: found.student.studentName,
            scanType: 'digital_text',
            errors: scanErrors,
          });
        }
      } else if (candidateMatches.length > 1) {
        // CONFLICT: Multiple candidate students in the same PDF!
        // Never auto-assign. Register conflict for each candidate.
        const candidateNames = candidateMatches.map((m) => m.student.studentName).join(', ');
        failedOcrItems.push({
          fileName: pdf.name,
          errorCode: 'conflict_ambiguous',
          reason: `PDF metninde birden fazla aday öğrenci ismi tespit edildi: ${candidateNames}`,
          actionRecommendation: 'Çakışma tespit edildiğinden otomatik eşleştirme yapılmadı. Manuel olarak atama yapınız.',
        });

        candidateMatches.forEach((match) => {
          newlyMatched[match.student.id] = {
            pdf,
            student: match.student,
            score: 60,
            reason: `Metin katmanında çakışan aday: ${candidateNames}`,
            hasConflict: true,
          };
        });
      } else {
        failedOcrItems.push({
          fileName: pdf.name,
          errorCode: 'no_candidate_match',
          reason: 'Dijital metin katmanı okundu ancak kayıtlı eksik öğrencilerle eşleşme bulunamadı.',
          actionRecommendation: 'Manuel atama yapabilir veya öğrenci adının yazılışını kontrol edebilirsiniz.',
        });
      }
    }
  });

  // CRITICAL SECURITY INVARIANT: Content-matched items NEVER become directly 'ready'
  // Status MUST be 'pending_confirmation' with needsConfirmation: true
  const updatedMatches = currentMatches.map((item) => {
    if (newlyMatched[item.student.id]) {
      const matchData = newlyMatched[item.student.id];
      const studentNamedPdf: LocalPdfFile = {
        ...matchData.pdf,
        originalName: matchData.pdf.originalName || matchData.pdf.name,
        name: `${item.student.studentName}.pdf`,
      };
      return {
        ...item,
        pdfFile: studentNamedPdf,
        status: 'pending_confirmation' as const, // Invariant: Content-text matches cannot be auto-dispatched
        needsConfirmation: true,
        hasConflict: matchData.hasConflict,
        matchMethod: 'text_extraction' as const,
        confidenceScore: matchData.score,
        matchReason: matchData.reason,
      };
    }
    return item;
  });

  return {
    updatedMatches,
    matchedCount: Object.keys(newlyMatched).filter((k) => !newlyMatched[k].hasConflict).length,
    scannedImagePdfs,
    failedOcrItems,
    errors: scanErrors,
    stats: {
      totalPdfs: unassignedPdfs.length,
      digitalMatched: Object.keys(newlyMatched).filter((k) => !newlyMatched[k].hasConflict).length,
      ocrMatched: 0,
      failedCount: failedOcrItems.length,
      durationMs: Date.now() - startTime,
    },
  };
}

/**
 * 2. METHOD B: Gerçek Görsel OCR Taraması (Taranmış / Resim Belgeler İçin Optik Karakter Tanıma)
 * Taranmış belgeleri multimodal OCR motoruna göndererek öğrenci adlarını tespit eder.
 * Şifreli, bozuk veya aşırı büyük dosyalar OCR FALLBACK'E ASLA GÖNDERİLMEZ.
 * GÜVENLİK DEĞİŞMEZİ: Eşleşen kayıtlar doğrudan ready YAPILMAZ; pending_confirmation olarak atanır!
 */
export async function performScannedPdfOcrMatching(
  currentMatches: MatchedItem[],
  allPdfs: LocalPdfFile[],
  targetPdfNames?: string[],
  onProgress?: (progress: PdfScanProgress) => void
): Promise<DeepScanResult> {
  const startTime = Date.now();
  const missingStudentItems = currentMatches.filter((item) => item.status === 'missing_pdf');
  if (missingStudentItems.length === 0) {
    return { updatedMatches: currentMatches, matchedCount: 0, scannedImagePdfs: [], failedOcrItems: [], errors: [] };
  }

  const assignedPdfNames = new Set(
    currentMatches.filter((i) => i.pdfFile !== null).map((i) => i.pdfFile!.name)
  );

  let unassignedPdfs = allPdfs.filter((pdf) => !assignedPdfNames.has(pdf.name));
  if (targetPdfNames && targetPdfNames.length > 0) {
    const targetSet = new Set(targetPdfNames);
    unassignedPdfs = unassignedPdfs.filter((pdf) => targetSet.has(pdf.name));
  }

  if (unassignedPdfs.length === 0) {
    return { updatedMatches: currentMatches, matchedCount: 0, scannedImagePdfs: [], failedOcrItems: [], errors: [] };
  }

  const remainingStudents = [...missingStudentItems.map((item) => item.student)];
  const newlyMatched: Record<
    string,
    { pdf: LocalPdfFile; student: Student; score: number; reason: string; hasConflict: boolean }
  > = {};
  const scanErrors: string[] = [];
  const scannedImagePdfs: string[] = [];
  const failedOcrItems: OcrFailureItem[] = [];

  let processedCount = 0;
  const total = unassignedPdfs.length;

  await processInParallelBatches(unassignedPdfs, PDF_PROCESSING_CONCURRENCY_LIMIT, async (pdf) => {
    processedCount++;

    if (onProgress) {
      onProgress({
        current: processedCount,
        total,
        currentFileName: pdf.name,
        scanType: 'visual_ocr',
        errors: scanErrors,
      });
    }

    if (!pdf.file) {
      failedOcrItems.push({
        fileName: pdf.name,
        errorCode: 'unreadable',
        reason: 'Dosya verisi hafızada mevcut değil.',
        actionRecommendation: 'Klasörü yeniden seçerek dosyaları yükleyin.',
      });
      return;
    }

    // Pre-check: Reject encrypted, corrupted, or oversized files before invoking OCR
    const precheck = await validatePdfBufferOrFile(pdf.file);
    if (!precheck.valid) {
      failedOcrItems.push({
        fileName: pdf.name,
        errorCode: precheck.errorCode,
        reason: precheck.errorReason || 'Dosya OCR işlemine uygun değil.',
        actionRecommendation:
          precheck.errorCode === 'encrypted'
            ? 'Şifreli PDF belgeleri güvenlik gereği OCR servisine gönderilemez. Şifresiz dosya kullanın.'
            : 'Dosyayı inceleyip yeniden yükleyin.',
      });
      return;
    }

    try {
      // 1. Try rendering first page to JPEG canvas image
      let imageBase64 = await renderPdfFirstPageToBase64(pdf.file);
      let pdfBase64: string | undefined = undefined;

      if (!imageBase64) {
        // Fallback: send full PDF base64 if canvas is unavailable (e.g. Node environment)
        pdfBase64 = await fileToBase64(pdf.file);
      }

      const studentCandidateNames = remainingStudents.map((s) => s.studentName);

      const ocrResponse = await requestVisualOcr({
        imageBase64: imageBase64 || undefined,
        pdfBase64: !imageBase64 ? pdfBase64 : undefined,
        studentCandidates: studentCandidateNames,
      });

      if (!ocrResponse.success || !ocrResponse.data) {
        scannedImagePdfs.push(pdf.name);
        failedOcrItems.push({
          fileName: pdf.name,
          errorCode: ocrResponse.errorCode || 'generic_error',
          reason: ocrResponse.error || 'Görsel OCR analizi yapılamadı veya servise ulaşılamadı.',
          actionRecommendation:
            ocrResponse.errorCode === 'ocr_unavailable'
              ? 'OCR servisi kapalı. Belgeleri "Ata / Değiştir" butonu ile manuel eşleştirebilirsiniz.'
              : 'Belgeyi manuel olarak atayabilirsiniz.',
        });
        return;
      }

      const ocrData = ocrResponse.data;
      scannedImagePdfs.push(pdf.name);

      // Evaluate candidate matches against all remaining students
      const candidateList: Student[] = [];

      // A. Check matchedStudentName returned by OCR
      if (ocrData.matchedStudentName) {
        const found = remainingStudents.find(
          (s) => normalizeForMatching(s.studentName) === normalizeForMatching(ocrData.matchedStudentName!)
        );
        if (found) candidateList.push(found);
      }

      // B. Cross-check detectedStudentName with candidate list
      if (ocrData.detectedStudentName) {
        const detectedMatches = findAllCandidatesInPdfText(ocrData.detectedStudentName, remainingStudents);
        detectedMatches.forEach((m) => {
          if (!candidateList.some((c) => c.id === m.student.id)) {
            candidateList.push(m.student);
          }
        });
      }

      // C. Cross-check extractedText fallback
      if (candidateList.length === 0 && ocrData.extractedText) {
        const textMatches = findAllCandidatesInPdfText(ocrData.extractedText, remainingStudents);
        textMatches.forEach((m) => {
          if (!candidateList.some((c) => c.id === m.student.id)) {
            candidateList.push(m.student);
          }
        });
      }

      if (candidateList.length === 1) {
        const matchedStudent = candidateList[0];
        newlyMatched[matchedStudent.id] = {
          pdf,
          student: matchedStudent,
          score: ocrData.confidence || 85,
          reason: `Taranmış belge Görsel OCR analizi ile tespit edildi (${ocrData.detectedStudentName || matchedStudent.studentName})`,
          hasConflict: false,
        };

        const sIndex = remainingStudents.findIndex((s) => s.id === matchedStudent.id);
        if (sIndex !== -1) {
          remainingStudents.splice(sIndex, 1);
        }

        if (onProgress) {
          onProgress({
            current: processedCount,
            total,
            currentFileName: pdf.name,
            detectedStudentName: matchedStudent.studentName,
            scanType: 'visual_ocr',
            errors: scanErrors,
          });
        }
      } else if (candidateList.length > 1) {
        // CONFLICT in OCR
        const candidateNames = candidateList.map((c) => c.studentName).join(', ');
        failedOcrItems.push({
          fileName: pdf.name,
          errorCode: 'conflict_ambiguous',
          reason: `Görsel OCR çıktısında birden fazla aday öğrenci eşleşti: ${candidateNames}`,
          actionRecommendation: 'Adaylar arasında çakışma olduğu için otomatik eşleşme yapılmadı. Manuel olarak atayınız.',
        });

        candidateList.forEach((cand) => {
          newlyMatched[cand.id] = {
            pdf,
            student: cand,
            score: 60,
            reason: `Görsel OCR çakışmalı aday: ${candidateNames}`,
            hasConflict: true,
          };
        });
      } else {
        // Scanned OCR failure for this specific file
        failedOcrItems.push({
          fileName: pdf.name,
          errorCode: 'no_candidate_match',
          reason: `Görsel OCR tamamlandı ancak belgeden okunan metin ("${ocrData.detectedStudentName || 'Öğrenci adı okunamadı'}") kayıtlı eksik öğrenci listesiyle eşleşmedi.`,
          actionRecommendation: '"Ata / Değiştir" butonuyla bu belgeyi ilgili öğrenciye manuel eşleştirin.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      scanErrors.push(`${pdf.name}: ${msg}`);
      failedOcrItems.push({
        fileName: pdf.name,
        errorCode: 'generic_error',
        reason: `OCR işlem hatası: ${msg}`,
        actionRecommendation: 'Belgeyi "Ata / Değiştir" butonuyla manuel olarak atayabilirsiniz.',
      });
    }
  });

  // CRITICAL SECURITY INVARIANT: Content-OCR matched items NEVER become directly 'ready'
  // Status MUST be 'pending_confirmation' with needsConfirmation: true
  const updatedMatches = currentMatches.map((item) => {
    if (newlyMatched[item.student.id]) {
      const matchData = newlyMatched[item.student.id];
      const studentNamedPdf: LocalPdfFile = {
        ...matchData.pdf,
        originalName: matchData.pdf.originalName || matchData.pdf.name,
        name: `${item.student.studentName}.pdf`,
      };
      return {
        ...item,
        pdfFile: studentNamedPdf,
        status: 'pending_confirmation' as const, // Invariant: Content-OCR matches cannot be auto-dispatched
        needsConfirmation: true,
        hasConflict: matchData.hasConflict,
        matchMethod: 'content_ocr' as const,
        confidenceScore: matchData.score,
        matchReason: matchData.reason,
      };
    }
    return item;
  });

  return {
    updatedMatches,
    matchedCount: Object.keys(newlyMatched).filter((k) => !newlyMatched[k].hasConflict).length,
    scannedImagePdfs,
    failedOcrItems,
    errors: scanErrors,
    stats: {
      totalPdfs: unassignedPdfs.length,
      digitalMatched: 0,
      ocrMatched: Object.keys(newlyMatched).filter((k) => !newlyMatched[k].hasConflict).length,
      failedCount: failedOcrItems.length,
      durationMs: Date.now() - startTime,
    },
  };
}

/**
 * 3. METHOD C: Güvenli Hibrit PDF Ayrıştırma Akışı (P1.3 Aşama 2)
 * Önce hızlı dijital metin katmanını dener; dijital metin yoksa veya yetersizse OCR fallback yapar.
 * Şifreli, bozuk ve aşırı büyük dosyaları OCR fallback'e göndermeden güvenle eler.
 */
export async function performHybridPdfScanMatching(
  currentMatches: MatchedItem[],
  allPdfs: LocalPdfFile[],
  onProgress?: (progress: PdfScanProgress) => void
): Promise<DeepScanResult> {
  const startTime = Date.now();

  // Step 1: Run digital text layer matching
  const digitalResult = await performDeepPdfContentMatching(currentMatches, allPdfs, onProgress);

  // If all files resolved or no scanned PDFs, return digital results
  if (digitalResult.scannedImagePdfs.length === 0) {
    const totalPdfs = allPdfs.length;
    const digitalMatched = digitalResult.matchedCount;
    const finalFailedCount = Math.max(0, totalPdfs - digitalMatched);
    return {
      ...digitalResult,
      stats: {
        totalPdfs,
        digitalMatched,
        ocrMatched: 0,
        failedCount: finalFailedCount,
        ocrFallbackCount: 0,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Step 2: Fallback to Visual OCR only for scanned/image-only PDFs
  const ocrResult = await performScannedPdfOcrMatching(
    digitalResult.updatedMatches,
    allPdfs,
    digitalResult.scannedImagePdfs,
    onProgress
  );

  const totalPdfs = allPdfs.length;
  const digitalMatched = digitalResult.matchedCount;
  const ocrMatched = ocrResult.matchedCount;
  // Final failed files are those that neither matched via digital text nor via OCR
  const finalFailedCount = Math.max(0, totalPdfs - (digitalMatched + ocrMatched));
  const ocrFallbackAttempts = digitalResult.scannedImagePdfs.length;

  return {
    updatedMatches: ocrResult.updatedMatches,
    matchedCount: digitalMatched + ocrMatched,
    scannedImagePdfs: digitalResult.scannedImagePdfs,
    failedOcrItems: [...digitalResult.failedOcrItems.filter((f) => f.errorCode !== 'scanned_image_only'), ...ocrResult.failedOcrItems],
    errors: [...digitalResult.errors, ...ocrResult.errors],
    stats: {
      totalPdfs,
      digitalMatched,
      ocrMatched,
      failedCount: finalFailedCount,
      ocrFallbackCount: ocrFallbackAttempts,
      durationMs: Date.now() - startTime,
    },
  };
}
