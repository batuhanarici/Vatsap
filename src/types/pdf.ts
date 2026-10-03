import { Student } from './student';

export interface LocalPdfFile {
  name: string;
  size: number;
  lastModified?: number;
  path?: string;
  file?: File;
  base64?: string;
}

export type MatchingStatus = 'ready' | 'missing_pdf' | 'invalid_phone';

export type SendingStatus = 
  | 'idle' 
  | 'waiting' 
  | 'sending_message' 
  | 'sending_pdf' 
  | 'success' 
  | 'failed';

export interface MatchedItem {
  id: string;
  student: Student;
  pdfFile: LocalPdfFile | null;
  status: MatchingStatus;
  sendingStatus: SendingStatus;
  errorMessage?: string;
}
