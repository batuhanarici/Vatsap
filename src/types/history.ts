import { SendOutcome } from './whatsapp';

export interface HistoryItem {
  id: string;
  studentId?: string;
  studentName: string;
  parentName: string;
  maskedPhone: string;
  phone?: string;
  pdfFileName: string;
  date: string; // ISO string e.g. 2026-10-02T18:30:00
  status: 'success' | 'failed' | 'partial_success' | 'cancelled';
  outcome?: SendOutcome;
  pdfSent?: boolean;
  messageSent?: boolean;
  attempts?: number;
  errorMessage?: string;
  examName?: string;
}
