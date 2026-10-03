export interface Student {
  id: string;
  studentName: string;
  parentName: string;
  phone: string; // Stored in normalized international format, e.g. 905XXXXXXXXX
  group?: string; // Sınıf / Şube / Grup, örn: "8-A", "12-Sayısal", "Hafta Sonu Kurs Grubu"
  notes?: string;
}

export interface StudentFormData {
  studentName: string;
  parentName: string;
  phone: string;
  group?: string;
  notes?: string;
}
