import React, { useState, useMemo } from 'react';
import { HistoryItem } from '../types/history';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Calendar,
  FileText,
  Search,
  Download,
  Filter,
  BarChart3,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  RotateCcw,
  Clock,
} from 'lucide-react';

interface HistoryTableProps {
  history: HistoryItem[];
  onClearHistory: () => void;
  isLoading?: boolean;
  errorText?: string | null;
  onRefresh?: () => void;
  onOpenReconcile?: (item: HistoryItem) => void;
}

export const HistoryTable: React.FC<HistoryTableProps> = ({
  history,
  onClearHistory,
  isLoading = false,
  errorText = null,
  onRefresh,
  onOpenReconcile,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'unknown' | 'failed'>('all');

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
  const successCount = history.filter((i) => i.status === 'success' || i.status === 'sent' || i.status === 'delivered').length;
  const unknownCount = history.filter((i) => i.status === 'unknown').length;
  const failedCount = history.filter((i) => i.status === 'failed').length;
  const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

  // Filtered items
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesSearch =
        item.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.parentName && item.parentName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        item.pdfFileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.maskedPhone.includes(searchTerm) ||
        (item.phone && item.phone.includes(searchTerm));

      let matchesStatus = true;
      if (statusFilter === 'success') {
        matchesStatus = item.status === 'success' || item.status === 'sent' || item.status === 'delivered';
      } else if (statusFilter === 'unknown') {
        matchesStatus = item.status === 'unknown';
      } else if (statusFilter === 'failed') {
        matchesStatus = item.status === 'failed';
      }

      return matchesSearch && matchesStatus;
    });
  }, [history, searchTerm, statusFilter]);

  // Export to CSV with UTF-8 BOM
  const handleExportCsv = () => {
    if (history.length === 0) return;

    const headers = [
      'Tarih',
      'Öğrenci Adı',
      'Veli Adı',
      'Telefon',
      'PDF Dosyası',
      'Durum',
      'Manuel Uzlaştırma Durumu',
      'Uzlaştırma Gerekçesi',
      'Hata Detayı',
    ];
    const rows = filteredHistory.map((item) => [
      formatDate(item.date),
      `"${item.studentName.replace(/"/g, '""')}"`,
      `"${(item.parentName || '').replace(/"/g, '""')}"`,
      `"${item.maskedPhone}"`,
      `"${item.pdfFileName.replace(/"/g, '""')}"`,
      item.status === 'sent' || item.status === 'success'
        ? 'İletildi'
        : item.status === 'delivered'
        ? 'Teslim Edildi'
        : item.status === 'unknown'
        ? 'Belirsiz (Unknown)'
        : item.status === 'sending'
        ? 'Gönderiliyor'
        : item.status === 'queued'
        ? 'Kuyrukta (Sırada)'
        : 'Başarısız',
      `"${(item.manualReconciliationStatus || '').replace(/"/g, '""')}"`,
      `"${(item.reconciliationReason || '').replace(/"/g, '""')}"`,
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

  const renderStatusBadge = (item: HistoryItem) => {
    if (item.status === 'queued') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700"
          title="Kuyrukta gönderim sırası bekliyor"
        >
          <Clock className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
          <span>Kuyrukta (Sırada)</span>
        </span>
      );
    }

    if (item.status === 'sending') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 animate-pulse"
          title="Sağlayıcıya aktarılıyor..."
        >
          <RefreshCw className="w-3 h-3 text-indigo-600 dark:text-indigo-400 animate-spin" />
          <span>Gönderiliyor...</span>
        </span>
      );
    }

    if (item.status === 'delivered') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
          title="Sağlayıcı tarafından teslimat kanıtı ile teyit edildi"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>Teslim Edildi (Kanıtlı)</span>
        </span>
      );
    }

    if (item.status === 'sent' || item.status === 'success') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
          title="Sunucuya iletildi. Teslimat garantisi değildir."
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>İletildi (Sunucu Onaylı)</span>
        </span>
      );
    }

    if (item.status === 'unknown') {
      const isUserConfirmed = item.manualReconciliationStatus === 'user_confirmed_delivered';
      const isRetryAuthorized = item.manualReconciliationStatus === 'retry_authorized';

      return (
        <div className="flex flex-col items-end gap-1">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              isUserConfirmed
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                : isRetryAuthorized
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
            }`}
            title="Mesajın WhatsApp tarafından işleme alınmış veya alıcıya ulaşmış olması mümkündür. Uygulama sonucu doğrulayamadığı için gönderim durumu belirsizdir. Yeniden gönderim mükerrer mesaja neden olabilir."
          >
            {isUserConfirmed ? (
              <>
                <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Belirsiz (Veli Teyidiyle Teslim Sayıldı)</span>
              </>
            ) : isRetryAuthorized ? (
              <>
                <RefreshCw className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                <span>Belirsiz (Tekrar Gönderim Yetkili)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>Belirsiz (Unknown)</span>
              </>
            )}
          </span>

          {item.reconciliationReason && (
            <span
              className="text-[10px] text-neutral-500 dark:text-neutral-400 max-w-[220px] truncate italic"
              title={`Uzlaştırma Notu: ${item.reconciliationReason}`}
            >
              &quot;{item.reconciliationReason}&quot;
            </span>
          )}

          {onOpenReconcile && !isUserConfirmed && (
            <button
              type="button"
              onClick={() => onOpenReconcile(item)}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 underline cursor-pointer"
            >
              Uzlaştır
            </button>
          )}
        </div>
      );
    }

    if (item.status === 'partial_success') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
          title={item.errorMessage || 'Yardımlı sekme açıldı, PDF otomatik eklenemedi'}
        >
          <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>Kısmi Başarılı (PDF Eklenmedi)</span>
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
        title={item.errorMessage || 'Gönderim başarısız oldu'}
      >
        <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
        <span>Hata: {item.errorMessage || 'İletilemedi'}</span>
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Unknown Delivery Explanation Informational Banner */}
      {unknownCount > 0 && (
        <div className="p-3 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block">
              Dikkat: Gönderim geçmişinizde {unknownCount} adet belirsiz (unknown) kayıt bulunmaktadır.
            </span>
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              Mesajın WhatsApp tarafından işleme alınmış veya alıcıya ulaşmış olması mümkündür.
              Uygulama sonucu doğrulayamadığı için gönderim durumu belirsizdir.
              Yeniden gönderim mükerrer (çift) mesaja neden olabilir.
              Lütfen her kaydı tablodaki <strong>&quot;Uzlaştır&quot;</strong> butonunu kullanarak veli teyidine bağlayın.
            </p>
          </div>
        </div>
      )}

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
            İletilen (Başarılı)
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">
              {successCount}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5 shadow-2xs transition-colors">
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
            Belirsiz (Unknown)
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold text-amber-700 dark:text-amber-400 font-mono">
              {unknownCount}
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
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
      </div>

      {/* Toolbar: Search, Filters & Export */}
      <div className="bg-white dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-2xs space-y-3 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>SQLite Gönderim Kayıtları Günlüğü ({filteredHistory.length})</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Main Process kalıcı SQLite veritabanındaki tüm yetkili gönderim ve uzlaştırma kayıtları.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                title="SQLite geçmişini yeniden yükle"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Yenile</span>
              </button>
            )}

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
              placeholder="Öğrenci, dosya adı veya telefon ile ara..."
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
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
                İletilen ({successCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('unknown')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'unknown'
                    ? 'bg-white dark:bg-neutral-900 text-amber-800 dark:text-amber-400 shadow-2xs font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Belirsiz ({unknownCount})
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

      {/* Error state if SQLite read fails */}
      {errorText && (
        <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span><strong>Veritabanı Okuma Hatası:</strong> {errorText}</span>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-2.5 py-1 bg-white dark:bg-neutral-900 border border-rose-300 dark:border-rose-700 rounded text-rose-700 dark:text-rose-300 font-semibold hover:bg-rose-50 cursor-pointer"
            >
              Tekrar Dene
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden shadow-2xs transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 font-medium">
                <th className="py-2.5 px-4 font-semibold">Tarih / Saat</th>
                <th className="py-2.5 px-4 font-semibold">Öğrenci Adı</th>
                <th className="py-2.5 px-4 font-semibold">Sınav</th>
                <th className="py-2.5 px-4 font-semibold">İletilen Telefon</th>
                <th className="py-2.5 px-4 font-semibold">Karne PDF Dosyası</th>
                <th className="py-2.5 px-4 font-semibold text-right">Gönderim Durumu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400 dark:text-neutral-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-neutral-500" />
                      <span>SQLite veritabanı kayıtları yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400 dark:text-neutral-500">
                    {history.length === 0
                      ? 'Henüz kayıtlı bir gönderim işlemi bulunmuyor. Ana ekrandan gönderim yapıldığında burada listelenecektir.'
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
                      {item.examName || '-'}
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
                      {renderStatusBadge(item)}
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
