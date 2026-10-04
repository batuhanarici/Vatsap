import React from 'react';
import { WhatsAppStatus } from '../types/whatsapp';
import { Settings, RefreshCw, Send, CheckCircle2, AlertCircle, QrCode, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  status: WhatsAppStatus;
  onOpenSettings: () => void;
  onRefreshStatus: () => void;
  isCheckingStatus: boolean;
  isMockMode: boolean;
  onToggleMockMode: () => void;
  onOpenTestModal: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onOpenSettings,
  onRefreshStatus,
  isCheckingStatus,
  isMockMode,
  onToggleMockMode,
  onOpenTestModal,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const getStatusBadge = () => {
    switch (status.state) {
      case 'connected':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-800 dark:text-neutral-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs"></span>
            <span>WhatsApp: Bağlı</span>
            {status.phoneConnected && (
              <span className="text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">({status.phoneConnected})</span>
            )}
          </div>
        );
      case 'qr_ready':
        return (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>QR Kod Bekleniyor</span>
          </button>
        );
      case 'starting':
      case 'authenticating':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-neutral-500" />
            <span>Başlatılıyor...</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-800 dark:text-rose-300">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Bağlantı Hatası</span>
          </div>
        );
      case 'disconnected':
      default:
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            <span className="w-2 h-2 rounded-full bg-neutral-400"></span>
            <span>WhatsApp: Bağlı Değil</span>
          </div>
        );
    }
  };

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-colors">
      <div className="max-w-6xl mx-auto px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              Karne Gönderici
            </h1>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
              macOS • OpenWA
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Haftalık sınav karne PDF&apos;lerini velilere WhatsApp üzerinden otomatik iletin.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Mock / Live switch */}
          <div className="flex items-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-0.5 text-xs">
            <button
              onClick={() => { if (!isMockMode) onToggleMockMode(); }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isMockMode
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs border border-neutral-200 dark:border-neutral-700'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              title="Ağ bağlantısı gerektirmeyen simüle test modu"
            >
              Test Modu
            </button>
            <button
              onClick={() => { if (isMockMode) onToggleMockMode(); }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                !isMockMode
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs border border-neutral-200 dark:border-neutral-700'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              title="Gerçek WhatsApp bağlantısı modu"
            >
              Canlı Mod
            </button>
          </div>

          {/* Status Badge */}
          {getStatusBadge()}

          {/* Refresh Status */}
          <button
            onClick={onRefreshStatus}
            disabled={isCheckingStatus}
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
            title="Durumu Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
          </button>

          {/* Dark Mode Toggle */}
          <button
            onClick={onToggleDarkMode}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium transition-colors cursor-pointer"
            title={isDarkMode ? 'Aydınlık Temaya Geç' : 'Karanlık Temaya Geç (Göz Yormaz)'}
          >
            {isDarkMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">Aydınlık</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden md:inline">Karanlık</span>
              </>
            )}
          </button>

          {/* Test Message */}
          <button
            onClick={onOpenTestModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
            <span>Test Mesajı</span>
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
            <span>Ayarlar</span>
          </button>
        </div>
      </div>
    </header>
  );
};
