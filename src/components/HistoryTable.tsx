import React from 'react';
import { HistoryItem } from '../types/history';
import { CheckCircle2, AlertCircle, Trash2, Calendar, FileText } from 'lucide-react';

interface HistoryTableProps {
  history: HistoryItem[];
  onClearHistory: () => void;
}

export const HistoryTable: React.FC<HistoryTableProps> = ({
  history,
  onClearHistory,
}) => {
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white p-4 border border-neutral-200 rounded">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            Gönderim Geçmişi ({history.length})
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Daha önce WhatsApp üzerinden velilere gönderilen karne kayıtları.
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Tüm gönderim geçmişini temizlemek istediğinizden emin misiniz?')) {
                onClearHistory();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-neutral-200 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Geçmişi Temizle</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-medium">
                <th className="py-2.5 px-4 font-semibold">Tarih</th>
                <th className="py-2.5 px-4 font-semibold">Öğrenci</th>
                <th className="py-2.5 px-4 font-semibold">Veli</th>
                <th className="py-2.5 px-4 font-semibold">Telefon</th>
                <th className="py-2.5 px-4 font-semibold">Gönderilen PDF</th>
                <th className="py-2.5 px-4 font-semibold">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-400">
                    Henüz kayıtlı bir gönderim işlemi bulunmuyor.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-neutral-500 text-[11px] whitespace-nowrap">
                      {formatDate(item.date)}
                    </td>
                    <td className="py-3 px-4 font-medium text-neutral-900">
                      {item.studentName}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      {item.parentName}
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-500">
                      {item.maskedPhone}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-mono text-neutral-700 text-[11px]">
                        <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate max-w-[180px]">{item.pdfFileName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {item.status === 'success' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Başarılı</span>
                        </span>
                      ) : (
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 w-fit">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>Başarısız</span>
                          </span>
                          {item.errorMessage && (
                            <span className="text-[10px] text-rose-600 mt-0.5">
                              {item.errorMessage}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
