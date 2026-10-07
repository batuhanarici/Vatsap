import React, { useState } from 'react';
import {
  FullBackupData,
  BackupValidationResult,
  ImportBackupOptions,
} from '../services/storageService';
import {
  X,
  Database,
  Users,
  MessageSquare,
  History,
  Settings,
  Clock,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface BackupPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  validationResult: BackupValidationResult | null;
  onConfirmImport: (data: FullBackupData, options: ImportBackupOptions) => void;
}

export const BackupPreviewModal: React.FC<BackupPreviewModalProps> = ({
  isOpen,
  onClose,
  fileName,
  validationResult,
  onConfirmImport,
}) => {
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [importSections, setImportSections] = useState({
    students: true,
    templates: true,
    history: true,
    config: true,
    schedule: true,
  });

  if (!isOpen || !validationResult) return null;

  const { isValid, errors, warnings, stats, data } = validationResult;

  const handleToggleSection = (key: keyof typeof importSections) => {
    setImportSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirm = () => {
    if (!data) return;
    onConfirmImport(data, {
      mode: importMode,
      sections: importSections,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/60 dark:bg-neutral-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Yedek Dosyası Önizleme &amp; İçe Aktarma
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate max-w-sm">
                {fileName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Invalid File State */}
          {!isValid && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-semibold text-sm">
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Geçersiz Yedek Dosyası</span>
              </div>
              <p className="text-rose-700 dark:text-rose-400 text-xs">
                Seçilen dosya doğrulanamadı ve içe aktarılamaz:
              </p>
              <ul className="list-disc list-inside space-y-1 text-rose-800 dark:text-rose-300 pl-1">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Valid File Content */}
          {isValid && stats && data && (
            <>
              {/* Meta & Security Status */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl text-neutral-600 dark:text-neutral-300">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {data.app} v{stats.version}
                  </span>
                  <span className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded font-mono text-[10px] font-semibold">
                    Şema v{stats.schemaVersion}
                  </span>
                  <span className="text-neutral-400 text-[11px]">
                    {new Date(stats.exportedAt).toLocaleDateString('tr-TR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {!stats.containsSecrets ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded-md font-semibold text-[11px] border border-emerald-200 dark:border-emerald-800">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Güvenli Yedek (API Key Yok)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 rounded-md font-semibold text-[11px] border border-amber-300 dark:border-amber-800">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Gizli Anahtar/Token İçerir</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Warnings Banner */}
              {warnings.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Dikkat Edilmesi Gereken Hususlar:</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-800/90 dark:text-amber-300/90 pl-1 space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Content Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30 flex flex-col items-center text-center">
                  <Users className="w-5 h-5 text-blue-500 mb-1" />
                  <span className="text-base font-bold text-neutral-900 dark:text-white">
                    {stats.studentCount}
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Öğrenci
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30 flex flex-col items-center text-center">
                  <MessageSquare className="w-5 h-5 text-indigo-500 mb-1" />
                  <span className="text-base font-bold text-neutral-900 dark:text-white">
                    {stats.templateCount}
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Şablon
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30 flex flex-col items-center text-center">
                  <History className="w-5 h-5 text-emerald-500 mb-1" />
                  <span className="text-base font-bold text-neutral-900 dark:text-white">
                    {stats.historyCount}
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Geçmiş Kayıt
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30 flex flex-col items-center text-center">
                  <Settings className="w-5 h-5 text-purple-500 mb-1" />
                  <span className="text-base font-bold text-neutral-900 dark:text-white">
                    {stats.hasConfig ? 'Var' : 'Yok'}
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Yapılandırma
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30 flex flex-col items-center text-center col-span-2 sm:col-span-1">
                  <Clock className="w-5 h-5 text-amber-500 mb-1" />
                  <span className="text-base font-bold text-neutral-900 dark:text-white">
                    {stats.hasSchedule ? 'Var' : 'Yok'}
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Zamanlama
                  </span>
                </div>
              </div>

              {/* Import Strategy: Merge vs. Overwrite */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-3">
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">
                  İçe Aktarma Yöntemi:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'merge'
                        ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 shadow-xs'
                        : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="merge"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="font-semibold block text-xs">
                        Birleştir (Merge) — Tavsiye Edilen
                      </span>
                      <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">
                        Mevcut verilerinizi korur, yedekteki yeni öğrencileri ve şablonları ekler.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'overwrite'
                        ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 shadow-xs'
                        : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="overwrite"
                      checked={importMode === 'overwrite'}
                      onChange={() => setImportMode('overwrite')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <span className="font-semibold block text-xs">
                        Üzerine Yaz (Overwrite)
                      </span>
                      <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">
                        Mevcut seçilen verileri temizler ve yedeğin birebir kopyasını yükler.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Section Checkboxes */}
              <div className="space-y-2">
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">
                  İçe Aktarılacak Bölümleri Seçin:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={importSections.students}
                      onChange={() => handleToggleSection('students')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Öğrenciler ({stats.studentCount})</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={importSections.templates}
                      onChange={() => handleToggleSection('templates')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Şablonlar ({stats.templateCount})</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={importSections.history}
                      onChange={() => handleToggleSection('history')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Geçmiş ({stats.historyCount})</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={importSections.config}
                      onChange={() => handleToggleSection('config')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Sistem Ayarları</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={importSections.schedule}
                      onChange={() => handleToggleSection('schedule')}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Zamanlanmış Gönderim</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-800/60 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-lg font-medium text-xs cursor-pointer"
          >
            Vazgeç
          </button>

          {isValid && (
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-5 py-2.5 rounded-lg font-semibold text-xs text-white shadow-xs flex items-center gap-2 cursor-pointer transition-all ${
                importMode === 'overwrite'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {importMode === 'overwrite'
                  ? 'Üzerine Yazarak İçe Aktar'
                  : 'Birleştirerek İçe Aktar'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
