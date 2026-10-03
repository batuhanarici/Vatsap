import React from 'react';
import { WhatsAppStatus } from '../types/whatsapp';
import { Settings, RefreshCw, Send, CheckCircle2, AlertCircle, QrCode } from 'lucide-react';

interface HeaderProps {
  status: WhatsAppStatus;
  onOpenSettings: () => void;
  onRefreshStatus: () => void;
  isCheckingStatus: boolean;
  isMockMode: boolean;
  onToggleMockMode: () => void;
  onOpenTestModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onOpenSettings,
  onRefreshStatus,
  isCheckingStatus,
  isMockMode,
  onToggleMockMode,
  onOpenTestModal,
}) => {
  const getStatusBadge = () => {
    switch (status.state) {
      case 'connected':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-neutral-100 border border-neutral-200 text-xs font-medium text-neutral-800">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
            <span>WhatsApp: Bağlı</span>
            {status.phoneConnected && (
              <span className="text-neutral-500 font-mono text-[11px]">({status.phoneConnected})</span>
            )}
          </div>
        );
      case 'qr_ready':
        return (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
          >
            <QrCode className="w-3.5 h-3.5 text-amber-600" />
            <span>QR Kod Bekleniyor</span>
          </button>
        );
      case 'starting':
      case 'authenticating':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-neutral-100 border border-neutral-200 text-xs font-medium text-neutral-700">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-neutral-500" />
            <span>Başlatılıyor...</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Bağlantı Hatası</span>
          </div>
        );
      case 'disconnected':
      default:
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-neutral-100 border border-neutral-200 text-xs font-medium text-neutral-600">
            <span className="w-2 h-2 rounded-full bg-neutral-400"></span>
            <span>WhatsApp: Bağlı Değil</span>
          </div>
        );
    }
  };

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
              Karne Gönderici
            </h1>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 border border-neutral-200">
              macOS • OpenWA
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Haftalık sınav karnelerini velilere gönderin.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Mock / Live switch */}
          <div className="flex items-center rounded border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
            <button
              onClick={() => { if (!isMockMode) onToggleMockMode(); }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                isMockMode
                  ? 'bg-white text-neutral-900 shadow-xs border border-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
              title="OpenWA olmadan akış testi yapın"
            >
              Test Modu
            </button>
            <button
              onClick={() => { if (isMockMode) onToggleMockMode(); }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                !isMockMode
                  ? 'bg-white text-neutral-900 shadow-xs border border-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
              title="Gerçek OpenWA servisine bağlanın"
            >
              Canlı OpenWA
            </button>
          </div>

          {/* Status Badge */}
          {getStatusBadge()}

          {/* Refresh Status */}
          <button
            onClick={onRefreshStatus}
            disabled={isCheckingStatus}
            className="p-1.5 rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-50"
            title="Durumu Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
          </button>

          {/* Test Message */}
          <button
            onClick={onOpenTestModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-medium transition-colors"
          >
            <Send className="w-3.5 h-3.5 text-neutral-500" />
            <span>Test Mesajı</span>
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-medium transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-neutral-500" />
            <span>Ayarlar</span>
          </button>
        </div>
      </div>
    </header>
  );
};
