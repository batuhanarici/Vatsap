import * as pdfjsLib from 'pdfjs-dist';
import { Student } from '../types/student';
import { LocalPdfFile, MatchedItem } from '../types/pdf';
import { normalizeForMatching } from './normalizer';

// Initialize PDF.js worker safely for Vite / Browser
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  // Use unpkg/cdnjs reliable CDN fallback for the PDF.js web worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

/**
 * Extracts all plain text content from a given File or ArrayBuffer using PDF.js
 * with a fast binary stream fallback.
 */
export async function extractTextFromPdf(input: File | ArrayBuffer): Promise<string> {
  let arrayBuffer: ArrayBuffer;

  if (input instanceof File) {
    arrayBuffer = await input.arrayBuffer();
  } else {
    arrayBuffer = input;
  }

  try {
    // 1. Primary method: PDF.js full DOM parsing
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      useSystemFonts: true,
    });

    const pdfDocument = await loadingTask.promise;
    const pageTexts: string[] = [];

    // Scan up to first 5 pages (report cards are usually 1-2 pages)
    const maxPages = Math.min(pdfDocument.numPages, 5);
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const textItems = textContent.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ');
      pageTexts.push(textItems);
    }

    const fullText = pageTexts.join('\n').trim();
    if (fullText.length > 0) {
      return fullText;
    }
  } catch (err) {
    console.warn('PDF.js text parsing encountered an issue, trying binary stream scan fallback:', err);
  }

  // 2. Fallback method: Direct regex scan for uncompressed text streams in raw PDF bytes
  try {
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawString = decoder.decode(bytes);

    // Look for text between parentheses in PDF text operators like (Student Name) Tj
    const matches = rawString.match(/\(([^()]{2,80})\)\s*T[jJ]/g);
    if (matches && matches.length > 0) {
      return matches
        .map((m) => m.replace(/^\(/, '').replace(/\)\s*T[jJ]$/, ''))
        .join(' ');
    }
  } catch (fallbackErr) {
    console.warn('Binary stream scan error:', fallbackErr);
  }

  return '';
}

export interface OcrScanProgress {
  current: number;
  total: number;
  currentFileName: string;
  detectedStudentName?: string;
}

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

/**
 * Performs deep OCR / Content Text analysis across all PDF files for unmatched students.
 */
export async function performDeepPdfContentMatching(
  currentMatches: MatchedItem[],
  allPdfs: LocalPdfFile[],
  onProgress?: (progress: OcrScanProgress) => void
): Promise<{
  updatedMatches: MatchedItem[];
  matchedCount: number;
}> {
  // Find which students are still missing a PDF
  const missingStudentItems = currentMatches.filter((item) => item.status === 'missing_pdf');
  if (missingStudentItems.length === 0) {
    return { updatedMatches: currentMatches, matchedCount: 0 };
  }

  // Find PDFs that are NOT yet assigned to any student
  const assignedPdfNames = new Set(
    currentMatches
      .filter((i) => i.pdfFile !== null)
      .map((i) => i.pdfFile!.name)
  );

  const unassignedPdfs = allPdfs.filter((pdf) => !assignedPdfNames.has(pdf.name));
  if (unassignedPdfs.length === 0) {
    return { updatedMatches: currentMatches, matchedCount: 0 };
  }

  const remainingStudents = missingStudentItems.map((item) => item.student);
  const newlyMatched: Record<string, { pdf: LocalPdfFile; student: Student }> = {};

  let current = 0;
  const total = unassignedPdfs.length;

  for (const pdf of unassignedPdfs) {
    current++;

    if (onProgress) {
      onProgress({
        current,
        total,
        currentFileName: pdf.name,
      });
    }

    let textContent = pdf.extractedText || '';

    // If text is not yet extracted and we have the File object
    if (!textContent && pdf.file) {
      try {
        textContent = await extractTextFromPdf(pdf.file);
        pdf.extractedText = textContent;
      } catch (err) {
        console.warn(`Failed to extract text from ${pdf.name}:`, err);
      }
    }

    // Check if any remaining missing student's name is in this PDF's content
    if (textContent) {
      const foundStudent = findStudentInPdfText(textContent, remainingStudents);
      if (foundStudent) {
        newlyMatched[foundStudent.id] = { pdf, student: foundStudent };

        // Remove from remaining students pool to avoid duplicate matching
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
          });
        }

        // Brief delay for smooth UI progress animation
        await new Promise((r) => setTimeout(r, 60));
      }
    }
  }

  // Update the matches table
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
        status: item.student.phone && item.student.phone.length >= 10 ? ('ready' as const) : ('invalid_phone' as const),
        matchMethod: 'content_ocr' as const,
      };
    }
    return item;
  });

  return {
    updatedMatches,
    matchedCount: Object.keys(newlyMatched).length,
  };
}
