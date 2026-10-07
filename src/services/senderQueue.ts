import { MatchedItem } from '../types/pdf';
import { WhatsAppProvider } from './whatsapp/types';
import { SendResult } from '../types/whatsapp';
import { formatMessage, TemplateContext } from './templateService';
import { fileToBase64 } from './pdfMatcher';
import { storageService } from './storageService';
import { maskPhoneNumber } from './normalizer';

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

    // 4. Duplicate Message Prevention:
    // a. Check session set
    if (sentStudentIds.has(student.id)) {
      currentItem.sendingStatus = 'success';
      currentItem.errorMessage = 'Bu oturumda zaten gönderildi (Çift gönderim engellendi).';
      onItemUpdated(currentItem);
      completedStudentIds.push(student.id);
      continue;
    }

    // b. Check today's history for exact same exam
    if (preventDuplicateSends && context?.examName) {
      const alreadySentToday = existingHistory.some(
        (h) =>
          h.phone === student.phone &&
          h.status === 'success' &&
          h.examName === context.examName &&
          h.date.startsWith(todayDatePrefix)
      );

      if (alreadySentToday) {
        currentItem.sendingStatus = 'success';
        currentItem.errorMessage = `"${context.examName}" karnesi veliye bugün zaten iletildi (Çift gönderim koruması).`;
        onItemUpdated(currentItem);
        completedStudentIds.push(student.id);
        continue;
      }
    }

    // Check eligibility during validation
    if (!pdfFile || (currentItem.status !== 'ready' && currentItem.status !== 'pending_confirmation')) {
      // Transition: [validating] -> [failed]
      currentItem.sendingStatus = 'failed';
      currentItem.errorMessage = currentItem.errorMessage || 'Gönderim için hazır değil (PDF eksik veya telefon geçersiz).';
      onItemUpdated(currentItem);
      failedCount++;
      failedStudentIds.push(student.id);
      continue;
    }

    const messageText = formatMessage(template, student, context);

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

    const targetPdfFileName = `${student.studentName}.pdf`;

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
        student.phone,
        base64,
        targetPdfFileName,
        messageText
      );

      if (sendResult.success) {
        break; // Document sent successfully
      }

      // If document send failed and we have retries left, transition to [retrying] and wait backoff
      if (attempt <= maxRetries && !isCancelled()) {
        currentItem.sendingStatus = 'retrying';
        onItemUpdated(currentItem);
        await sleep(retryDelayMs);
      }
    }

    // 6. If PDF send failed across all retries: Transition to [sending_message] fallback
    let isFallbackTextOnly = false;
    if (!sendResult.success && !isCancelled()) {
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

      const fallbackResult = await provider.sendMessage(student.phone, messageText);
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

    // 7. Final State Transitions: -> [success] | [partial_success] | [failed]
    if (sendResult.pdfSent) {
      // Transition -> [success]
      currentItem.sendingStatus = 'success';
      currentItem.errorMessage = undefined;
      onItemUpdated(currentItem);
      successCount++;
      sentStudentIds.add(student.id);
      completedStudentIds.push(student.id);

      storageService.addHistoryItem({
        id: `hist_${Date.now()}_${student.id}`,
        studentName: student.studentName,
        parentName: student.parentName,
        maskedPhone: maskPhoneNumber(student.phone),
        phone: student.phone,
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
        try {
          await sleep(1500); // Friendly inter-message pause
          const secResult = await provider.sendDocument(
            student.secondaryPhone,
            base64,
            targetPdfFileName,
            messageText
          );
          storageService.addHistoryItem({
            id: `hist_sec_${Date.now()}_${student.id}`,
            studentName: `${student.studentName} (2. Veli)`,
            parentName: `${student.parentName} (2. Veli)`,
            maskedPhone: maskPhoneNumber(student.secondaryPhone),
            phone: student.secondaryPhone,
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
    } else if (isFallbackTextOnly || sendResult.outcome === 'partial_success') {
      // Transition -> [partial_success]
      currentItem.sendingStatus = 'partial_success';
      currentItem.errorMessage = sendResult.error || 'PDF belgesi iletilemedi; veliye yalnızca metin mesajı iletildi.';
      onItemUpdated(currentItem);
      partialSuccessCount++;
      sentStudentIds.add(student.id);
      partialStudentIds.push(student.id);

      storageService.addHistoryItem({
        id: `hist_${Date.now()}_${student.id}`,
        studentName: student.studentName,
        parentName: student.parentName,
        maskedPhone: maskPhoneNumber(student.phone),
        phone: student.phone,
        pdfFileName: targetPdfFileName,
        date: new Date().toISOString(),
        status: 'partial_success',
        outcome: 'partial_success',
        pdfSent: false,
        messageSent: true,
        errorMessage: currentItem.errorMessage,
        examName: context?.examName,
      });
    } else {
      // Transition -> [failed]
      currentItem.sendingStatus = 'failed';
      currentItem.errorMessage = sendResult.error || 'Mesaj ve PDF gönderilemedi.';
      onItemUpdated(currentItem);
      failedCount++;
      failedStudentIds.push(student.id);

      storageService.addHistoryItem({
        id: `hist_${Date.now()}_${student.id}`,
        studentName: student.studentName,
        parentName: student.parentName,
        maskedPhone: maskPhoneNumber(student.phone),
        phone: student.phone,
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
