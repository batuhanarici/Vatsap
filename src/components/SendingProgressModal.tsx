import React from 'react';
import { QueueProgressEvent } from '../services/senderQueue';
import { CheckCircle2, AlertCircle, RefreshCw, X, Clock } from 'lucide-react';

interface SendingProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  progressEvent: QueueProgressEvent | null;
  isCompleted: boolean;
  onCancel: () => void;
}

export const SendingProgressModal: React.FC<SendingProgressModalProps> = ({
  isOpen,
  onClose,
  progressEvent,
  isCompleted,
  onCancel,
}) => {
  if (!isOpen || !progressEvent) return null;

  const { currentIndex, totalCount, currentItem, phase, successCount, failedCount } = progressEvent;
  const progressPercent = totalCount > 0 ? Math.round((currentIndex / totalCount) * 100) : 0;

  const getPhaseDescription = () => {
    switch (phase) {
      case 'sending_text':
        return 'WhatsApp metin mesajı gönderiliyor...';
      case 'sending_pdf':
        return 'PDF karnesi aktarılıyor...';
      case 'waiting_delay':
        return 'Güvenlik aralığı bekleniyor...';
      case 'completed':
        return 'Gönderim tamamlandı.';
      default:
        return 'İşleniyor...';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-neutral-900 dark:text-neutral-100 transition-colors">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {isCompleted ? 'Gönderim Tamamlandı' : 'Karneler Gönderiliyor'}
          </h2>
          {isCompleted && (
            <button
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 mb-1.5 font-medium">
              <span>İlerleme ({currentIndex} / {totalCount})</span>
              <span className="font-mono font-semibold text-neutral-900 dark:text-white">%{progressPercent}</span>
            </div>
            <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden border border-neutral-200 dark:border-neutral-700">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          {/* Current Processing Item */}
          {currentItem && !isCompleted && (
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded-lg space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">İşlenen Öğrenci:</span>
                <span className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                  <Clock className="w-3 h-3" />
                  <span>{getPhaseDescription()}</span>
                </span>
              </div>
              <div className="font-semibold text-neutral-900 dark:text-white text-sm">
                {currentItem.student.studentName}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between font-mono">
                <span>Veli: {currentItem.student.parentName}</span>
                <span>Tel: {currentItem.student.phone}</span>
              </div>
            </div>
          )}

          {/* Success / Failed Counters */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <span className="block text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">Başarılı</span>
                <span className="font-bold text-sm text-emerald-900 dark:text-emerald-200 font-mono">{successCount}</span>
              </div>
            </div>

            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <div>
                <span className="block text-[10px] text-rose-700 dark:text-rose-400 font-medium">Hatalı</span>
                <span className="font-bold text-sm text-rose-900 dark:text-rose-200 font-mono">{failedCount}</span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            {!isCompleted ? (
              <>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 font-mono">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-neutral-400" />
                  <span>Kuyruk çalışıyor...</span>
                </span>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-3.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Gönderimi Durdur
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                Pencereyi Kapat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
