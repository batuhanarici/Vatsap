import React from 'react';
import { ScheduledDispatch } from '../types/schedule';
import { Clock, Play, X, AlertTriangle, Calendar, Users, Terminal } from 'lucide-react';

interface OverdueScheduleModalProps {
  isOpen: boolean;
  schedule: ScheduledDispatch | null;
  onExecuteNow: () => void;
  onDismissAndCancel: () => void;
}

export const OverdueScheduleModal: React.FC<OverdueScheduleModalProps> = ({
  isOpen,
  schedule,
  onExecuteNow,
  onDismissAndCancel,
}) => {
  if (!isOpen || !schedule) return null;

  const targetDate = new Date(schedule.targetTimestamp);
  const formattedDate = targetDate.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-amber-200 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center border border-amber-300 dark:border-amber-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Gecikmiş Zamanlı Gönderim Uyarısı
              </h2>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Planlanan saatte uygulama kapalıydı
              </p>
            </div>
          </div>
          <button
            onClick={onDismissAndCancel}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-xl text-neutral-800 dark:text-neutral-200 leading-relaxed space-y-1.5">
            <p>
              Aşağıdaki sınav karnesi gönderimi <strong>{formattedDate}</strong> ({schedule.targetTimeString}) için planlanmıştı.
            </p>
            <p className="text-neutral-600 dark:text-neutral-400 text-[11px]">
              Belirtilen saatte bilgisayarınız veya uygulama kapalı olduğu için gönderim başlatılamadı. Bu görevi hemen şimdi başlatabilir veya iptal ederek kaydı kapatabilirsiniz.
            </p>
          </div>

          {/* Schedule Info Box */}
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 font-medium">Sınav Başlığı:</span>
              <strong className="text-neutral-900 dark:text-neutral-100">{schedule.examName}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 font-medium">Hedef Kitle / Grup:</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {schedule.selectedGroup === 'all' ? 'Tüm Sınıflar' : schedule.selectedGroup}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 font-medium">Öğrenci Sayısı:</span>
              <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">
                {schedule.studentCount} Veli
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 font-medium">Planlanan Zaman:</span>
              <span className="font-mono text-amber-700 dark:text-amber-300 font-semibold">
                {schedule.targetDateString} {schedule.targetTimeString}
              </span>
            </div>
          </div>

          {/* Background Execution Notice */}
          <div className="p-3 bg-neutral-100 dark:bg-neutral-800/40 rounded-lg text-[11px] text-neutral-500 dark:text-neutral-400 space-y-1">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300 block">
              💡 Bilgi: Uygulama Kapalıyken Arka Planda Çalışma (LaunchAgent)
            </span>
            <p>
              Mac uyku modundayken veya uygulama kapalıyken arka planda tetiklenmesi için macOS LaunchAgent servisi yapılandırılabilir. Ayarlar ekranından arka plan rehberini inceleyebilirsiniz.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-800/60 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onDismissAndCancel}
            className="px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-lg font-medium text-xs cursor-pointer"
          >
            İptal Et &amp; Temizle
          </button>

          <button
            type="button"
            onClick={onExecuteNow}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Geciken Gönderimi Şimdi Başlat</span>
          </button>
        </div>
      </div>
    </div>
  );
};
