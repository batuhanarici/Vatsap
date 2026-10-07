import * as pdfjsLib from 'pdfjs-dist';
import { Student } from '../types/student';
import { LocalPdfFile, MatchedItem } from '../types/pdf';
import { normalizeForMatching } from './normalizer';
import { fileToBase64 } from './pdfMatcher';

// Initialize PDF.js worker safely for Vite / Browser
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export interface PdfTextExtractionResult {
  text: string;
  hasTextLayer: boolean;
  isScannedImageOnly: boolean;
  pageCount: number;
  unsupportedOcrReason?: string;
}

export interface OcrFailureItem {
  fileName: string;
  reason: string;
  actionRecommendation: string;
}

export interface ScannedPdfOcrResult {
  detectedStudentName?: string;
  matchedStudentName?: string | null;
  extractedText?: string;
  confidence?: number;
  isScanned?: boolean;
  notes?: string;
}

/**
 * Extracts selectable digital text layer from a PDF.
 * This is instant, offline and distinct from raster image OCR.
 */
export async function extractTextFromPdf(input: File | ArrayBuffer): Promise<PdfTextExtractionResult> {
  let arrayBuffer: ArrayBuffer;

  if (input instanceof File) {
    arrayBuffer = await input.arrayBuffer();
  } else {
    arrayBuffer = input;
  }

  let errorDetails: string | null = null;
  let pageCount = 0;

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      useSystemFonts: true,
    });

    const pdfDocument = await loadingTask.promise;
    pageCount = pdfDocument.numPages;
    const pageTexts: string[] = [];
    let totalItemsFound = 0;

    // Scan first 5 pages
    const maxPages = Math.min(pdfDocument.numPages, 5);
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      totalItemsFound += textContent.items.length;

      const textItems = textContent.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ');
      pageTexts.push(textItems);
    }

    const fullText = pageTexts.join('\n').trim();

    if (fullText.length > 0) {
      return {
        text: fullText,
        hasTextLayer: true,
        isScannedImageOnly: false,
        pageCount,
      };
    }

    // If zero selectable text items exist across pages, this is a scanned/image-only PDF
    if (totalItemsFound === 0) {
      return {
        text: '',
        hasTextLayer: false,
        isScannedImageOnly: true,
        pageCount,
        unsupportedOcrReason:
          'Bu belge taranmış/fotoğraf formatında (görüntü tabanlı) bir PDF’tir ve seçilebilir dijital metin katmanı içermemektedir. Görsel OCR (Optik Karakter Tanıma) gerektirir.',
      };
    }
  } catch (err) {
    errorDetails = err instanceof Error ? err.message : String(err);
  }

  // Fallback: search raw PDF binary string for uncompressed text streams
  try {
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawString = decoder.decode(bytes);

    const matches = rawString.match(/\(([^()]{2,80})\)\s*T[jJ]/g);
    if (matches && matches.length > 0) {
      const fallbackText = matches
        .map((m) => m.replace(/^\(/, '').replace(/\)\s*T[jJ]$/, ''))
        .join(' ')
        .trim();

      if (fallbackText) {
        return {
          text: fallbackText,
          hasTextLayer: true,
          isScannedImageOnly: false,
          pageCount,
        };
      }
    }
  } catch {
    // binary parse fallback
  }

  if (errorDetails) {
    throw new Error(`PDF metni okunamadı: ${errorDetails}`);
  }

  return {
    text: '',
    hasTextLayer: false,
    isScannedImageOnly: true,
    pageCount,
    unsupportedOcrReason:
      'PDF içinde seçilebilir metin katmanı bulunamadı (taranmış görsel olabilir).',
  };
}

/**
 * Renders the first page of a PDF file to a JPEG Base64 image using PDF.js and Canvas.
 */
export async function renderPdfFirstPageToBase64(input: File | ArrayBuffer): Promise<string | null> {
  try {
    let arrayBuffer: ArrayBuffer;
    if (input instanceof File) {
      arrayBuffer = await input.arrayBuffer();
    } else {
      arrayBuffer = input;
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    if (pdfDoc.numPages < 1) return null;

    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });

    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
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

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.split(',')[1] || null;
  } catch (err) {
    console.error('PDF sayfası resme dönüştürülemedi:', err);
    return null;
  }
}

/**
 * Calls server-side Gemini Vision OCR to analyze scanned PDFs.
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
}> {
  try {
    const res = await fetch('/api/ocr-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    return json;
  } catch (err) {
    return {
      success: false,
      isOcrAvailable: false,
      error: `OCR servisine ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface PdfScanProgress {
  current: number;
  total: number;
  currentFileName: string;
  detectedStudentName?: string;
  isScannedImage?: boolean;
  scanType?: 'digital_text' | 'visual_ocr';
  errors?: string[];
}

export type OcrScanProgress = PdfScanProgress;

/**
 * Searches the extracted PDF text to find matching student names.
 */
export function findStudentInPdfText(
  pdfText: string,
  unmatchedStudents: Student[]
): Student | null {
  if (!pdfText || pdfText.trim().length === 0) return null;

  const normalizedPdfText = normalizeForMatching(pdfText);

  for (const student of unmatchedStudents) {
    const normalizedStudentName = normalizeForMatching(student.studentName);

    // 1. Direct exact phrase match (e.g. "ahmet yilmaz")
    if (normalizedPdfText.includes(normalizedStudentName)) {
      return student;
    }

    // 2. Name parts match: Both first name and last name must exist in the text
    const nameParts = normalizedStudentName.split(' ').filter((p) => p.length >= 2);
    if (nameParts.length >= 2) {
      const allPartsExist = nameParts.every((part) => normalizedPdfText.includes(part));
      if (allPartsExist) {
        return student;
      }
    }
  }

  return null;
}

export interface DeepScanResult {
  updatedMatches: MatchedItem[];
  matchedCount: number;
  scannedImagePdfs: string[];
  failedOcrItems: OcrFailureItem[];
  errors: string[];
}

/**
 * 1. METHOD A: Hızlı PDF İçi Metin Katmanı Taraması (Dijital Metin Okuma)
 * Vektörel dijital metin katmanlarını hızlıca okur, taranmış fotoğrafları işaretler.
 */
export async function performDeepPdfContentMatching(
  currentMatches: MatchedItem[],
  allPdfs: LocalPdfFile[],
  onProgress?: (progress: PdfScanProgress) => void
): Promise<DeepScanResult> {
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

  const remainingStudents = missingStudentItems.map((item) => item.student);
  const newlyMatched: Record<string, { pdf: LocalPdfFile; student: Student }> = {};
  const scanErrors: string[] = [];
  const scannedImagePdfs: string[] = [];
  const failedOcrItems: OcrFailureItem[] = [];

  let current = 0;
  const total = unassignedPdfs.length;

  for (const pdf of unassignedPdfs) {
    current++;

    if (onProgress) {
      onProgress({
        current,
        total,
        currentFileName: pdf.name,
        scanType: 'digital_text',
        errors: scanErrors,
      });
    }

    let textContent = pdf.extractedText || '';

    if (!textContent && pdf.file) {
      try {
        const extraction = await extractTextFromPdf(pdf.file);
        textContent = extraction.text;
        pdf.extractedText = textContent;

        if (extraction.isScannedImageOnly) {
          scannedImagePdfs.push(pdf.name);
          failedOcrItems.push({
            fileName: pdf.name,
            reason: 'Seçilebilir dijital metin katmanı içermiyor (taranmış görsel/fotoğraf formatında).',
            actionRecommendation: 'Bu belge için "Taranmış Belge Görsel OCR" butonunu çalıştırabilir veya "Ata / Değiştir" butonuyla manuel eşleştirebilirsiniz.',
          });

          if (onProgress) {
            onProgress({
              current,
              total,
              currentFileName: pdf.name,
              isScannedImage: true,
              scanType: 'digital_text',
              errors: scanErrors,
            });
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        scanErrors.push(`${pdf.name}: ${msg}`);
      }
    }

    if (textContent) {
      const foundStudent = findStudentInPdfText(textContent, remainingStudents);
      if (foundStudent) {
        newlyMatched[foundStudent.id] = { pdf, student: foundStudent };

        const sIndex = remainingStudents.findIndex((s) => s.id === foundStudent.id);
        if (sIndex !== -1) {
          remainingStudents.splice(sIndex, 1);
        }

        if (onProgress) {
          onProgress({
            current,
            total,
            currentFileName: pdf.name,
            detectedStudentName: foundStudent.studentName,
            scanType: 'digital_text',
            errors: scanErrors,
          });
        }

        await new Promise((r) => setTimeout(r, 40));
      }
    }
  }

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
        status:
          item.student.phone && item.student.phone.length >= 10
            ? ('ready' as const)
            : ('invalid_phone' as const),
        matchMethod: 'text_extraction' as const,
        confidenceScore: 80,
        matchReason: 'PDF içi dijital metin katmanı okuması ile tespit edildi',
      };
    }
    return item;
  });

  return {
    updatedMatches,
    matchedCount: Object.keys(newlyMatched).length,
    scannedImagePdfs,
    failedOcrItems,
    errors: scanErrors,
  };
}

/**
 * 2. METHOD B: Gerçek Görsel OCR Taraması (Taranmış / Resim Belgeler İçin Optik Karakter Tanıma)
 * Taranmış belgeleri yapay zeka görsel OCR motoruna göndererek öğrenci adlarını tespit eder.
 */
export async function performScannedPdfOcrMatching(
  currentMatches: MatchedItem[],
  allPdfs: LocalPdfFile[],
  targetPdfNames?: string[],
  onProgress?: (progress: PdfScanProgress) => void
): Promise<DeepScanResult> {
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

  const remainingStudents = missingStudentItems.map((item) => item.student);
  const newlyMatched: Record<string, { pdf: LocalPdfFile; student: Student; score: number; reason: string }> = {};
  const scanErrors: string[] = [];
  const scannedImagePdfs: string[] = [];
  const failedOcrItems: OcrFailureItem[] = [];

  let current = 0;
  const total = unassignedPdfs.length;

  for (const pdf of unassignedPdfs) {
    current++;

    if (onProgress) {
      onProgress({
        current,
        total,
        currentFileName: pdf.name,
        scanType: 'visual_ocr',
        errors: scanErrors,
      });
    }

    if (!pdf.file) {
      failedOcrItems.push({
        fileName: pdf.name,
        reason: 'Dosya verisi hafızada mevcut değil.',
        actionRecommendation: 'Klasörü yeniden seçerek dosyaları yükleyin.',
      });
      continue;
    }

    try {
      // 1. Try rendering first page to JPEG canvas image
      let imageBase64 = await renderPdfFirstPageToBase64(pdf.file);
      let pdfBase64: string | undefined = undefined;

      if (!imageBase64) {
        // Fallback: send full PDF base64
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
          reason: ocrResponse.error || 'Görsel OCR analizi yapılamadı veya servise ulaşılamadı.',
          actionRecommendation: 'Bu taranmış belgeyi "Ata / Değiştir" butonuyla öğrenciye manuel olarak atayabilirsiniz.',
        });
        continue;
      }

      const ocrData = ocrResponse.data;
      scannedImagePdfs.push(pdf.name);

      let matchedStudent: Student | null = null;

      // Check matchedStudentName returned by OCR
      if (ocrData.matchedStudentName) {
        const found = remainingStudents.find(
          (s) => normalizeForMatching(s.studentName) === normalizeForMatching(ocrData.matchedStudentName!)
        );
        if (found) matchedStudent = found;
      }

      // Check detectedStudentName
      if (!matchedStudent && ocrData.detectedStudentName) {
        matchedStudent = findStudentInPdfText(ocrData.detectedStudentName, remainingStudents);
      }

      // Check extractedText fallback
      if (!matchedStudent && ocrData.extractedText) {
        matchedStudent = findStudentInPdfText(ocrData.extractedText, remainingStudents);
      }

      if (matchedStudent) {
        newlyMatched[matchedStudent.id] = {
          pdf,
          student: matchedStudent,
          score: ocrData.confidence || 85,
          reason: `Taranmış belge Görsel OCR analizi ile tespit edildi (${ocrData.detectedStudentName || matchedStudent.studentName})`,
        };

        const sIndex = remainingStudents.findIndex((s) => s.id === matchedStudent!.id);
        if (sIndex !== -1) {
          remainingStudents.splice(sIndex, 1);
        }

        if (onProgress) {
          onProgress({
            current,
            total,
            currentFileName: pdf.name,
            detectedStudentName: matchedStudent.studentName,
            scanType: 'visual_ocr',
            errors: scanErrors,
          });
        }
      } else {
        // Scanned OCR failure for this specific file
        failedOcrItems.push({
          fileName: pdf.name,
          reason: `Görsel OCR tamamlandı ancak belgeden okunan metin ("${ocrData.detectedStudentName || 'Öğrenci adı okunamadı'}") hiçbir eksik öğrenciyle eşleşmedi.`,
          actionRecommendation: '"Ata / Değiştir" butonuyla bu belgeyi ilgili öğrenciye manuel eşleştirin.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      scanErrors.push(`${pdf.name}: ${msg}`);
      failedOcrItems.push({
        fileName: pdf.name,
        reason: `OCR işlem hatası: ${msg}`,
        actionRecommendation: 'Belgeyi "Ata / Değiştir" butonuyla manuel olarak atayabilirsiniz.',
      });
    }
  }

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
        status:
          item.student.phone && item.student.phone.length >= 10
            ? ('ready' as const)
            : ('invalid_phone' as const),
        matchMethod: 'content_ocr' as const,
        confidenceScore: matchData.score,
        matchReason: matchData.reason,
      };
    }
    return item;
  });

  return {
    updatedMatches,
    matchedCount: Object.keys(newlyMatched).length,
    scannedImagePdfs,
    failedOcrItems,
    errors: scanErrors,
  };
}
