import React, { useState } from 'react';
import { WhatsAppProvider } from '../services/whatsapp/types';
import { normalizePhoneNumber, isValidTurkishPhone, formatPhoneDisplay } from '../services/normalizer';
import { X, Send, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface TestMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: WhatsAppProvider;
  defaultPhone: string;
  onSaveDefaultPhone: (phone: string) => void;
}

export const TestMessageModal: React.FC<TestMessageModalProps> = ({
  isOpen,
  onClose,
  provider,
  defaultPhone,
  onSaveDefaultPhone,
}) => {
  const [phone, setPhone] = useState(defaultPhone || '');
  const [message, setMessage] = useState(
    'Karne Gönderici test mesajıdır. WhatsApp ve OpenWA bağlantısı başarıyla çalışıyor.'
  );
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    const cleanPhone = normalizePhoneNumber(phone);
    if (!isValidTurkishPhone(cleanPhone)) {
      setResult({
        success: false,
        text: 'Lütfen geçerli bir Türkiye cep telefonu (05XX... veya 905XX...) girin.',
      });
      return;
    }

    onSaveDefaultPhone(cleanPhone);
    setIsSending(true);

    try {
      const res = await provider.sendMessage(cleanPhone, message);
      if (res.success) {
        setResult({
          success: true,
          text: `Test mesajı başarıyla iletildi (${cleanPhone}).`,
        });
      } else {
        setResult({
          success: false,
          text: res.error || 'Mesaj gönderilemedi.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({
        success: false,
        text: msg || 'Bilinmeyen bir hata oluştu.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-neutral-900 dark:text-neutral-100 transition-colors">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Test Mesajı Gönder
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Toplu gönderim yapmadan önce kendi numaranızda test edin.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-4">
          {result && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                result.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <span>{result.text}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Test Telefon Numarası
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XX XXX XX XX"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
            {phone && (
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 block font-mono">
                {formatPhoneDisplay(phone)}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Test Mesajı İçeriği
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-2.5 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
          </div>

          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Kapat
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs disabled:opacity-50 cursor-pointer active:scale-98"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Gönderiliyor...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Test Mesajını Gönder</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
