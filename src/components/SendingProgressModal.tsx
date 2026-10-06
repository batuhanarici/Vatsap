import React from 'react';
import { QueueProgressEvent } from '../services/senderQueue';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Clock,
  Pause,
  Play,
  FileCheck,
  RotateCcw,
  StopCircle,
} from 'lucide-react';

interface SendingProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  progressEvent: QueueProgressEvent | null;
  isCompleted: boolean;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onCancel: () => void;
  onRetryFailed?: () => void;
}

export const SendingProgressModal: React.FC<SendingProgressModalProps> = ({
  isOpen,
  onClose,
  progressEvent,
  isCompleted,
  isPaused = false,
  onTogglePause,
  onCancel,
  onRetryFailed,
}) => {
  if (!isOpen || !progressEvent) return null;

  const {
    currentIndex,
    totalCount,
    currentItem,
    phase,
    successCount,
    partialSuccessCount = 0,
    failedCount,
    cancelledCount = 0,
    retryAttempt,
  } = progressEvent;

  const progressPercent = totalCount > 0 ? Math.round((currentIndex / totalCount) * 100) : 0;

  const getPhaseDescription = () => {
    switch (phase) {
      case 'sending_text':
        return 'WhatsApp metin mesajı iletiliyor...';
      case 'sending_pdf':
        return 'PDF karne belgesi aktarılıyor...';
      case 'retrying':
        return `Tekrar deneniyor (${retryAttempt || 2}. deneme)...`;
      case 'waiting_delay':
        return 'Güvenlik aralığı bekleniyor...';
      case 'waiting_network':
        return 'İnternet bağlantısı koptu! Bağlantı bekleniyor...';
      case 'paused':
        return 'Kuyruk duraklatıldı.';
      case 'completed':
        return 'Gönderim süreci tamamlandı.';
      default:
        return 'İşleniyor...';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-neutral-900 dark:text-neutral-100 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50">
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isCompleted
                  ? 'bg-emerald-500'
                  : isPaused
                  ? 'bg-amber-500'
                  : 'bg-indigo-500 animate-pulse'
              }`}
            />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {isCompleted
                ? 'Gönderim Raporu'
                : isPaused
                ? 'Gönderim Duraklatıldı'
                : 'Karneler Gönderiliyor'}
            </h2>
          </div>
          {isCompleted && (
            <button
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 mb-1.5 font-medium">
              <span>
                İlerleme ({currentIndex} / {totalCount})
              </span>
              <span className="font-mono font-semibold text-neutral-900 dark:text-white">
                %{progressPercent}
              </span>
            </div>
            <div className="w-full h-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden border border-neutral-200 dark:border-neutral-700">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isCompleted ? 'bg-emerald-500' : isPaused ? 'bg-amber-500' : 'bg-indigo-600'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Current Processing Item Banner */}
          {currentItem && !isCompleted && (
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded-lg space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  Şu Anda İşlenen:
                </span>
                <span className="flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-300 font-mono font-medium">
                  <Clock className="w-3 h-3 text-indigo-500" />
                  <span>{getPhaseDescription()}</span>
                </span>
              </div>
              <div className="font-semibold text-neutral-900 dark:text-white text-sm flex items-center justify-between">
                <span>{currentItem.student.studentName}</span>
                <span className="text-xs font-mono text-neutral-500">
                  {currentItem.student.phone}
                </span>
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
                <span>Veli: {currentItem.student.parentName || '-'}</span>
                {currentItem.pdfFile && (
                  <span className="font-mono truncate max-w-[200px]">
                    {currentItem.pdfFile.name}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 4-Stat Breakdown Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {/* Tam Başarılı */}
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 mb-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">Başarılı</span>
              </div>
              <span className="font-bold text-base text-emerald-900 dark:text-emerald-200 font-mono">
                {successCount}
              </span>
              <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 block">
                PDF + Mesaj
              </span>
            </div>

            {/* Kısmi Başarılı */}
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 mb-0.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">Kısmi</span>
              </div>
              <span className="font-bold text-base text-amber-900 dark:text-amber-200 font-mono">
                {partialSuccessCount}
              </span>
              <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 block">
                Yalnız Mesaj
              </span>
            </div>

            {/* Hatalı */}
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg">
              <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 mb-0.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">Hatalı</span>
              </div>
              <span className="font-bold text-base text-rose-900 dark:text-rose-200 font-mono">
                {failedCount}
              </span>
              <span className="text-[10px] text-rose-700/80 dark:text-rose-400/80 block">
                İletilemedi
              </span>
            </div>

            {/* İptal Edilen */}
            <div className="p-2.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
              <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 mb-0.5">
                <StopCircle className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">İptal</span>
              </div>
              <span className="font-bold text-base text-neutral-800 dark:text-neutral-200 font-mono">
                {cancelledCount}
              </span>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block">
                Durduruldu
              </span>
            </div>
          </div>

          {/* Action Footer: Running Controls vs Completed Summary Actions */}
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2 flex-wrap">
            {!isCompleted ? (
              <>
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                  {isPaused ? (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                      <Pause className="w-3.5 h-3.5" />
                      <span>Kuyruk duraklatıldı</span>
                    </span>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                      <span>Gönderim devam ediyor...</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {onTogglePause && (
                    <button
                      type="button"
                      onClick={onTogglePause}
                      className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Devam Ettir</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5 text-amber-600" />
                          <span>Duraklat</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    <span>Durdur / İptal</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full flex items-center justify-between gap-2">
                {(failedCount > 0 || partialSuccessCount > 0) && onRetryFailed ? (
                  <button
                    type="button"
                    onClick={onRetryFailed}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Başarısızları Tekrar Gönder ({failedCount + partialSuccessCount})</span>
                  </button>
                ) : (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <FileCheck className="w-4 h-4" />
                    <span>Tüm işlemler başarıyla sonuçlandı.</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer ml-auto"
                >
                  Tamamla ve Kapat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
