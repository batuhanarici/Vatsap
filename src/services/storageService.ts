import { Student } from '../types/student';
import { HistoryItem } from '../types/history';
import { OpenWAConfig } from '../types/whatsapp';
import { MessageTemplate } from '../types/template';
import { ScheduledDispatch } from '../types/schedule';

const STUDENTS_STORAGE_KEY = 'karne_gonderici_students';
const HISTORY_STORAGE_KEY = 'karne_gonderici_history';
const TEMPLATES_STORAGE_KEY = 'karne_gonderici_templates_v2';
const ACTIVE_TEMPLATE_ID_KEY = 'karne_gonderici_active_template_id';
const CONFIG_STORAGE_KEY = 'karne_gonderici_config';
const THEME_STORAGE_KEY = 'karne_gonderici_theme';
const SCHEDULE_STORAGE_KEY = 'karne_gonderici_schedule';

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'tmpl_haftalik',
    title: 'Haftalık Sınav Karnesi',
    tag: 'Haftalık',
    content: `Sayın {veli_adi},

Öğrencimiz {ogrenci_adi}'nin {tarih} {gun} günü yapılan {sinav_adi} karnesi ekte bilgilerinize sunulmuştur.

Öğrencimizin haftalık başarı grafiğini ve ders netlerini belgeden inceleyebilirsiniz.

İyi günler dileriz.`,
    isDefault: true,
  },
  {
    id: 'tmpl_deneme',
    title: 'Deneme Sınavı Sonucu',
    tag: 'Deneme',
    content: `Sayın {veli_adi},

Öğrencimiz {ogrenci_adi}'nin {tarih} tarihinde gerçekleştirilen {sinav_adi} sonuç karnesi ekte paylaşılmıştır. Net dağılımı ve genel sıralamasını inceleyebilirsiniz.

Başarılar dileriz.`,
  },
  {
    id: 'tmpl_donem_sonu',
    title: 'Dönem Sonu Karnesi',
    tag: 'Dönem Sonu',
    content: `Değerli Velimiz {veli_adi},

{ogrenci_adi} öğrencimizin dönem sonu karne ve gelişim raporu ekte bilginize sunulmuştur. Gösterdiği gayret için öğrencimizi tebrik eder, verimli bir tatil dönemi dileriz.`,
  },
  {
    id: 'tmpl_odev_takip',
    title: 'Ödev & Devamsızlık Takibi',
    tag: 'Takip',
    content: `Merhaba {veli_adi},

{ogrenci_adi} öğrencimizin {tarih} {gun} tarihli haftalık ders ve ödev takip karnesi ekte yer almaktadır. Eksik kazanımları karne üzerinden takip edebilirsiniz.`,
  },
];

export const DEFAULT_TEMPLATE = DEFAULT_TEMPLATES[0].content;

export const DEFAULT_CONFIG: OpenWAConfig & {
  testPhone: string;
  delaySeconds: number;
  examName: string;
  schoolName: string;
} = {
  providerType: 'openwa',
  baseUrl: 'http://127.0.0.1:2785/api',
  apiKey: '',
  sessionId: 'default',
  sessionUuid: '',
  autoStart: true,
  metaToken: '',
  metaPhoneNumberId: '',
  testPhone: '',
  delaySeconds: 3,
  examName: 'Genel Değerlendirme ve Deneme Sınavı',
  schoolName: 'Özel Başarı Okulları',
};

export const INITIAL_STUDENTS: Student[] = [];

export const SAMPLE_TEST_STUDENTS: Student[] = [
  { id: '1', studentName: 'Ahmet Yılmaz', parentName: 'Mehmet Yılmaz', phone: '905321112233', group: '8-A' },
  { id: '2', studentName: 'Ayşe Demir', parentName: 'Ali Demir', phone: '905332223344', group: '8-A' },
  { id: '3', studentName: 'Mehmet Kaya', parentName: 'Hasan Kaya', phone: '905353334455', group: '8-A' },
  { id: '4', studentName: 'Zeynep Çelik', parentName: 'Fatma Çelik', phone: '905364445566', group: '8-B' },
  { id: '5', studentName: 'Can Öztürk', parentName: 'Burak Öztürk', phone: '905375556677', group: '8-B' },
  { id: '6', studentName: 'Elif Şahin', parentName: 'Kemal Şahin', phone: '905386667788', group: '12-Sayısal' },
  { id: '7', studentName: 'Burak Aydın', parentName: 'Selin Aydın', phone: '905397778899', group: '12-Sayısal' },
  { id: '8', studentName: 'İrem Güneş', parentName: 'Murat Güneş', phone: '905418889900', group: '12-EA' },
  { id: '9', studentName: 'Emre Koç', parentName: 'Derya Koç', phone: '905429990011', group: 'Hafta Sonu Grubu' },
  { id: '10', studentName: 'Defne Yıldız', parentName: 'Okan Yıldız', phone: '905431110022', group: 'Hafta Sonu Grubu' },
];

export const storageService = {
  getStudents(): Student[] {
    try {
      const data = localStorage.getItem(STUDENTS_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          // If stored data contains the old dummy sample students, purge it so user starts with a clean list
          const isOldDummyData =
            parsed.length === 10 &&
            parsed[0]?.studentName === 'Ahmet Yılmaz' &&
            parsed[9]?.studentName === 'Defne Yıldız';
          if (isOldDummyData) {
            localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify([]));
            return [];
          }
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return [];
  },

  saveStudents(students: Student[]): void {
    localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(students));
  },

  clearAllStudents(): void {
    localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify([]));
  },

  exportFullBackup(): string {
    const backup = {
      app: 'KarneGonderici',
      exportedAt: new Date().toISOString(),
      students: this.getStudents(),
      templates: this.getTemplates(),
      activeTemplateId: this.getActiveTemplateId(),
      history: this.getHistory(),
      config: this.getConfig(),
    };
    return JSON.stringify(backup, null, 2);
  },

  importFullBackup(jsonString: string): boolean {
    try {
      const backup = JSON.parse(jsonString);
      if (backup.students && Array.isArray(backup.students)) {
        this.saveStudents(backup.students);
      }
      if (backup.templates && Array.isArray(backup.templates)) {
        this.saveTemplates(backup.templates);
      }
      if (backup.activeTemplateId) {
        this.setActiveTemplateId(backup.activeTemplateId);
      }
      return true;
    } catch {
      return false;
    }
  },

  getTemplates(): MessageTemplate[] {
    try {
      const data = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_TEMPLATES;
  },

  saveTemplates(templates: MessageTemplate[]): void {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  },

  getActiveTemplateId(): string {
    try {
      const id = localStorage.getItem(ACTIVE_TEMPLATE_ID_KEY);
      if (id) return id;
    } catch {
      // Fallback
    }
    return DEFAULT_TEMPLATES[0].id;
  },

  setActiveTemplateId(id: string): void {
    localStorage.setItem(ACTIVE_TEMPLATE_ID_KEY, id);
  },

  getTemplate(): string {
    const templates = this.getTemplates();
    const activeId = this.getActiveTemplateId();
    const active = templates.find((t) => t.id === activeId) || templates[0];
    return active ? active.content : DEFAULT_TEMPLATE;
  },

  saveTemplate(template: string): void {
    const templates = this.getTemplates();
    const activeId = this.getActiveTemplateId();
    const index = templates.findIndex((t) => t.id === activeId);
    if (index >= 0) {
      templates[index].content = template;
      this.saveTemplates(templates);
    }
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
  },

  getTheme(): 'light' | 'dark' {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      // Fallback
    }
    return 'light';
  },

  saveTheme(theme: 'light' | 'dark'): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore
    }
  },

  getSchedule(): ScheduledDispatch | null {
    try {
      const data = localStorage.getItem(SCHEDULE_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data) as ScheduledDispatch;
        // If expired more than 30 mins ago, discard
        if (parsed.targetTimestamp < Date.now() - 30 * 60 * 1000) {
          localStorage.removeItem(SCHEDULE_STORAGE_KEY);
          return null;
        }
        return parsed;
      }
    } catch {
      // Fallback
    }
    return null;
  },

  saveSchedule(schedule: ScheduledDispatch | null): void {
    try {
      if (schedule) {
        localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
      } else {
        localStorage.removeItem(SCHEDULE_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  }
};
