import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'loading';
  title: string;
  message?: string;
  durationMs?: number;
}

interface ToastNotificationProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-60 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (toast.type === 'loading') return;
    const duration = toast.durationMs || (toast.type === 'error' ? 6500 : 4500);
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return {
          container:
            'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100 shadow-emerald-500/10',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
          bar: 'bg-emerald-500',
        };
      case 'error':
        return {
          container:
            'bg-rose-50 dark:bg-rose-950/90 border-rose-300 dark:border-rose-700 text-rose-950 dark:text-rose-100 shadow-rose-500/10',
          icon: <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />,
          bar: 'bg-rose-500',
        };
      case 'warning':
        return {
          container:
            'bg-amber-50 dark:bg-amber-950/90 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 shadow-amber-500/10',
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
          bar: 'bg-amber-500',
        };
      case 'loading':
        return {
          container:
            'bg-blue-50 dark:bg-blue-950/90 border-blue-300 dark:border-blue-700 text-blue-950 dark:text-blue-100 shadow-blue-500/10',
          icon: <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 animate-spin mt-0.5" />,
          bar: 'bg-blue-500',
        };
      case 'info':
      default:
        return {
          container:
            'bg-neutral-50 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-neutral-500/10',
          icon: <Info className="w-5 h-5 text-neutral-600 dark:text-neutral-400 shrink-0 mt-0.5" />,
          bar: 'bg-neutral-500',
        };
    }
  };

  const styles = getStyles();

  return (
    <div
      role="alert"
      className={`pointer-events-auto p-4 rounded-xl border shadow-xl flex items-start gap-3 transition-all duration-200 animate-in slide-in-from-top-3 fade-in backdrop-blur-md ${styles.container}`}
    >
      {styles.icon}
      <div className="flex-1 min-w-0 pr-1">
        <h4 className="text-xs font-bold tracking-tight">{toast.title}</h4>
        {toast.message && (
          <p className="text-[11px] leading-relaxed opacity-90 mt-1 font-medium break-words">
            {toast.message}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-current opacity-50 hover:opacity-100 transition-opacity p-0.5 rounded cursor-pointer shrink-0"
        title="Kapat"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
