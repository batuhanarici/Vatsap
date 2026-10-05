export interface Student {
  id: string;
  studentName: string;
  parentName: string;
  phone: string; // Stored in normalized international format, e.g. 905XXXXXXXXX
  secondaryPhone?: string; // Optional 2nd parent contact
  group?: string; // Sınıf / Şube / Grup, örn: "8-A", "12-Sayısal", "Hafta Sonu Kurs Grubu"
  notes?: string;
  isActive?: boolean; // default: true
}

export interface StudentFormData {
  studentName: string;
  parentName: string;
  phone: string;
  secondaryPhone?: string;
  group?: string;
  notes?: string;
  isActive?: boolean;
}
