import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, X } from 'lucide-react';

interface LiveModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLiveMode: () => Promise<void> | void;
}

export const LiveModeModal: React.FC<LiveModeModalProps> = ({
  isOpen,
  onClose,
  onConfirmLiveMode,
}) => {
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAuthorize = async () => {
    if (!hasAcknowledged) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.liveMode?.authorize) {
        const res = await window.electronAPI.liveMode.authorize({
          confirmationPhrase: 'CANLI_GONDERIM_ONAYLI',
          durationMinutes: 15,
        });
        if (!res.success) {
          setError(res.error || 'Canlı mod yetkilendirmesi başarısız oldu.');
          setIsSubmitting(false);
          return;
        }
      }
      await onConfirmLiveMode();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Yetkilendirme sırasında bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/60 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-neutral-900 dark:text-neutral-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-red-100 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/40">
          <div className="flex items-center gap-2.5 text-red-700 dark:text-red-400">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h3 className="text-sm font-semibold tracking-tight">
              Canlı Gönderim Yetkilendirmesi
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                DİKKAT: Gerçek WhatsApp Moduna Geçmek Üzeresiniz!
              </p>
              <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                Bu modda yapılacak tüm gönderimler velilerin ve öğrencilerin kayıtlı gerçek telefon hatlarına doğrudan iletilecektir.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-neutral-600 dark:text-neutral-300">
            <p className="font-medium text-neutral-900 dark:text-neutral-100">
              Main Process Güvenlik Kuralları:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-[11px]">
              <li>
                Canlı gönderim izni yalnızca bu oturum için (15 dakika) geçerlidir.
              </li>
              <li>
                Uygulama yeniden başlatıldığında canlı yetki otomatik olarak iptal edilir ve Test Moduna dönülür.
              </li>
              <li>
                Daha önce gönderilmiş (sent) veya belirsiz (unknown) kayıtlar mükerrer gönderilmez.
              </li>
            </ul>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
              className="mt-0.5 rounded text-red-600 focus:ring-red-500"
            />
            <span className="text-[11px] leading-snug font-medium text-neutral-800 dark:text-neutral-200">
              Karnelerin gerçek veli numaralarına iletileceğini anladım ve canlı gönderim yetkisini onaylıyorum.
            </span>
          </label>

          {error && (
            <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-[11px]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            İptal (Test Modunda Kal)
          </button>
          <button
            type="button"
            disabled={!hasAcknowledged || isSubmitting}
            onClick={handleAuthorize}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Yetkilendiriliyor...' : 'Canlı Modu Yetkilendir'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
