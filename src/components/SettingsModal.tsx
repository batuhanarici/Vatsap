import React, { useState } from 'react';
import { WhatsAppStatus, OpenWAConfig } from '../types/whatsapp';
import { X, RefreshCw, CheckCircle2, AlertCircle, QrCode, ExternalLink, Shield } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OpenWAConfig & { testPhone: string; delaySeconds: number };
  onSaveConfig: (updated: Partial<OpenWAConfig & { testPhone: string; delaySeconds: number }>) => void;
  status: WhatsAppStatus;
  onCheckStatus: () => void;
  isChecking: boolean;
  qrCodeUrl: string | null;
  onStartSession: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  status,
  onCheckStatus,
  isChecking,
  qrCodeUrl,
  onStartSession,
}) => {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [sessionId, setSessionId] = useState(config.sessionId);
  const [delaySeconds, setDelaySeconds] = useState(config.delaySeconds || 3);
  const [showKey, setShowKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      sessionId: sessionId.trim(),
      delaySeconds: Number(delaySeconds) || 3,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const getStatusColor = () => {
    switch (status.state) {
      case 'connected':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200';
      case 'qr_ready':
        return 'text-amber-800 bg-amber-50 border-amber-200';
      case 'error':
        return 'text-rose-700 bg-rose-50 border-rose-200';
      default:
        return 'text-neutral-700 bg-neutral-100 border-neutral-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-neutral-50/50">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              WhatsApp ve OpenWA Ayarları
            </h2>
            <p className="text-xs text-neutral-500">
              Yerel OpenWA servis bağlantısı ve oturum yönetimi
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Status Box */}
          <div className={`p-3.5 rounded border text-xs flex flex-col gap-2 ${getStatusColor()}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-current"></span>
                <span>Durum: {status.state === 'connected' ? 'Bağlı (Gönderime Hazır)' : status.state === 'qr_ready' ? 'QR Kod Hazır' : status.state}</span>
              </div>
              <button
                type="button"
                onClick={onCheckStatus}
                disabled={isChecking}
                className="flex items-center gap-1 px-2 py-1 rounded bg-white/80 hover:bg-white text-neutral-800 border border-neutral-200 font-medium transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
                <span>Test Et</span>
              </button>
            </div>
            {status.details && (
              <p className="text-[11px] opacity-90">{status.details}</p>
            )}
          </div>

          {/* QR Code Presentation if available */}
          {(status.state === 'qr_ready' || qrCodeUrl) && (
            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-neutral-800">
                <QrCode className="w-4 h-4" />
                <span>WhatsApp Bağlantısı İçin QR Kodu Okutun</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Telefonunuzdan WhatsApp &gt; Ayarlar / Bağlı Cihazlar &gt; Cihaz Bağla bölümüne gidin.
              </p>
              <div className="flex justify-center p-3 bg-white rounded border border-neutral-200 inline-block mx-auto">
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="WhatsApp QR Code"
                    className="w-48 h-48 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-xs text-neutral-400">
                    QR yükleniyor...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Configuration Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                OpenWA REST API Adresi
              </label>
              <input
                type="text"
                required
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:2785/api"
                className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
              />
              <span className="text-[11px] text-neutral-400 mt-1 block">
                Varsayılan: http://localhost:2785/api
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-neutral-700">
                  OpenWA API Anahtarı (X-API-Key)
                </label>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-[11px] text-neutral-500 hover:text-neutral-800"
                >
                  {showKey ? 'Gizle' : 'Göster'}
                </button>
              </div>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="data/.api-key dosyasındaki anahtar"
                className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
              />
              <span className="text-[11px] text-neutral-400 mt-1 block">
                OpenWA konsolunda veya OpenWA web dashboard&apos;unda üretilen anahtardır.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Oturum ID (Session ID)
                </label>
                <input
                  type="text"
                  required
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder="default"
                  className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Öğrenciler Arası Bekleme
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
                  />
                  <span className="text-xs text-neutral-500 shrink-0">saniye</span>
                </div>
              </div>
            </div>

            {/* Quick Session Actions */}
            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
              <button
                type="button"
                onClick={onStartSession}
                className="text-xs text-neutral-700 hover:text-neutral-900 font-medium underline"
              >
                Yeni Oturum Başlat / Yenile
              </button>

              <div className="flex items-center gap-2">
                {savedSuccess && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Kaydedildi</span>
                  </span>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 bg-neutral-900 text-white rounded text-xs font-medium hover:bg-neutral-800 transition-colors shadow-xs"
                >
                  Ayarları Kaydet
                </button>
              </div>
            </div>
          </form>

          {/* Architecture Reminder */}
          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-[11px] text-neutral-500 space-y-1">
            <div className="font-semibold text-neutral-700 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" />
              <span>Güvenlik ve Gizlilik</span>
            </div>
            <p>
              Tüm mesajlar ve PDF belgeleri doğrudan yerel makineniz üzerinden OpenWA aracılığıyla WhatsApp&apos;a iletilir. Hiçbir harici bulut servisine veya üçüncü taraf sunucuya veri aktarılmaz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
