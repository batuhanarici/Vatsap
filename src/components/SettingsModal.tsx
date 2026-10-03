import React, { useState, useEffect } from 'react';
import { WhatsAppStatus, OpenWAConfig, WhatsAppProviderType } from '../types/whatsapp';
import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Shield,
  Globe,
  Zap,
  Server,
  Key,
  Info,
  ExternalLink,
} from 'lucide-react';

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
  const [providerType, setProviderType] = useState<WhatsAppProviderType>(
    config.providerType || 'whatsapp_web'
  );

  // OpenWA fields
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || 'http://localhost:2785/api');
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [sessionId, setSessionId] = useState(config.sessionId || 'default');

  // Meta Cloud API fields
  const [metaToken, setMetaToken] = useState(config.metaToken || '');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState(config.metaPhoneNumberId || '');

  // General fields
  const [delaySeconds, setDelaySeconds] = useState(config.delaySeconds || 3);
  const [showKey, setShowKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Keep local state in sync when config opens
  useEffect(() => {
    if (isOpen) {
      setProviderType(config.providerType || 'whatsapp_web');
      setBaseUrl(config.baseUrl || 'http://localhost:2785/api');
      setApiKey(config.apiKey || '');
      setSessionId(config.sessionId || 'default');
      setMetaToken(config.metaToken || '');
      setMetaPhoneNumberId(config.metaPhoneNumberId || '');
      setDelaySeconds(config.delaySeconds || 3);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  // Detect key types for helpful user feedback
  const trimmedKey = (providerType === 'meta_cloud' ? metaToken : apiKey).trim();
  const isGeminiKey = trimmedKey.startsWith('AIzaSy');
  const isMetaToken = trimmedKey.startsWith('EAAG') || trimmedKey.startsWith('EAA');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      providerType,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      sessionId: sessionId.trim(),
      metaToken: metaToken.trim(),
      metaPhoneNumberId: metaPhoneNumberId.trim(),
      delaySeconds: Number(delaySeconds) || 3,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const getStatusColor = () => {
    switch (status.state) {
      case 'connected':
        return 'text-emerald-800 bg-emerald-50 border-emerald-200';
      case 'qr_ready':
        return 'text-amber-800 bg-amber-50 border-amber-200';
      case 'error':
        return 'text-rose-800 bg-rose-50 border-rose-200';
      default:
        return 'text-neutral-700 bg-neutral-100 border-neutral-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-neutral-50/50">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              WhatsApp Gönderim ve API Ayarları
            </h2>
            <p className="text-xs text-neutral-500">
              Gönderim yöntemini seçin ve bağlantınızı yapılandırın.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Provider Selection Tabs */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-2">
              WhatsApp Gönderim Yöntemi Seçin:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* WhatsApp Web (No API key needed) */}
              <button
                type="button"
                onClick={() => setProviderType('whatsapp_web')}
                className={`flex flex-col items-center justify-center text-center p-3 rounded-lg border text-xs font-medium transition-all ${
                  providerType === 'whatsapp_web'
                    ? 'border-emerald-600 bg-emerald-50/60 text-emerald-900 ring-1 ring-emerald-600'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                <Globe className={`w-5 h-5 mb-1.5 ${providerType === 'whatsapp_web' ? 'text-emerald-600' : 'text-neutral-400'}`} />
                <span className="font-semibold">WhatsApp Web</span>
                <span className="text-[10px] text-neutral-500 mt-0.5 font-normal">
                  Sıfır Kurulum (API Yok)
                </span>
                <span className="mt-1 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] font-semibold rounded">
                  Önerilen
                </span>
              </button>

              {/* Meta Cloud API */}
              <button
                type="button"
                onClick={() => setProviderType('meta_cloud')}
                className={`flex flex-col items-center justify-center text-center p-3 rounded-lg border text-xs font-medium transition-all ${
                  providerType === 'meta_cloud'
                    ? 'border-blue-600 bg-blue-50/60 text-blue-900 ring-1 ring-blue-600'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                <Zap className={`w-5 h-5 mb-1.5 ${providerType === 'meta_cloud' ? 'text-blue-600' : 'text-neutral-400'}`} />
                <span className="font-semibold">Meta Cloud API</span>
                <span className="text-[10px] text-neutral-500 mt-0.5 font-normal">
                  Resmi Meta Token
                </span>
              </button>

              {/* OpenWA / Docker */}
              <button
                type="button"
                onClick={() => setProviderType('openwa')}
                className={`flex flex-col items-center justify-center text-center p-3 rounded-lg border text-xs font-medium transition-all ${
                  providerType === 'openwa'
                    ? 'border-neutral-900 bg-neutral-100 text-neutral-900 ring-1 ring-neutral-900'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                <Server className={`w-5 h-5 mb-1.5 ${providerType === 'openwa' ? 'text-neutral-900' : 'text-neutral-400'}`} />
                <span className="font-semibold">OpenWA / Docker</span>
                <span className="text-[10px] text-neutral-500 mt-0.5 font-normal">
                  Yerel REST Servisi
                </span>
              </button>
            </div>
          </div>

          {/* Key Type Warning Banners */}
          {isGeminiKey && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Google Gemini / AI Studio API Anahtarı Algılandı!</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                Girdiğiniz anahtar (<span className="font-mono font-medium">AIzaSy...</span>) Google Gemini yapay zeka anahtarıdır. WhatsApp üzerinden velilere mesaj veya karne göndermek için Google anahtarı kullanılamaz.
              </p>
              <p className="text-[11px] font-medium text-emerald-800">
                👉 Hemen yukarıdaki <strong>&quot;WhatsApp Web&quot;</strong> seçeneğine tıklayarak herhangi bir API anahtarı olmadan velilere doğrudan WhatsApp mesajı gönderebilirsiniz!
              </p>
            </div>
          )}

          {isMetaToken && providerType === 'openwa' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Meta WhatsApp Cloud API Token&apos;ı Algılandı</span>
              </div>
              <p className="text-[11px] text-blue-800">
                Girdiğiniz anahtar bir Meta Cloud API token&apos;ıdır. Lütfen yukarıdan <strong>&quot;Meta Cloud API&quot;</strong> sekmesini seçin ve Phone Number ID bilginizi girin.
              </p>
            </div>
          )}

          {/* Connection Status Box */}
          <div className={`p-3.5 rounded-lg border text-xs flex flex-col gap-2 ${getStatusColor()}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-current"></span>
                <span>
                  Durum:{' '}
                  {status.state === 'connected'
                    ? 'Bağlı (Gönderime Hazır)'
                    : status.state === 'qr_ready'
                    ? 'QR Kod Bekleniyor'
                    : status.state === 'error'
                    ? 'Bağlantı Hatası'
                    : 'Bağlı Değil'}
                </span>
              </div>
              <button
                type="button"
                onClick={onCheckStatus}
                disabled={isChecking}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 font-medium transition-colors shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                <span>Bağlantıyı Sına</span>
              </button>
            </div>
            {status.details && (
              <p className="text-[11px] opacity-90">{status.details}</p>
            )}
          </div>

          {/* QR Code Presentation if available */}
          {(status.state === 'qr_ready' || qrCodeUrl) && (
            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg text-center space-y-3">
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
                    className="w-44 h-44 object-contain"
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-xs text-neutral-400">
                    QR yükleniyor...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Configuration Form by Provider */}
          <form onSubmit={handleSave} className="space-y-4">
            {/* 1. WHATSAPP WEB MODE */}
            {providerType === 'whatsapp_web' && (
              <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-2 text-xs text-emerald-950">
                <div className="flex items-center gap-2 font-semibold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp Web Modu — Sıfır Kurulum & Sıfır Maliyet</span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-800">
                  Bu modda herhangi bir API anahtarı, Docker veya sunucuya gerek yoktur. Her velinin telefon numarası ve hazırlanan karne mesajı doğrudan tarayıcınızda resmi WhatsApp Web sekmesinde açılır.
                </p>
                <div className="text-[11px] bg-white p-2.5 rounded border border-emerald-200 text-neutral-700">
                  ✅ <strong>Nasıl Çalışır?</strong> Karne listesinden &quot;Gönder&quot; dediğinizde velinin sohbet penceresi mesajı hazır olarak açılır; siz sadece Enter tuşuna basarak iletiyi gönderirsiniz.
                </div>
              </div>
            )}

            {/* 2. META CLOUD API MODE */}
            {providerType === 'meta_cloud' && (
              <div className="space-y-3 p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-900">
                    Meta for Developers (WhatsApp Cloud API)
                  </span>
                  <a
                    href="https://developers.facebook.com/apps/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span>Meta Paneli</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-neutral-700">
                      Meta Access Token (Kalıcı veya Geçici Belirteç)
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
                    value={metaToken}
                    onChange={(e) => setMetaToken(e.target.value)}
                    placeholder="EAAG..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 bg-white"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    Meta Developers panelindeki WhatsApp &gt; API Setup bölümünde oluşturulan token.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Phone Number ID (Telefon Numarası Kimliği)
                  </label>
                  <input
                    type="text"
                    value={metaPhoneNumberId}
                    onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                    placeholder="Örn: 10482910492810"
                    className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 bg-white"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    WhatsApp Cloud API panelindeki &quot;Phone number ID&quot; alanındaki rakamlar.
                  </span>
                </div>
              </div>
            )}

            {/* 3. OPENWA / DOCKER MODE */}
            {providerType === 'openwa' && (
              <div className="space-y-3 p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    OpenWA REST API Adresi
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:2785/api"
                    className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 bg-white"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    Örnek: http://localhost:2785/api veya sunucu IP&apos;niz
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
                    placeholder="OpenWA sunucusundaki data/.api-key anahtarı"
                    className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Oturum ID (Session ID)
                    </label>
                    <input
                      type="text"
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                      placeholder="default"
                      className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 bg-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={onStartSession}
                      className="w-full px-3 py-2 border border-neutral-300 bg-white rounded text-xs text-neutral-700 hover:bg-neutral-100 font-medium transition-colors"
                    >
                      Oturum Başlat
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded text-[11px] text-amber-800 space-y-1">
                  <strong>⚠️ Önemli Not:</strong> Bu modun çalışması için Docker veya sunucunuzda şu komutun açık olması gerekir:
                  <code className="block p-1 bg-white border border-amber-200 rounded font-mono text-[10px] text-neutral-800 mt-1">
                    docker run -d -p 2785:2785 openwa/wa-automate
                  </code>
                </div>
              </div>
            )}

            {/* General Settings: Delay */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Öğrenciler / Veliler Arası Gönderim Bekleme Süresi
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  className="w-24 px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 bg-white"
                />
                <span className="text-xs text-neutral-500">saniye (WhatsApp spam engellemesi için önerilir)</span>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                Seçim: <strong className="text-neutral-800">{providerType === 'whatsapp_web' ? 'WhatsApp Web' : providerType === 'meta_cloud' ? 'Meta Cloud API' : 'OpenWA Docker'}</strong>
              </span>

              <div className="flex items-center gap-2">
                {savedSuccess && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ayarlar Kaydedildi</span>
                  </span>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 bg-neutral-900 text-white rounded text-xs font-medium hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer"
                >
                  Ayarları Kaydet ve Uygula
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
              Öğrenci ve veli telefon bilgileri hiçbir harici sunucuda depolanmaz. Tüm gönderimler doğrudan seçtiğiniz kanal üzerinden gerçekleştirilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
