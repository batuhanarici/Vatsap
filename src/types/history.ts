import { SendOutcome } from './whatsapp';

export interface HistoryItem {
  id: string;
  dispatchKey?: string;
  studentId?: string;
  studentName: string;
  parentName: string;
  maskedPhone: string;
  phone?: string;
  pdfFileName: string;
  date: string; // ISO string e.g. 2026-10-02T18:30:00
  updatedAt?: string;
  status: 'success' | 'sent' | 'delivered' | 'failed' | 'partial_success' | 'cancelled' | 'unknown';
  outcome?: SendOutcome;
  pdfSent?: boolean;
  messageSent?: boolean;
  attempts?: number;
  errorMessage?: string;
  examName?: string;
  provider?: string;
  manualReconciliationStatus?: 'user_confirmed_delivered' | 'retry_authorized' | null;
  reconciledAt?: string | null;
  reconciliationReason?: string | null;
}
