import { MatchedItem } from '../types/pdf';
import { isValidTurkishPhone } from './normalizer';
import { HistoryItem } from '../types/history';

export enum SafetyGateCode {
  ALLOWED = 'ALLOWED',
  MISSING_PDF = 'MISSING_PDF',
  MISSING_RECIPIENT = 'MISSING_RECIPIENT',
  INVALID_PHONE = 'INVALID_PHONE',
  INVALID_SCORE = 'INVALID_SCORE',
  LOW_MATCH_CONFIDENCE = 'LOW_MATCH_CONFIDENCE',
  AMBIGUOUS_MATCH = 'AMBIGUOUS_MATCH',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  MATCH_CHANGED_AFTER_APPROVAL = 'MATCH_CHANGED_AFTER_APPROVAL',
  ALREADY_SENT_OR_IN_PROGRESS = 'ALREADY_SENT_OR_IN_PROGRESS',
}

export interface SafetyGateDecision {
  allowed: boolean;
  code: SafetyGateCode;
  reason: string;
  details?: {
    confidenceScore?: number;
    hasConflict?: boolean;
    studentId?: string;
    studentName?: string;
    pdfName?: string;
    phone?: string;
    dispatchKey?: string;
  };
}

export interface SafetyGateOptions {
  examName?: string;
  sentStudentIds?: Set<string>;
  sentDispatchKeys?: Set<string>;
  inProgressStudentIds?: Set<string>;
  history?: HistoryItem[];
  preventDuplicateSends?: boolean;
}

/**
 * Computes a deterministic 64-bit hex hash from string content for synchronous integrity checks.
 */
export function computeQuickHash(content: string): string {
  if (!content) return '';
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Builds a composite dispatch key to track session deliveries without falsely blocking different exams.
 */
export function buildDispatchKey(studentId: string, examName?: string, pdfName?: string): string {
  return `${studentId}::${(examName || 'default').trim()}::${(pdfName || '').trim()}`;
}

/**
 * Vatsap V2 — Central Dispatch Safety Gate (P0-3A / P0-3A.1)
 * 
 * Verifies every dispatch item right before transmission to prevent:
 * 1. Sending reports to the wrong student / parent
 * 2. Dispatching unverified or ambiguous candidate matches
 * 3. Dispatching to invalid or missing phone numbers
 * 4. Duplicate deliveries within the same session or day
 * 5. Dispatching after assignment data or PDF content changed post-approval
 */
export function evaluateDispatchSafety(
  item: MatchedItem | null | undefined,
  options: SafetyGateOptions = {}
): SafetyGateDecision {
  // 1. Recipient & Student Integrity
  if (!item || !item.student || !item.student.id) {
    return {
      allowed: false,
      code: SafetyGateCode.MISSING_RECIPIENT,
      reason: 'Öğrenci kaydı veya alıcı bilgisi bulunamadı.',
    };
  }

  const { student, pdfFile } = item;
  const rawPhone = (student.phone || '').trim();

  if (!rawPhone) {
    return {
      allowed: false,
      code: SafetyGateCode.MISSING_RECIPIENT,
      reason: 'Alıcı veli telefon numarası tanımlı değil.',
      details: { studentId: student.id, studentName: student.studentName },
    };
  }

  if (!isValidTurkishPhone(rawPhone)) {
    return {
      allowed: false,
      code: SafetyGateCode.INVALID_PHONE,
      reason: 'Alıcı telefon numarası geçersiz formatta (+90 5XX XXX XX XX olmalıdır).',
      details: { studentId: student.id, phone: rawPhone },
    };
  }

  // 2. PDF Attachment Integrity
  if (!pdfFile || (!pdfFile.name && !pdfFile.originalName)) {
    return {
      allowed: false,
      code: SafetyGateCode.MISSING_PDF,
      reason: 'Öğrenciye atanmış geçerli bir PDF karne dosyası bulunamadı.',
      details: { studentId: student.id, studentName: student.studentName },
    };
  }

  const currentPdfIdentifier = pdfFile.originalName || pdfFile.name;

  // 3. Match Confidence Score Integrity
  const score = item.confidenceScore;
  if (
    score === undefined ||
    score === null ||
    typeof score !== 'number' ||
    Number.isNaN(score) ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    return {
      allowed: false,
      code: SafetyGateCode.INVALID_SCORE,
      reason: 'Eşleştirme skoru eksik veya geçersiz ölçekte (0-100 arasında olmalıdır).',
      details: { confidenceScore: score, studentId: student.id },
    };
  }

  // 4. Post-Approval Tamper / Change Detection
  if (item.userConfirmed) {
    const hasStudentIdChanged =
      Boolean(item.confirmedStudentId) &&
      item.confirmedStudentId !== student.id;

    const hasPdfChanged =
      Boolean(item.confirmedPdfName) &&
      item.confirmedPdfName !== currentPdfIdentifier;

    const hasPdfSizeChanged =
      item.confirmedPdfSize !== undefined &&
      pdfFile.size !== undefined &&
      item.confirmedPdfSize !== pdfFile.size;

    const hasPdfLastModifiedChanged =
      item.confirmedPdfLastModified !== undefined &&
      pdfFile.lastModified !== undefined &&
      item.confirmedPdfLastModified !== pdfFile.lastModified;

    const currentHash = pdfFile.hash || (pdfFile.base64 ? computeQuickHash(pdfFile.base64) : undefined);
    const hasPdfHashChanged =
      Boolean(item.confirmedPdfHash) &&
      Boolean(currentHash) &&
      item.confirmedPdfHash !== currentHash;

    const hasPhoneChanged =
      Boolean(item.confirmedStudentPhone) &&
      item.confirmedStudentPhone !== rawPhone;

    const hasStudentNameChanged =
      Boolean(item.confirmedStudentName) &&
      item.confirmedStudentName !== student.studentName;

    if (
      hasStudentIdChanged ||
      hasPdfChanged ||
      hasPdfSizeChanged ||
      hasPdfLastModifiedChanged ||
      hasPdfHashChanged ||
      hasPhoneChanged ||
      hasStudentNameChanged
    ) {
      return {
        allowed: false,
        code: SafetyGateCode.MATCH_CHANGED_AFTER_APPROVAL,
        reason: 'Eşleşme onaylandıktan sonra PDF içeriği, boyutu, tarihi veya öğrenci/veli bilgisi değişti. Tekrar açık onay gereklidir.',
        details: {
          studentId: student.id,
          studentName: student.studentName,
          pdfName: currentPdfIdentifier,
        },
      };
    }
  }

  // 5. Duplicate Send & In-Progress Prevention (Idempotency Guard)
  const dispatchKey = buildDispatchKey(student.id, options.examName, currentPdfIdentifier);

  if (
    options.inProgressStudentIds &&
    (options.inProgressStudentIds.has(dispatchKey) || options.inProgressStudentIds.has(student.id))
  ) {
    return {
      allowed: false,
      code: SafetyGateCode.ALREADY_SENT_OR_IN_PROGRESS,
      reason: 'Bu karne gönderimi şu anda kuyrukta işlenmektedir (Mükerrer gönderim engellendi).',
      details: { studentId: student.id, dispatchKey },
    };
  }

  const isSessionDuplicate =
    Boolean(options.sentDispatchKeys?.has(dispatchKey)) ||
    Boolean(options.sentStudentIds?.has(dispatchKey)) ||
    Boolean(options.sentStudentIds?.has(student.id) && !options.examName);

  if (isSessionDuplicate) {
    return {
      allowed: false,
      code: SafetyGateCode.ALREADY_SENT_OR_IN_PROGRESS,
      reason: 'Bu karne bu oturumda zaten başarıyla gönderildi.',
      details: { studentId: student.id, dispatchKey },
    };
  }

  if (options.preventDuplicateSends !== false && options.history && options.examName) {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const alreadySentToday = options.history.some(
      (h) =>
        (h.studentId === student.id || h.phone === rawPhone || h.studentName === student.studentName) &&
        h.status === 'success' &&
        h.examName === options.examName &&
        h.date.startsWith(todayPrefix)
    );

    if (alreadySentToday) {
      return {
        allowed: false,
        code: SafetyGateCode.ALREADY_SENT_OR_IN_PROGRESS,
        reason: `"${options.examName}" karnesi alıcıya bugün zaten başarıyla iletildi (Çift gönderim koruması).`,
        details: { studentId: student.id, phone: rawPhone, dispatchKey },
      };
    }
  }

  // 6. Matching Policy Rules (V2 Section 49 & Roadmap P0-3A)
  const isApproved = Boolean(item.userConfirmed);
  const isManuallyAssigned = Boolean(item.isManuallyAssigned || item.matchMethod === 'manual');
  const hasConflict = Boolean(item.hasConflict);

  // 6A. Candidate Ambiguity: Multiple students contending for the same PDF
  if (hasConflict) {
    if (!isApproved) {
      return {
        allowed: false,
        code: SafetyGateCode.AMBIGUOUS_MATCH,
        reason: 'Bu PDF için birden fazla aday öğrenci bulunmaktadır. Kullanıcı onayı olmadan otomatik gönderilemez.',
        details: { confidenceScore: score, hasConflict: true },
      };
    }
    // Even if approved, if score is below 85, require explicit manual assignment
    if (score < 85 && !isManuallyAssigned) {
      return {
        allowed: false,
        code: SafetyGateCode.AMBIGUOUS_MATCH,
        reason: 'Çakışmalı adaylarda güven skoru %85 altında olduğundan manuel eşleştirme yapılmalıdır.',
        details: { confidenceScore: score, hasConflict: true },
      };
    }
  }

  // 6B. Score < 70: Strictly blocked. Re-matching required.
  if (score < 70) {
    return {
      allowed: false,
      code: SafetyGateCode.LOW_MATCH_CONFIDENCE,
      reason: `Eşleştirme güven skoru (%${score}) kritik eşik olan %70'in altındadır. Yanlış karne gönderimini önlemek için yeniden eşleştirme yapılmalıdır.`,
      details: { confidenceScore: score },
    };
  }

  // 6C. Score 70–84: Manual match and explicit confirmation required
  if (score >= 70 && score < 85) {
    if (!isApproved || !isManuallyAssigned) {
      return {
        allowed: false,
        code: SafetyGateCode.APPROVAL_REQUIRED,
        reason: `Eşleştirme skoru %70–84 aralığındadır (%${score}). Bu aralıktaki karneler için manuel kontrol ve açık kullanıcı onayı zorunludur.`,
        details: { confidenceScore: score },
      };
    }
  }

  // 6D. Score 85–94: User confirmation required
  if (score >= 85 && score < 95) {
    if (!isApproved) {
      return {
        allowed: false,
        code: SafetyGateCode.APPROVAL_REQUIRED,
        reason: `Eşleştirme skoru %85–94 aralığındadır (%${score}). Gönderim öncesinde açık kullanıcı onayı gereklidir.`,
        details: { confidenceScore: score },
      };
    }
  }

  // 6E. Score >= 95: Single unambiguous candidate allowed automatically
  // (If it had a conflict, it was already handled by rule 6A)

  return {
    allowed: true,
    code: SafetyGateCode.ALLOWED,
    reason: 'Safety Gate doğrulamasından başarıyla geçti.',
    details: {
      confidenceScore: score,
      hasConflict,
      studentId: student.id,
      pdfName: currentPdfIdentifier,
    },
  };
}

/**
 * Evaluates an entire batch of items before queue submission.
 */
export function evaluateBatchDispatchSafety(
  items: MatchedItem[],
  options: SafetyGateOptions = {}
): {
  passed: MatchedItem[];
  rejected: Array<{ item: MatchedItem; decision: SafetyGateDecision }>;
} {
  const passed: MatchedItem[] = [];
  const rejected: Array<{ item: MatchedItem; decision: SafetyGateDecision }> = [];

  for (const item of items) {
    const decision = evaluateDispatchSafety(item, options);
    if (decision.allowed) {
      passed.push(item);
    } else {
      rejected.push({ item, decision });
    }
  }

  return { passed, rejected };
}
