import React, { useState } from 'react';
import { HistoryItem } from '../types/history';
import { MatchedItem } from '../types/pdf';
import { storageService } from '../services/storageService';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileText,
  Phone,
  User,
  Calendar,
  ShieldCheck,
  Send,
  HelpCircle,
  AlertCircle,
} from 'lucide-react';

interface ReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: HistoryItem | MatchedItem | null;
  onReconciled: (result: { action: 'confirm_delivered' | 'authorize_retry'; retryToken?: string }) => void;
}

export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({
  isOpen,
  onClose,
  item,
  onReconciled,
}) => {
  const [selectedAction, setSelectedAction] = useState<'confirm_delivered' | 'authorize_retry'>('confirm_delivered');
  const [reason, setReason] = useState('');
  const [confirmDuplicateRisk, setConfirmDuplicateRisk] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  // Extract common fields whether item is HistoryItem or MatchedItem
  const studentName = 'studentName' in item ? item.studentName : item.student.studentName;
  const parentName = 'parentName' in item ? item.parentName : (item.student.parentName || '-');
  const phone = 'maskedPhone' in item ? item.maskedPhone : (item.student.phone || '-');
  const examName = 'examName' in item ? item.examName || 'Genel Değerlendirme' : 'Genel Değerlendirme';
  const pdfFileName = 'pdfFileName' in item ? item.pdfFileName : (item.pdfFile?.name || '-');
  const dispatchKey = 'dispatchKey' in item ? item.dispatchKey : undefined;
  const dateStr = 'date' in item ? item.date : (item.confirmedAt || new Date().toISOString());
  const errorMessage = item.errorMessage || 'Zaman aşımı veya sağlayıcı yanıtının kesilmesi nedeniyle teslimat belirsiz (unknown).';

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setErrorText('Lütfen en az 5 karakterlik geçerli bir uzlaştırma gerekçesi girin.');
      return;
    }

    if (selectedAction === 'authorize_retry' && !confirmDuplicateRisk) {
      setErrorText('Lütfen mükerrer mesaj gönderim riskini anladığınızı onaylayan kutuyu işaretleyin.');
      return;
    }

    if (!dispatchKey) {
      setErrorText('Bu kayıt için geçerli bir dispatchKey bulunamadı.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await storageService.reconcileUnknownDispatch({
        dispatchKey,
        action: selectedAction,
        userReason: cleanReason,
      });

      if (!res.success) {
        setErrorText(res.error || 'Manuel uzlaştırma işlemi başarısız oldu.');
        return;
      }

      onReconciled({
        action: selectedAction,
        retryToken: res.retryToken,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorText(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] text-neutral-900 dark:text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-800/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Belirsiz (Unknown) Gönderim Uzlaştırma Paneli
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Teslimat sonucu doğrulanamayan karne için yetkili manuel uzlaştırma
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Critical Meaning / Invariant Explanation Banner */}
          <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-lg text-amber-900 dark:text-amber-200 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold">
              <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Belirsiz (Unknown) Durumu Ne Anlama Gelir?</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              Mesajın WhatsApp tarafından işleme alınmış veya alıcıya ulaşmış olması mümkündür.
              Uygulama sağlayıcı yanıtındaki zaman aşımı veya bağlantı kopması nedeniyle sonucu doğrulayamamıştır.
              <strong> Doğrudan yeniden gönderim mükerrer (çift) mesaja neden olabilir.</strong>
            </p>
          </div>

          {/* Record Details Card */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 p-3.5 border border-neutral-200 dark:border-neutral-700/80 rounded-lg space-y-2">
            <div className="font-semibold text-neutral-900 dark:text-white text-xs mb-1">
              Kayıt Ayrıntıları
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <User className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>Öğrenci: <strong>{studentName}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span className="font-mono">Telefon: {phone}</span>
              </div>
              <div className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span className="truncate" title={pdfFileName}>Dosya: {pdfFileName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <Calendar className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>Zaman: {formatDate(dateStr)}</span>
              </div>
            </div>
            {errorMessage && (
              <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-700/60 text-[11px] text-rose-700 dark:text-rose-400 font-mono">
                Hata / Yanıt: {errorMessage}
              </div>
            )}
          </div>

          {/* Action Selection Tabs */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              Uygulanacak Uzlaştırma İşlemi:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedAction('confirm_delivered')}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  selectedAction === 'confirm_delivered'
                    ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 shadow-xs'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-750'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                  <CheckCircle2 className={`w-4 h-4 ${selectedAction === 'confirm_delivered' ? 'text-emerald-600' : 'text-neutral-400'}`} />
                  <span>A. Alıcıya Ulaştığı Teyit Edildi</span>
                </div>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-normal">
                  Veliyle görüşüldü, karnenin ulaştığı doğrulandı. Kayıt kullanıcı beyanıyla işaretlenir, sağlayıcı durumu sahte &quot;delivered&quot; yapılmaz.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedAction('authorize_retry')}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  selectedAction === 'authorize_retry'
                    ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 shadow-xs'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-750'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                  <RefreshCw className={`w-4 h-4 ${selectedAction === 'authorize_retry' ? 'text-indigo-600' : 'text-neutral-400'}`} />
                  <span>B. Ulaşmadı — Tekrar Gönderime İzin Ver</span>
                </div>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-normal">
                  Veliyle teyitleşildi ve karnenin ulaşmadığı anlaşıldı. Main Process tek kullanımlık süreli bir retry token üreterek yeniden gönderime izin verir.
                </p>
              </button>
            </div>
          </div>

          {/* User Reason / Justification Input */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Uzlaştırma Gerekçesi (Zorunlu, denetim kaydına yazılacaktır):
            </label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                selectedAction === 'confirm_delivered'
                  ? 'Örn: Veli Mehmet Yılmaz ile telefonla görüşüldü, karnenin WhatsApp üzerinden ulaştığını teyit etti.'
                  : 'Örn: Veli ile görüşüldü, karnenin WhatsApp sohbetine düşmediği belirlendi, yeniden gönderim talep etti.'
              }
              className="w-full p-2.5 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block mt-0.5">
              Bu açıklama SQLite denetim tablosunda ({'reconciliation_audit'}) kalıcı olarak saklanır.
            </span>
          </div>

          {/* Duplicate warning confirmation checkbox for Option B */}
          {selectedAction === 'authorize_retry' && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmDuplicateRisk}
                  onChange={(e) => setConfirmDuplicateRisk(e.target.checked)}
                  className="mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                />
                <span className="text-[11px] font-medium text-rose-900 dark:text-rose-200">
                  Önceki gönderimin WhatsApp sunucularına ulaşmış olması durumunda veliye aynı karnenin <strong>mükerrer (çift)</strong> iletilmesi riskini anladım ve kabul ediyorum.
                </span>
              </label>
            </div>
          )}

          {errorText && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorText}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${
                selectedAction === 'confirm_delivered'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Uzlaştırılıyor...</span>
                </>
              ) : selectedAction === 'confirm_delivered' ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Kullanıcı Teyidi Olarak Kaydet</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Yetkilendir ve Tekrar Gönder</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
