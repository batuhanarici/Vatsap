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
  Copy,
  Check,
  Loader2,
  Terminal,
} from 'lucide-react';

export interface StartSessionParams {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}

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
  ) => Promise<WhatsAppStatus | void> | void;
  status: WhatsAppStatus;
  onCheckStatus: () => Promise<WhatsAppStatus | void> | void;
  isChecking: boolean;
  qrCodeUrl: string | null;
  onStartSession: (
    params: StartSessionParams
  ) => Promise<{ success: boolean; sessionUuid?: string; error?: string } | boolean>;
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
    config.providerType || 'openwa'
  );

  // OpenWA fields
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || 'http://127.0.0.1:2785/api');
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

  // User feedback banner state for prominent success/error notifications
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'loading' | 'info';
    title: string;
    message: string;
  } | null>(null);

  const [copiedDockerCmd, setCopiedDockerCmd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      setProviderType(config.providerType || 'openwa');
      setBaseUrl(config.baseUrl || 'http://127.0.0.1:2785/api');
      setApiKey(config.apiKey || '');
      setSessionId(config.sessionId || 'default');
      setMetaToken(config.metaToken || '');
      setMetaPhoneNumberId(config.metaPhoneNumberId || '');
      setDelaySeconds(config.delaySeconds || 3);
      setSchoolName(config.schoolName || 'Özel Başarı Okulları');
      setExamName(config.examName || 'Genel Değerlendirme Sınavı');
      setFeedback(null);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const trimmedKey = (providerType === 'meta_cloud' ? metaToken : apiKey).trim();
  const isGeminiKey = trimmedKey.startsWith('AIzaSy');
  const isMetaToken = trimmedKey.startsWith('EAAG') || trimmedKey.startsWith('EAA');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Ayarlar Kaydediliyor',
      message: 'Yapılandırma uygulanıyor ve bağlantı doğrulanıyor...',
    });

    try {
      const updatedConfig = {
        providerType,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        sessionId: sessionId.trim() || 'default',
        metaToken: metaToken.trim(),
        metaPhoneNumberId: metaPhoneNumberId.trim(),
        delaySeconds: Number(delaySeconds) || 3,
        schoolName: schoolName.trim(),
        examName: examName.trim(),
      };

      const resultStatus = await onSaveConfig(updatedConfig);
      const currentSt = resultStatus || status;

      if (currentSt.state === 'connected') {
        setFeedback({
          type: 'success',
          title: 'İşleminiz Başarılı',
          message: 'Ayarlar başarıyla kaydedildi! WhatsApp bağlı ve gönderime hazır.',
        });
      } else if (currentSt.state === 'qr_ready') {
        setFeedback({
          type: 'info',
          title: 'İşleminiz Başarılı (QR Kod Hazır)',
          message: 'Ayarlar kaydedildi. Lütfen aşağıdaki QR kodu telefonunuzdaki WhatsApp ile taratın.',
        });
      } else if (currentSt.state === 'starting' || currentSt.state === 'authenticating') {
        setFeedback({
          type: 'info',
          title: 'İşlem Başarılı: Başlatılıyor',
          message: 'Ayarlar kaydedildi. WhatsApp motoru başlatılıyor, lütfen bekleyin...',
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'İşlem Başarısız (Bağlantı Kurulamadı)',
          message: `Ayarlar kaydedildi ancak WhatsApp servisine bağlanılamadı: ${currentSt.details || 'Sunucu yanıt vermedi. Lütfen URL ve API anahtarını kontrol edin.'}`,
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setFeedback({
        type: 'error',
        title: 'İşlem Başarısız',
        message: `Ayarlar kaydedilemedi: ${errMsg}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefreshClick = async () => {
    setFeedback({
      type: 'loading',
      title: 'Bağlantı Kontrol Ediliyor',
      message: 'WhatsApp sunucusuna erişim test ediliyor...',
    });

    try {
      const refreshed = await onCheckStatus();
      const currentSt = refreshed || status;

      if (currentSt.state === 'connected') {
        setFeedback({
          type: 'success',
          title: 'İşleminiz Başarılı',
          message: `WhatsApp bağlantısı aktif! (${currentSt.phoneConnected || 'Bağlı'})`,
        });
      } else if (currentSt.state === 'qr_ready') {
        setFeedback({
          type: 'info',
          title: 'QR Kod Bekleniyor',
          message: 'Oturum aktif, lütfen QR kodu telefonunuzdan taratın.',
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'İşlem Başarısız',
          message: `Bağlantı kurulamadı: ${currentSt.details || 'Sunucuya ulaşılamıyor.'}`,
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        title: 'İşlem Başarısız',
        message: 'WhatsApp bağlantısı sorgulanamadı.',
      });
    }
  };

  const handleStartSessionClick = async () => {
    setFeedback({
      type: 'loading',
      title: 'Oturum Başlatılıyor',
      message: 'OpenWA üzerinde oturum başlatılıyor...',
    });

    try {
      const result = await onStartSession({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        sessionId: sessionId.trim() || 'default',
      });

      const isSuccess = typeof result === 'boolean' ? result : Boolean(result?.success);
      const errorMsg = typeof result === 'object' && result?.error ? result.error : undefined;

      if (isSuccess) {
        setFeedback({
          type: 'success',
          title: 'İşleminiz Başarılı',
          message: 'Oturum oluşturuldu ve başlatıldı! QR kod hazırlandığında birazdan görüntülenecektir.',
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'İşlem Başarısız',
          message:
            errorMsg ||
            'Oturum başlatılamadı. Lütfen Docker servisinin açık olduğunu, 2785 portunu ve API anahtarını kontrol edin.',
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Bilinmeyen hata oluştu.';
      setFeedback({
        type: 'error',
        title: 'İşlem Başarısız',
        message: `Oturum başlatılamadı: ${errMsg}`,
      });
    }
  };

  const copyDockerCommand = () => {
    const cmd = 'docker run -v $(pwd)/data:/app/data -p 2785:2785 openwa/wa-automate';
    navigator.clipboard.writeText(cmd);
    setCopiedDockerCmd(true);
    setTimeout(() => setCopiedDockerCmd(false), 2500);
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
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 text-neutral-900 dark:text-neutral-100 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              WhatsApp Gönderim ve API Ayarları
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Gönderim yöntemini seçin, API bilgilerinizi yapılandırın ve bağlantınızı test edin.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Action Notification Result Banner (Prominent Feedback) */}
          {feedback && (
            <div
              className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 transition-all animate-in fade-in slide-in-from-top-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-300 dark:border-rose-700 text-rose-950 dark:text-rose-100'
                  : feedback.type === 'loading'
                  ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-300 dark:border-blue-700 text-blue-950 dark:text-blue-100'
                  : 'bg-amber-50 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100'
              }`}
            >
              {feedback.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
              {feedback.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />}
              {feedback.type === 'loading' && <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 animate-spin mt-0.5" />}
              {feedback.type === 'info' && <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
              <div className="flex-1">
                <h4 className="font-bold text-xs">{feedback.title}</h4>
                <p className="text-[11px] leading-relaxed mt-0.5 opacity-90">{feedback.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-current opacity-50 hover:opacity-100 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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
                  Tam Otomatik PDF Eki
                </span>
              </button>
            </div>
          </div>

          {/* Key Type Warning Banners */}
          {isGeminiKey && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Google Gemini API Anahtarı Algılandı!</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                Girdiğiniz anahtar (<span className="font-mono">AIzaSy...</span>) yapay zeka anahtarıdır. WhatsApp için kullanılamaz. Sıfır kurulum için lütfen <strong>&quot;WhatsApp Web&quot;</strong> seçeneğini tercih edin.
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
                Lütfen yukarıdan <strong>&quot;Meta Cloud API&quot;</strong> sekmesini seçin ve Phone Number ID bilginizi girin.
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
                    : status.state === 'starting' || status.state === 'authenticating'
                    ? 'Başlatılıyor...'
                    : status.state === 'error'
                    ? 'Bağlantı Hatası'
                    : 'Bağlantı Yok'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRefreshClick}
                disabled={isChecking}
                className="flex items-center gap-1 text-[11px] font-semibold underline opacity-90 hover:opacity-100 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                <span>Durumu Yenile</span>
              </button>
            </div>

            {status.details && (
              <p className="text-[11px] opacity-80 leading-relaxed font-mono">
                {status.details}
              </p>
            )}

            {/* QR Code view if waiting for QR scan */}
            {status.state === 'qr_ready' && qrCodeUrl && (
              <div className="mt-2 p-3 bg-white dark:bg-neutral-900 rounded-lg border border-amber-300 dark:border-amber-800 flex flex-col items-center gap-2 text-center">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                  <QrCode className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>WhatsApp ile QR Kodu Taratın</span>
                </div>
                <img
                  src={qrCodeUrl}
                  alt="WhatsApp QR Kodu"
                  className="w-48 h-48 rounded border border-neutral-200 dark:border-neutral-700 bg-white p-2"
                />
                <p className="text-[10px] text-neutral-500 max-w-xs">
                  Telefonunuzda WhatsApp &gt; Bağlı Cihazlar &gt; Cihaz Bağla adımlarını takip edin.
                </p>
              </div>
            )}
          </div>

          {/* Configuration Form */}
          <form onSubmit={handleSave} className="space-y-4">
            {/* 1. WHATSAPP WEB MODE */}
            {providerType === 'whatsapp_web' && (
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg space-y-2 text-xs text-emerald-950 dark:text-emerald-200">
                <div className="flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-300">
                  <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>WhatsApp Web Otomatik Gönderim (API Gerektirmez)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-900/90 dark:text-emerald-300/80">
                  Bu modda hiçbir sunucu, Docker veya API anahtarına ihtiyaç duyulmaz. Sistem velinin numarasına göre WhatsApp Web sohbetini otomatik açar.
                </p>
                <div className="p-2 bg-emerald-100/60 dark:bg-emerald-900/40 rounded border border-emerald-300/50 dark:border-emerald-700/50 text-[11px] space-y-1">
                  <strong>💡 PDF Eki İpucu:</strong> WhatsApp güvenlik kuralları gereği harici web linkleri otomatik dosya yükleyemez. Sohbet açıldığında PDF&apos;i pencereye sürükleyip bırakarak veya sol alttaki <strong>&quot;+&quot; ➔ Belge</strong> seçeneğiyle ekleyebilirsiniz.
                </div>
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

                {/* Info about real automatic PDF sending */}
                <div className="p-2.5 bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                  ✨ <strong>Tam Otomatik PDF Gönderimi:</strong> OpenWA modunda sistem arka planda WhatsApp sunucusuyla iletişim kurar. PDF belgeleri velilere **gerçek bir dosya eki** olarak doğrudan gider.
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Sunucu API URL Adresi
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setBaseUrl('http://127.0.0.1:2785/api')}
                        className="text-[10px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline cursor-pointer"
                      >
                        127.0.0.1:2785/api
                      </button>
                      <span className="text-[10px] text-neutral-400">•</span>
                      <button
                        type="button"
                        onClick={() => setBaseUrl('http://localhost:2785/api')}
                        className="text-[10px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline cursor-pointer"
                      >
                        localhost:2785/api
                      </button>
                    </div>
                  </div>
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
                    placeholder="Eğer sunucunuzda API anahtarı ayarlıysa girin (isteğe bağlı)"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Not: Yerel docker sunucunuzda anahtar yoksa boş bırakabilirsiniz.
                  </p>
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
                      onClick={handleStartSessionClick}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-lg text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Oturum Başlat</span>
                    </button>
                  </div>
                </div>

                {/* Docker Quick Command Helper */}
                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-neutral-500" />
                      <span>Hızlı Docker Başlatma Komutu:</span>
                    </span>
                    <button
                      type="button"
                      onClick={copyDockerCommand}
                      className="flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {copiedDockerCmd ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedDockerCmd ? 'Kopyalandı!' : 'Komutu Kopyala'}</span>
                    </button>
                  </div>
                  <code className="block p-2 bg-neutral-900 text-neutral-200 rounded text-[10px] font-mono select-all overflow-x-auto">
                    docker run -v $(pwd)/data:/app/data -p 2785:2785 openwa/wa-automate
                  </code>
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

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Gönderimler Arası Güvenlik Gecikmesi (Saniye)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
                  />
                  <span className="text-[11px] text-neutral-500">
                    Önerilen: 3-5 saniye (Spam engelini önler)
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Seçim: <strong className="text-neutral-800 dark:text-neutral-200">{providerType === 'whatsapp_web' ? 'WhatsApp Web' : providerType === 'meta_cloud' ? 'Meta Cloud API' : 'OpenWA Docker'}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all shadow-sm cursor-pointer active:scale-98 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Ayarları Kaydet ve Uygula</span>
                    </>
                  )}
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
