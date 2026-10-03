import { Student } from '../types/student';
import { LocalPdfFile, MatchedItem, MatchingStatus } from '../types/pdf';
import { simplifyForComparison, isValidTurkishPhone } from './normalizer';

/**
 * Checks if a PDF filename matches a student name with high confidence
 */
export function matchStudentToPdf(studentName: string, pdfFileName: string): number {
  const cleanStudent = simplifyForComparison(studentName);
  const cleanFile = simplifyForComparison(pdfFileName);

  // Exact match (e.g. "ahmet yilmaz" === "ahmet yilmaz")
  if (cleanStudent === cleanFile) {
    return 100;
  }

  // Exact start (e.g. "ahmet yilmaz karne" starts with "ahmet yilmaz")
  if (cleanFile.startsWith(cleanStudent)) {
    return 90;
  }

  // File contains student full name
  if (cleanFile.includes(cleanStudent)) {
    return 80;
  }

  // Word token matching: student has multiple words (e.g. ["ahmet", "yilmaz"])
  const studentTokens = cleanStudent.split(' ').filter(Boolean);
  const fileTokens = cleanFile.split(' ').filter(Boolean);

  if (studentTokens.length > 0) {
    const allTokensMatch = studentTokens.every(token => 
      fileTokens.some(ft => ft === token || ft.includes(token))
    );

    if (allTokensMatch) {
      return 70;
    }
  }

  return 0;
}

/**
 * Matches students with loaded PDF files
 */
export function matchStudentsWithPdfs(
  students: Student[],
  pdfFiles: LocalPdfFile[]
): MatchedItem[] {
  const matchedPdfs = new Set<string>();

  return students.map(student => {
    // 1. Phone validation
    const hasValidPhone = isValidTurkishPhone(student.phone);
    if (!hasValidPhone) {
      return {
        id: student.id,
        student,
        pdfFile: null,
        status: 'invalid_phone' as MatchingStatus,
        sendingStatus: 'idle',
        errorMessage: 'Geçersiz telefon numarası'
      };
    }

    // 2. Search for best matching PDF
    let bestPdf: LocalPdfFile | null = null;
    let bestScore = 0;

    for (const pdf of pdfFiles) {
      // Don't reuse already matched PDF if possible, but keep tracking
      const score = matchStudentToPdf(student.studentName, pdf.name);
      if (score > bestScore && score >= 70) {
        bestScore = score;
        bestPdf = pdf;
      }
    }

    if (bestPdf) {
      matchedPdfs.add(bestPdf.name);
      return {
        id: student.id,
        student,
        pdfFile: bestPdf,
        status: 'ready' as MatchingStatus,
        sendingStatus: 'idle'
      };
    }

    return {
      id: student.id,
      student,
      pdfFile: null,
      status: 'missing_pdf' as MatchingStatus,
      sendingStatus: 'idle',
      errorMessage: 'PDF bulunamadı'
    };
  });
}

/**
 * Converts a browser File to base64 string (without the data:application/pdf;base64, prefix)
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data url prefix if present
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}
