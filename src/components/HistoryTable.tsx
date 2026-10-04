import React, { useState, useMemo } from 'react';
import { HistoryItem } from '../types/history';
import {
  CheckCircle2,
  AlertCircle,
  Trash2,
  Calendar,
  FileText,
  Search,
  Download,
  Filter,
  BarChart3,
  TrendingUp,
} from 'lucide-react';

interface HistoryTableProps {
  history: HistoryItem[];
  onClearHistory: () => void;
}

export const HistoryTable: React.FC<HistoryTableProps> = ({
  history,
  onClearHistory,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');

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

  // Stats calculation
  const totalCount = history.length;
  const successCount = history.filter((i) => i.status === 'success').length;
  const failedCount = history.filter((i) => i.status === 'failed').length;
  const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

  // Filtered items
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesSearch =
        item.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.parentName && item.parentName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        item.pdfFileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.maskedPhone.includes(searchTerm);

      const matchesStatus =
        statusFilter === 'all' ? true : item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [history, searchTerm, statusFilter]);

  // Export to CSV
  const handleExportCsv = () => {
    if (history.length === 0) return;

    const headers = ['Tarih', 'Öğrenci Adı', 'Veli Adı', 'Telefon', 'PDF Dosyası', 'Durum', 'Hata Detayı'];
    const rows = filteredHistory.map((item) => [
      formatDate(item.date),
      `"${item.studentName.replace(/"/g, '""')}"`,
      `"${(item.parentName || '').replace(/"/g, '""')}"`,
      `"${item.maskedPhone}"`,
      `"${item.pdfFileName.replace(/"/g, '""')}"`,
      item.status === 'success' ? 'Başarılı' : 'Başarısız',
      `"${(item.errorMessage || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Gonderim_Gecmisi_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5 shadow-2xs transition-colors">
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
            Toplam Gönderim
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold text-neutral-900 dark:text-white font-mono">
              {totalCount}
            </span>
            <BarChart3 className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5 shadow-2xs transition-colors">
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
            Başarılı İletilen
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">
              {successCount}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5 shadow-2xs transition-colors">
          <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400 uppercase tracking-wider block">
            Başarısız / Hatalı
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold text-rose-700 dark:text-rose-400 font-mono">
              {failedCount}
            </span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5 shadow-2xs transition-colors">
          <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400 uppercase tracking-wider block">
            Başarı Oranı
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold text-indigo-700 dark:text-indigo-400 font-mono">
              %{successRate}
            </span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters & Export */}
      <div className="bg-white dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-2xs space-y-3 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Gönderim Kayıtları Günlüğü ({filteredHistory.length})</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              WhatsApp üzerinden velilere iletilen tüm karne ve mesajların geçmiş dökümü.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {history.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer"
                  title="Listeyi Excel uyumlu CSV olarak indir"
                >
                  <Download className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                  <span>Excel CSV İndir</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Tüm gönderim geçmişini temizlemek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
                      onClearHistory();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title="Geçmişi temizle"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Temizle</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Öğrenci, veli, dosya adı veya telefon ile ara..."
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
              <span>Durum:</span>
            </span>
            <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Tümü ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('success')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'success'
                    ? 'bg-white dark:bg-neutral-900 text-emerald-800 dark:text-emerald-400 shadow-2xs font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Başarılı ({successCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('failed')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'failed'
                    ? 'bg-white dark:bg-neutral-900 text-rose-800 dark:text-rose-400 shadow-2xs font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Hatalı ({failedCount})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden shadow-2xs transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 font-medium">
                <th className="py-2.5 px-4 font-semibold">Tarih / Saat</th>
                <th className="py-2.5 px-4 font-semibold">Öğrenci Adı</th>
                <th className="py-2.5 px-4 font-semibold">Veli Adı</th>
                <th className="py-2.5 px-4 font-semibold">İletilen Telefon</th>
                <th className="py-2.5 px-4 font-semibold">Karne PDF Dosyası</th>
                <th className="py-2.5 px-4 font-semibold text-right">Gönderim Durumu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400 dark:text-neutral-500">
                    {history.length === 0
                      ? 'Henüz kayıtlı bir gönderim işlemi bulunmuyor. Ana ekrandan gönderim yaptığınızda burada listelenecektir.'
                      : 'Arama kriterlerinize uygun kayıt bulunamadı.'}
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-neutral-500 dark:text-neutral-400 text-[11px] whitespace-nowrap">
                      {formatDate(item.date)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-neutral-900 dark:text-white">
                      {item.studentName}
                    </td>
                    <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400">
                      {item.parentName || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-600 dark:text-neutral-400">
                      {item.maskedPhone}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-mono text-neutral-700 dark:text-neutral-300 text-[11px]">
                        <FileText className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 shrink-0" />
                        <span className="truncate max-w-[200px]" title={item.pdfFileName}>
                          {item.pdfFileName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {item.status === 'success' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>İletildi</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                          title={item.errorMessage || 'Gönderim başarısız oldu'}
                        >
                          <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                          <span>Hata: {item.errorMessage || 'İletilemedi'}</span>
                        </span>
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
