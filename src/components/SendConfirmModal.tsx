import React from 'react';
import { MatchedItem } from '../types/pdf';
import { WhatsAppStatus } from '../types/whatsapp';
import { X, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SendConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  matchedItems: MatchedItem[];
  whatsAppStatus: WhatsAppStatus;
  delaySeconds: number;
}

export const SendConfirmModal: React.FC<SendConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  matchedItems,
  whatsAppStatus,
  delaySeconds,
}) => {
  if (!isOpen) return null;

  const readyItems = matchedItems.filter((i) => i.status === 'ready');
  const missingItems = matchedItems.filter((i) => i.status === 'missing_pdf');
  const invalidItems = matchedItems.filter((i) => i.status === 'invalid_phone');

  const estimatedMinutes = Math.ceil((readyItems.length * (delaySeconds + 2)) / 60);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-neutral-50/50">
          <h2 className="text-sm font-semibold text-neutral-900">
            Gönderim Onayı
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-neutral-600 leading-relaxed">
            WhatsApp üzerinden haftalık sınav karneleri velilere sırayla gönderilecektir.
          </p>

          {/* Statistics summary */}
          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded space-y-2 text-xs">
            <div className="flex items-center justify-between font-medium text-neutral-900">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Gönderilecek Öğrenci:</span>
              </span>
              <span className="font-semibold text-sm">{readyItems.length} veli</span>
            </div>

            {missingItems.length > 0 && (
              <div className="flex items-center justify-between text-neutral-500 pt-1 border-t border-neutral-200">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-neutral-400" />
                  <span>PDF Eksik (Hariç tutulacak):</span>
                </span>
                <span>{missingItems.length}</span>
              </div>
            )}

            {invalidItems.length > 0 && (
              <div className="flex items-center justify-between text-amber-700 pt-1 border-t border-neutral-200">
                <span>Geçersiz Telefon (Hariç tutulacak):</span>
                <span>{invalidItems.length}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-200">
              <span>Öğrenciler arası güvenlik beklemesi:</span>
              <span>{delaySeconds} saniye</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-neutral-500">
              <span>Tahmini toplam süre:</span>
              <span>~{estimatedMinutes > 1 ? `${estimatedMinutes} dakika` : '30-45 saniye'}</span>
            </div>
          </div>

          <div className="text-xs font-medium text-neutral-800">
            Toplu gönderime başlamak için hazır mısınız?
          </div>

          <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              Vazgeç
            </button>
            <button
              onClick={() => {
                onClose();
                onConfirm();
              }}
              className="flex items-center gap-1.5 px-5 py-2 rounded bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Gönder</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
