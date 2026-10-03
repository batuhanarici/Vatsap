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
  Eye,
  Sparkles,
  ScanText,
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
  unassignedPdfCount?: number;
  selectedGroup?: string;
  onSelectGroup?: (group: string) => void;
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
  unassignedPdfCount = 0,
  selectedGroup = 'all',
  onSelectGroup,
}) => {
  const [internalGroup, setInternalGroup] = React.useState('all');
  const currentGroup = selectedGroup !== undefined ? selectedGroup : internalGroup;
  const handleGroupChange = onSelectGroup || setInternalGroup;

  // Extract all unique groups
  const availableGroups = React.useMemo(() => {
    const set = new Set<string>();
    matchedItems.forEach((i) => {
      if (i.student.group) set.add(i.student.group);
      else set.add('Genel');
    });
    return Array.from(set).sort();
  }, [matchedItems]);

  // Filter items by selected class/group
  const displayedItems = React.useMemo(() => {
    if (currentGroup === 'all') return matchedItems;
    return matchedItems.filter((i) => (i.student.group || 'Genel') === currentGroup);
  }, [matchedItems, currentGroup]);

  const readyCount = displayedItems.filter((i) => i.status === 'ready').length;
  const missingCount = displayedItems.filter((i) => i.status === 'missing_pdf').length;
  const invalidPhoneCount = displayedItems.filter((i) => i.status === 'invalid_phone').length;

  const isConnected = whatsAppStatus.state === 'connected';
  const canSend = readyCount > 0 && !isSending;

  const selectedTemplate =
    templates.find((t) => t.id === activeTemplateId) || templates[0];

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
    <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden shadow-2xs">
      {/* Top Template Selection Toolbar */}
      <div className="px-4 py-2.5 bg-neutral-50/90 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-neutral-600 font-medium flex items-center gap-1.5 shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>Mesaj Şablonu:</span>
          </span>
          <select
            value={activeTemplateId}
            onChange={(e) => onSelectTemplate(e.target.value)}
            className="px-2.5 py-1 bg-white border border-neutral-300 rounded font-medium text-neutral-800 text-xs focus:ring-1 focus:ring-neutral-900 focus:outline-hidden shadow-2xs"
          >
            {templates.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                🏷️ [{tmpl.tag || 'Genel'}] {tmpl.title}
              </option>
            ))}
          </select>
          {selectedTemplate?.tag && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              {selectedTemplate.tag}
            </span>
          )}
        </div>
        {selectedTemplate && (
          <span
            className="text-[11px] text-neutral-500 italic truncate max-w-sm hidden md:inline-block"
            title={formatMessage(
              selectedTemplate.content,
              { id: 'p', studentName: 'Ahmet', parentName: 'Mehmet Bey', phone: '' },
              { examName: 'Deneme Sınavı' }
            )}
          >
            Önizleme: &quot;
            {formatMessage(
              selectedTemplate.content,
              { id: 'p', studentName: 'Ahmet', parentName: 'Mehmet Bey', phone: '' },
              { examName: 'Deneme Sınavı' }
            )
              .replace(/\n/g, ' ')
              .slice(0, 60)}
            ...&quot;
          </span>
        )}
      </div>

      {/* Class / Group Filter Toolbar */}
      {availableGroups.length > 0 && (
        <div className="px-4 py-2 bg-neutral-100/80 border-b border-neutral-200 flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-neutral-600 font-semibold flex items-center gap-1 mr-1">
            <span>🎯 Sınıf / Şube Seçimi:</span>
          </span>
          <button
            type="button"
            onClick={() => handleGroupChange('all')}
            className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
              currentGroup === 'all'
                ? 'bg-neutral-900 text-white font-semibold shadow-2xs'
                : 'bg-white text-neutral-700 hover:bg-neutral-50 border border-neutral-200'
            }`}
          >
            Tüm Sınıflar ({matchedItems.length})
          </button>
          {availableGroups.map((g) => {
            const groupTotal = matchedItems.filter((i) => (i.student.group || 'Genel') === g).length;
            const groupReady = matchedItems.filter((i) => (i.student.group || 'Genel') === g && i.status === 'ready').length;
            const isSelected = currentGroup === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => handleGroupChange(g)}
                className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs ring-1 ring-indigo-700'
                    : 'bg-white text-neutral-700 hover:bg-neutral-50 border border-neutral-200'
                }`}
              >
                <span>{g}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? 'bg-indigo-700 text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                  title={`${groupReady}/${groupTotal} öğrenci hazır`}
                >
                  {groupReady}/{groupTotal}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* OCR / Smart Content Matching Bar */}
      {missingCount > 0 && hasFolderSelected && onStartOcrScan && (
        <div className="px-4 py-3 bg-indigo-50/90 border-b border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-md border border-indigo-200 shrink-0 mt-0.5">
              <ScanText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-indigo-950">
                  {missingCount} öğrenci için dosya adı eşleşmedi
                </span>
                {unassignedPdfCount > 0 && (
                  <span className="text-[10px] bg-indigo-200/70 text-indigo-800 font-mono px-1.5 py-0.2 rounded font-semibold">
                    {unassignedPdfCount} boşta PDF var
                  </span>
                )}
              </div>
              <p className="text-[11px] text-indigo-800/90 mt-0.5">
                Dosya adları <code>scan_001.pdf</code> gibi genel veya numaralı olsa bile, akıllı metin analizi ile PDF&apos;lerin ilk sayfalarındaki öğrenci adını okuyarak eşleştirebilirsiniz.
              </p>
            </div>
          </div>

          <button
            onClick={onStartOcrScan}
            disabled={isOcrScanning}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-semibold text-xs transition-all shrink-0 shadow-xs cursor-pointer ${
              isOcrScanning
                ? 'bg-indigo-300 text-white cursor-wait'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-98'
            }`}
          >
            {isOcrScanning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>
                  Taranıyor {ocrProgress ? `(${ocrProgress.current}/${ocrProgress.total})` : ''}...
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>PDF İçinden İsim Oku (OCR)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Real-time OCR scan progress status bar */}
      {isOcrScanning && ocrProgress && (
        <div className="px-4 py-2 bg-indigo-100/70 border-b border-indigo-200 flex items-center justify-between text-[11px] text-indigo-900 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="font-mono">📄 {ocrProgress.currentFileName}</span>
            {ocrProgress.detectedStudentName && (
              <span className="font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                ✓ Tespit Edildi: {ocrProgress.detectedStudentName}
              </span>
            )}
          </div>
          <span className="font-mono">%{Math.round((ocrProgress.current / ocrProgress.total) * 100)}</span>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-medium">
              <th className="py-2.5 px-4 font-semibold">Öğrenci</th>
              <th className="py-2.5 px-4 font-semibold">Sınıf / Şube</th>
              <th className="py-2.5 px-4 font-semibold">Veli</th>
              <th className="py-2.5 px-4 font-semibold">WhatsApp Numarası</th>
              <th className="py-2.5 px-4 font-semibold">Eşleşen PDF Dosyası</th>
              <th className="py-2.5 px-4 font-semibold">Durum</th>
              <th className="py-2.5 px-4 font-semibold text-right">Karne Önizle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-neutral-800">
            {displayedItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-neutral-400">
                  {currentGroup !== 'all'
                    ? `"${currentGroup}" sınıfında kayıtlı öğrenci bulunmuyor.`
                    : 'Kayıtlı öğrenci bulunmuyor. Lütfen "Öğrenciler" sekmesinden öğrenci ekleyin.'}
                </td>
              </tr>
            ) : (
              displayedItems.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-neutral-50/70 transition-colors ${
                    item.status === 'missing_pdf' ? 'opacity-80' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-neutral-900">
                    {item.student.studentName}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                      {item.student.group || 'Genel'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-neutral-600">
                    {item.student.parentName}
                  </td>
                  <td className="py-3 px-4 font-mono text-neutral-600">
                    {formatPhoneDisplay(item.student.phone)}
                  </td>
                  <td className="py-3 px-4">
                    {item.pdfFile ? (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => onPreviewItem(item)}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-800 font-mono text-[11px] transition-colors cursor-pointer group text-left"
                          title="Karnenin ayrıntılı önizlemesine bakmak için tıklayın"
                        >
                          <FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[190px] group-hover:underline">
                            {item.pdfFile.name}
                          </span>
                        </button>
                        {item.matchMethod === 'content_ocr' && (
                          <div className="flex items-center gap-1 text-[10px] text-indigo-700 font-semibold bg-indigo-50/80 px-1.5 py-0.5 rounded border border-indigo-200 w-fit">
                            <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span>PDF İçi Metinden Okundu</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-400 font-mono text-[11px]">—</span>
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
                  <td className="py-3 px-4 text-right">
                    {item.pdfFile ? (
                      <button
                        type="button"
                        onClick={() => onPreviewItem(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-100 hover:bg-emerald-50 text-neutral-800 hover:text-emerald-900 border border-neutral-300 hover:border-emerald-300 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
                        title="Göndermeden önce bu öğrencinin karnesini inceleyin"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        <span>İncele</span>
                      </button>
                    ) : (
                      <span className="text-neutral-300 text-xs font-mono">—</span>
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
            <span>
              {currentGroup !== 'all'
                ? `${currentGroup} Sınıfına Gönder (${readyCount})`
                : `Toplu Gönderime Başla (${readyCount})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
