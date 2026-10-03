export interface Student {
  id: string;
  studentName: string;
  parentName: string;
  phone: string; // Stored in normalized international format, e.g. 905XXXXXXXXX
  notes?: string;
}

export interface StudentFormData {
  studentName: string;
  parentName: string;
  phone: string;
}
