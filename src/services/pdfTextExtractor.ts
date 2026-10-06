import * as pdfjsLib from 'pdfjs-dist';
import { Student } from '../types/student';
import { LocalPdfFile, MatchedItem } from '../types/pdf';
import { normalizeForMatching } from './normalizer';

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

/**
 * Extracts plain text content from a PDF with clear discrimination between
 * selectable digital text layers vs. scanned/image-only PDFs.
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
          'Bu belge taranmış/fotoğraf formatında (görüntü tabanlı) bir PDF’tir ve seçilebilir dijital metin katmanı içermemektedir. Görsel OCR (Optik Karakter Tanıma) desteklenmemektedir; lütfen orijinal metin katmanlı PDF yükleyin veya manuel eşleştirme kullanın.',
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

export interface PdfScanProgress {
  current: number;
  total: number;
  currentFileName: string;
  detectedStudentName?: string;
  isScannedImage?: boolean;
  errors?: string[];
}

// Backwards compatibility alias
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
  errors: string[];
}

/**
 * Performs deep content text analysis across PDF files for unmatched students,
 * accurately flagging scanned image-only files that require image OCR.
 */
export async function performDeepPdfContentMatching(
  currentMatches: MatchedItem[],
  allPdfs: LocalPdfFile[],
  onProgress?: (progress: PdfScanProgress) => void
): Promise<DeepScanResult> {
  const missingStudentItems = currentMatches.filter((item) => item.status === 'missing_pdf');
  if (missingStudentItems.length === 0) {
    return { updatedMatches: currentMatches, matchedCount: 0, scannedImagePdfs: [], errors: [] };
  }

  const assignedPdfNames = new Set(
    currentMatches.filter((i) => i.pdfFile !== null).map((i) => i.pdfFile!.name)
  );

  const unassignedPdfs = allPdfs.filter((pdf) => !assignedPdfNames.has(pdf.name));
  if (unassignedPdfs.length === 0) {
    return { updatedMatches: currentMatches, matchedCount: 0, scannedImagePdfs: [], errors: [] };
  }

  const remainingStudents = missingStudentItems.map((item) => item.student);
  const newlyMatched: Record<string, { pdf: LocalPdfFile; student: Student }> = {};
  const scanErrors: string[] = [];
  const scannedImagePdfs: string[] = [];

  let current = 0;
  const total = unassignedPdfs.length;

  for (const pdf of unassignedPdfs) {
    current++;

    if (onProgress) {
      onProgress({
        current,
        total,
        currentFileName: pdf.name,
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
          if (onProgress) {
            onProgress({
              current,
              total,
              currentFileName: pdf.name,
              isScannedImage: true,
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
        matchReason: 'PDF içi metin katmanı taraması ile tespit edildi',
      };
    }
    return item;
  });

  return {
    updatedMatches,
    matchedCount: Object.keys(newlyMatched).length,
    scannedImagePdfs,
    errors: scanErrors,
  };
}
