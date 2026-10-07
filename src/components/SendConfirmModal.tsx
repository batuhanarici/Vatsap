import React, { useState } from 'react';
import { MatchedItem } from '../types/pdf';
import { WhatsAppStatus } from '../types/whatsapp';
import { MessageTemplate } from '../types/template';
import { formatMessage } from '../services/templateService';
import {
  X,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Zap,
  Moon,
  Sun,
  Sparkles,
  Info,
} from 'lucide-react';

interface SendConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (examName: string, sendToSecondaryParents?: boolean) => void;
  onSchedule?: (params: {
    targetTimestamp: number;
    targetTimeString: string;
    targetDateString: string;
    examName: string;
    sendToSecondaryParents?: boolean;
  }) => void;
  matchedItems: MatchedItem[];
  whatsAppStatus: WhatsAppStatus;
  delaySeconds: number;
  templates: MessageTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (id: string) => void;
  initialExamName?: string;
  selectedGroupName?: string;
}

export const SendConfirmModal: React.FC<SendConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onSchedule,
  matchedItems,
  whatsAppStatus,
  delaySeconds,
  templates,
  activeTemplateId,
  onSelectTemplate,
  initialExamName = 'Genel Deneme Sınavı',
  selectedGroupName = 'all',
}) => {
  const [examName, setExamName] = useState(initialExamName);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [sendToSecondary, setSendToSecondary] = useState(false);

  // Schedule date & time state
  const getTodayDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [scheduledDate, setScheduledDate] = useState<string>(getTodayDateString());
  const [scheduledTime, setScheduledTime] = useState<string>('19:30');

  if (!isOpen) return null;

  const readyItems = matchedItems.filter((i) => i.status === 'ready');
  const missingItems = matchedItems.filter((i) => i.status === 'missing_pdf');
  const invalidItems = matchedItems.filter((i) => i.status === 'invalid_phone');

  const isClassFiltered = selectedGroupName && selectedGroupName !== 'all';

  const selectedTemplate =
    templates.find((t) => t.id === activeTemplateId) || templates[0];

  const estimatedMinutes = Math.ceil((readyItems.length * (delaySeconds + 2)) / 60);

  // Preview message with the first ready student or a sample
  const previewStudent = readyItems[0]?.student || {
    id: 'sample',
    studentName: 'Ahmet Yılmaz',
    parentName: 'Mehmet Yılmaz',
    phone: '905321112233',
    group: isClassFiltered ? selectedGroupName : '8-A',
  };

  const previewText = selectedTemplate
    ? formatMessage(selectedTemplate.content, previewStudent, { examName })
    : '';

  // Calculate target timestamp
  const calculateTargetTimestamp = (dateStr: string, timeStr: string): number => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      const targetDate = new Date(year, month - 1, day, hours, minutes, 0);
      return targetDate.getTime();
    } catch {
      return Date.now() + 60 * 60 * 1000;
    }
  };

  const targetTimestamp = calculateTargetTimestamp(scheduledDate, scheduledTime);
  const diffMs = targetTimestamp - Date.now();
  const isPastTime = diffMs <= 0;

  const getDiffText = () => {
    if (isPastTime) return 'Seçilen saat geçmişte kalmış! Lütfen ileri bir saat seçin.';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours === 0) {
      return `Yaklaşık ${diffMinutes} dakika sonra başlayacak.`;
    }
    return `Yaklaşık ${diffHours} saat ${diffMinutes} dakika sonra başlayacak.`;
  };

  // Quick preset handlers
  const handleSetPreset = (time: string, isTomorrow = false) => {
    const d = new Date();
    if (isTomorrow) {
      d.setDate(d.getDate() + 1);
    }
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setScheduledDate(dateStr);
    setScheduledTime(time);
  };

  const handleStartOrSchedule = () => {
    if (sendMode === 'now') {
      onClose();
      onConfirm(examName, sendToSecondary);
    } else {
      if (isPastTime) {
        alert('Lütfen gelecekteki bir tarih ve saat seçin.');
        return;
      }
      if (onSchedule) {
        onSchedule({
          targetTimestamp,
          targetTimeString: scheduledTime,
          targetDateString: scheduledDate,
          examName,
          sendToSecondaryParents: sendToSecondary,
        });
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-neutral-900 dark:text-neutral-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/90 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {isClassFiltered ? `${selectedGroupName} Sınıfı Gönderim Onayı` : 'Toplu Gönderim Öncesi Onay'}
            </h2>
            {isClassFiltered && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Sınıf: {selectedGroupName}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Mode Switcher: Hemen Gönder vs Zamanla */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSendMode('now')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md transition-all cursor-pointer ${
                sendMode === 'now'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-current" />
              <span>Hemen Şimdi Gönder</span>
            </button>

            <button
              type="button"
              onClick={() => setSendMode('schedule')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md transition-all cursor-pointer ${
                sendMode === 'schedule'
                  ? 'bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>İleri Bir Saate Planla ⏱️</span>
            </button>
          </div>

          {/* Schedule Settings Panel (shown when schedule mode active) */}
          {sendMode === 'schedule' && (
            <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-lg space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Otomatik Gönderim Zamanlayıcısı</span>
                </span>
                <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-mono">
                  {getDiffText()}
                </span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-indigo-900/80 dark:text-indigo-300 block">
                  Hızlı Saat Önerileri (Velilerin evde olduğu saatler):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetPreset('19:30')}
                    className="px-2.5 py-1 bg-white dark:bg-neutral-900 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 rounded text-xs hover:bg-indigo-100/50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Moon className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    <span>Bugün 19:30</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPreset('20:00')}
                    className="px-2.5 py-1 bg-white dark:bg-neutral-900 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 rounded text-xs hover:bg-indigo-100/50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Moon className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    <span>Bugün 20:00</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPreset('21:00')}
                    className="px-2.5 py-1 bg-white dark:bg-neutral-900 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 rounded text-xs hover:bg-indigo-100/50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Moon className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    <span>Bugün 21:00</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPreset('09:00', true)}
                    className="px-2.5 py-1 bg-white dark:bg-neutral-900 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 rounded text-xs hover:bg-indigo-100/50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Sun className="w-3 h-3 text-amber-500" />
                    <span>Yarın 09:00</span>
                  </button>
                </div>
              </div>

              {/* Exact Date & Time Picker */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-indigo-200/50 dark:border-indigo-800/50">
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 block mb-0.5">
                    Gönderim Tarihi:
                  </label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 block mb-0.5">
                    Gönderim Saati:
                  </label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 font-mono"
                  />
                </div>
              </div>

              {isPastTime && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                  ⚠️ Belirttiğiniz saat geçmiştedir. Lütfen ileri bir saat belirleyin.
                </p>
              )}
            </div>
          )}

          {/* Template Selection Box */}
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <span>Kullanılacak Mesaj Şablonu:</span>
              </label>
              {selectedTemplate?.tag && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  🏷️ {selectedTemplate.tag}
                </span>
              )}
            </div>

            <select
              value={activeTemplateId}
              onChange={(e) => onSelectTemplate(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-medium text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            >
              {templates.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  [{tmpl.tag || 'Genel'}] {tmpl.title}
                </option>
              ))}
            </select>

            {/* Sınav Adı Girişi */}
            <div>
              <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                Sınav / Karne Başlığı ({'{sinav_adi}'}):
              </label>
              <input
                type="text"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="Örn: LGS 3. Deneme Sınavı veya 1. Dönem 1. Yazılı"
                className="w-full px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-medium text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
              />
            </div>

            {/* Template preview snippet */}
            <div>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium block mb-1">
                Mesaj Önizlemesi ({'{tarih}'}, {'{gun}'} ve {'{sinif}'} çözümlendi):
              </span>
              <div className="p-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-[11px] text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap max-h-24 overflow-y-auto leading-relaxed font-sans">
                {previewText}
              </div>
            </div>
          </div>

          {/* Multi-Parent Delivery Option */}
          {readyItems.some((i) => Boolean(i.student.secondaryPhone)) && (
            <label className="flex items-start gap-2.5 p-3 bg-purple-50/80 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg cursor-pointer text-xs transition-colors">
              <input
                type="checkbox"
                checked={sendToSecondary}
                onChange={(e) => setSendToSecondary(e.target.checked)}
                className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="font-semibold text-purple-900 dark:text-purple-200">
                  2. Veli Numarasına da Gönder (Kopya İletimi)
                </span>
                <span className="text-[11px] text-purple-800/80 dark:text-purple-300/80 mt-0.5 leading-relaxed">
                  İkinci veli telefonu tanımlı olan{' '}
                  <strong>{readyItems.filter((i) => Boolean(i.student.secondaryPhone)).length} öğrenci</strong> için karne kopyası 2. veliye de otomatik iletilecektir.
                </span>
              </div>
            </label>
          )}

          {/* Statistics summary */}
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between font-medium text-neutral-900 dark:text-neutral-100">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Gönderilecek Hazır Veli:</span>
              </span>
              <span className="font-semibold text-sm font-mono">{readyItems.length} kişi</span>
            </div>

            {missingItems.length > 0 && (
              <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 pt-1 border-t border-neutral-200 dark:border-neutral-700">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-neutral-400" />
                  <span>PDF Eksik (Atlanacak):</span>
                </span>
                <span className="font-mono">{missingItems.length}</span>
              </div>
            )}

            {invalidItems.length > 0 && (
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 pt-1 border-t border-neutral-200 dark:border-neutral-700">
                <span>Geçersiz Telefon (Atlanacak):</span>
                <span className="font-mono">{invalidItems.length}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 pt-1 border-t border-neutral-200 dark:border-neutral-700">
              <span>Veliler arası bekleme:</span>
              <span className="font-mono">{delaySeconds} saniye</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
              <span>Tahmini gönderim süresi:</span>
              <span className="font-mono">~{estimatedMinutes > 1 ? `${estimatedMinutes} dakika` : '30-45 saniye'}</span>
            </div>
          </div>

          {/* Important Technical Delivery Note */}
          <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-950 dark:text-indigo-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-900 dark:text-indigo-300">
              <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>WhatsApp PDF İletimi Hakkında Bilgi</span>
            </div>
            <p className="text-[11px] leading-relaxed text-indigo-900/90 dark:text-indigo-300/90">
              <strong>WhatsApp Web (Yardımlı Gönderim):</strong> Web tarayıcı güvenlik kuralları gereği harici linkler üzerinden WhatsApp&apos;a otomatik dosya enjekte edilemez. Bu modda PDF veliye doğrudan gitmez; veli sohbet sekmesi açıldığında PDF belgesini <strong>WhatsApp ekranına sürükleyip bırakarak</strong> manuel göndermeniz gerekir.
            </p>
            <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300 font-medium">
              💡 <strong>Tam Otomatik PDF Eki:</strong> Herhangi bir sekme açmadan PDF&apos;lerin veliye doğrudan yeşil dosya eki olarak gitmesi için <strong>Ayarlar ➔ OpenWA / Docker</strong> modunu kullanabilirsiniz.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Vazgeç
          </button>

          {sendMode === 'now' ? (
            <button
              onClick={handleStartOrSchedule}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-white transition-colors shadow-xs cursor-pointer active:scale-98"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Hemen Gönderimi Başlat ({readyItems.length})</span>
            </button>
          ) : (
            <button
              onClick={handleStartOrSchedule}
              disabled={isPastTime}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-semibold shadow-xs transition-all ${
                isPastTime
                  ? 'bg-neutral-300 dark:bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer active:scale-98'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Saat {scheduledTime}&apos;a Zamanla ({readyItems.length})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
