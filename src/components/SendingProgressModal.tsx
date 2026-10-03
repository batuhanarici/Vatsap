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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-neutral-50/50">
          <h2 className="text-sm font-semibold text-neutral-900">
            {isCompleted ? 'Gönderim Tamamlandı' : 'Karneler Gönderiliyor'}
          </h2>
          {isCompleted && (
            <button
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-600 mb-1.5 font-medium">
              <span>
                {currentIndex} / {totalCount} Öğrenci
              </span>
              <span>%{progressPercent}</span>
            </div>
            <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isCompleted ? 'bg-emerald-600' : 'bg-neutral-900'
                }`}
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          {/* Current Student Card */}
          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] text-neutral-400 block">Şu Anki Öğrenci</span>
                <span className="text-xs font-semibold text-neutral-900">
                  {currentItem.student.studentName}
                </span>
                <span className="text-xs text-neutral-500 ml-1.5">
                  ({currentItem.student.parentName})
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-neutral-400 block">Dosya</span>
                <span className="text-xs font-mono text-neutral-700 truncate max-w-[150px] inline-block">
                  {currentItem.pdfFile?.name || '—'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-200/70 flex items-center gap-2 text-xs">
              {!isCompleted ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-neutral-500 shrink-0" />
                  <span className="text-neutral-700 font-medium">
                    {getPhaseDescription()}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 font-medium">
                    Tüm işlemler tamamlandı.
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Status Counter */}
          <div className="grid grid-cols-2 gap-3 text-center text-xs">
            <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded">
              <span className="text-[11px] text-emerald-700 block">Başarılı</span>
              <span className="text-base font-semibold text-emerald-800">
                {successCount}
              </span>
            </div>
            <div className="p-2.5 bg-rose-50/70 border border-rose-200 rounded">
              <span className="text-[11px] text-rose-700 block">Hata</span>
              <span className="text-base font-semibold text-rose-800">
                {failedCount}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-neutral-100 flex items-center justify-end">
            {!isCompleted ? (
              <button
                onClick={onCancel}
                className="px-4 py-2 border border-neutral-300 rounded text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Gönderimi Durdur
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-5 py-2 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors"
              >
                Kapat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
