export interface HistoryItem {
  id: string;
  studentName: string;
  parentName: string;
  maskedPhone: string;
  pdfFileName: string;
  date: string; // ISO string e.g. 2026-10-02T18:30:00
  status: 'success' | 'failed';
  errorMessage?: string;
}
