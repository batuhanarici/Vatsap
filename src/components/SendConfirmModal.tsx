import React from 'react';
import { MatchedItem } from '../types/pdf';
import { WhatsAppStatus } from '../types/whatsapp';
import { MessageTemplate } from '../types/template';
import { formatMessage } from '../services/templateService';
import { X, Send, AlertTriangle, CheckCircle2, MessageSquare, Tag } from 'lucide-react';

interface SendConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  matchedItems: MatchedItem[];
  whatsAppStatus: WhatsAppStatus;
  delaySeconds: number;
  templates: MessageTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (id: string) => void;
}

export const SendConfirmModal: React.FC<SendConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  matchedItems,
  whatsAppStatus,
  delaySeconds,
  templates,
  activeTemplateId,
  onSelectTemplate,
}) => {
  if (!isOpen) return null;

  const readyItems = matchedItems.filter((i) => i.status === 'ready');
  const missingItems = matchedItems.filter((i) => i.status === 'missing_pdf');
  const invalidItems = matchedItems.filter((i) => i.status === 'invalid_phone');

  const selectedTemplate =
    templates.find((t) => t.id === activeTemplateId) || templates[0];

  const estimatedMinutes = Math.ceil((readyItems.length * (delaySeconds + 2)) / 60);

  // Preview message with the first ready student or a sample
  const previewStudent = readyItems[0]?.student || {
    id: 'sample',
    studentName: 'Ahmet Yılmaz',
    parentName: 'Mehmet Yılmaz',
    phone: '905321112233',
  };
  const previewText = selectedTemplate
    ? formatMessage(selectedTemplate.content, previewStudent)
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-neutral-50/50">
          <h2 className="text-sm font-semibold text-neutral-900">
            Toplu Gönderim Öncesi Onay
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Template Selection Box */}
          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Kullanılacak Mesaj Şablonu:</span>
              </label>
              {selectedTemplate?.tag && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  🏷️ {selectedTemplate.tag}
                </span>
              )}
            </div>

            <select
              value={activeTemplateId}
              onChange={(e) => onSelectTemplate(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-medium text-neutral-900 bg-white focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
            >
              {templates.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  [{tmpl.tag || 'Genel'}] {tmpl.title}
                </option>
              ))}
            </select>

            {/* Template preview snippet */}
            <div className="mt-2 p-2.5 bg-white border border-neutral-200 rounded text-[11px] text-neutral-700 whitespace-pre-wrap max-h-24 overflow-y-auto leading-relaxed font-sans">
              {previewText}
            </div>
          </div>

          {/* Statistics summary */}
          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between font-medium text-neutral-900">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Gönderilecek Hazır Veli:</span>
              </span>
              <span className="font-semibold text-sm">{readyItems.length} kişi</span>
            </div>

            {missingItems.length > 0 && (
              <div className="flex items-center justify-between text-neutral-500 pt-1 border-t border-neutral-200">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-neutral-400" />
                  <span>PDF Eksik (Atlanacak):</span>
                </span>
                <span>{missingItems.length}</span>
              </div>
            )}

            {invalidItems.length > 0 && (
              <div className="flex items-center justify-between text-amber-700 pt-1 border-t border-neutral-200">
                <span>Geçersiz Telefon (Atlanacak):</span>
                <span>{invalidItems.length}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-200">
              <span>Veliler arası bekleme:</span>
              <span>{delaySeconds} saniye</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-neutral-500">
              <span>Tahmini süre:</span>
              <span>~{estimatedMinutes > 1 ? `${estimatedMinutes} dakika` : '30-45 saniye'}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-neutral-100 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              onClick={() => {
                onClose();
                onConfirm();
              }}
              className="flex items-center gap-1.5 px-5 py-2 rounded bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Gönderimi Başlat ({readyItems.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
