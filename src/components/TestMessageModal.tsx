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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-neutral-50/50">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              Test Mesajı Gönder
            </h2>
            <p className="text-xs text-neutral-500">
              Toplu gönderim yapmadan önce kendi numaranızda test edin.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-4">
          {result && (
            <div
              className={`p-3 rounded border text-xs flex items-start gap-2 ${
                result.success
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{result.text}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Test Telefon Numarası
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XX XXX XX XX"
              className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
            />
            {phone && (
              <span className="text-[11px] text-neutral-500 mt-1 block font-mono">
                {formatPhoneDisplay(phone)}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Test Mesajı İçeriği
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-2.5 border border-neutral-300 rounded text-xs text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              Kapat
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white rounded text-xs font-medium hover:bg-neutral-800 transition-colors shadow-xs disabled:opacity-50"
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
