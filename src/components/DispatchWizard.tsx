import React, { useState } from 'react';
import {
  Users,
  FolderOpen,
  FileCheck,
  MessageSquare,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Send,
  FileText,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Student, StudentFormData } from '../types/student';
import { LocalPdfFile, MatchedItem } from '../types/pdf';
import { OcrScanProgress } from '../services/pdfTextExtractor';
import { MessageTemplate } from '../types/template';
import { WhatsAppStatus } from '../types/whatsapp';
import { formatMessage } from '../services/templateService';
import { StudentManagement } from './StudentManagement';
import { FolderSelector } from './FolderSelector';
import { MatchingTable } from './MatchingTable';
import { TemplateEditor } from './TemplateEditor';

export type WizardStep = 1 | 2 | 3 | 4 | 5;

interface DispatchWizardProps {
  currentStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
  students: Student[];
  pdfFiles: LocalPdfFile[];
  matchedItems: MatchedItem[];
  folderPath: string;
  whatsAppStatus: WhatsAppStatus;
  templates: MessageTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (id: string) => void;
  onSaveTemplates: (templates: MessageTemplate[]) => void;
  onFolderSelected: (path: string, files: LocalPdfFile[]) => void;
  onLoadSamplePdfs: () => void;
  onClearFolder: () => void;
  onAddStudent: (data: StudentFormData) => void;
  onUpdateStudent: (id: string, data: StudentFormData) => void;
  onDeleteStudent: (id: string) => void;
  onResetStudents: () => void;
  onBulkAddStudents: (students: Student[]) => void;
  onClearAllStudents: () => void;
  onInitiateImportBackup: (fileName: string, jsonString: string) => void;
  onConfirmMatch: (id: string) => void;
  onOpenManualMatch: (item: MatchedItem) => void;
  onPreviewItem: (item: MatchedItem) => void;
  onOpenReconcile: (item: MatchedItem) => void;
  onConfirmSend: (examName: string, sendToSecondaryParents?: boolean) => void;
  onRetrySingleItem: (item: MatchedItem) => void;
  isSending: boolean;
  config: {
    examName?: string;
    schoolName?: string;
    delaySeconds?: number;
    maxRetries?: number;
    retryDelaySeconds?: number;
  };
  onCheckStatus: () => void;
  isCheckingStatus: boolean;
  // OCR props
  isOcrScanning?: boolean;
  ocrProgress?: OcrScanProgress | null;
  onStartOcrScan?: () => void;
  isVisualOcrRunning?: boolean;
  visualOcrProgress?: OcrScanProgress | null;
  onStartVisualOcr?: () => void;
  onOpenOcrFailureModal?: () => void;
  failedOcrCount?: number;
  unassignedPdfCount?: number;
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
}

export const DispatchWizard: React.FC<DispatchWizardProps> = ({
  currentStep,
  onStepChange,
  students,
  pdfFiles,
  matchedItems,
  folderPath,
  whatsAppStatus,
  templates,
  activeTemplateId,
  onSelectTemplate,
  onSaveTemplates,
  onFolderSelected,
  onLoadSamplePdfs,
  onClearFolder,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onResetStudents,
  onBulkAddStudents,
  onClearAllStudents,
  onInitiateImportBackup,
  onConfirmMatch,
  onOpenManualMatch,
  onPreviewItem,
  onOpenReconcile,
  onConfirmSend,
  onRetrySingleItem,
  isSending,
  config,
  onCheckStatus,
  isCheckingStatus,
  isOcrScanning,
  ocrProgress,
  onStartOcrScan,
  isVisualOcrRunning,
  visualOcrProgress,
  onStartVisualOcr,
  onOpenOcrFailureModal,
  failedOcrCount = 0,
  unassignedPdfCount = 0,
  selectedGroup,
  onSelectGroup,
}) => {
  // Step 5 parameters state
  const [examName, setExamName] = useState(config.examName || 'Genel Değerlendirme ve Deneme Sınavı');
  const [sendToSecondaryParents, setSendToSecondaryParents] = useState(false);

  // Stats calculations across matchedItems
  const targetItems = selectedGroup === 'all'
    ? matchedItems
    : matchedItems.filter((i) => (i.student.group || 'Genel') === selectedGroup);

  const readyItems = targetItems.filter((i) => i.status === 'ready' && i.sendingStatus !== 'unknown' && !i.needsConfirmation && !i.hasConflict);
  const pendingItems = targetItems.filter((i) => i.status === 'pending_confirmation' || i.needsConfirmation);
  const missingItems = targetItems.filter((i) => i.status === 'missing_pdf');
  const conflictItems = targetItems.filter((i) => i.hasConflict);
  const unknownItems = targetItems.filter((i) => i.sendingStatus === 'unknown');
  const invalidPhoneItems = targetItems.filter((i) => i.status === 'invalid_phone');

  const readyCount = readyItems.length;
  const pendingCount = pendingItems.length;
  const missingCount = missingItems.length;
  const conflictCount = conflictItems.length;
  const unknownCount = unknownItems.length;
  const invalidPhoneCount = invalidPhoneItems.length;

  const selectedTemplate = templates.find((t) => t.id === activeTemplateId) || templates[0];
  const sampleStudentForPreview = readyItems[0]?.student || students[0] || {
    id: 'sample',
    studentName: 'Ahmet Yılmaz',
    parentName: 'Mehmet Yılmaz',
    phone: '905321112233',
    group: '8-A',
  };

  const stepsConfig = [
    {
      step: 1 as WizardStep,
      title: 'Öğrenciler',
      desc: `${students.length} Öğrenci Kayıtlı`,
      icon: Users,
      isCompleted: students.length > 0,
    },
    {
      step: 2 as WizardStep,
      title: 'Karneler',
      desc: `${pdfFiles.length} PDF Yüklü`,
      icon: FolderOpen,
      isCompleted: pdfFiles.length > 0,
    },
    {
      step: 3 as WizardStep,
      title: 'Eşleştirme',
      desc: `${readyCount} Hazır, ${pendingCount} Onay Bekliyor`,
      icon: FileCheck,
      isCompleted: readyCount > 0 && pendingCount === 0,
    },
    {
      step: 4 as WizardStep,
      title: 'Mesaj & Önizleme',
      desc: selectedTemplate?.title || 'Şablon Seçili',
      icon: MessageSquare,
      isCompleted: Boolean(selectedTemplate),
    },
    {
      step: 5 as WizardStep,
      title: 'Son Kontrol & Gönderim',
      desc: `${readyCount} Karne Gönderime Hazır`,
      icon: ShieldCheck,
      isCompleted: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 5-Step Stepper Navigation Header */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-2xs transition-colors">
        <nav aria-label="Gönderim Sihirbazı Adımları" className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {stepsConfig.map((item) => {
            const Icon = item.icon;
            const isCurrent = currentStep === item.step;
            const isPassed = currentStep > item.step || item.isCompleted;

            return (
              <button
                key={item.step}
                type="button"
                onClick={() => onStepChange(item.step)}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all cursor-pointer border ${
                  isCurrent
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white shadow-2xs'
                    : isPassed
                    ? 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    : 'bg-white dark:bg-neutral-900 border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-xs font-semibold ${
                    isCurrent
                      ? 'bg-white/20 text-white dark:bg-neutral-900/20 dark:text-neutral-900'
                      : isPassed
                      ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {isPassed && !isCurrent ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <span>{item.step}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate leading-tight">
                    {item.title}
                  </div>
                  <div
                    className={`text-[10px] truncate leading-tight mt-0.5 ${
                      isCurrent
                        ? 'text-neutral-300 dark:text-neutral-600'
                        : 'text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {item.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Step Content Containers */}
      {/* ------------------------------------------------------------- */}
      {/* ADIM 1: ÖĞRENCİLER                                            */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>1. Adım: Öğrenci Listesi ve İçe Aktarma</span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Karnesi gönderilecek öğrencileri Excel veya CSV ile içe aktarın ya da manuel olarak ekleyin.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStepChange(2)}
                disabled={students.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
              >
                <span>Sonraki Adım: Karneler</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <StudentManagement
            students={students}
            onAddStudent={onAddStudent}
            onUpdateStudent={onUpdateStudent}
            onDeleteStudent={onDeleteStudent}
            onResetToDefaults={onResetStudents}
            onBulkAddStudents={onBulkAddStudents}
            onClearAllStudents={onClearAllStudents}
            onInitiateImportBackup={onInitiateImportBackup}
          />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ADIM 2: KARNELER (PDF KLASÖRÜ)                                */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>2. Adım: Karne PDF Klasörü Seçimi</span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Öğrenci karnelerinin bulunduğu klasörü seçin veya örnek klasörü yükleyin.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStepChange(1)}
                className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Önceki Adım: Öğrenciler</span>
              </button>

              <button
                type="button"
                onClick={() => onStepChange(3)}
                disabled={pdfFiles.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
              >
                <span>Sonraki Adım: Eşleştirme</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <FolderSelector
            folderPath={folderPath}
            pdfFiles={pdfFiles}
            onFolderSelected={onFolderSelected}
            onLoadSamplePdfs={onLoadSamplePdfs}
            onClear={onClearFolder}
          />

          {/* Quick PDF File List Preview */}
          {pdfFiles.length > 0 && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden shadow-2xs">
              <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-900 dark:text-white">
                  Seçilen Klasördeki PDF Dosyaları ({pdfFiles.length} Belge)
                </span>
                <span className="text-[11px] text-neutral-500 font-mono">
                  Toplam Boyut: {(pdfFiles.reduce((acc, f) => acc + (f.size || 0), 0) / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                {pdfFiles.map((f, idx) => (
                  <div key={idx} className="px-4 py-2.5 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <div className="flex items-center gap-2.5 truncate max-w-md">
                      <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="font-mono text-neutral-800 dark:text-neutral-200 truncate">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono shrink-0">
                      {f.extractedText ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-sans">Metin Katmanı Mevcut</span>
                      ) : (
                        <span className="text-neutral-400 font-sans">Salt Dosya Adı / Görsel</span>
                      )}
                      <span>{f.size ? `${(f.size / 1024).toFixed(1)} KB` : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ADIM 3: EŞLEŞTİRME VE ÇAKIŞMA KONTROLÜ                       */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>3. Adım: Öğrenci - Karne Eşleştirmesi ve Doğrulama</span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Eşleşme skorlarını ve çakışmaları inceleyin. Düşük güvenli veya çakışmalı eşleşmeleri onaylayın.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStepChange(2)}
                className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Önceki Adım: Karneler</span>
              </button>

              <button
                type="button"
                onClick={() => onStepChange(4)}
                className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer shadow-2xs"
              >
                <span>Sonraki Adım: Mesaj & Önizleme</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Critical Warning if Pending Confirmation items exist */}
          {pendingCount > 0 && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">
                  Güvenlik Kuralı: {pendingCount} adet eşleşme onay bekliyor.
                </span>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  Düşük uyum skoruna veya isim çakışmasına sahip belgeler siz tabloda <strong>&quot;Onayla&quot;</strong> butonuna basmadığınız sürece <strong>asla gönderim kuyruğuna alınmayacaktır</strong>.
                </p>
              </div>
            </div>
          )}

          <MatchingTable
            matchedItems={matchedItems}
            whatsAppStatus={whatsAppStatus}
            onStartBatchSend={() => onStepChange(5)}
            onRetrySingleItem={onRetrySingleItem}
            onPreviewItem={onPreviewItem}
            isSending={isSending}
            hasFolderSelected={Boolean(folderPath)}
            templates={templates}
            activeTemplateId={activeTemplateId}
            onSelectTemplate={onSelectTemplate}
            isOcrScanning={isOcrScanning}
            ocrProgress={ocrProgress}
            onStartOcrScan={onStartOcrScan}
            isVisualOcrRunning={isVisualOcrRunning}
            visualOcrProgress={visualOcrProgress}
            onStartVisualOcr={onStartVisualOcr}
            onOpenOcrFailureModal={onOpenOcrFailureModal}
            failedOcrCount={failedOcrCount}
            unassignedPdfCount={unassignedPdfCount}
            selectedGroup={selectedGroup}
            onSelectGroup={onSelectGroup}
            onConfirmMatch={onConfirmMatch}
            onOpenManualMatch={onOpenManualMatch}
            onOpenReconcile={onOpenReconcile}
          />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ADIM 4: MESAJ VE ÖNİZLEME                                     */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>4. Adım: Mesaj Şablonu ve Canlı Önizleme</span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Velilere gönderilecek mesaj şablonunu seçin, düzenleyin ve alıcı bazlı canlı önizlemesini test edin.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStepChange(3)}
                className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Önceki Adım: Eşleştirme</span>
              </button>

              <button
                type="button"
                onClick={() => onStepChange(5)}
                className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer shadow-2xs"
              >
                <span>Sonraki Adım: Son Kontrol</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <TemplateEditor
            templates={templates}
            activeTemplateId={activeTemplateId}
            onSelectTemplate={onSelectTemplate}
            onSaveTemplates={onSaveTemplates}
            sampleStudent={sampleStudentForPreview}
          />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ADIM 5: SON KONTROL VE GÜVENLİ GÖNDERİM                       */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 5 && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>5. Adım: Son Kontrol ve Güvenli Gönderim Onayı</span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Tüm kayıtların sayılarını, bağlantı durumunu ve sınav ayarlarını son kez kontrol ederek gönderimi başlatın.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStepChange(4)}
                className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Önceki Adım: Mesaj & Önizleme</span>
              </button>
            </div>
          </div>

          {/* Critical Conflict Alert in Step 5 */}
          {conflictCount > 0 && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">
                  Güvenlik Kuralı: {conflictCount} adet çakışmalı eşleşme bulundu.
                </span>
                <p className="text-[11px] leading-relaxed text-rose-800 dark:text-rose-300">
                  Aynı PDF karnesi birden fazla öğrenciye atanmış olduğundan, yanlış kişiye karne gönderilmesini önlemek amacıyla bu belgeler <strong>kesinlikle gönderim kuyruğuna alınmaz</strong>. Lütfen 3. Adım&apos;a dönerek eşleştirmeleri düzeltiniz.
                </p>
              </div>
            </div>
          )}

          {/* Pre-Flight Checklist Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-2xs">
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                Gönderime Hazır
              </span>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white mt-1">
                {readyCount}
              </div>
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Doğrulanmış &amp; Eşleşmiş
              </span>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-2xs">
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                Onay Bekliyor (Gönderilmez)
              </span>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white mt-1">
                {pendingCount}
              </div>
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Düşük güven veya çakışma
              </span>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-2xs">
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                PDF Yok (Gönderilmez)
              </span>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white mt-1">
                {missingCount}
              </div>
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Belge eşleşmedi
              </span>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-2xs">
              <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400 uppercase tracking-wider block">
                Belirsiz / Bilinmeyen
              </span>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white mt-1">
                {unknownCount}
              </div>
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Mükerrer koruması devrede
              </span>
            </div>
          </div>

          {/* Connection & Configuration Panel */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full shrink-0 ${
                    whatsAppStatus.state === 'connected'
                      ? 'bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950/60'
                      : 'bg-rose-500 ring-4 ring-rose-100 dark:ring-rose-950/60'
                  }`}
                />
                <div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                    WhatsApp Oturumu:{' '}
                    {whatsAppStatus.state === 'connected' ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Bağlı ({whatsAppStatus.phoneConnected || 'Aktif'})
                      </span>
                    ) : (
                      <span className="text-rose-700 dark:text-rose-400">
                        Bağlantı Yok ({whatsAppStatus.details || 'Oturum açılmadı'})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Gönderim Main Process SQLite rezervasyonu ve yetkili dispatch motoru üzerinden gerçekleştirilir.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onCheckStatus}
                disabled={isCheckingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                <span>Durumu Yenile</span>
              </button>
            </div>

            {/* Inputs: Exam Name & Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Sınav / Rapor Başlığı:
                </label>
                <input
                  type="text"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="Örn: 8. Sınıf LGS 1. Deneme Sınavı"
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Mesajdaki {'{sinav_adi}'} değişkeni ve SQLite dispatch anahtarında kullanılır.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Gönderim Ayarları &amp; Süre:
                </label>
                <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Mesaj Başına Gecikme:</span>
                    <span className="font-semibold font-mono">{config.delaySeconds || 3} saniye</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Tahmini Toplam Süre:</span>
                    <span className="font-semibold font-mono">
                      ~{Math.ceil((readyCount * ((config.delaySeconds || 3) + 2)) / 60)} dakika
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2nd parent delivery checkbox */}
            <div className="pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendToSecondaryParents}
                  onChange={(e) => setSendToSecondaryParents(e.target.checked)}
                  className="mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 block">
                    Kayıtlı ise 2. Veli Numarasına da İlet
                  </span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block">
                    Öğrencinin ikinci bir veli telefonu varsa, birincil gönderim başarılı olduktan sonra otomatik olarak iletilir.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Legal / Safety Confirmation Notice */}
          <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
            <div className="flex items-center gap-2 text-neutral-900 dark:text-white font-semibold">
              <HelpCircle className="w-4 h-4 text-neutral-500 shrink-0" />
              <span>Güvenlik ve Teslimat Güvencesi Bildirimi:</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              1. <strong>İletildi (sent)</strong> durumu, mesaj ve belgenin WhatsApp sunucuları tarafından işleme alındığını ifade eder. Sağlayıcı teslimat kanıtı vermedikçe kesin okundu garantisi değildir.
              <br />
              2. <strong>Belirsiz (unknown)</strong> durumdaki veya henüz <strong>onaylanmamış</strong> karneler mükerrer (çift) mesajı önlemek amacıyla bu kuyrukta <strong>gönderilmez</strong>.
            </p>
          </div>

          {/* Action Trigger Card */}
          <div className="p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                {readyCount > 0
                  ? `${readyCount} Adet Karne Gönderilmeye Hazır`
                  : 'Gönderilecek Hazır Karne Bulunmuyor'}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {whatsAppStatus.state !== 'connected'
                  ? 'WhatsApp oturumu bağlı olmadığı için gönderim başlatılamaz.'
                  : readyCount === 0
                  ? 'Lütfen önceki adımlara dönerek öğrenci ve PDF eşleşmelerini tamamlayın.'
                  : 'Butona basıldığında gönderim sırası güvenli rezervasyonla başlayacaktır.'}
              </div>
            </div>

            <button
              type="button"
              disabled={readyCount === 0 || whatsAppStatus.state !== 'connected' || isSending}
              onClick={() => onConfirmSend(examName, sendToSecondaryParents)}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md transition-all disabled:opacity-40 cursor-pointer shrink-0 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSending
                  ? 'Gönderim Devam Ediyor...'
                  : `Güvenli Gönderimi Başlat (${readyCount} Karne)`}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
