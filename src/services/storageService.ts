import { Student } from '../types/student';
import { HistoryItem } from '../types/history';
import { OpenWAConfig } from '../types/whatsapp';
import { MessageTemplate } from '../types/template';
import { ScheduledDispatch } from '../types/schedule';

export interface FullBackupData {
  schemaVersion: number;
  app: 'KarneGonderici';
  version: string;
  exportedAt: string;
  containsSecrets: boolean;
  students: Student[];
  templates: MessageTemplate[];
  activeTemplateId: string;
  history: HistoryItem[];
  config: Partial<OpenWAConfig & { testPhone: string; delaySeconds: number; maxRetries: number; retryDelaySeconds: number; examName: string; schoolName: string }>;
  scheduledDispatch: ScheduledDispatch | null;
}

export interface BackupValidationStats {
  studentCount: number;
  templateCount: number;
  historyCount: number;
  hasConfig: boolean;
  hasSchedule: boolean;
  schemaVersion: number;
  version: string;
  exportedAt: string;
  containsSecrets: boolean;
}

export interface BackupValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  data: FullBackupData | null;
  stats: BackupValidationStats | null;
}

export interface ImportBackupOptions {
  mode: 'overwrite' | 'merge';
  sections: {
    students: boolean;
    templates: boolean;
    history: boolean;
    config: boolean;
    schedule: boolean;
  };
}

export interface ImportBackupSummary {
  success: boolean;
  importedStudentsCount: number;
  importedTemplatesCount: number;
  importedHistoryCount: number;
  configUpdated: boolean;
  scheduleUpdated: boolean;
  mode: 'overwrite' | 'merge';
}

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
  maxRetries: number;
  retryDelaySeconds: number;
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
  maxRetries: 2,
  retryDelaySeconds: 2,
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

// In-memory runtime secrets removed: all credentials isolated in Electron Main Process
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

  exportFullBackup(includeSecrets = false): string {
    const rawConfig = this.getConfig();
    const safeConfig = { ...rawConfig };

    // Strict Security: By default, NEVER export API Key or Meta Token in backup files
    if (!includeSecrets) {
      safeConfig.apiKey = '';
      safeConfig.metaToken = '';
    }

    const backup: FullBackupData = {
      schemaVersion: 1,
      app: 'KarneGonderici',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      containsSecrets: includeSecrets,
      students: this.getStudents(),
      templates: this.getTemplates(),
      activeTemplateId: this.getActiveTemplateId(),
      history: this.getHistory(),
      config: safeConfig,
      scheduledDispatch: this.getSchedule(),
    };
    return JSON.stringify(backup, null, 2);
  },

  validateBackupFile(jsonString: string): BackupValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      return {
        isValid: false,
        errors: ['Dosya geçerli bir JSON formatında değil.'],
        warnings: [],
        data: null,
        stats: null,
      };
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        isValid: false,
        errors: ['Yedek verisi geçerli bir JSON nesnesi içermiyor.'],
        warnings: [],
        data: null,
        stats: null,
      };
    }

    // App name check
    if (parsed.app !== 'KarneGonderici') {
      errors.push('Bu dosya Karne Gönderici uygulamasına ait geçerli bir yedek dosyası değil.');
    }

    // Schema version check
    const schemaVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1;
    if (schemaVersion > 1) {
      warnings.push(`Yedek şema versiyonu (${schemaVersion}) mevcut uygulama şemasından (v1) daha yeni olabilir.`);
    }

    // Students validation
    const students = Array.isArray(parsed.students) ? parsed.students : [];
    if (!Array.isArray(parsed.students)) {
      warnings.push('Yedek dosyasında öğrenci listesi bulunamadı.');
    } else {
      const invalidStudents = students.filter((s: any) => !s || typeof s !== 'object' || !s.studentName);
      if (invalidStudents.length > 0) {
        warnings.push(`${invalidStudents.length} adet öğrenci kaydında isim bilgisi eksik.`);
      }
    }

    // Templates validation
    const templates = Array.isArray(parsed.templates) ? parsed.templates : [];
    if (!Array.isArray(parsed.templates)) {
      warnings.push('Yedek dosyasında şablon listesi bulunamadı.');
    }

    // History validation
    const history = Array.isArray(parsed.history) ? parsed.history : [];

    // Config validation
    const hasConfig = Boolean(parsed.config && typeof parsed.config === 'object');
    if (hasConfig && (parsed.config.apiKey || parsed.config.metaToken)) {
      warnings.push('Bu yedek dosyası API anahtarı veya kimlik doğrulama belirteci içermektedir.');
    }

    const hasSchedule = Boolean(parsed.scheduledDispatch && typeof parsed.scheduledDispatch === 'object');

    const isValid = errors.length === 0;

    const data: FullBackupData = {
      schemaVersion,
      app: 'KarneGonderici',
      version: parsed.version || '1.0.0',
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      containsSecrets: Boolean(parsed.containsSecrets || (parsed.config?.apiKey || parsed.config?.metaToken)),
      students,
      templates: templates.length > 0 ? templates : DEFAULT_TEMPLATES,
      activeTemplateId: parsed.activeTemplateId || DEFAULT_TEMPLATES[0].id,
      history,
      config: parsed.config || {},
      scheduledDispatch: hasSchedule ? parsed.scheduledDispatch : null,
    };

    const stats: BackupValidationStats = {
      studentCount: students.length,
      templateCount: templates.length,
      historyCount: history.length,
      hasConfig,
      hasSchedule,
      schemaVersion,
      version: parsed.version || '1.0.0',
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      containsSecrets: data.containsSecrets,
    };

    return {
      isValid,
      errors,
      warnings,
      data: isValid ? data : null,
      stats: isValid ? stats : null,
    };
  },

  importFullBackupWithOptions(data: FullBackupData, options: ImportBackupOptions): ImportBackupSummary {
    const { mode, sections } = options;
    let importedStudentsCount = 0;
    let importedTemplatesCount = 0;
    let importedHistoryCount = 0;
    let configUpdated = false;
    let scheduleUpdated = false;

    // 1. Students
    if (sections.students && Array.isArray(data.students)) {
      if (mode === 'overwrite') {
        this.saveStudents(data.students);
        importedStudentsCount = data.students.length;
      } else {
        // Merge mode: Match by ID or studentName
        const currentStudents = this.getStudents();
        const studentMap = new Map<string, Student>();
        currentStudents.forEach((s) => {
          studentMap.set(s.id, s);
          studentMap.set(s.studentName.toLowerCase().trim(), s);
        });

        const mergedStudents = [...currentStudents];
        data.students.forEach((incoming) => {
          const byId = studentMap.get(incoming.id);
          const byName = studentMap.get(incoming.studentName.toLowerCase().trim());
          const existing = byId || byName;

          if (existing) {
            const idx = mergedStudents.findIndex((s) => s.id === existing.id);
            if (idx >= 0) {
              mergedStudents[idx] = { ...existing, ...incoming };
            }
          } else {
            mergedStudents.push(incoming);
            studentMap.set(incoming.id, incoming);
            studentMap.set(incoming.studentName.toLowerCase().trim(), incoming);
          }
        });
        this.saveStudents(mergedStudents);
        importedStudentsCount = data.students.length;
      }
    }

    // 2. Templates
    if (sections.templates && Array.isArray(data.templates) && data.templates.length > 0) {
      if (mode === 'overwrite') {
        this.saveTemplates(data.templates);
        if (data.activeTemplateId) {
          this.setActiveTemplateId(data.activeTemplateId);
        }
        importedTemplatesCount = data.templates.length;
      } else {
        // Merge mode: Match templates by ID
        const currentTemplates = this.getTemplates();
        const templateMap = new Map<string, MessageTemplate>();
        currentTemplates.forEach((t) => templateMap.set(t.id, t));

        const mergedTemplates = [...currentTemplates];
        data.templates.forEach((incoming) => {
          const existing = templateMap.get(incoming.id);
          if (existing) {
            const idx = mergedTemplates.findIndex((t) => t.id === existing.id);
            if (idx >= 0) {
              mergedTemplates[idx] = { ...existing, ...incoming };
            }
          } else {
            mergedTemplates.push(incoming);
            templateMap.set(incoming.id, incoming);
          }
        });
        this.saveTemplates(mergedTemplates);
        if (data.activeTemplateId) {
          this.setActiveTemplateId(data.activeTemplateId);
        }
        importedTemplatesCount = data.templates.length;
      }
    }

    // 3. History
    if (sections.history && Array.isArray(data.history) && data.history.length > 0) {
      if (mode === 'overwrite') {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data.history.slice(0, 100)));
        importedHistoryCount = data.history.length;
      } else {
        // Merge mode: Combine history entries uniquely by ID and date
        const currentHistory = this.getHistory();
        const existingKeys = new Set(currentHistory.map((h) => `${h.id}_${h.date}`));
        const newItems = data.history.filter((h) => !existingKeys.has(`${h.id}_${h.date}`));
        const combined = [...newItems, ...currentHistory].slice(0, 100);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(combined));
        importedHistoryCount = newItems.length;
      }
    }

    // 4. Config
    if (sections.config && data.config && typeof data.config === 'object') {
      const currentConfig = this.getConfig();
      // Security: Do NOT overwrite an existing working API key with empty string from backup
      const safeIncomingConfig = { ...data.config };
      if (!safeIncomingConfig.apiKey && currentConfig.apiKey) {
        delete safeIncomingConfig.apiKey;
      }
      if (!safeIncomingConfig.metaToken && currentConfig.metaToken) {
        delete safeIncomingConfig.metaToken;
      }

      this.saveConfig(safeIncomingConfig);
      configUpdated = true;
    }

    // 5. Schedule
    if (sections.schedule) {
      this.saveSchedule(data.scheduledDispatch || null);
      scheduleUpdated = true;
    }

    return {
      success: true,
      importedStudentsCount,
      importedTemplatesCount,
      importedHistoryCount,
      configUpdated,
      scheduleUpdated,
      mode,
    };
  },

  importFullBackup(jsonString: string): boolean {
    const validation = this.validateBackupFile(jsonString);
    if (!validation.isValid || !validation.data) {
      return false;
    }

    const res = this.importFullBackupWithOptions(validation.data, {
      mode: 'merge',
      sections: {
        students: true,
        templates: true,
        history: true,
        config: true,
        schedule: true,
      },
    });
    return res.success;
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
        const parsed = JSON.parse(data);
        const merged = { ...DEFAULT_CONFIG, ...parsed };

        // Secrets are strictly isolated in Main Process: never stored or returned as plaintext
        merged.apiKey = '';
        merged.metaToken = '';

        return merged;
      }
    } catch {
      // Fallback
    }

    return {
      ...DEFAULT_CONFIG,
      apiKey: '',
      metaToken: '',
    };
  },

  async initSecureStorage(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.credentials) {
        const isAvail = await window.electronAPI.credentials.isAvailable();
        if (isAvail) {
          // Check for legacy ciphertext stored in localStorage from V1
          const encKey = localStorage.getItem('karne_sec_key_enc');
          const encMeta = localStorage.getItem('karne_sec_meta_enc');

          if (encKey || encMeta) {
            const result = await window.electronAPI.credentials.migrateLegacy({
              encryptedOpenWaKey: encKey,
              encryptedMetaToken: encMeta,
            });

            if (result.success) {
              // Securely clean up legacy ciphertexts from Renderer localStorage
              if (result.migratedOpenWa) {
                localStorage.removeItem('karne_sec_key_enc');
              }
              if (result.migratedMeta) {
                localStorage.removeItem('karne_sec_meta_enc');
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[StorageService] Güvenli depolama başlatılamadı:', err);
    }
  },

  saveConfig(config: Partial<typeof DEFAULT_CONFIG>): void {
    const current = this.getConfig();
    const updated = { ...current, ...config };

    // Secrets are NEVER persisted into localStorage in plaintext or ciphertext
    const sanitizedToStore = {
      ...updated,
      apiKey: '',
      metaToken: '',
    };

    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(sanitizedToStore));
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

  getSchedule(allowExpired = false): ScheduledDispatch | null {
    try {
      const data = localStorage.getItem(SCHEDULE_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data) as ScheduledDispatch;
        if (!allowExpired && parsed.targetTimestamp <= Date.now()) {
          return null;
        }
        return parsed;
      }
    } catch {
      // Fallback
    }
    return null;
  },

  getOverdueSchedule(): ScheduledDispatch | null {
    try {
      const data = localStorage.getItem(SCHEDULE_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data) as ScheduledDispatch;
        if (parsed.targetTimestamp <= Date.now()) {
          return parsed;
        }
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
  },

  dismissSchedule(schedule: ScheduledDispatch | null, logAsMissed = false): void {
    if (schedule && logAsMissed) {
      this.addHistoryItem({
        id: `missed_${Date.now()}`,
        studentName: `Toplu Gönderim (${schedule.studentCount} Veli)`,
        parentName: 'Zamanlanmış Görev',
        maskedPhone: '—',
        pdfFileName: `${schedule.examName}.pdf`,
        date: new Date().toISOString(),
        status: 'cancelled',
        outcome: 'failed',
        errorMessage: `Uygulama kapalı olduğu için planlanan saatte (${schedule.targetTimeString}) gönderilemedi (Zaman aşımı / İptal).`,
        examName: schedule.examName,
      });
    }
    localStorage.removeItem(SCHEDULE_STORAGE_KEY);
  },

  getActiveQueueState(): PersistedQueueState | null {
    try {
      const data = localStorage.getItem('karne_active_queue_state');
      if (data) {
        return JSON.parse(data) as PersistedQueueState;
      }
    } catch {
      // Fallback
    }
    return null;
  },

  saveActiveQueueState(state: PersistedQueueState | null): void {
    try {
      if (state) {
        localStorage.setItem('karne_active_queue_state', JSON.stringify(state));
      } else {
        localStorage.removeItem('karne_active_queue_state');
      }
    } catch {
      // Ignore
    }
  }
};

export interface PersistedQueueState {
  id: string;
  examName: string;
  selectedGroup?: string;
  totalCount: number;
  currentIndex: number;
  completedStudentIds: string[];
  failedStudentIds: string[];
  partialStudentIds: string[];
  pendingStudentIds: string[];
  updatedAt: string;
  status: 'running' | 'paused' | 'completed' | 'interrupted';
}
