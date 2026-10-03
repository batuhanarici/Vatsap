import React from 'react';
import { MatchedItem } from '../types/pdf';
import { WhatsAppStatus } from '../types/whatsapp';
import { formatPhoneDisplay } from '../services/normalizer';
import { CheckCircle2, AlertTriangle, AlertCircle, RefreshCw, Send, FileCheck } from 'lucide-react';

interface MatchingTableProps {
  matchedItems: MatchedItem[];
  whatsAppStatus: WhatsAppStatus;
  onStartBatchSend: () => void;
  onRetrySingleItem: (item: MatchedItem) => void;
  isSending: boolean;
  hasFolderSelected: boolean;
}

export const MatchingTable: React.FC<MatchingTableProps> = ({
  matchedItems,
  whatsAppStatus,
  onStartBatchSend,
  onRetrySingleItem,
  isSending,
  hasFolderSelected,
}) => {
  const readyCount = matchedItems.filter((i) => i.status === 'ready').length;
  const missingCount = matchedItems.filter((i) => i.status === 'missing_pdf').length;
  const invalidPhoneCount = matchedItems.filter((i) => i.status === 'invalid_phone').length;

  const isConnected = whatsAppStatus.state === 'connected';
  const canSend = readyCount > 0 && !isSending;

  const getStatusBadge = (item: MatchedItem) => {
    // If currently sending or sent
    if (item.sendingStatus === 'sending_message' || item.sendingStatus === 'sending_pdf') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
          <RefreshCw className="w-3 h-3 animate-spin text-neutral-500" />
          <span>{item.sendingStatus === 'sending_message' ? 'Mesaj Gönderiliyor' : 'PDF Gönderiliyor'}</span>
        </span>
      );
    }

    if (item.sendingStatus === 'success') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>Tamamlandı</span>
        </span>
      );
    }

    if (item.sendingStatus === 'failed') {
      return (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            <span>Hata</span>
          </span>
          <button
            onClick={() => onRetrySingleItem(item)}
            className="text-[11px] underline text-neutral-600 hover:text-neutral-900"
          >
            Tekrar Dene
          </button>
        </div>
      );
    }

    // Static matching statuses
    switch (item.status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Hazır</span>
          </span>
        );
      case 'missing_pdf':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-neutral-50 text-neutral-500 border border-neutral-200">
            <AlertTriangle className="w-3 h-3 text-neutral-400" />
            <span>PDF bulunamadı</span>
          </span>
        );
      case 'invalid_phone':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            <span>Geçersiz numara</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded overflow-hidden">
      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-medium">
              <th className="py-2.5 px-4 font-semibold">Öğrenci</th>
              <th className="py-2.5 px-4 font-semibold">Veli</th>
              <th className="py-2.5 px-4 font-semibold">WhatsApp Numarası</th>
              <th className="py-2.5 px-4 font-semibold">Eşleşen PDF Dosyası</th>
              <th className="py-2.5 px-4 font-semibold">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-neutral-800">
            {matchedItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-neutral-400">
                  Kayıtlı öğrenci bulunmuyor. Lütfen &quot;Öğrenciler&quot; sekmesinden öğrenci ekleyin.
                </td>
              </tr>
            ) : (
              matchedItems.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-neutral-50/70 transition-colors ${
                    item.status === 'missing_pdf' ? 'opacity-80' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-neutral-900">
                    {item.student.studentName}
                  </td>
                  <td className="py-3 px-4 text-neutral-600">
                    {item.student.parentName}
                  </td>
                  <td className="py-3 px-4 font-mono text-neutral-600">
                    {formatPhoneDisplay(item.student.phone)}
                  </td>
                  <td className="py-3 px-4">
                    {item.pdfFile ? (
                      <div className="flex items-center gap-1.5 font-mono text-neutral-800 text-[11px]">
                        <FileCheck className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span className="truncate max-w-[220px]" title={item.pdfFile.name}>
                          {item.pdfFile.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-neutral-400 font-mono">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {getStatusBadge(item)}
                    {item.errorMessage && (
                      <p className="text-[11px] text-rose-600 mt-1 max-w-[200px]">
                        {item.errorMessage}
                      </p>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Summary Bar */}
      <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="font-semibold text-neutral-900">{readyCount}</span> hazır
            {missingCount > 0 && (
              <span className="text-neutral-500 ml-2">
                • <span className="font-semibold text-neutral-700">{missingCount}</span> eksik
              </span>
            )}
            {invalidPhoneCount > 0 && (
              <span className="text-amber-700 ml-2">
                • <span className="font-semibold">{invalidPhoneCount}</span> geçersiz telefon
              </span>
            )}
          </div>
          <div className="h-3 w-px bg-neutral-200"></div>
          <div className="flex items-center gap-1.5 text-neutral-600">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500' : 'bg-neutral-400'
              }`}
            ></span>
            <span>WhatsApp: {isConnected ? 'Bağlı' : 'Bağlı Değil'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!hasFolderSelected && (
            <span className="text-[11px] text-neutral-500">
              Gönderim için lütfen önce PDF klasörü seçin.
            </span>
          )}
          <button
            onClick={onStartBatchSend}
            disabled={!canSend}
            className={`flex items-center gap-2 px-5 py-2.5 rounded text-xs font-semibold shadow-xs transition-colors ${
              canSend
                ? 'bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Gönderime Başla</span>
          </button>
        </div>
      </div>
    </div>
  );
};
