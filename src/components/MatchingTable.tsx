import React from 'react';
import { MatchedItem } from '../types/pdf';
import { WhatsAppStatus } from '../types/whatsapp';
import { MessageTemplate } from '../types/template';
import { formatPhoneDisplay } from '../services/normalizer';
import { formatMessage } from '../services/templateService';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Send,
  FileCheck,
  MessageSquare,
  Sparkles,
  ScanText,
  Link,
  ShieldCheck,
  SlidersHorizontal,
  Eye,
  FileQuestion,
  FileText,
} from 'lucide-react';

interface MatchingTableProps {
  matchedItems: MatchedItem[];
  whatsAppStatus: WhatsAppStatus;
  onStartBatchSend: () => void;
  onRetrySingleItem: (item: MatchedItem) => void;
  onPreviewItem: (item: MatchedItem) => void;
  isSending: boolean;
  hasFolderSelected: boolean;
  templates: MessageTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (id: string) => void;
  isOcrScanning?: boolean;
  ocrProgress?: { current: number; total: number; currentFileName: string; detectedStudentName?: string } | null;
  onStartOcrScan?: () => void;
  isVisualOcrRunning?: boolean;
  visualOcrProgress?: { current: number; total: number; currentFileName: string; detectedStudentName?: string } | null;
  onStartVisualOcr?: () => void;
  onOpenOcrFailureModal?: () => void;
  failedOcrCount?: number;
  unassignedPdfCount?: number;
  selectedGroup?: string;
  onSelectGroup?: (group: string) => void;
  onConfirmMatch?: (studentId: string) => void;
  onOpenManualMatch?: (item: MatchedItem) => void;
}

export const MatchingTable: React.FC<MatchingTableProps> = ({
  matchedItems,
  whatsAppStatus,
  onStartBatchSend,
  onRetrySingleItem,
  onPreviewItem,
  isSending,
  hasFolderSelected,
  templates,
  activeTemplateId,
  onSelectTemplate,
  isOcrScanning = false,
  ocrProgress = null,
  onStartOcrScan,
  isVisualOcrRunning = false,
  visualOcrProgress = null,
  onStartVisualOcr,
  onOpenOcrFailureModal,
  failedOcrCount = 0,
  unassignedPdfCount = 0,
  selectedGroup = 'all',
  onSelectGroup,
  onConfirmMatch,
  onOpenManualMatch,
}) => {
  const [internalGroup, setInternalGroup] = React.useState('all');
  const currentGroup = selectedGroup !== undefined ? selectedGroup : internalGroup;
  const handleGroupChange = onSelectGroup || setInternalGroup;

  // Status Filter tab
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'ready' | 'pending' | 'conflict' | 'missing'>('all');

  // Extract all unique groups
  const availableGroups = React.useMemo(() => {
    const set = new Set<string>();
    matchedItems.forEach((i) => {
      if (i.student.group) set.add(i.student.group);
      else set.add('Genel');
    });
    return Array.from(set).sort();
  }, [matchedItems]);

  // Filter items by selected class/group and status filter
  const displayedItems = React.useMemo(() => {
    let list = matchedItems;
    if (currentGroup !== 'all') {
      list = list.filter((i) => (i.student.group || 'Genel') === currentGroup);
    }

    if (statusFilter === 'ready') {
      list = list.filter((i) => i.status === 'ready');
    } else if (statusFilter === 'pending') {
      list = list.filter((i) => i.status === 'pending_confirmation' || i.needsConfirmation);
    } else if (statusFilter === 'conflict') {
      list = list.filter((i) => i.hasConflict);
    } else if (statusFilter === 'missing') {
      list = list.filter((i) => i.status === 'missing_pdf');
    }

    return list;
  }, [matchedItems, currentGroup, statusFilter]);

  const readyCount = matchedItems.filter((i) => i.status === 'ready').length;
  const pendingCount = matchedItems.filter((i) => i.status === 'pending_confirmation' || i.needsConfirmation).length;
  const conflictCount = matchedItems.filter((i) => i.hasConflict).length;
  const missingCount = matchedItems.filter((i) => i.status === 'missing_pdf').length;
  const invalidPhoneCount = matchedItems.filter((i) => i.status === 'invalid_phone').length;

  const isConnected = whatsAppStatus.state === 'connected';
  const canSend = readyCount > 0 && !isSending;

  const selectedTemplate =
    templates.find((t) => t.id === activeTemplateId) || templates[0];

  const getStatusBadge = (item: MatchedItem) => {
    // Finite State Machine: Runtime queue processing states
    if (item.sendingStatus === 'validating') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
          <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
          <span>Doğrulanıyor...</span>
        </span>
      );
    }

    if (item.sendingStatus === 'retrying') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
          <span>Tekrar Deneniyor</span>
        </span>
      );
    }

    if (item.sendingStatus === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>
          <span>Sırada Bekliyor</span>
        </span>
      );
    }

    if (item.sendingStatus === 'sending_message' || item.sendingStatus === 'sending_pdf') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
          <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
          <span>{item.sendingStatus === 'sending_message' ? 'Mesaj İletiliyor' : 'PDF Aktarılıyor'}</span>
        </span>
      );
    }

    if (item.sendingStatus === 'success') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>Tamamlandı</span>
        </span>
      );
    }

    if (item.sendingStatus === 'partial_success') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
          title={item.errorMessage || 'Sohbet sekmesi açıldı, PDF otomatik eklenemedi'}
        >
          <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>Kısmi Başarılı</span>
        </span>
      );
    }

    if (item.sendingStatus === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
          <span>İptal Edildi</span>
        </span>
      );
    }

    if (item.sendingStatus === 'failed') {
      return (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            <span>Hata</span>
          </span>
          <button
            onClick={() => onRetrySingleItem(item)}
            className="text-[11px] underline text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 cursor-pointer"
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
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Gönderime Hazır</span>
          </span>
        );
      case 'pending_confirmation':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse">
            <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Onay Bekliyor</span>
          </span>
        );
      case 'missing_pdf':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
            <AlertTriangle className="w-3 h-3 text-neutral-400" />
            <span>PDF Yok</span>
          </span>
        );
      case 'invalid_phone':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            <span>Geçersiz Numara</span>
          </span>
        );
      default:
        return null;
    }
  };

  const renderMatchScore = (item: MatchedItem) => {
    if (!item.pdfFile) {
      return <span className="text-[11px] text-neutral-400 font-mono">—</span>;
    }

    if (item.isManuallyAssigned || item.matchMethod === 'manual') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          <Link className="w-3 h-3 text-blue-500" />
          <span>Manuel Atandı (%100)</span>
        </span>
      );
    }

    if (item.matchMethod === 'content_ocr') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
          title={item.matchReason || 'Taranmış belge Görsel OCR (Optik Tanıma) ile eşleştirildi'}
        >
          <Eye className="w-3 h-3 text-purple-500" />
          <span>Görsel OCR (%{item.confidenceScore || 85})</span>
        </span>
      );
    }

    if (item.matchMethod === 'text_extraction') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
          title={item.matchReason || 'PDF içi dijital metin katmanı okunarak eşleştirildi'}
        >
          <FileText className="w-3 h-3 text-indigo-500" />
          <span>Metin Katmanı (%{item.confidenceScore || 80})</span>
        </span>
      );
    }

    const score = item.confidenceScore || 0;
    const isStrong = score >= 85;

    return (
      <div className="space-y-0.5">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
            isStrong
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
          }`}
          title={item.matchReason}
        >
          <span>%{score} {isStrong ? 'Güçlü' : 'Düşük Güven'}</span>
        </span>

        {item.hasConflict && (
          <div
            className="flex items-center gap-1 text-[10px] text-rose-700 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.2 rounded border border-rose-200 dark:border-rose-800 w-fit"
            title="Bu dosya adı birden fazla öğrenciyle benzerlik gösteriyor! Lütfen doğru öğrenci olduğunu teyit edin."
          >
            <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
            <span>Çakışma Uyarısı</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden shadow-2xs transition-colors">
      {/* Top Template Selection Toolbar */}
      <div className="px-4 py-2.5 bg-neutral-50/90 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-neutral-600 dark:text-neutral-400 font-medium flex items-center gap-1.5 shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Mesaj Şablonu:</span>
          </span>
          <select
            value={activeTemplateId}
            onChange={(e) => onSelectTemplate(e.target.value)}
            className="px-2.5 py-1 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded font-medium text-neutral-800 dark:text-neutral-200 text-xs focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 focus:outline-hidden shadow-2xs"
          >
            {templates.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                🏷️ [{tmpl.tag || 'Genel'}] {tmpl.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400 max-w-sm truncate">
          <span>Önizleme:</span>
          <span className="italic truncate font-mono">
            &quot;{selectedTemplate ? formatMessage(selectedTemplate.content, displayedItems[0]?.student || { id: '0', studentName: 'Ahmet Yılmaz', parentName: 'Mehmet Yılmaz', phone: '905XXXXXXXXX' }).slice(0, 45) : ''}...&quot;
          </span>
        </div>
      </div>

      {/* Class / Group Filters & Status Filter Tabs */}
      <div className="px-4 py-2 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
        {/* Class selector buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-neutral-500 dark:text-neutral-400 font-medium text-[11px] mr-1">
            Sınıflar:
          </span>
          <button
            type="button"
            onClick={() => handleGroupChange('all')}
            className={`px-2.5 py-0.5 rounded text-xs transition-all cursor-pointer ${
              currentGroup === 'all'
                ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold shadow-2xs'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            Tümü ({matchedItems.length})
          </button>
          {availableGroups.map((g) => {
            const count = matchedItems.filter((i) => (i.student.group || 'Genel') === g).length;
            return (
              <button
                key={g}
                type="button"
                onClick={() => handleGroupChange(g)}
                className={`px-2 py-0.5 rounded text-xs transition-all cursor-pointer ${
                  currentGroup === g
                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {g} ({count})
              </button>
            );
          })}
        </div>

        {/* Status view filter */}
        <div className="flex items-center gap-1 flex-wrap text-[11px]">
          <span className="text-neutral-400 font-medium mr-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3" />
            <span>Filtre:</span>
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            Tümü ({matchedItems.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ready')}
            className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
              statusFilter === 'ready'
                ? 'bg-emerald-700 text-white'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            Hazır ({readyCount})
          </button>
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
              }`}
            >
              ⚠️ Onay Bekleyen ({pendingCount})
            </button>
          )}
          {conflictCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('conflict')}
              className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                statusFilter === 'conflict'
                  ? 'bg-rose-600 text-white'
                  : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
              }`}
            >
              Çakışmalar ({conflictCount})
            </button>
          )}
          {missingCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('missing')}
              className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                statusFilter === 'missing'
                  ? 'bg-neutral-600 text-white'
                  : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              PDF Yok ({missingCount})
            </button>
          )}
        </div>
      </div>

      {/* Scanning Bar: Clearly distinguishes Digital Text Layer Extraction vs. Scanned Image OCR */}
      {missingCount > 0 && hasFolderSelected && (onStartOcrScan || onStartVisualOcr) && (
        <div className="px-4 py-3 bg-indigo-50/90 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-md border border-indigo-200 dark:border-indigo-800 shrink-0 mt-0.5">
              <ScanText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-indigo-950 dark:text-indigo-200">
                  Otomatik İçerik &amp; OCR Taraması ({missingCount} eksik öğrenci)
                </span>
                {unassignedPdfCount > 0 && (
                  <span className="text-[10px] bg-indigo-200/70 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 font-mono px-1.5 py-0.2 rounded font-semibold">
                    {unassignedPdfCount} boşta PDF
                  </span>
                )}
                {failedOcrCount > 0 && onOpenOcrFailureModal && (
                  <button
                    type="button"
                    onClick={onOpenOcrFailureModal}
                    className="inline-flex items-center gap-1 text-[10px] bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-semibold px-2 py-0.5 rounded cursor-pointer hover:bg-amber-200"
                  >
                    <FileQuestion className="w-3 h-3 text-amber-600" />
                    <span>{failedOcrCount} Belgede OCR Başarısız (Raporu Gör)</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80 mt-0.5 leading-relaxed">
                İki farklı yöntem desteklenir: <strong>PDF Metin Katmanı</strong> (dijital metin içeren belgeler için hızlı tarama) veya <strong>Görsel OCR</strong> (taranmış fotokopi ve fotoğraflar için yapay zeka optik tanıma).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* 1. Digital Text Layer Scan */}
            {onStartOcrScan && (
              <button
                type="button"
                onClick={onStartOcrScan}
                disabled={isOcrScanning || isVisualOcrRunning || unassignedPdfCount === 0}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Dijital metin katmanı içeren standart PDF'leri anında çevrimdışı tarar"
              >
                {isOcrScanning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {ocrProgress
                        ? `Metin Taranıyor (${ocrProgress.current}/${ocrProgress.total})...`
                        : 'Metin Taranıyor...'}
                    </span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-indigo-200" />
                    <span>PDF Metin Katmanını Tara</span>
                  </>
                )}
              </button>
            )}

            {/* 2. Scanned Image Real OCR */}
            {onStartVisualOcr && (
              <button
                type="button"
                onClick={onStartVisualOcr}
                disabled={isOcrScanning || isVisualOcrRunning || unassignedPdfCount === 0}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-xs transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Taranmış veya resim formatındaki PDF'leri yapay zeka Optik Karakter Tanıma (OCR) ile okur"
              >
                {isVisualOcrRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {visualOcrProgress
                        ? `Görsel OCR (${visualOcrProgress.current}/${visualOcrProgress.total})...`
                        : 'OCR Analiz Ediliyor...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Taranmış Belge Görsel OCR</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
              <th className="py-2.5 px-4 font-semibold">Öğrenci</th>
              <th className="py-2.5 px-4 font-semibold">Sınıf</th>
              <th className="py-2.5 px-4 font-semibold">Veli &amp; Tel</th>
              <th className="py-2.5 px-4 font-semibold">Eşleşen Karne PDF</th>
              <th className="py-2.5 px-4 font-semibold">Uyum Skoru &amp; Metot</th>
              <th className="py-2.5 px-4 font-semibold">Gönderim Durumu</th>
              <th className="py-2.5 px-4 font-semibold text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200">
            {displayedItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-neutral-400 dark:text-neutral-500">
                  {statusFilter !== 'all'
                    ? 'Bu filtre kriterine uygun kayıt bulunamadı.'
                    : currentGroup !== 'all'
                    ? `"${currentGroup}" sınıfında kayıtlı öğrenci bulunmuyor.`
                    : 'Kayıtlı öğrenci bulunmuyor. Lütfen "Öğrenciler" sekmesinden öğrenci ekleyin.'}
                </td>
              </tr>
            ) : (
              displayedItems.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors ${
                    item.hasConflict
                      ? 'bg-rose-50/30 dark:bg-rose-950/20'
                      : item.status === 'pending_confirmation'
                      ? 'bg-amber-50/30 dark:bg-amber-950/20'
                      : item.status === 'missing_pdf'
                      ? 'opacity-80'
                      : ''
                  }`}
                >
                  <td className="py-3 px-4 font-semibold text-neutral-900 dark:text-white">
                    {item.student.studentName}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-mono">
                      {item.student.group || 'Genel'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-0.5">
                      <div className="text-neutral-900 dark:text-neutral-100 font-medium">
                        {item.student.parentName || '-'}
                      </div>
                      <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                        {formatPhoneDisplay(item.student.phone)}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {item.pdfFile ? (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => onPreviewItem(item)}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-mono text-[11px] font-medium transition-colors cursor-pointer group text-left shadow-2xs"
                          title="Öğrenci isim-soyismi ile adlandırılan karne belgesi. Önizlemek için tıklayın."
                        >
                          <FileCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="truncate max-w-[190px] font-semibold group-hover:underline">
                            {item.pdfFile.name}
                          </span>
                        </button>

                        {item.pdfFile.originalName && item.pdfFile.originalName !== item.pdfFile.name && (
                          <div
                            className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-[190px] flex items-center gap-1 font-mono"
                            title={`Yüklenen Orijinal Dosya: ${item.pdfFile.originalName}`}
                          >
                            <span className="text-neutral-400">↺</span>
                            <span>Orijinal: {item.pdfFile.originalName}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-400 dark:text-neutral-500 font-mono text-[11px]">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">{renderMatchScore(item)}</td>
                  <td className="py-3 px-4">{getStatusBadge(item)}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {/* Low confidence confirm button */}
                      {(item.status === 'pending_confirmation' || item.needsConfirmation) && onConfirmMatch && (
                        <button
                          type="button"
                          onClick={() => onConfirmMatch(item.id)}
                          className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                          title="Bu düşük güvenli eşleşmeyi doğrula ve gönderime hazır yap"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Onayla</span>
                        </button>
                      )}

                      {/* Manual Assignment / Change Button */}
                      {onOpenManualMatch && (
                        <button
                          type="button"
                          onClick={() => onOpenManualMatch(item)}
                          className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                          title="Bu öğrenciye farklı bir PDF ata veya mevcut atamayı değiştir"
                        >
                          <Link className="w-3 h-3 text-neutral-500" />
                          <span>{item.pdfFile ? 'Değiştir' : 'PDF Ata'}</span>
                        </button>
                      )}

                      {/* Preview Button */}
                      {item.pdfFile ? (
                        <button
                          type="button"
                          onClick={() => onPreviewItem(item)}
                          className="px-2.5 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          Önizle
                        </button>
                      ) : (
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Summary Bar */}
      <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div>
            <span className="font-semibold text-emerald-800 dark:text-emerald-300 font-mono">{readyCount}</span> hazır
            {pendingCount > 0 && (
              <span className="text-amber-700 dark:text-amber-400 ml-2 font-semibold font-mono">
                • {pendingCount} onay bekleyen
              </span>
            )}
            {conflictCount > 0 && (
              <span className="text-rose-700 dark:text-rose-400 ml-2 font-semibold font-mono">
                • {conflictCount} çakışma
              </span>
            )}
            {missingCount > 0 && (
              <span className="text-neutral-500 dark:text-neutral-400 ml-2">
                • <span className="font-semibold text-neutral-700 dark:text-neutral-300 font-mono">{missingCount}</span> eksik
              </span>
            )}
            {invalidPhoneCount > 0 && (
              <span className="text-rose-700 dark:text-rose-400 ml-2">
                • <span className="font-semibold font-mono">{invalidPhoneCount}</span> geçersiz telefon
              </span>
            )}
          </div>
          <div className="h-3 w-px bg-neutral-200 dark:bg-neutral-700 hidden sm:block"></div>
          <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500' : 'bg-neutral-400'
              }`}
            ></span>
            <span className="text-[11px]">
              WhatsApp: <strong>{whatsAppStatus.phoneConnected || whatsAppStatus.details || whatsAppStatus.state}</strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onStartBatchSend}
          disabled={!canSend || !isConnected}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
            canSend && isConnected
              ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 cursor-pointer active:scale-98'
              : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 cursor-not-allowed'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Toplu Gönderimi Başlat ({readyCount})</span>
        </button>
      </div>
    </div>
  );
};
