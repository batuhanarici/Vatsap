import { Student } from '../types/student';

export interface TemplateContext {
  examName?: string;
  schoolName?: string;
  teacherName?: string;
  customDate?: Date;
}

const TURKISH_DAYS = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
];

const TURKISH_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/**
 * Formats message template with student, parent names and extended dynamic variables:
 * - {veli_adi}, {veli_adı}
 * - {ogrenci_adi}, {öğrenci_adı}
 * - {tarih} -> e.g. 03.10.2026
 * - {tarih_uzun} -> e.g. 3 Ekim 2026
 * - {gun}, {gün} -> e.g. Cumartesi
 * - {saat} -> e.g. 14:30
 * - {sinav_adi}, {sınav_adı} -> e.g. LGS 3. Deneme Sınavı
 * - {okul_adi}, {kurs_adi} -> e.g. Özel Başarı Koleji
 * - {ogretmen_adi}, {öğretmen_adı} -> e.g. Batuhan Öğretmen
 */
export function formatMessage(
  template: string,
  student: Student,
  context?: TemplateContext
): string {
  const now = context?.customDate || new Date();

  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const dateFormatted = `${day}.${month}.${year}`;
  const longDateFormatted = `${now.getDate()} ${TURKISH_MONTHS[now.getMonth()]} ${year}`;
  const dayOfWeek = TURKISH_DAYS[now.getDay()];
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeFormatted = `${hours}:${minutes}`;

  const examName = context?.examName || 'Deneme Sınavı';
  const schoolName = context?.schoolName || 'Eğitim Kurumu';
  const teacherName = context?.teacherName || '';

  return template
    .replace(/\{veli_adi\}/gi, student.parentName || 'Sayın Velimiz')
    .replace(/\{veli_adı\}/gi, student.parentName || 'Sayın Velimiz')
    .replace(/\{ogrenci_adi\}/gi, student.studentName)
    .replace(/\{öğrenci_adı\}/gi, student.studentName)
    .replace(/\{sinif\}/gi, student.group || 'Genel')
    .replace(/\{sınıf\}/gi, student.group || 'Genel')
    .replace(/\{grup\}/gi, student.group || 'Genel')
    .replace(/\{sube\}/gi, student.group || 'Genel')
    .replace(/\{şube\}/gi, student.group || 'Genel')
    .replace(/\{tarih\}/gi, dateFormatted)
    .replace(/\{tarih_uzun\}/gi, longDateFormatted)
    .replace(/\{gun\}/gi, dayOfWeek)
    .replace(/\{gün\}/gi, dayOfWeek)
    .replace(/\{saat\}/gi, timeFormatted)
    .replace(/\{sinav_adi\}/gi, examName)
    .replace(/\{sınav_adı\}/gi, examName)
    .replace(/\{okul_adi\}/gi, schoolName)
    .replace(/\{kurs_adi\}/gi, schoolName)
    .replace(/\{ogretmen_adi\}/gi, teacherName)
    .replace(/\{öğretmen_adı\}/gi, teacherName);
}

export interface AvailableVariable {
  tag: string;
  label: string;
  description: string;
  example: string;
}

export const AVAILABLE_VARIABLES: AvailableVariable[] = [
  {
    tag: '{ogrenci_adi}',
    label: 'Öğrenci Adı',
    description: 'Öğrencinin tam adı soyadı',
    example: 'Ahmet Yılmaz',
  },
  {
    tag: '{sinif}',
    label: 'Sınıf / Şube',
    description: 'Öğrencinin sınıf, şube veya grubu',
    example: '8-A',
  },
  {
    tag: '{veli_adi}',
    label: 'Veli Adı',
    description: 'Velinin adı veya hitap',
    example: 'Mehmet Yılmaz',
  },
  {
    tag: '{tarih}',
    label: 'Tarih',
    description: 'Bugünün tarihi (GG.AA.YYYY)',
    example: '03.10.2026',
  },
  {
    tag: '{gun}',
    label: 'Gün',
    description: 'Bugünün haftanın günü',
    example: 'Cumartesi',
  },
  {
    tag: '{sinav_adi}',
    label: 'Sınav Adı',
    description: 'Yapılan sınav veya denemenin başlığı',
    example: 'LGS 1. Deneme Sınavı',
  },
  {
    tag: '{tarih_uzun}',
    label: 'Uzun Tarih',
    description: 'Gün, ay ismi ve yıl',
    example: '3 Ekim 2026',
  },
  {
    tag: '{saat}',
    label: 'Saat',
    description: 'Gönderim saati (SS:DD)',
    example: '14:30',
  },
  {
    tag: '{okul_adi}',
    label: 'Okul / Kurum',
    description: 'Okul veya kurs merkezi adı',
    example: 'Özel Başarı Okulları',
  },
];
