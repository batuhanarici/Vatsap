import { Student } from './student';

export interface LocalPdfFile {
  name: string;
  originalName?: string;
  size: number;
  lastModified?: number;
  path?: string;
  file?: File;
  base64?: string;
  extractedText?: string;
}

export type MatchingStatus = 'ready' | 'missing_pdf' | 'invalid_phone' | 'pending_confirmation';

export type SendingStatus = 
  | 'idle'
  | 'pending'
  | 'validating'
  | 'sending_pdf' 
  | 'sending_message' 
  | 'retrying'
  | 'success' 
  | 'partial_success'
  | 'failed'
  | 'cancelled';

export type MatchingMethod = 'filename' | 'text_extraction' | 'content_ocr' | 'manual';

export interface MatchedItem {
  id: string;
  student: Student;
  pdfFile: LocalPdfFile | null;
  status: MatchingStatus;
  sendingStatus: SendingStatus;
  errorMessage?: string;
  matchMethod?: MatchingMethod;
  confidenceScore?: number; // 0 - 100
  matchReason?: string;
  hasConflict?: boolean;
  isManuallyAssigned?: boolean;
  needsConfirmation?: boolean;
  attempts?: number;
}
