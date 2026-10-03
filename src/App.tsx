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

import { Student, StudentFormData } from './types/student';
import { LocalPdfFile, MatchedItem } from './types/pdf';
import { WhatsAppStatus } from './types/whatsapp';
import { HistoryItem } from './types/history';
import { MessageTemplate } from './types/template';

import { storageService, INITIAL_STUDENTS, DEFAULT_TEMPLATE } from './services/storageService';
import { matchStudentsWithPdfs } from './services/pdfMatcher';
import { OpenWAProvider } from './services/whatsapp/OpenWAProvider';
import { MockWhatsAppProvider } from './services/whatsapp/MockProvider';
import { WhatsAppWebProvider } from './services/whatsapp/WhatsAppWebProvider';
import { MetaCloudProvider } from './services/whatsapp/MetaCloudProvider';
import { executeSenderQueue, QueueProgressEvent } from './services/senderQueue';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('send');

  // Persistent States
  const [students, setStudents] = useState<Student[]>(() => storageService.getStudents());
  const [templates, setTemplates] = useState<MessageTemplate[]>(() => storageService.getTemplates());
  const [activeTemplateId, setActiveTemplateId] = useState<string>(() => storageService.getActiveTemplateId());
  const [config, setConfig] = useState(() => storageService.getConfig());
  const [history, setHistory] = useState<HistoryItem[]>(() => storageService.getHistory());

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

  // WhatsApp Connection State
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus>({
    state: 'connected',
    sessionId: config.sessionId,
    details: 'WhatsApp Web Modu Aktif (API Anahtarı Gerekmez)'
  });
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [isProgressOpen, setIsProgressOpen] = useState<boolean>(false);

  // Queue Sending State
  const [isSending, setIsSending] = useState<boolean>(false);
  const [progressEvent, setProgressEvent] = useState<QueueProgressEvent | null>(null);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const cancelSendingRef = useRef<boolean>(false);

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

  // 2. WhatsApp Status Check
  const checkStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const st = await activeProvider.getStatus();
      setWhatsAppStatus(st);
      if (st.state === 'qr_ready') {
        const qr = await activeProvider.getQrCode();
        setQrCodeUrl(qr);
      } else {
        setQrCodeUrl(null);
      }
    } catch {
      setWhatsAppStatus({
        state: 'disconnected',
        sessionId: config.sessionId,
        details: 'Bağlantı sağlanamadı.'
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMockMode, config.providerType, config.baseUrl, config.sessionId, config.apiKey, config.metaToken, config.metaPhoneNumberId]);

  // 3. Folder & Sample PDF Handlers
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
   * Pre-loads realistic sample PDFs matching 9 students, leaving 1 student missing
   * exactly demonstrating the test scenario described in the user prompt:
   * (9 Hazır, 1 Eksik)
   */
  const handleLoadSamplePdfs = () => {
    const sampleFiles: LocalPdfFile[] = [
      { name: 'Ahmet Yılmaz.pdf', size: 245000 },
      { name: 'Ayse_Demir.pdf', size: 312000 },
      { name: 'mehmet-kaya.pdf', size: 198000 },
      { name: 'Zeynep Celik.pdf', size: 280000 },
      { name: 'Can Öztürk - Haftalık.pdf', size: 260000 },
      { name: 'Elif_Sahin.pdf', size: 305000 },
      { name: 'burak-aydin.pdf', size: 220000 },
      { name: 'İrem Güneş.pdf', size: 290000 },
      { name: 'Emre_Koc.pdf', size: 240000 },
      // "Defne Yıldız" intentionally omitted to simulate 1 missing PDF!
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

  const handleConfirmSend = async () => {
    setIsSending(true);
    setIsCompleted(false);
    cancelSendingRef.current = false;
    setIsProgressOpen(true);

    const itemsToSend = matchedItems.filter((i) => i.status === 'ready');

    await executeSenderQueue({
      items: itemsToSend,
      template,
      provider: activeProvider,
      delayMs: (config.delaySeconds || 3) * 1000,
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
    });

    setIsCompleted(true);
    setIsSending(false);
    setHistory(storageService.getHistory());
  };

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

  // 9. Config Action
  const handleSaveConfig = (updated: Partial<typeof config>) => {
    storageService.saveConfig(updated);
    setConfig((prev) => ({ ...prev, ...updated }));
  };

  return (
    <div className="min-h-screen bg-[#fbfbfb] text-[#1c1c1c] flex flex-col font-sans">
      {/* Top Header */}
      <Header
        status={whatsAppStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshStatus={checkStatus}
        isCheckingStatus={isCheckingStatus}
        isMockMode={isMockMode}
        onToggleMockMode={() => setIsMockMode(!isMockMode)}
        onOpenTestModal={() => setIsTestModalOpen(true)}
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
              isSending={isSending}
              hasFolderSelected={Boolean(folderPath)}
              templates={templates}
              activeTemplateId={activeTemplateId}
              onSelectTemplate={handleSelectTemplate}
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
        onCheckStatus={checkStatus}
        isChecking={isCheckingStatus}
        qrCodeUrl={qrCodeUrl}
        onStartSession={async () => {
          await openWaProvider.createSession();
          await openWaProvider.startSession();
          await checkStatus();
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
        matchedItems={matchedItems}
        whatsAppStatus={whatsAppStatus}
        delaySeconds={config.delaySeconds || 3}
        templates={templates}
        activeTemplateId={activeTemplateId}
        onSelectTemplate={handleSelectTemplate}
      />

      <SendingProgressModal
        isOpen={isProgressOpen}
        onClose={() => setIsProgressOpen(false)}
        progressEvent={progressEvent}
        isCompleted={isCompleted}
        onCancel={() => {
          cancelSendingRef.current = true;
          setIsSending(false);
          setIsCompleted(true);
        }}
      />
    </div>
  );
}
