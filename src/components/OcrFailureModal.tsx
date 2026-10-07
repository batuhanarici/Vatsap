import React from 'react';
import { OcrFailureItem } from '../services/pdfTextExtractor';
import { AlertCircle, FileQuestion, X, ArrowRight, Sparkles, FileText, CheckCircle2 } from 'lucide-react';

interface OcrFailureModalProps {
  isOpen: boolean;
  onClose: () => void;
  failureItems: OcrFailureItem[];
  scannedPdfs: string[];
  scanType: 'digital_text' | 'visual_ocr';
  onStartVisualOcr?: () => void;
  onOpenManualMatch?: () => void;
  isOcrRunning?: boolean;
}

export const OcrFailureModal: React.FC<OcrFailureModalProps> = ({
  isOpen,
  onClose,
  failureItems,
  scannedPdfs,
  scanType,
  onStartVisualOcr,
  onOpenManualMatch,
  isOcrRunning,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                {scanType === 'digital_text'
                  ? 'Taranmış Belge & Metin Katmanı Raporu'
                  : 'Görsel OCR Başarısızlık & Durum Raporu'}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {failureItems.length} adet PDF dosyasında otomatik eşleşme sağlanamadı
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

        {/* Informative Explanation Banner */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-1">
                  {scanType === 'digital_text'
                    ? 'Bu belgeler taranmış görsel/resim içeriyor (Dijital metin katmanı yok)'
                    : 'Görsel OCR analizi sonucunda öğrenci ismi eşleştirilemedi'}
                </span>
                {scanType === 'digital_text' ? (
                  <p>
                    <strong>PDF Metin Tarama</strong> yalnızca seçilebilir dijital metin katmanı içeren PDF&apos;leri anında okur.
                    Aşağıdaki belgeler fotokopi veya taranmış resim formatında olduğundan, <strong>Görsel OCR (Optik Tanıma)</strong> motoruyla
                    analiz edilmeli veya sağdaki &quot;Ata / Değiştir&quot; butonuyla manuel eşleştirilmelidir.
                  </p>
                ) : (
                  <p>
                    Görsel OCR motoru belgeleri analiz etti ancak belge kalitesi (çözünürlük, eğiklik veya el yazısı) nedeniyle aday öğrenci isimleriyle kesin bir eşleşme kurulamadı.
                    Bu belgeleri aşağıdaki listeden inceleyerek doğrudan manuel atayabilirsiniz.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* List of Files */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Etkilenen PDF Dosyaları ({failureItems.length}):
            </h3>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
              {failureItems.map((item, idx) => (
                <div key={idx} className="p-3 bg-neutral-50/50 dark:bg-neutral-800/30 text-xs flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 truncate">
                      <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      {item.fileName}
                    </span>
                    <span className="text-[10px] bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded font-medium shrink-0">
                      Metin Bulunamadı
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    <strong className="text-neutral-700 dark:text-neutral-300">Neden:</strong> {item.reason}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 italic">
                    💡 <strong>Öneri:</strong> {item.actionRecommendation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {scannedPdfs.length > 0 && `${scannedPdfs.length} adet taranmış görsel tespit edildi`}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {scanType === 'digital_text' && onStartVisualOcr && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartVisualOcr();
                }}
                disabled={isOcrRunning}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Görsel OCR Taramasını Başlat</span>
              </button>
            )}

            {onOpenManualMatch && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenManualMatch();
                }}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>Manuel Eşleştirmeyi Aç</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-lg text-xs font-medium cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
