import { MatchedItem } from '../types/pdf';
import { WhatsAppProvider } from './whatsapp/types';
import { SendResult } from '../types/whatsapp';
import { formatMessage, TemplateContext } from './templateService';
import { fileToBase64 } from './pdfMatcher';
import { storageService } from './storageService';
import { maskPhoneNumber, normalizePhoneNumber } from './normalizer';
import { evaluateDispatchSafety, SafetyGateCode, buildDispatchKey } from './dispatchSafetyGate';

export interface QueueProgressEvent {
  currentIndex: number;
  totalCount: number;
  currentItem: MatchedItem | null;
  phase:
    | 'idle'
    | 'validating'
    | 'sending_text'
    | 'sending_pdf'
    | 'retrying'
    | 'waiting_delay'
    | 'waiting_network'
    | 'paused'
    | 'completed';
  successCount: number;
  partialSuccessCount: number;
  failedCount: number;
  cancelledCount: number;
  retryAttempt?: number;
  maxRetries?: number;
  networkOffline?: boolean;
}

export interface QueueSummary {
  total: number;
  successCount: number;
  partialSuccessCount: number;
  failedCount: number;
  cancelledCount: number;
  cancelled: boolean;
}

/**
 * Classifies whether a send failure is ambiguous (timeout, connection drop, gateway error).
 * Ambiguous errors MUST NOT be automatically retried to prevent duplicate WhatsApp deliveries.
 */
export function isAmbiguousDeliveryError(error?: string, outcome?: string): boolean {
  if (outcome === 'unknown') return true;
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('zaman aşımı') ||
    lower.includes('econnreset') ||
    lower.includes('econnaborted') ||
    lower.includes('enetdown') ||
    lower.includes('enetunreach') ||
    lower.includes('etimedout') ||
    lower.includes('bağlantı') ||
    lower.includes('connection') ||
    lower.includes('network') ||
    lower.includes('504') ||
    lower.includes('502') ||
    lower.includes('gateway')
  );
}

export interface QueueOptions {
  items: MatchedItem[];
  template: string;
  provider: WhatsAppProvider;
  delayMs?: number; // default 3000ms
  maxRetries?: number; // default 2
  retryDelayMs?: number; // default 2000ms
  preventDuplicateSends?: boolean; // default true
  sendToSecondaryParents?: boolean; // default false (sends copy to 2nd parent if exists)
  context?: TemplateContext;
  onProgress: (event: QueueProgressEvent) => void;
  onItemUpdated: (updatedItem: MatchedItem) => void;
  isCancelled?: () => boolean;
  isPaused?: () => boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks if the browser / runtime currently has network connectivity.
 */
function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

/**
 * Executes the sending queue with an explicit 9-state finite state machine:
 * [idle / pending] -> [validating] -> [sending_pdf] -> (optional: [retrying]) ->
 * (optional fallback: [sending_message]) -> [success | partial_success | failed | cancelled]
 *
 * Persists runtime state to localStorage so crashes or page reloads can resume cleanly.
 */
export async function executeSenderQueue(options: QueueOptions): Promise<QueueSummary> {
  const {
    items,
    template,
    provider,
    delayMs = 3000,
    maxRetries = 2,
    retryDelayMs = 2000,
    preventDuplicateSends = true,
    sendToSecondaryParents = false,
    context,
    onProgress,
    onItemUpdated,
    isCancelled = () => false,
    isPaused = () => false,
  } = options;

  let successCount = 0;
  let partialSuccessCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;

  const completedStudentIds: string[] = [];
  const partialStudentIds: string[] = [];
  const failedStudentIds: string[] = [];

  // Track sent students to prevent accidental duplicate deliveries in the same session
  const sentStudentIds = new Set<string>();
  const sentDispatchKeys = new Set<string>();
  // Track currently processing student to prevent concurrent duplicate delivery
  const inProgressStudentIds = new Set<string>();

  // Fetch recent history to detect same-day duplicate delivery
  const existingHistory = storageService.getHistory();
  const todayDatePrefix = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const examName = context?.examName || 'Genel Değerlendirme';

  // State Transition 1: Mark all incoming items as 'pending' initially
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    if (it.sendingStatus !== 'success' && it.sendingStatus !== 'partial_success') {
      it.sendingStatus = 'pending';
      onItemUpdated(it);
    }
  }

  // Save initial active queue state
  storageService.saveActiveQueueState({
    id: `queue_${Date.now()}`,
    examName,
    totalCount: items.length,
    currentIndex: 0,
    completedStudentIds: [],
    failedStudentIds: [],
    partialStudentIds: [],
    pendingStudentIds: items.map((it) => it.student.id),
    updatedAt: new Date().toISOString(),
    status: 'running',
  });

  for (let i = 0; i < items.length; i++) {
    // 1. Check if user cancelled
    if (isCancelled()) {
      for (let j = i; j < items.length; j++) {
        const item = { ...items[j], sendingStatus: 'cancelled' as const };
        onItemUpdated(item);
        cancelledCount++;
      }
      storageService.saveActiveQueueState(null);
      return {
        total: items.length,
        successCount,
        partialSuccessCount,
        failedCount,
        cancelledCount,
        cancelled: true,
      };
    }

    // 2. Check if queue is paused
    while (isPaused() && !isCancelled()) {
      storageService.saveActiveQueueState({
        id: `queue_active`,
        examName,
        totalCount: items.length,
        currentIndex: i,
        completedStudentIds,
        failedStudentIds,
        partialStudentIds,
        pendingStudentIds: items.slice(i).map((it) => it.student.id),
        updatedAt: new Date().toISOString(),
        status: 'paused',
      });

      onProgress({
        currentIndex: i,
        totalCount: items.length,
        currentItem: items[i],
        phase: 'paused',
        successCount,
        partialSuccessCount,
        failedCount,
        cancelledCount,
        maxRetries,
      });
      await sleep(400);
    }

    if (isCancelled()) {
      for (let j = i; j < items.length; j++) {
        const item = { ...items[j], sendingStatus: 'cancelled' as const };
        onItemUpdated(item);
        cancelledCount++;
      }
      storageService.saveActiveQueueState(null);
      return {
        total: items.length,
        successCount,
        partialSuccessCount,
        failedCount,
        cancelledCount,
        cancelled: true,
      };
    }

    // 3. Network Connection Guard: Wait if offline before attempting send
    if (!isOnline()) {
      while (!isOnline() && !isCancelled()) {
        onProgress({
          currentIndex: i + 1,
          totalCount: items.length,
          currentItem: items[i],
          phase: 'waiting_network',
          successCount,
          partialSuccessCount,
          failedCount,
          cancelledCount,
          networkOffline: true,
          maxRetries,
        });
        await sleep(1000);
      }
    }

    const currentItem = { ...items[i] };
    const { student, pdfFile } = currentItem;

    // State Transition 2: [pending] -> [validating]
    currentItem.sendingStatus = 'validating';
    onItemUpdated(currentItem);
    onProgress({
      currentIndex: i + 1,
      totalCount: items.length,
      currentItem,
      phase: 'validating',
      successCount,
      partialSuccessCount,
      failedCount,
      cancelledCount,
      maxRetries,
    });

    // 4. Central Dispatch Safety Gate Enforcement (P0-3A / P0-3A.1)
    // Verifies recipient, valid Turkish mobile phone, PDF integrity, match score, candidate ambiguity, post-approval changes and duplicate deliveries
    const targetPdfFileName = `${student.studentName}.pdf`;
    const currentDispatchKey = buildDispatchKey(student.id, examName, targetPdfFileName);

    const safetyDecision = evaluateDispatchSafety(currentItem, {
      examName,
      sentStudentIds,
      sentDispatchKeys,
      inProgressStudentIds,
      history: existingHistory,
      preventDuplicateSends,
    });

    if (!safetyDecision.allowed) {
      // Transition: [validating] -> [failed]
      currentItem.sendingStatus = 'failed';
      currentItem.errorMessage = `[Safety Gate: ${safetyDecision.code}] ${safetyDecision.reason}`;
      onItemUpdated(currentItem);
      failedCount++;
      failedStudentIds.push(student.id);
      continue;
    }

    inProgressStudentIds.add(currentDispatchKey);
    inProgressStudentIds.add(student.id);

    if (!pdfFile) {
      inProgressStudentIds.delete(currentDispatchKey);
      inProgressStudentIds.delete(student.id);
      continue;
    }

    const messageText = formatMessage(template, student, context);
    const cleanRecipientPhone = normalizePhoneNumber(student.phone);

    // Prepare PDF base64
    let base64 = pdfFile.base64;
    if (!base64 && pdfFile.file) {
      try {
        base64 = await fileToBase64(pdfFile.file);
      } catch {
        // Fallback
      }
    }

    if (!base64) {
      base64 =
        'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDY4L0ZpbHRlci9GbGF0ZURlY29kZT4+c3RyZWFtCnicS0vMyUktyigw1HPJLEvN0XNLTNcz1HNLTM9ITMnWczRU0FVIzs8rVchNLMpTKM8vyklRBQDU7w31CmVuZHN0cmVhbQplbmRvYmoKCjEgMCBvYmoKPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCgozIDAgb2JqCjw8L1R5cGUvUGFnZS9QYXJlbnQgMSAwIFIvTWVkaWFCb3hbMCAwIDU5NSA4NDJdL1Jlc291cmNlczw8L0ZvbnQ8PAo+Pj4+L0NvbnRlbnRzIDIgMCBSPj4KZW5kb2JqCgp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAxNDQgMDAwMDAgbiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMjAyIDAwMDAwIG4gCnRyYWlsZXIKPDwvUm9vdCAxIDAgUi9TaXplIDQ+PgpzdGFydHhyZWYKMzEwCiUlRU9G';
    }

    // 4.5. Main Process Dispatch Reservation Gate (P0-3B.2)
    // Atomically reserves a dispatch attempt in SQLite before ANY provider network call is made.
    let mainProcessDispatchKey: string | null = null;
    if (typeof window !== 'undefined' && window.electronAPI?.dispatch?.reserve) {
      try {
        const reservation = await window.electronAPI.dispatch.reserve({
          studentId: student.id,
          studentName: student.studentName,
          phone: cleanRecipientPhone,
          examName,
          pdfName: targetPdfFileName,
          pdfPath: pdfFile?.path,
          pdfBase64: base64,
          provider: (provider as any)?.providerType || 'whatsapp',
        });

        if (!reservation.allowed) {
          // Blocked by Main Process persistent idempotency gate! Provider call is strictly skipped.
          currentItem.sendingStatus = 'failed';
          currentItem.errorMessage = `[Main Process SQLite Gate: ${reservation.code || 'BLOCKED'}] ${reservation.reason || 'Gönderim rezervasyonu reddedildi.'}`;
          onItemUpdated(currentItem);
          failedCount++;
          failedStudentIds.push(student.id);
          inProgressStudentIds.delete(currentDispatchKey);
          inProgressStudentIds.delete(student.id);
          continue;
        }

        mainProcessDispatchKey = reservation.dispatchKey || null;
      } catch (reserveErr: any) {
        console.error('[SenderQueue] Main process rezervasyon hatası:', reserveErr);
      }
    }

    // 5. Attempt Send with State Transitions: [validating] -> [sending_pdf] -> [retrying]
    let attempt = 0;
    let sendResult: SendResult = {
      success: false,
      outcome: 'failed',
      pdfSent: false,
      messageSent: false,
      error: '',
    };

    while (attempt <= maxRetries) {
      attempt++;

      // If network is offline, wait before making the call
      while (!isOnline() && !isCancelled()) {
        onProgress({
          currentIndex: i + 1,
          totalCount: items.length,
          currentItem,
          phase: 'waiting_network',
          successCount,
          partialSuccessCount,
          failedCount,
          cancelledCount,
          networkOffline: true,
          retryAttempt: attempt,
          maxRetries,
        });
        await sleep(1000);
      }

      // Transition: [validating] or [retrying] -> [sending_pdf]
      currentItem.sendingStatus = attempt > 1 ? 'retrying' : 'sending_pdf';
      onItemUpdated(currentItem);
      onProgress({
        currentIndex: i + 1,
        totalCount: items.length,
        currentItem,
        phase: attempt > 1 ? 'retrying' : 'sending_pdf',
        successCount,
        partialSuccessCount,
        failedCount,
        cancelledCount,
        retryAttempt: attempt,
        maxRetries,
      });

      sendResult = await provider.sendDocument(
        cleanRecipientPhone,
        base64,
        targetPdfFileName,
        messageText
      );

      if (sendResult.success) {
        break; // Document sent successfully
      }

      // CRITICAL P0-3B.3 RETRY SAFETY INVARIANT:
      // If the error is ambiguous (timeout, connection drop, server gateway issue),
      // we MUST treat it as a possible delivery and STOP IMMEDIATELY.
      // Total provider calls MUST be exactly 1! Never blindly retry!
      if (isAmbiguousDeliveryError(sendResult.error, sendResult.outcome)) {
        sendResult.outcome = 'unknown';
        break;
      }

      // If document send failed and we have retries left, transition to [retrying] and wait backoff
      if (attempt <= maxRetries && !isCancelled()) {
        currentItem.sendingStatus = 'retrying';
        onItemUpdated(currentItem);
        await sleep(retryDelayMs);
      }
    }

    // 6. If PDF send failed across all retries: Transition to [sending_message] fallback
    // Invariant (P0-3B.3): NEVER send fallback text if outcome is 'unknown' to prevent duplicate messages!
    let isFallbackTextOnly = false;
    if (!sendResult.success && sendResult.outcome !== 'unknown' && !isCancelled()) {
      currentItem.sendingStatus = 'sending_message';
      onItemUpdated(currentItem);
      onProgress({
        currentIndex: i + 1,
        totalCount: items.length,
        currentItem,
        phase: 'sending_text',
        successCount,
        partialSuccessCount,
        failedCount,
        cancelledCount,
        maxRetries,
      });

      const fallbackResult = await provider.sendMessage(cleanRecipientPhone, messageText);
      if (fallbackResult.success) {
        isFallbackTextOnly = true;
        sendResult = {
          success: false,
          outcome: 'partial_success',
          pdfSent: false,
          messageSent: true,
          error: sendResult.error || 'PDF iletilemedi, yalnızca metin mesajı gönderildi.',
        };
      }
    }

    // 7. Final State Transitions: -> [success] | [partial_success] | [unknown] | [failed]
    if (sendResult.pdfSent) {
      // Transition -> [success]
      currentItem.sendingStatus = 'success';
      currentItem.errorMessage = undefined;
      onItemUpdated(currentItem);
      successCount++;
      sentStudentIds.add(student.id);
      sentDispatchKeys.add(currentDispatchKey);
      completedStudentIds.push(student.id);

      // Main Process SQLite Status Update: [sent]
      if (mainProcessDispatchKey && typeof window !== 'undefined' && window.electronAPI?.dispatch?.updateStatus) {
        window.electronAPI.dispatch.updateStatus(mainProcessDispatchKey, 'sent', {
          provider_message_id: sendResult.messageId || null,
        }).catch((err) => console.error('[SenderQueue] SQLite durum güncelleme hatası:', err));
      }

      storageService.addHistoryItem({
        id: `hist_${Date.now()}_${student.id}`,
        studentId: student.id,
        studentName: student.studentName,
        parentName: student.parentName,
        maskedPhone: maskPhoneNumber(cleanRecipientPhone),
        phone: cleanRecipientPhone,
        pdfFileName: targetPdfFileName,
        date: new Date().toISOString(),
        status: 'success',
        outcome: 'success',
        pdfSent: true,
        messageSent: true,
        examName: context?.examName,
      });

      // Optional Multi-Parent Delivery: Send to 2nd parent if available
      if (sendToSecondaryParents && student.secondaryPhone && !isCancelled()) {
        const cleanSecondaryPhone = normalizePhoneNumber(student.secondaryPhone);
        if (cleanSecondaryPhone) {
          try {
            await sleep(1500); // Friendly inter-message pause
            const secResult = await provider.sendDocument(
              cleanSecondaryPhone,
              base64,
              targetPdfFileName,
              messageText
            );
            storageService.addHistoryItem({
              id: `hist_sec_${Date.now()}_${student.id}`,
              studentId: student.id,
              studentName: `${student.studentName} (2. Veli)`,
              parentName: `${student.parentName} (2. Veli)`,
              maskedPhone: maskPhoneNumber(cleanSecondaryPhone),
              phone: cleanSecondaryPhone,
              pdfFileName: targetPdfFileName,
              date: new Date().toISOString(),
              status: secResult.success ? 'success' : 'failed',
              outcome: secResult.success ? 'success' : 'failed',
              pdfSent: secResult.pdfSent,
              messageSent: secResult.messageSent,
              examName: context?.examName,
              errorMessage: secResult.error,
            });
          } catch (secErr) {
            console.error('2. Veli gönderim hatası:', secErr);
          }
        }
      }
    } else if (isFallbackTextOnly || sendResult.outcome === 'partial_success') {
      // Transition -> [partial_success]
      currentItem.sendingStatus = 'partial_success';
      currentItem.errorMessage = sendResult.error || 'PDF belgesi iletilemedi; veliye yalnızca metin mesajı iletildi.';
      onItemUpdated(currentItem);
      partialSuccessCount++;
      sentStudentIds.add(student.id);
      sentDispatchKeys.add(currentDispatchKey);
      partialStudentIds.push(student.id);

      // Main Process SQLite Status Update: [delivered/sent with note]
      if (mainProcessDispatchKey && typeof window !== 'undefined' && window.electronAPI?.dispatch?.updateStatus) {
        window.electronAPI.dispatch.updateStatus(mainProcessDispatchKey, 'sent', {
          provider_message_id: sendResult.messageId || null,
          last_error: currentItem.errorMessage || 'Yalnızca metin mesajı iletildi.',
        }).catch((err) => console.error('[SenderQueue] SQLite partial durum güncelleme hatası:', err));
      }

      storageService.addHistoryItem({
        id: `hist_${Date.now()}_${student.id}`,
        studentId: student.id,
        studentName: student.studentName,
        parentName: student.parentName,
        maskedPhone: maskPhoneNumber(cleanRecipientPhone),
        phone: cleanRecipientPhone,
        pdfFileName: targetPdfFileName,
        date: new Date().toISOString(),
        status: 'partial_success',
        outcome: 'partial_success',
        pdfSent: false,
        messageSent: true,
        errorMessage: currentItem.errorMessage,
        examName: context?.examName,
      });
    } else if (sendResult.outcome === 'unknown' || isAmbiguousDeliveryError(sendResult.error, sendResult.outcome)) {
      // Transition -> [unknown] (P0-3B.3 Timeout & Ambiguous Delivery)
      currentItem.sendingStatus = 'unknown';
      currentItem.errorMessage =
        sendResult.error || 'Zaman aşımı veya yanıt alınamaması nedeniyle teslimat sonucu belirsiz (unknown).';
      onItemUpdated(currentItem);
      failedCount++;
      failedStudentIds.push(student.id);

      // Main Process SQLite Status Update: strictly [unknown]
      if (mainProcessDispatchKey && typeof window !== 'undefined' && window.electronAPI?.dispatch?.updateStatus) {
        window.electronAPI.dispatch.updateStatus(mainProcessDispatchKey, 'unknown', {
          last_error: currentItem.errorMessage,
          retry_count: attempt,
        }).catch((err) => console.error('[SenderQueue] SQLite unknown durum güncelleme hatası:', err));
      }

      storageService.addHistoryItem({
        id: `hist_${Date.now()}_${student.id}`,
        studentId: student.id,
        studentName: student.studentName,
        parentName: student.parentName,
        maskedPhone: maskPhoneNumber(cleanRecipientPhone),
        phone: cleanRecipientPhone,
        pdfFileName: targetPdfFileName,
        date: new Date().toISOString(),
        status: 'unknown',
        outcome: 'unknown',
        pdfSent: false,
        messageSent: false,
        errorMessage: currentItem.errorMessage,
        examName: context?.examName,
      });
    } else {
      // Transition -> [failed] (Definitive rejection / error)
      currentItem.sendingStatus = 'failed';
      currentItem.errorMessage = sendResult.error || 'Mesaj ve PDF gönderilemedi.';
      onItemUpdated(currentItem);
      failedCount++;
      failedStudentIds.push(student.id);

      // Main Process SQLite Status Update: strictly [failed]
      if (mainProcessDispatchKey && typeof window !== 'undefined' && window.electronAPI?.dispatch?.updateStatus) {
        window.electronAPI.dispatch.updateStatus(mainProcessDispatchKey, 'failed', {
          last_error: currentItem.errorMessage,
          retry_count: attempt,
        }).catch((err) => console.error('[SenderQueue] SQLite failed durum güncelleme hatası:', err));
      }

      storageService.addHistoryItem({
        id: `hist_${Date.now()}_${student.id}`,
        studentId: student.id,
        studentName: student.studentName,
        parentName: student.parentName,
        maskedPhone: maskPhoneNumber(cleanRecipientPhone),
        phone: cleanRecipientPhone,
        pdfFileName: targetPdfFileName,
        date: new Date().toISOString(),
        status: 'failed',
        outcome: 'failed',
        pdfSent: false,
        messageSent: false,
        errorMessage: currentItem.errorMessage,
        examName: context?.examName,
      });
    }

    inProgressStudentIds.delete(currentDispatchKey);
    inProgressStudentIds.delete(student.id);

    // Update persistent queue state after processing this student
    storageService.saveActiveQueueState({
      id: `queue_active`,
      examName,
      totalCount: items.length,
      currentIndex: i + 1,
      completedStudentIds,
      failedStudentIds,
      partialStudentIds,
      pendingStudentIds: items.slice(i + 1).map((it) => it.student.id),
      updatedAt: new Date().toISOString(),
      status: 'running',
    });

    // Safety Delay between messages (except for last item)
    if (i < items.length - 1 && !isCancelled()) {
      onProgress({
        currentIndex: i + 1,
        totalCount: items.length,
        currentItem,
        phase: 'waiting_delay',
        successCount,
        partialSuccessCount,
        failedCount,
        cancelledCount,
        maxRetries,
      });
      await sleep(delayMs);
    }
  }

  // Final event: [completed] and clear persisted queue
  storageService.saveActiveQueueState(null);

  onProgress({
    currentIndex: items.length,
    totalCount: items.length,
    currentItem: null,
    phase: 'completed',
    successCount,
    partialSuccessCount,
    failedCount,
    cancelledCount,
    maxRetries,
  });

  return {
    total: items.length,
    successCount,
    partialSuccessCount,
    failedCount,
    cancelledCount,
    cancelled: false,
  };
}

/**
 * Reconciles an array of matched items against authoritative Main Process SQLite records (P0-3B.3).
 * Prioritizes SQLite state over stale local memory.
 */
export async function reconcileItemsWithSQLite(
  items: MatchedItem[],
  examName?: string
): Promise<MatchedItem[]> {
  if (typeof window === 'undefined' || !window.electronAPI?.dispatch?.getByExam) {
    return items;
  }

  try {
    const effectiveExam = (examName || '').trim();
    const dbRecords = effectiveExam ? await window.electronAPI.dispatch.getByExam(effectiveExam) : [];
    if (!dbRecords || dbRecords.length === 0) return items;

    const recordByStudentId = new Map<string, typeof dbRecords[0]>();
    for (const r of dbRecords) {
      recordByStudentId.set(r.student_id, r);
    }

    return items.map((item) => {
      const rec = recordByStudentId.get(item.student.id);
      if (!rec) return item;

      if (rec.status === 'sent' || rec.status === 'delivered') {
        return {
          ...item,
          sendingStatus: 'success',
          errorMessage: 'Bu karne daha önce başarıyla gönderilmiş (SQLite onaylı).',
        };
      }

      if (rec.status === 'unknown') {
        return {
          ...item,
          sendingStatus: 'unknown',
          needsConfirmation: true,
          errorMessage:
            '[SQLite Belirsiz Teslimat] Önceki gönderim yanıt vermedi. Yeniden göndermek için mükerrer mesaj riskini onaylayın.',
        };
      }

      return item;
    });
  } catch (err) {
    console.warn('[SenderQueue] SQLite ile uzlaştırma yapılamadı:', err);
    return items;
  }
}
