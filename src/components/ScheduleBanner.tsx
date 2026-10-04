import React, { useState, useEffect } from 'react';
import { ScheduledDispatch } from '../types/schedule';
import { Clock, Play, X, Bell, Calendar, Sparkles } from 'lucide-react';

interface ScheduleBannerProps {
  schedule: ScheduledDispatch;
  onExecuteNow: () => void;
  onCancelSchedule: () => void;
}

export const ScheduleBanner: React.FC<ScheduleBannerProps> = ({
  schedule,
  onExecuteNow,
  onCancelSchedule,
}) => {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    totalMs: number;
  }>({ hours: 0, minutes: 0, seconds: 0, totalMs: 0 });

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(0, schedule.targetTimestamp - now);

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds, totalMs: diff });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [schedule.targetTimestamp]);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-neutral-900 text-white rounded-xl p-4 shadow-lg border border-indigo-700/50 mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Side: Schedule Details */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-lg text-indigo-300 shrink-0 mt-0.5 animate-pulse">
            <Clock className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5" />
                <span>Planlı Gönderim Devrede</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/30 border border-indigo-400/40 text-indigo-200">
                Hedef Saat: {schedule.targetTimeString}
              </span>
              {schedule.selectedGroup && schedule.selectedGroup !== 'all' && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                  Sınıf: {schedule.selectedGroup}
                </span>
              )}
            </div>

            <p className="text-xs text-neutral-200 font-medium mt-1">
              <strong>{schedule.studentCount} veliye</strong> &quot;{schedule.examName}&quot; karneleri belirlenen saatte otomatik gönderilecek.
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Geri sayım tamamlandığında sesli uyarı çalacak ve WhatsApp gönderim kuyruğu başlayacaktır.
            </p>
          </div>
        </div>

        {/* Right Side: Digital Countdown Timer & Action Buttons */}
        <div className="flex items-center gap-3 self-end md:self-center shrink-0">
          <div className="bg-black/40 border border-white/10 rounded-lg px-3.5 py-1.5 text-center">
            <span className="text-[9px] uppercase tracking-wider text-neutral-400 block font-semibold">
              Kalan Süre
            </span>
            <span className="text-lg font-bold font-mono text-emerald-400 tracking-wider">
              {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExecuteNow}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
              title="Zamanlayıcıyı beklemeden gönderimi hemen başlat"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Hemen Başlat</span>
            </button>

            <button
              onClick={onCancelSchedule}
              className="flex items-center gap-1 px-2.5 py-2 bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
              title="Planlamayı iptal et"
            >
              <X className="w-3.5 h-3.5" />
              <span>İptal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
