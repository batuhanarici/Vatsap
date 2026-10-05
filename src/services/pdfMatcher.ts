import { Student } from '../types/student';
import { LocalPdfFile, MatchedItem, MatchingStatus } from '../types/pdf';
import { simplifyForComparison, isValidTurkishPhone } from './normalizer';

export interface MatchScoreResult {
  score: number;
  reason: string;
}

/**
 * Calculates a match confidence score between student name and PDF filename (0-100)
 */
export function calculateMatchScore(studentName: string, pdfFileName: string): MatchScoreResult {
  const cleanStudent = simplifyForComparison(studentName);
  const cleanFile = simplifyForComparison(pdfFileName);

  if (!cleanStudent || !cleanFile) {
    return { score: 0, reason: 'İsim veya dosya adı boş' };
  }

  // Exact match (e.g. "ahmet yilmaz" === "ahmet yilmaz")
  if (cleanStudent === cleanFile) {
    return { score: 100, reason: 'Tam İsim Eşleşmesi (%100)' };
  }

  // Starts with exact full student name (e.g. "ahmet yilmaz karne" starts with "ahmet yilmaz")
  if (cleanFile.startsWith(cleanStudent)) {
    return { score: 95, reason: 'İsimle Başlayan Dosya (%95)' };
  }

  // Contains exact full student name as a contiguous phrase
  if (cleanFile.includes(cleanStudent)) {
    return { score: 90, reason: 'İçinde Tam İsim Geçiyor (%90)' };
  }

  // Token-based matching: split names
  const studentTokens = cleanStudent.split(' ').filter((t) => t.length > 1);
  const fileTokens = cleanFile.split(' ').filter((t) => t.length > 1);

  if (studentTokens.length > 0) {
    // Check if every student name part exists in the file tokens
    const matchedCount = studentTokens.filter((st) =>
      fileTokens.some((ft) => ft === st || ft.includes(st))
    ).length;

    if (matchedCount === studentTokens.length) {
      return { score: 85, reason: 'Tüm İsim Parçaları Eşleşti (%85)' };
    }

    if (studentTokens.length >= 2 && matchedCount >= studentTokens.length - 1) {
      return { score: 60, reason: 'Kısmi İsim Eşleşmesi — Kontrol Önerilir (%60)' };
    }
  }

  return { score: 0, reason: 'Eşleşme Bulunamadı' };
}

/**
 * Two-pass 1:1 Greedy Matcher that avoids assigning the same PDF to multiple students
 */
export function matchStudentsWithPdfs(
  students: Student[],
  pdfFiles: LocalPdfFile[]
): MatchedItem[] {
  // Step 1: Filter active students
  const activeStudents = students.filter((s) => s.isActive !== false);

  // Step 2: Build all candidate pairs with scores >= 50
  interface Candidate {
    studentIndex: number;
    pdfIndex: number;
    score: number;
    reason: string;
  }

  const candidates: Candidate[] = [];
  const studentPdfScores: Map<string, number> = new Map(); // studentId -> bestScore

  activeStudents.forEach((student, sIdx) => {
    pdfFiles.forEach((pdf, pIdx) => {
      const { score, reason } = calculateMatchScore(student.studentName, pdf.name);
      if (score >= 50) {
        candidates.push({ studentIndex: sIdx, pdfIndex: pIdx, score, reason });
      }
    });
  });

  // Sort candidates by score descending so highest confidence pairs claim the PDF first
  candidates.sort((a, b) => b.score - a.score);

  const assignedStudentIndices = new Set<number>();
  const assignedPdfIndices = new Set<number>();
  const studentAssignments = new Map<number, { pdf: LocalPdfFile; score: number; reason: string }>();

  // Check for potential conflicts (multiple students contending for the same PDF)
  const pdfClaimants = new Map<number, number[]>(); // pdfIndex -> studentIndices[]
  for (const c of candidates) {
    const list = pdfClaimants.get(c.pdfIndex) || [];
    list.push(c.studentIndex);
    pdfClaimants.set(c.pdfIndex, list);
  }

  // 1:1 Greedy Assignment
  for (const c of candidates) {
    if (!assignedStudentIndices.has(c.studentIndex) && !assignedPdfIndices.has(c.pdfIndex)) {
      assignedStudentIndices.add(c.studentIndex);
      assignedPdfIndices.add(c.pdfIndex);
      studentAssignments.set(c.studentIndex, {
        pdf: pdfFiles[c.pdfIndex],
        score: c.score,
        reason: c.reason,
      });
    }
  }

  // Step 3: Produce final MatchedItem list
  return activeStudents.map((student, idx) => {
    const hasValidPhone = isValidTurkishPhone(student.phone);
    const assignment = studentAssignments.get(idx);

    if (!hasValidPhone) {
      return {
        id: student.id,
        student,
        pdfFile: assignment ? assignment.pdf : null,
        status: 'invalid_phone' as MatchingStatus,
        sendingStatus: 'idle',
        confidenceScore: assignment?.score || 0,
        matchReason: 'Geçersiz telefon formatı (+905XXXXXXXXX olmalı)',
        errorMessage: 'Geçersiz telefon numarası',
      };
    }

    if (assignment) {
      const pdf = assignment.pdf;
      const isLowConfidence = assignment.score < 70;
      const claimants = pdfClaimants.get(pdfFiles.indexOf(pdf)) || [];
      const hasConflict = claimants.length > 1;

      const studentNamedPdf: LocalPdfFile = {
        ...pdf,
        originalName: pdf.originalName || pdf.name,
        name: `${student.studentName}.pdf`,
      };

      return {
        id: student.id,
        student,
        pdfFile: studentNamedPdf,
        status: isLowConfidence ? ('pending_confirmation' as MatchingStatus) : ('ready' as MatchingStatus),
        sendingStatus: 'idle',
        matchMethod: 'filename',
        confidenceScore: assignment.score,
        matchReason: assignment.reason,
        hasConflict,
        needsConfirmation: isLowConfidence,
      };
    }

    return {
      id: student.id,
      student,
      pdfFile: null,
      status: 'missing_pdf' as MatchingStatus,
      sendingStatus: 'idle',
      confidenceScore: 0,
      matchReason: 'Uygun karne PDF dosyası bulunamadı',
      errorMessage: 'PDF bulunamadı',
    };
  });
}

/**
 * Converts a browser File to base64 string
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}
