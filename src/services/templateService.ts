import { Student } from '../types/student';

/**
 * Formats message template with student and parent names
 */
export function formatMessage(template: string, student: Student): string {
  return template
    .replace(/\{veli_adi\}/g, student.parentName || 'Sayın Velimiz')
    .replace(/\{veli_adı\}/g, student.parentName || 'Sayın Velimiz')
    .replace(/\{ogrenci_adi\}/g, student.studentName)
    .replace(/\{öğrenci_adı\}/g, student.studentName);
}
