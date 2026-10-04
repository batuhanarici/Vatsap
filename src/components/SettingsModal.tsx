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
  config: OpenWAConfig & {
    testPhone: string;
    delaySeconds: number;
    schoolName?: string;
    examName?: string;
  };
  onSaveConfig: (
    updated: Partial<
      OpenWAConfig & {
        testPhone: string;
        delaySeconds: number;
        schoolName?: string;
        examName?: string;
      }
    >
  ) => void;
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
  const [schoolName, setSchoolName] = useState(config.schoolName || 'Özel Başarı Okulları');
  const [examName, setExamName] = useState(config.examName || 'Genel Değerlendirme Sınavı');
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
      setSchoolName(config.schoolName || 'Özel Başarı Okulları');
      setExamName(config.examName || 'Genel Değerlendirme Sınavı');
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
      schoolName: schoolName.trim(),
      examName: examName.trim(),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const getStatusColor = () => {
    switch (status.state) {
      case 'connected':
        return 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800';
      case 'qr_ready':
        return 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800';
      case 'error':
        return 'text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800';
      default:
        return 'text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 text-neutral-900 dark:text-neutral-100 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              WhatsApp Gönderim ve API Ayarları
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Gönderim yöntemini seçin ve bağlantınızı yapılandırın.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Provider Selection Tabs */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-2">
              WhatsApp Gönderim Yöntemi Seçin:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* WhatsApp Web (No API key needed) */}
              <button
                type="button"
                onClick={() => setProviderType('whatsapp_web')}
                className={`flex flex-col items-center justify-center text-center p-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  providerType === 'whatsapp_web'
                    ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 ring-1 ring-emerald-600'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700/60'
                }`}
              >
                <Globe className={`w-5 h-5 mb-1.5 ${providerType === 'whatsapp_web' ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400'}`} />
                <span className="font-semibold">WhatsApp Web</span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-normal">
                  Sıfır Kurulum (API Yok)
                </span>
                <span className="mt-1 px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 text-[9px] font-semibold rounded">
                  Önerilen
                </span>
              </button>

              {/* Meta Cloud API */}
              <button
                type="button"
                onClick={() => setProviderType('meta_cloud')}
                className={`flex flex-col items-center justify-center text-center p-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  providerType === 'meta_cloud'
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700/60'
                }`}
              >
                <Zap className={`w-5 h-5 mb-1.5 ${providerType === 'meta_cloud' ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-400'}`} />
                <span className="font-semibold">Meta Cloud API</span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-normal">
                  Resmi Meta Token
                </span>
              </button>

              {/* OpenWA / Docker */}
              <button
                type="button"
                onClick={() => setProviderType('openwa')}
                className={`flex flex-col items-center justify-center text-center p-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  providerType === 'openwa'
                    ? 'border-neutral-900 dark:border-white bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white ring-1 ring-neutral-900 dark:ring-white'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700/60'
                }`}
              >
                <Server className={`w-5 h-5 mb-1.5 ${providerType === 'openwa' ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'}`} />
                <span className="font-semibold">OpenWA / Docker</span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-normal">
                  Yerel REST Servisi
                </span>
              </button>
            </div>
          </div>

          {/* Key Type Warning Banners */}
          {isGeminiKey && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Google Gemini / AI Studio API Anahtarı Algılandı!</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                Girdiğiniz anahtar (<span className="font-mono font-medium">AIzaSy...</span>) Google Gemini yapay zeka anahtarıdır. WhatsApp üzerinden velilere mesaj veya karne göndermek için Google anahtarı kullanılamaz.
              </p>
              <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                👉 Hemen yukarıdaki <strong>&quot;WhatsApp Web&quot;</strong> seçeneğine tıklayarak herhangi bir API anahtarı olmadan velilere doğrudan WhatsApp mesajı gönderebilirsiniz!
              </p>
            </div>
          )}

          {isMetaToken && providerType === 'openwa' && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Meta WhatsApp Cloud API Token&apos;ı Algılandı</span>
              </div>
              <p className="text-[11px] text-blue-800 dark:text-blue-300">
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
                    ? 'Bağlantı Kurulamadı'
                    : 'Bağlantı Yok'}
                </span>
              </div>
              <button
                type="button"
                onClick={onCheckStatus}
                disabled={isChecking}
                className="flex items-center gap-1 text-[11px] underline opacity-90 hover:opacity-100 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
                <span>Yenile</span>
              </button>
            </div>

            {status.details && (
              <p className="text-[11px] opacity-80 leading-relaxed font-mono">
                {status.details}
              </p>
            )}
          </div>

          {/* Configuration Form */}
          <form onSubmit={handleSave} className="space-y-4">
            {/* 1. WHATSAPP WEB MODE */}
            {providerType === 'whatsapp_web' && (
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg space-y-2.5 text-xs text-emerald-950 dark:text-emerald-200">
                <div className="flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-300">
                  <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>WhatsApp Web Otomatik Gönderim (API Gerektirmez)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-900/90 dark:text-emerald-300/80">
                  Bu mod açıkken hiçbir harici sunucu, Docker veya API anahtarına ihtiyaç duyulmaz. Sistem, velinin numarasına mesajı ve karne belgesini iletir. Gönderim esnasında bilgisayarınıza kesinlikle gereksiz dosya indirilmez; karne doğrudan WhatsApp mesajına eklenir.
                </p>
              </div>
            )}

            {/* 2. META CLOUD API FORM */}
            {providerType === 'meta_cloud' && (
              <div className="space-y-3.5 p-4 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Meta Cloud API Bilgileri</span>
                  </h3>
                  <a
                    href="https://developers.facebook.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                  >
                    <span>Meta Developers</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Meta Erişim Belirteci (Permanent / Temporary Access Token)
                  </label>
                  <input
                    type="password"
                    value={metaToken}
                    onChange={(e) => setMetaToken(e.target.value)}
                    placeholder="EAAG..."
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-blue-600 bg-white dark:bg-neutral-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={metaPhoneNumberId}
                    onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                    placeholder="Örn: 104523992839182"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-blue-600 bg-white dark:bg-neutral-800"
                  />
                </div>
              </div>
            )}

            {/* 3. OPENWA LOCAL REST FORM */}
            {providerType === 'openwa' && (
              <div className="space-y-3.5 p-4 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                    <span>OpenWA Yerel REST Sunucu Ayarları</span>
                  </h3>
                  <a
                    href="https://openwa.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center gap-0.5"
                  >
                    <span>Dokümantasyon</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Sunucu API URL Adresi
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:2785/api"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      OpenWA API Gizli Anahtarı (api-key)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                    >
                      {showKey ? 'Gizle' : 'Göster'}
                    </button>
                  </div>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="OpenWA sunucusundaki data/.api-key anahtarı"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Oturum ID (Session ID)
                    </label>
                    <input
                      type="text"
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                      placeholder="default"
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={onStartSession}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 font-medium transition-colors cursor-pointer"
                    >
                      Oturum Başlat
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Institution & Dynamic Variable Defaults */}
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
              <div>
                <h3 className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Kurum ve Şablon Varsayılanları</span>
                </h3>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Mesaj şablonlarındaki {'{okul_adi}'} ve {'{sinav_adi}'} değişkenlerinde varsayılan olarak kullanılır.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Okul / Kurum Adı ({'{okul_adi}'})
                  </label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder="Örn: Özel Başarı Okulları"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Varsayılan Sınav Başlığı ({'{sinav_adi}'})
                  </label>
                  <input
                    type="text"
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    placeholder="Örn: 1. Dönem Değerlendirme Sınavı"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
                  />
                </div>
              </div>
            </div>

            {/* General Settings: Delay */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Öğrenciler / Veliler Arası Gönderim Bekleme Süresi
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  className="w-24 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
                />
                <span className="text-xs text-neutral-500 dark:text-neutral-400">saniye (WhatsApp spam engellemesi için önerilir)</span>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Seçim: <strong className="text-neutral-800 dark:text-neutral-200">{providerType === 'whatsapp_web' ? 'WhatsApp Web' : providerType === 'meta_cloud' ? 'Meta Cloud API' : 'OpenWA Docker'}</strong>
              </span>

              <div className="flex items-center gap-2">
                {savedSuccess && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ayarlar Kaydedildi</span>
                  </span>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs cursor-pointer active:scale-98"
                >
                  Ayarları Kaydet ve Uygula
                </button>
              </div>
            </div>
          </form>

          {/* Architecture Reminder */}
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 rounded-lg text-[11px] text-neutral-500 dark:text-neutral-400 space-y-1">
            <div className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
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
