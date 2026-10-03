import { Student } from '../types/student';
import { HistoryItem } from '../types/history';
import { OpenWAConfig } from '../types/whatsapp';

const STUDENTS_STORAGE_KEY = 'karne_gonderici_students';
const HISTORY_STORAGE_KEY = 'karne_gonderici_history';
const TEMPLATE_STORAGE_KEY = 'karne_gonderici_template';
const CONFIG_STORAGE_KEY = 'karne_gonderici_config';

export const DEFAULT_TEMPLATE = `Merhaba {veli_adi},

{ogrenci_adi} öğrencimizin bu haftaki sınav karnesi ekte yer almaktadır.

Bilginize sunarım.`;

export const DEFAULT_CONFIG: OpenWAConfig & { testPhone: string; delaySeconds: number } = {
  providerType: 'whatsapp_web',
  baseUrl: 'http://localhost:2785/api',
  apiKey: '',
  sessionId: 'default',
  autoStart: true,
  metaToken: '',
  metaPhoneNumberId: '',
  testPhone: '',
  delaySeconds: 3
};

export const INITIAL_STUDENTS: Student[] = [
  { id: '1', studentName: 'Ahmet Yılmaz', parentName: 'Mehmet Yılmaz', phone: '905321112233' },
  { id: '2', studentName: 'Ayşe Demir', parentName: 'Ali Demir', phone: '905332223344' },
  { id: '3', studentName: 'Mehmet Kaya', parentName: 'Hasan Kaya', phone: '905353334455' },
  { id: '4', studentName: 'Zeynep Çelik', parentName: 'Fatma Çelik', phone: '905364445566' },
  { id: '5', studentName: 'Can Öztürk', parentName: 'Burak Öztürk', phone: '905375556677' },
  { id: '6', studentName: 'Elif Şahin', parentName: 'Kemal Şahin', phone: '905386667788' },
  { id: '7', studentName: 'Burak Aydın', parentName: 'Selin Aydın', phone: '905397778899' },
  { id: '8', studentName: 'İrem Güneş', parentName: 'Murat Güneş', phone: '905418889900' },
  { id: '9', studentName: 'Emre Koç', parentName: 'Derya Koç', phone: '905429990011' },
  { id: '10', studentName: 'Defne Yıldız', parentName: 'Okan Yıldız', phone: '905431110022' }
];

export const storageService = {
  getStudents(): Student[] {
    try {
      const data = localStorage.getItem(STUDENTS_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Fallback
    }
    return INITIAL_STUDENTS;
  },

  saveStudents(students: Student[]): void {
    localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(students));
  },

  getTemplate(): string {
    try {
      const data = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (data) return data;
    } catch {
      // Fallback
    }
    return DEFAULT_TEMPLATE;
  },

  saveTemplate(template: string): void {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, template);
  },

  getConfig(): typeof DEFAULT_CONFIG {
    try {
      const data = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (data) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_CONFIG;
  },

  saveConfig(config: Partial<typeof DEFAULT_CONFIG>): void {
    const current = this.getConfig();
    const updated = { ...current, ...config };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(updated));
  },

  getHistory(): HistoryItem[] {
    try {
      const data = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Fallback
    }
    return [];
  },

  addHistoryItem(item: HistoryItem): void {
    const history = this.getHistory();
    const updated = [item, ...history];
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated.slice(0, 100))); // Keep last 100
  },

  clearHistory(): void {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  }
};
