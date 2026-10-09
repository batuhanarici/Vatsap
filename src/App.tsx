/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { Tabs, TabType } from './components/Tabs';
import { FolderSelector } from './components/FolderSelector';
import { MatchingTable } from './components/MatchingTable';
import { StudentManagement } from './components/StudentManagement';
import { TemplateEditor } from './components/TemplateEditor';
import { HistoryTable } from './components/HistoryTable';
import { SettingsModal } from './components/SettingsModal';
import { TestMessageModal } from './components/TestMessageModal';
import { SendConfirmModal } from './components/SendConfirmModal';
import { SendingProgressModal } from './components/SendingProgressModal';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { ScheduleBanner } from './components/ScheduleBanner';
import { ToastNotification, ToastMessage } from './components/ToastNotification';
import { Play, RotateCcw } from 'lucide-react';

import { Student, StudentFormData } from './types/student';
import { LocalPdfFile, MatchedItem } from './types/pdf';
import { WhatsAppStatus } from './types/whatsapp';
import { HistoryItem } from './types/history';
import { MessageTemplate } from './types/template';
import { ScheduledDispatch } from './types/schedule';

import {
  storageService,
  INITIAL_STUDENTS,
  SAMPLE_TEST_STUDENTS,
  DEFAULT_TEMPLATE,
  PersistedQueueState,
  FullBackupData,
  BackupValidationResult,
  ImportBackupOptions,
} from './services/storageService';
import { matchStudentsWithPdfs } from './services/pdfMatcher';
import {
  performDeepPdfContentMatching,
  performScannedPdfOcrMatching,
  OcrScanProgress,
  OcrFailureItem,
} from './services/pdfTextExtractor';
import { OpenWAProvider } from './services/whatsapp/OpenWAProvider';
import { MockWhatsAppProvider } from './services/whatsapp/MockProvider';
import { WhatsAppWebProvider } from './services/whatsapp/WhatsAppWebProvider';
import { MetaCloudProvider } from './services/whatsapp/MetaCloudProvider';
import { WhatsAppProvider } from './services/whatsapp/types';
import { executeSenderQueue, QueueProgressEvent } from './services/senderQueue';
import { computeQuickHash } from './services/dispatchSafetyGate';
import { ManualMatchModal } from './components/ManualMatchModal';
import { OcrFailureModal } from './components/OcrFailureModal';
import { BackupPreviewModal } from './components/BackupPreviewModal';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('send');

  // Persistent States
  const [students, setStudents] = useState<Student[]>(() => storageService.getStudents());
  const [templates, setTemplates] = useState<MessageTemplate[]>(() => storageService.getTemplates());
  const [activeTemplateId, setActiveTemplateId] = useState<string>(() => storageService.getActiveTemplateId());
  const [config, setConfig] = useState(() => storageService.getConfig());
  const [history, setHistory] = useState<HistoryItem[]>(() => storageService.getHistory());
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => storageService.getTheme() === 'dark');
  const [scheduledDispatch, setScheduledDispatch] = useState<ScheduledDispatch | null>(() =>
    storageService.getSchedule()
  );

  // Sync dark mode class with html element and storage
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    storageService.saveTheme(isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Active Template derived content
  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || templates[0],
    [templates, activeTemplateId]
  );
  const template = activeTemplate ? activeTemplate.content : DEFAULT_TEMPLATE;

  // PDF & Folder State
  const [folderPath, setFolderPath] = useState<string>('');
  const [pdfFiles, setPdfFiles] = useState<LocalPdfFile[]>([]);

  // WhatsApp Providers
  const [isMockMode, setIsMockMode] = useState<boolean>(false);
  const openWaProvider = useMemo(() => new OpenWAProvider(config), [config]);
  const mockProvider = useMemo(() => new MockWhatsAppProvider(true), []);
  const webProvider = useMemo(() => new WhatsAppWebProvider(), []);
  const metaCloudProvider = useMemo(
    () =>
      new MetaCloudProvider({
        accessToken: config.metaToken || '',
        phoneNumberId: config.metaPhoneNumberId || '',
      }),
    [config.metaToken, config.metaPhoneNumberId]
  );

  const activeProvider = useMemo(() => {
    if (isMockMode) return mockProvider;
    switch (config.providerType) {
      case 'meta_cloud':
        return metaCloudProvider;
      case 'openwa':
        return openWaProvider;
      case 'whatsapp_web':
      default:
        return webProvider;
    }
  }, [isMockMode, config.providerType, mockProvider, metaCloudProvider, openWaProvider, webProvider]);

  // WhatsApp Connection State (starts as 'checking' or 'disconnected', never falsely 'connected')
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus>({
    state: 'checking',
    sessionId: config.sessionId || 'default',
    sessionUuid: config.sessionUuid,
    details: 'WhatsApp bağlantı durumu kontrol ediliyor...',
  });
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  // App-wide Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (toast: Omit<ToastMessage, 'id'> & { id?: string }) => {
    const id = toast.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      return [...filtered, { ...toast, id }];
    });
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [isProgressOpen, setIsProgressOpen] = useState<boolean>(false);
  const [previewItem, setPreviewItem] = useState<MatchedItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  // Queue Sending State
  const [isSending, setIsSending] = useState<boolean>(false);
  const [progressEvent, setProgressEvent] = useState<QueueProgressEvent | null>(null);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const cancelSendingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [interruptedQueue, setInterruptedQueue] = useState<PersistedQueueState | null>(() =>
    storageService.getActiveQueueState()
  );

  // Individual item overrides (for runtime updates during queue or manual retries)
  const [itemOverrides, setItemOverrides] = useState<Record<string, Partial<MatchedItem>>>({});

  // 1. Matched Items Calculation
  const matchedItems: MatchedItem[] = useMemo(() => {
    const calculated = matchStudentsWithPdfs(students, pdfFiles);
    return calculated.map((item) => {
      const override = itemOverrides[item.id];
      if (override) {
        return { ...item, ...override };
      }
      return item;
    });
  }, [students, pdfFiles, itemOverrides]);

  // 2. WhatsApp Status Check with interactive notification support
  const checkStatus = async (interactive: boolean = false): Promise<WhatsAppStatus> => {
    setIsCheckingStatus(true);
    if (interactive) {
      addToast({
        id: 'status_check',
        type: 'loading',
        title: 'Durum Kontrol Ediliyor',
        message: 'WhatsApp sunucusuna erişim test ediliyor...',
      });
    }

    try {
      const st = await activeProvider.getStatus();
      setWhatsAppStatus(st);
      if (st.state === 'qr_ready') {
        const qr = await activeProvider.getQrCode();
        setQrCodeUrl(qr);
      } else {
        setQrCodeUrl(null);
      }

      if (interactive) {
        if (st.state === 'connected') {
          addToast({
            id: 'status_check',
            type: 'success',
            title: 'İşleminiz Başarılı',
            message: `WhatsApp bağlantısı aktif ve hazır. (${st.phoneConnected || 'Bağlı'})`,
          });
        } else if (st.state === 'qr_ready') {
          addToast({
            id: 'status_check',
            type: 'warning',
            title: 'İşlem Başarılı: QR Kod Hazır',
            message: 'Oturum oluşturuldu. Lütfen Ayarlar penceresinden QR kodu telefonunuzdaki WhatsApp ile taratın.',
          });
        } else if (st.state === 'starting' || st.state === 'authenticating') {
          addToast({
            id: 'status_check',
            type: 'info',
            title: 'WhatsApp Başlatılıyor',
            message: st.details || 'Oturum doğrulanıyor, lütfen bekleyin...',
          });
        } else {
          addToast({
            id: 'status_check',
            type: 'error',
            title: 'İşlem Başarısız (Bağlantı Yok)',
            message: st.details || 'WhatsApp sunucusuna bağlanılamadı. URL ve API anahtarını kontrol edin.',
          });
        }
      }
      return st;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Bağlantı hatası oluştu.';
      const failStatus: WhatsAppStatus = {
        state: 'disconnected',
        sessionId: config.sessionId,
        details: errMsg,
      };
      setWhatsAppStatus(failStatus);
      if (interactive) {
        addToast({
          id: 'status_check',
          type: 'error',
          title: 'İşlem Başarısız',
          message: errMsg,
        });
      }
      return failStatus;
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    storageService.initSecureStorage().then(() => {
      checkStatus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMockMode, config.providerType, config.baseUrl, config.sessionId, config.apiKey, config.metaToken, config.metaPhoneNumberId]);

  // 3. Folder & Sample PDF Handlers
  const [isOcrScanning, setIsOcrScanning] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<OcrScanProgress | null>(null);

  const [isVisualOcrRunning, setIsVisualOcrRunning] = useState<boolean>(false);
  const [visualOcrProgress, setVisualOcrProgress] = useState<OcrScanProgress | null>(null);

  const [failedOcrItems, setFailedOcrItems] = useState<OcrFailureItem[]>([]);
  const [scannedImagePdfs, setScannedImagePdfs] = useState<string[]>([]);
  const [isOcrFailureModalOpen, setIsOcrFailureModalOpen] = useState<boolean>(false);
  const [ocrFailureScanType, setOcrFailureScanType] = useState<'digital_text' | 'visual_ocr'>('digital_text');

  // Manual Matching Modal State
  const [manualMatchItem, setManualMatchItem] = useState<MatchedItem | null>(null);
  const [isManualMatchOpen, setIsManualMatchOpen] = useState<boolean>(false);

  // Backup Import & Preview States
  const [isBackupPreviewOpen, setIsBackupPreviewOpen] = useState<boolean>(false);
  const [backupFileName, setBackupFileName] = useState<string>('');
  const [backupValidationResult, setBackupValidationResult] = useState<BackupValidationResult | null>(null);

  const handleInitiateImportBackup = (fileName: string, jsonString: string) => {
    const validation = storageService.validateBackupFile(jsonString);
    setBackupFileName(fileName);
    setBackupValidationResult(validation);
    setIsBackupPreviewOpen(true);
  };

  const handleConfirmImportBackup = (data: FullBackupData, options: ImportBackupOptions) => {
    const summary = storageService.importFullBackupWithOptions(data, options);
    if (!summary.success) {
      addToast({
        type: 'error',
        title: 'İçe Aktarma Hatası',
        message: 'Yedek dosyası içe aktarılırken bir sorun oluştu.',
      });
      return;
    }

    // Refresh active in-memory React states from storageService
    if (options.sections.students) {
      setStudents(storageService.getStudents());
      setItemOverrides({});
    }
    if (options.sections.templates) {
      setTemplates(storageService.getTemplates());
      setActiveTemplateId(storageService.getActiveTemplateId());
    }
    if (options.sections.history) {
      setHistory(storageService.getHistory());
    }
    if (options.sections.config) {
      const newConfig = storageService.getConfig();
      setConfig(newConfig);
      openWaProvider.updateConfig(newConfig);
    }
    if (options.sections.schedule) {
      setScheduledDispatch(storageService.getSchedule());
    }

    const modeText = options.mode === 'overwrite' ? 'üzerine yazılarak' : 'mevcut verilere birleştirilerek';
    addToast({
      type: 'success',
      title: 'Yedek Başarıyla İçe Aktarıldı',
      message: `${summary.importedStudentsCount} öğrenci ve ${summary.importedTemplatesCount} şablon ${modeText} başarıyla yüklendi!`,
    });
  };

  const handleExportBackup = (includeSecrets = false) => {
    const jsonString = storageService.exportFullBackup(includeSecrets);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Karne_Gonderici_Yedek_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast({
      type: 'success',
      title: 'Yedek İndirildi',
      message: includeSecrets
        ? 'Tüm sistem verileri (API anahtarları dahil) indirildi.'
        : 'Sistem verileri güvenli olarak indirildi (API anahtarları hariç tutuldu).',
    });
  };

  const assignedPdfNames = useMemo(
    () => new Set(matchedItems.filter((i) => i.pdfFile !== null).map((i) => i.pdfFile!.name)),
    [matchedItems]
  );
  const unassignedPdfCount = useMemo(
    () => pdfFiles.filter((pdf) => !assignedPdfNames.has(pdf.name)).length,
    [pdfFiles, assignedPdfNames]
  );

  // 1. Digital Text Layer Scanning (Fast, offline, reads selectable PDF vector text)
  const handleStartOcrScan = async () => {
    setIsOcrScanning(true);
    setOcrProgress({ current: 0, total: pdfFiles.length, currentFileName: 'Başlatılıyor...' });

    try {
      const result = await performDeepPdfContentMatching(
        matchedItems,
        pdfFiles,
        (progress) => {
          setOcrProgress(progress);
        }
      );

      const newOverrides: Record<string, Partial<MatchedItem>> = {};
      result.updatedMatches.forEach((updated) => {
        if (updated.matchMethod === 'text_extraction' || (updated.matchMethod as string) === 'content_ocr') {
          newOverrides[updated.id] = updated;
        }
      });

      setItemOverrides((prev) => ({ ...prev, ...newOverrides }));
      setScannedImagePdfs(result.scannedImagePdfs);
      setFailedOcrItems(result.failedOcrItems);

      if (result.matchedCount > 0) {
        addToast({
          type: 'success',
          title: 'Metin Taraması Başarılı',
          message: `${result.matchedCount} öğrenci PDF dijital metin katmanı okunarak başarıyla eşleştirildi!`,
        });
      } else {
        addToast({
          type: 'info',
          title: 'Metin Eşleşmesi Bulunamadı',
          message: 'Boştaki PDF dosyalarının dijital metin katmanında eşleşmeyen öğrencilere ait isim tespit edilemedi.',
        });
      }

      if (result.scannedImagePdfs && result.scannedImagePdfs.length > 0) {
        setOcrFailureScanType('digital_text');
        addToast({
          type: 'warning',
          title: 'Taranmış Görsel Belge Uyarısı',
          message: `${result.scannedImagePdfs.length} adet PDF (${result.scannedImagePdfs.slice(0, 3).join(', ')}${result.scannedImagePdfs.length > 3 ? '...' : ''}) taranmış görsel formatında olduğundan dijital metin içermiyor. "Taranmış Belge Görsel OCR" butonunu çalıştırabilir veya hata raporunu açabilirsiniz.`,
        });
      }
    } catch (err) {
      console.error('PDF text scanning error:', err);
      addToast({
        type: 'error',
        title: 'Tarama Hatası',
        message: 'PDF metin taraması sırasında hata oluştu: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setIsOcrScanning(false);
      setOcrProgress(null);
    }
  };

  // 2. Real Scanned Document Visual OCR (Multimodal image optical character recognition)
  const handleStartVisualOcr = async () => {
    setIsVisualOcrRunning(true);
    setVisualOcrProgress({ current: 0, total: pdfFiles.length, currentFileName: 'Görsel OCR Başlatılıyor...' });

    try {
      const result = await performScannedPdfOcrMatching(
        matchedItems,
        pdfFiles,
        undefined,
        (progress) => {
          setVisualOcrProgress(progress);
        }
      );

      const newOverrides: Record<string, Partial<MatchedItem>> = {};
      result.updatedMatches.forEach((updated) => {
        if (updated.matchMethod === 'content_ocr') {
          newOverrides[updated.id] = updated;
        }
      });

      setItemOverrides((prev) => ({ ...prev, ...newOverrides }));
      setFailedOcrItems(result.failedOcrItems);
      setScannedImagePdfs(result.scannedImagePdfs);

      if (result.matchedCount > 0) {
        addToast({
          type: 'success',
          title: 'Görsel OCR Başarılı',
          message: `${result.matchedCount} adet taranmış belge Optik Karakter Tanıma (OCR) ile başarıyla eşleştirildi!`,
        });
      } else {
        addToast({
          type: 'warning',
          title: 'Görsel OCR Eşleşmesi Sağlanamadı',
          message: 'Taranmış belgeler analiz edildi ancak belgedeki yazılar eksik öğrenci listesiyle eşleşmedi.',
        });
      }

      if (result.failedOcrItems && result.failedOcrItems.length > 0) {
        setOcrFailureScanType('visual_ocr');
        setIsOcrFailureModalOpen(true);
      }
    } catch (err) {
      console.error('Visual OCR error:', err);
      addToast({
        type: 'error',
        title: 'Görsel OCR Hatası',
        message: 'Görsel OCR sırasında hata oluştu: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setIsVisualOcrRunning(false);
      setVisualOcrProgress(null);
    }
  };

  const handleOpenManualMatch = (item: MatchedItem) => {
    setManualMatchItem(item);
    setIsManualMatchOpen(true);
  };

  const handleAssignPdf = (studentId: string, pdfFile: LocalPdfFile | null) => {
    if (!pdfFile) {
      setItemOverrides((prev) => ({
        ...prev,
        [studentId]: {
          pdfFile: null,
          status: 'missing_pdf',
          confidenceScore: 0,
          matchMethod: 'manual',
          isManuallyAssigned: false,
          needsConfirmation: false,
          userConfirmed: false,
          confirmedAt: undefined,
          confirmedPdfName: undefined,
          confirmedStudentPhone: undefined,
          confirmedStudentName: undefined,
          matchReason: 'PDF ataması kaldırıldı',
        },
      }));
      return;
    }

    const currentItem = matchedItems.find((i) => i.student.id === studentId);
    const hasValidPhone = Boolean(currentItem?.student.phone && currentItem.student.phone.length >= 10);

    const namedPdf: LocalPdfFile = {
      ...pdfFile,
      originalName: pdfFile.originalName || pdfFile.name,
      name: currentItem ? `${currentItem.student.studentName}.pdf` : pdfFile.name,
    };

    const chosenPdfName = pdfFile.originalName || pdfFile.name;
    const chosenPdfHash = pdfFile.hash || (pdfFile.base64 ? computeQuickHash(pdfFile.base64) : undefined);

    setItemOverrides((prev) => ({
      ...prev,
      [studentId]: {
        pdfFile: namedPdf,
        status: hasValidPhone ? 'ready' : 'invalid_phone',
        confidenceScore: 100,
        matchMethod: 'manual',
        isManuallyAssigned: true,
        needsConfirmation: false,
        userConfirmed: true,
        confirmedAt: new Date().toISOString(),
        confirmedStudentId: studentId,
        confirmedPdfName: chosenPdfName,
        confirmedPdfSize: pdfFile.size,
        confirmedPdfLastModified: pdfFile.lastModified,
        confirmedPdfHash: chosenPdfHash,
        confirmedStudentPhone: currentItem?.student.phone,
        confirmedStudentName: currentItem?.student.studentName,
        matchReason: `Kullanıcı tarafından manuel olarak atandı (${chosenPdfName})`,
      },
    }));

    addToast({
      type: 'success',
      title: 'PDF Atandı',
      message: `${currentItem?.student.studentName || 'Öğrenci'} için "${pdfFile.name}" dosyası başarıyla atandı.`,
    });
  };

  const handleConfirmMatch = (studentId: string) => {
    const item = matchedItems.find((i) => i.student.id === studentId);
    if (!item) return;

    const pdfName = item.pdfFile?.originalName || item.pdfFile?.name;
    const pdfHash = item.pdfFile?.hash || (item.pdfFile?.base64 ? computeQuickHash(item.pdfFile.base64) : undefined);

    setItemOverrides((prev) => ({
      ...prev,
      [studentId]: {
        ...item,
        status: item.student.phone && item.student.phone.length >= 10 ? 'ready' : 'invalid_phone',
        needsConfirmation: false,
        userConfirmed: true,
        confirmedAt: new Date().toISOString(),
        confirmedStudentId: studentId,
        confirmedPdfName: pdfName,
        confirmedPdfSize: item.pdfFile?.size,
        confirmedPdfLastModified: item.pdfFile?.lastModified,
        confirmedPdfHash: pdfHash,
        confirmedStudentPhone: item.student.phone,
        confirmedStudentName: item.student.studentName,
        matchReason: (item.matchReason || '') + ' (Kullanıcı tarafından onaylandı)',
      },
    }));

    addToast({
      type: 'success',
      title: 'Eşleşme Onaylandı',
      message: `${item.student.studentName} için PDF eşleşmesi onaylandı.`,
    });
  };

  const handleFolderSelected = (path: string, files: LocalPdfFile[]) => {
    setFolderPath(path);
    setPdfFiles(files);
    setItemOverrides({});
  };

  const handleClearFolder = () => {
    setFolderPath('');
    setPdfFiles([]);
    setItemOverrides({});
  };

  /**
   * Pre-loads realistic sample PDFs including both filename matches and generic scanned files
   * (e.g. scan_001.pdf) to demonstrate OCR content matching.
   */
  const handleLoadSamplePdfs = () => {
    if (students.length === 0) {
      setStudents(SAMPLE_TEST_STUDENTS);
      storageService.saveStudents(SAMPLE_TEST_STUDENTS);
    }

    const sampleFiles: LocalPdfFile[] = [
      { name: 'Ahmet Yılmaz.pdf', size: 245000 },
      { name: 'Ayse_Demir.pdf', size: 312000 },
      { name: 'mehmet-kaya.pdf', size: 198000 },
      {
        name: 'scan_001.pdf',
        size: 280000,
        extractedText: 'T.C. MİLLİ EĞİTİM BAKANLIĞI DENEME SINAV KARNESİ ÖĞRENCİ: ZEYNEP ÇELİK VELİ: FATMA ÇELİK NET: 78.50',
      },
      {
        name: 'belge_2026_02.pdf',
        size: 260000,
        extractedText: 'HAFTALIK DEĞERLENDİRME RAPORU ÖĞRENCİ: CAN ÖZTÜRK VELİ: BURAK ÖZTÜRK BAŞARI: %88',
      },
      {
        name: 'dokuman_003.pdf',
        size: 305000,
        extractedText: 'ÖĞRENCİ GELİŞİM RAPORU ELİF ŞAHİN KEMAL ŞAHİN ORTALAMA: 94.20',
      },
      {
        name: 'taranmis_karne_004.pdf',
        size: 450000,
        // Intentionally no digital text layer to simulate a scanned image PDF
      },
      { name: 'burak-aydin.pdf', size: 220000 },
      { name: 'İrem Güneş.pdf', size: 290000 },
      { name: 'Emre_Koc.pdf', size: 240000 },
    ];

    setFolderPath('/Users/batuhan/Desktop/Karneler/2026-10-02');
    setPdfFiles(sampleFiles);
    setItemOverrides({});
  };

  // 4. Batch Send Execution
  const handleStartBatchSend = () => {
    if (whatsAppStatus.state !== 'connected') {
      alert('WhatsApp oturumu bağlı değil. Lütfen Ayarlar bölümünden bağlantıyı kontrol edin.');
      return;
    }
    setIsConfirmOpen(true);
  };

  const handleConfirmSend = async (customExamName?: string, sendToSecondaryParents?: boolean) => {
    setIsSending(true);
    setIsCompleted(false);
    setIsPaused(false);
    isPausedRef.current = false;
    cancelSendingRef.current = false;
    setIsProgressOpen(true);

    const targetItems = selectedGroup === 'all'
      ? matchedItems
      : matchedItems.filter((i) => (i.student.group || 'Genel') === selectedGroup);

    const itemsToSend = targetItems.filter((i) => i.status === 'ready' || i.status === 'pending_confirmation');
    const examName = customExamName || config.examName || 'Genel Değerlendirme Sınavı';

    await executeSenderQueue({
      items: itemsToSend,
      template,
      provider: activeProvider,
      delayMs: (config.delaySeconds || 3) * 1000,
      maxRetries: config.maxRetries ?? 2,
      retryDelayMs: (config.retryDelaySeconds ?? 2) * 1000,
      sendToSecondaryParents: Boolean(sendToSecondaryParents),
      context: {
        examName,
        schoolName: config.schoolName,
      },
      onProgress: (event) => {
        setProgressEvent(event);
      },
      onItemUpdated: (updatedItem) => {
        setItemOverrides((prev) => ({
          ...prev,
          [updatedItem.id]: updatedItem,
        }));
      },
      isCancelled: () => cancelSendingRef.current,
      isPaused: () => isPausedRef.current,
    });

    setIsCompleted(true);
    setIsSending(false);
    setHistory(storageService.getHistory());
  };

  const handleTogglePause = () => {
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    setIsPaused(next);
  };

  const handleRetryFailedBatch = async () => {
    const failedItems = matchedItems.filter(
      (i) => i.sendingStatus === 'failed' || i.sendingStatus === 'partial_success'
    );
    if (failedItems.length === 0) return;

    setIsCompleted(false);
    setIsSending(true);
    setIsPaused(false);
    isPausedRef.current = false;
    cancelSendingRef.current = false;

    await executeSenderQueue({
      items: failedItems,
      template,
      provider: activeProvider,
      delayMs: (config.delaySeconds || 3) * 1000,
      maxRetries: config.maxRetries ?? 2,
      retryDelayMs: (config.retryDelaySeconds ?? 2) * 1000,
      context: {
        examName: config.examName || 'Genel Değerlendirme Sınavı',
        schoolName: config.schoolName,
      },
      onProgress: (event) => {
        setProgressEvent(event);
      },
      onItemUpdated: (updatedItem) => {
        setItemOverrides((prev) => ({
          ...prev,
          [updatedItem.id]: updatedItem,
        }));
      },
      isCancelled: () => cancelSendingRef.current,
      isPaused: () => isPausedRef.current,
    });

    setIsCompleted(true);
    setIsSending(false);
    setHistory(storageService.getHistory());
  };

  const handleResumeInterruptedQueue = async () => {
    if (!interruptedQueue) return;
    if (whatsAppStatus.state !== 'connected') {
      alert('WhatsApp bağlı değil. Lütfen Ayarlar menüsünden bağlantıyı kontrol edin.');
      return;
    }

    const pendingSet = new Set(interruptedQueue.pendingStudentIds);
    const targetItems = matchedItems.filter(
      (i) => pendingSet.has(i.student.id) && (i.status === 'ready' || i.status === 'pending_confirmation')
    );

    if (targetItems.length === 0) {
      alert('Kalan öğrenciler arasında gönderime hazır karne bulunamadı.');
      setInterruptedQueue(null);
      storageService.saveActiveQueueState(null);
      return;
    }

    const exam = interruptedQueue.examName;
    setInterruptedQueue(null);

    setIsSending(true);
    setIsCompleted(false);
    setIsPaused(false);
    isPausedRef.current = false;
    cancelSendingRef.current = false;
    setIsProgressOpen(true);

    await executeSenderQueue({
      items: targetItems,
      template,
      provider: activeProvider,
      delayMs: (config.delaySeconds || 3) * 1000,
      maxRetries: config.maxRetries ?? 2,
      retryDelayMs: (config.retryDelaySeconds ?? 2) * 1000,
      context: {
        examName: exam,
        schoolName: config.schoolName,
      },
      onProgress: (event) => {
        setProgressEvent(event);
      },
      onItemUpdated: (updatedItem) => {
        setItemOverrides((prev) => ({
          ...prev,
          [updatedItem.id]: updatedItem,
        }));
      },
      isCancelled: () => cancelSendingRef.current,
      isPaused: () => isPausedRef.current,
    });

    setIsCompleted(true);
    setIsSending(false);
    setHistory(storageService.getHistory());
  };

  const handleDiscardInterruptedQueue = () => {
    setInterruptedQueue(null);
    storageService.saveActiveQueueState(null);
  };

  // Audio chime notification for when scheduled dispatch starts
  const playChime = () => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12); // A5
      gain2.gain.setValueAtTime(0.25, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.6);
    } catch {
      // Audio playback might be restricted
    }
  };

  // Schedule dispatch actions
  const handleScheduleDispatch = (params: {
    targetTimestamp: number;
    targetTimeString: string;
    targetDateString: string;
    examName: string;
    sendToSecondaryParents?: boolean;
  }) => {
    const targetItems =
      selectedGroup === 'all'
        ? matchedItems
        : matchedItems.filter((i) => (i.student.group || 'Genel') === selectedGroup);
    const readyCount = targetItems.filter((i) => i.status === 'ready').length;

    const newSchedule: ScheduledDispatch = {
      id: String(Date.now()),
      targetTimestamp: params.targetTimestamp,
      targetTimeString: params.targetTimeString,
      targetDateString: params.targetDateString,
      examName: params.examName,
      selectedGroup,
      studentCount: readyCount,
      sendToSecondaryParents: params.sendToSecondaryParents,
      createdAt: Date.now(),
    };

    setScheduledDispatch(newSchedule);
    storageService.saveSchedule(newSchedule);
  };

  const handleCancelSchedule = () => {
    setScheduledDispatch(null);
    storageService.saveSchedule(null);
  };

  const handleExecuteScheduleNow = () => {
    if (!scheduledDispatch) return;
    const examName = scheduledDispatch.examName;
    const sendSec = scheduledDispatch.sendToSecondaryParents;
    setScheduledDispatch(null);
    storageService.saveSchedule(null);
    handleConfirmSend(examName, sendSec);
  };

  // Monitor scheduled dispatch timer
  useEffect(() => {
    if (!scheduledDispatch) return;

    const checkSchedule = () => {
      const now = Date.now();
      if (now >= scheduledDispatch.targetTimestamp) {
        playChime();
        const targetExam = scheduledDispatch.examName;
        const targetGroup = scheduledDispatch.selectedGroup;

        if (targetGroup && targetGroup !== selectedGroup) {
          setSelectedGroup(targetGroup);
        }

        setScheduledDispatch(null);
        storageService.saveSchedule(null);

        handleConfirmSend(targetExam);
      }
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 1000);
    return () => clearInterval(interval);
  }, [scheduledDispatch, selectedGroup]);

  // 5. Retry Single Item
  const handleRetrySingleItem = async (item: MatchedItem) => {
    if (whatsAppStatus.state !== 'connected') {
      alert('WhatsApp bağlı değil.');
      return;
    }

    setIsSending(true);
    setItemOverrides((prev) => ({
      ...prev,
      [item.id]: { sendingStatus: 'sending_message' },
    }));

    await executeSenderQueue({
      items: [item],
      template,
      provider: activeProvider,
      delayMs: 0,
      maxRetries: config.maxRetries ?? 2,
      retryDelayMs: (config.retryDelaySeconds ?? 2) * 1000,
      onProgress: () => {},
      onItemUpdated: (updatedItem) => {
        setItemOverrides((prev) => ({
          ...prev,
          [updatedItem.id]: updatedItem,
        }));
      },
    });

    setIsSending(false);
    setHistory(storageService.getHistory());
  };

  // 6. Student Actions
  const handleAddStudent = (data: StudentFormData) => {
    const newStudent: Student = {
      id: String(Date.now()),
      ...data,
    };
    const updated = [...students, newStudent];
    setStudents(updated);
    storageService.saveStudents(updated);
  };

  const handleUpdateStudent = (id: string, data: StudentFormData) => {
    const updated = students.map((s) => (s.id === id ? { ...s, ...data } : s));
    setStudents(updated);
    storageService.saveStudents(updated);
  };

  const handleDeleteStudent = (id: string) => {
    const updated = students.filter((s) => s.id !== id);
    setStudents(updated);
    storageService.saveStudents(updated);
  };

  const handleBulkAddStudents = (newStudents: Student[]) => {
    const updated = [...students, ...newStudents];
    setStudents(updated);
    storageService.saveStudents(updated);
  };

  const handleClearAllStudents = () => {
    setStudents([]);
    storageService.clearAllStudents();
  };

  const handleResetStudents = () => {
    setStudents([]);
    storageService.clearAllStudents();
  };

  // 7. Template Actions
  const handleSelectTemplate = (id: string) => {
    setActiveTemplateId(id);
    storageService.setActiveTemplateId(id);
  };

  const handleSaveTemplates = (updatedTemplates: MessageTemplate[], newActiveId?: string) => {
    setTemplates(updatedTemplates);
    storageService.saveTemplates(updatedTemplates);
    if (newActiveId) {
      setActiveTemplateId(newActiveId);
      storageService.setActiveTemplateId(newActiveId);
    }
  };

  // 8. History Action
  const handleClearHistory = () => {
    storageService.clearHistory();
    setHistory([]);
  };

  // 9. Config Action with interactive verification
  const handleSaveConfig = async (updated: Partial<typeof config>): Promise<WhatsAppStatus> => {
    addToast({
      id: 'save_config',
      type: 'loading',
      title: 'Ayarlar Kaydediliyor',
      message: 'Yapılandırma uygulanıyor ve WhatsApp bağlantısı doğrulanıyor...',
    });

    storageService.saveConfig(updated);
    const newConfig = { ...config, ...updated };
    setConfig(newConfig);

    // Update active provider's config
    openWaProvider.updateConfig(newConfig);
    metaCloudProvider.updateConfig({
      accessToken: newConfig.metaToken || '',
      phoneNumberId: newConfig.metaPhoneNumberId || '',
    });

    let targetProvider: WhatsAppProvider = webProvider;
    if (newConfig.providerType === 'openwa') {
      targetProvider = openWaProvider;
    } else if (newConfig.providerType === 'meta_cloud') {
      targetProvider = metaCloudProvider;
    } else if (isMockMode) {
      targetProvider = mockProvider;
    }

    try {
      const st = await targetProvider.getStatus();
      setWhatsAppStatus(st);
      if (st.state === 'qr_ready') {
        const qr = await targetProvider.getQrCode();
        setQrCodeUrl(qr);
      } else {
        setQrCodeUrl(null);
      }

      if (st.state === 'connected') {
        addToast({
          id: 'save_config',
          type: 'success',
          title: 'İşleminiz Başarılı',
          message: 'Ayarlar başarıyla kaydedildi! WhatsApp bağlı ve gönderime hazır.',
        });
      } else if (st.state === 'qr_ready') {
        addToast({
          id: 'save_config',
          type: 'warning',
          title: 'İşleminiz Başarılı: QR Kod Hazır',
          message: 'Ayarlar kaydedildi. Lütfen QR kodu telefonunuzdaki WhatsApp ile taratın.',
        });
      } else if (st.state === 'starting' || st.state === 'authenticating') {
        addToast({
          id: 'save_config',
          type: 'info',
          title: 'İşlem Başarılı: Başlatılıyor',
          message: 'Ayarlar kaydedildi. WhatsApp motoru başlatılıyor, lütfen bekleyin...',
        });
      } else {
        addToast({
          id: 'save_config',
          type: 'error',
          title: 'İşlem Başarısız (Bağlantı Kurulamadı)',
          message: `Ayarlar kaydedildi ancak WhatsApp servisine bağlanılamadı: ${st.details || 'Sunucu yanıt vermedi'}`,
        });
      }
      return st;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Bağlantı hatası oluştu.';
      addToast({
        id: 'save_config',
        type: 'error',
        title: 'İşlem Başarısız',
        message: `Ayarlar kaydedildi fakat bağlantı sağlanamadı: ${errMsg}`,
      });
      return { state: 'disconnected', sessionId: newConfig.sessionId || 'default', details: errMsg };
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfbfb] dark:bg-[#0b0d11] text-[#1c1c1c] dark:text-[#ededed] flex flex-col font-sans transition-colors duration-150">
      {/* Top Header */}
      <Header
        status={whatsAppStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshStatus={() => checkStatus(true)}
        isCheckingStatus={isCheckingStatus}
        isMockMode={isMockMode}
        onToggleMockMode={() => setIsMockMode(!isMockMode)}
        onOpenTestModal={() => setIsTestModalOpen(true)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
      />

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        studentCount={students.length}
        historyCount={history.length}
        templateCount={templates.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6">
        {/* Active Schedule Notification Banner */}
        {scheduledDispatch && (
          <ScheduleBanner
            schedule={scheduledDispatch}
            onExecuteNow={handleExecuteScheduleNow}
            onCancelSchedule={handleCancelSchedule}
          />
        )}

        {/* Interrupted / Unfinished Queue Recovery Banner */}
        {interruptedQueue && (
          <div className="mb-4 p-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-lg shrink-0">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold text-amber-950 dark:text-amber-200 text-sm flex items-center gap-2">
                  <span>Önceki Gönderim Tamamlanmadı</span>
                  <span className="text-[11px] font-mono px-2 py-0.2 rounded-full bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                    {interruptedQueue.examName}
                  </span>
                </h4>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  Uygulama sonlandığında toplam {interruptedQueue.totalCount} öğrenciden{' '}
                  <strong>{interruptedQueue.completedStudentIds.length}</strong> tanesi başarıyla iletilmişti.
                  Kalan <strong>{interruptedQueue.pendingStudentIds.length}</strong> öğrenci için gönderime kaldığı yerden devam edebilirsiniz.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleResumeInterruptedQueue}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Kaldığı Yerden Devam Et ({interruptedQueue.pendingStudentIds.length})</span>
              </button>
              <button
                type="button"
                onClick={handleDiscardInterruptedQueue}
                className="px-3 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-lg transition-colors cursor-pointer"
              >
                İptal Et
              </button>
            </div>
          </div>
        )}

        {activeTab === 'send' && (
          <div>
            {/* Folder Picker */}
            <FolderSelector
              folderPath={folderPath}
              pdfFiles={pdfFiles}
              onFolderSelected={handleFolderSelected}
              onLoadSamplePdfs={handleLoadSamplePdfs}
              onClear={handleClearFolder}
            />

            {/* Matching Table */}
            <MatchingTable
              matchedItems={matchedItems}
              whatsAppStatus={whatsAppStatus}
              onStartBatchSend={handleStartBatchSend}
              onRetrySingleItem={handleRetrySingleItem}
              onPreviewItem={(item) => {
                setPreviewItem(item);
                setIsPreviewOpen(true);
              }}
              isSending={isSending}
              hasFolderSelected={Boolean(folderPath)}
              templates={templates}
              activeTemplateId={activeTemplateId}
              onSelectTemplate={handleSelectTemplate}
              isOcrScanning={isOcrScanning}
              ocrProgress={ocrProgress}
              onStartOcrScan={handleStartOcrScan}
              isVisualOcrRunning={isVisualOcrRunning}
              visualOcrProgress={visualOcrProgress}
              onStartVisualOcr={handleStartVisualOcr}
              onOpenOcrFailureModal={() => setIsOcrFailureModalOpen(true)}
              failedOcrCount={failedOcrItems.length}
              unassignedPdfCount={unassignedPdfCount}
              selectedGroup={selectedGroup}
              onSelectGroup={setSelectedGroup}
              onConfirmMatch={handleConfirmMatch}
              onOpenManualMatch={handleOpenManualMatch}
            />
          </div>
        )}

        {activeTab === 'students' && (
          <StudentManagement
            students={students}
            onAddStudent={handleAddStudent}
            onUpdateStudent={handleUpdateStudent}
            onDeleteStudent={handleDeleteStudent}
            onResetToDefaults={handleResetStudents}
            onBulkAddStudents={handleBulkAddStudents}
            onClearAllStudents={handleClearAllStudents}
            onInitiateImportBackup={handleInitiateImportBackup}
          />
        )}

        {activeTab === 'template' && (
          <TemplateEditor
            templates={templates}
            activeTemplateId={activeTemplateId}
            onSelectTemplate={handleSelectTemplate}
            onSaveTemplates={handleSaveTemplates}
            sampleStudent={students[0]}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTable
            history={history}
            onClearHistory={handleClearHistory}
          />
        )}
      </main>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
        status={whatsAppStatus}
        onCheckStatus={() => checkStatus(true)}
        isChecking={isCheckingStatus}
        qrCodeUrl={qrCodeUrl}
        onInitiateImportBackup={handleInitiateImportBackup}
        onExportBackup={handleExportBackup}
        onStartSession={async (sessionParams) => {
          addToast({
            id: 'session_start',
            type: 'loading',
            title: 'Oturum Başlatılıyor',
            message: 'OpenWA üzerinde oturum başlatılıyor...',
          });

          // 1. Immediately apply latest settings from the Settings form
          if (sessionParams) {
            openWaProvider.updateConfig({
              baseUrl: sessionParams.baseUrl,
              sessionId: sessionParams.sessionId,
            });
            const updated = {
              baseUrl: sessionParams.baseUrl,
              sessionId: sessionParams.sessionId,
            };
            setConfig((prev) => ({ ...prev, ...updated }));
            storageService.saveConfig(updated);
          }

          // 2. Create session on OpenWA
          const targetSessionId =
            sessionParams?.sessionId || openWaProvider.getConfig().sessionId || 'default';
          const createRes = await openWaProvider.createSession(targetSessionId);
          if (!createRes.success) {
            addToast({
              id: 'session_start',
              type: 'error',
              title: 'İşlem Başarısız',
              message: createRes.error || 'Oturum oluşturulamadı.',
            });
            return { success: false, error: createRes.error };
          }

          // Store discovered UUID
          if (createRes.sessionUuid) {
            storageService.saveConfig({ sessionUuid: createRes.sessionUuid });
            setConfig((prev) => ({ ...prev, sessionUuid: createRes.sessionUuid }));
          }

          // 3. Start session engine
          const startRes = await openWaProvider.startSession(createRes.sessionUuid || targetSessionId);
          if (!startRes.success) {
            addToast({
              id: 'session_start',
              type: 'error',
              title: 'İşlem Başarısız',
              message: startRes.error || 'Oturum başlatılamadı.',
            });
            return { success: false, error: startRes.error };
          }

          // 4. Refresh status
          const st = await checkStatus(false);
          addToast({
            id: 'session_start',
            type: 'success',
            title: 'İşleminiz Başarılı',
            message:
              st.state === 'qr_ready'
                ? 'Oturum başlatıldı ve QR kod hazır! Lütfen telefonunuzdaki WhatsApp ile taratın.'
                : st.state === 'connected'
                ? 'Oturum başarıyla bağlandı ve hazır!'
                : 'Oturum başlatıldı! WhatsApp motoru hazırlanıyor...',
          });

          return {
            success: true,
            sessionUuid: createRes.sessionUuid,
          };
        }}
      />

      <TestMessageModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        provider={activeProvider}
        defaultPhone={config.testPhone}
        onSaveDefaultPhone={(phone) => handleSaveConfig({ testPhone: phone })}
      />

      <SendConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmSend}
        onSchedule={handleScheduleDispatch}
        matchedItems={
          selectedGroup === 'all'
            ? matchedItems
            : matchedItems.filter((i) => (i.student.group || 'Genel') === selectedGroup)
        }
        whatsAppStatus={whatsAppStatus}
        delaySeconds={config.delaySeconds || 3}
        templates={templates}
        activeTemplateId={activeTemplateId}
        onSelectTemplate={handleSelectTemplate}
        initialExamName={config.examName}
        selectedGroupName={selectedGroup}
      />

      <SendingProgressModal
        isOpen={isProgressOpen}
        onClose={() => setIsProgressOpen(false)}
        progressEvent={progressEvent}
        isCompleted={isCompleted}
        isPaused={isPaused}
        onTogglePause={handleTogglePause}
        onRetryFailed={handleRetryFailedBatch}
        onCancel={() => {
          cancelSendingRef.current = true;
          setIsSending(false);
          setIsCompleted(true);
        }}
      />

      <PdfPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        currentItem={previewItem}
        allItems={matchedItems}
        onSelectIndex={(index) => setPreviewItem(matchedItems[index])}
      />

      {/* Manual PDF Match Modal */}
      <ManualMatchModal
        isOpen={isManualMatchOpen}
        onClose={() => setIsManualMatchOpen(false)}
        targetItem={manualMatchItem}
        allItems={matchedItems}
        allPdfFiles={pdfFiles}
        onAssignPdf={handleAssignPdf}
      />

      {/* Scanned Document OCR Failure Report Modal */}
      <OcrFailureModal
        isOpen={isOcrFailureModalOpen}
        onClose={() => setIsOcrFailureModalOpen(false)}
        failureItems={failedOcrItems}
        scannedPdfs={scannedImagePdfs}
        scanType={ocrFailureScanType}
        onStartVisualOcr={handleStartVisualOcr}
        onOpenManualMatch={() => {
          const firstMissing = matchedItems.find((i) => i.status === 'missing_pdf') || matchedItems[0];
          if (firstMissing) {
            handleOpenManualMatch(firstMissing);
          }
        }}
        isOcrRunning={isVisualOcrRunning}
      />

      {/* System Full Backup Preview & Import Modal */}
      <BackupPreviewModal
        isOpen={isBackupPreviewOpen}
        onClose={() => setIsBackupPreviewOpen(false)}
        fileName={backupFileName}
        validationResult={backupValidationResult}
        onConfirmImport={handleConfirmImportBackup}
      />

      {/* Floating App-wide Toast Notifications */}
      <ToastNotification toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
