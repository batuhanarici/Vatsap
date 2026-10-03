import React, { useState } from 'react';
import { Student } from '../types/student';
import { formatMessage } from '../services/templateService';
import { DEFAULT_TEMPLATE } from '../services/storageService';
import { Check, RotateCcw, Copy } from 'lucide-react';

interface TemplateEditorProps {
  template: string;
  onSaveTemplate: (newTemplate: string) => void;
  sampleStudent?: Student;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  template,
  onSaveTemplate,
  sampleStudent = {
    id: 'sample',
    studentName: 'Ahmet Yılmaz',
    parentName: 'Mehmet Yılmaz',
    phone: '905321112233',
  },
}) => {
  const [currentText, setCurrentText] = useState(template);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    onSaveTemplate(currentText);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleInsert = (variable: string) => {
    setCurrentText((prev) => prev + variable);
  };

  const handleReset = () => {
    setCurrentText(DEFAULT_TEMPLATE);
    onSaveTemplate(DEFAULT_TEMPLATE);
  };

  const preview = formatMessage(currentText, sampleStudent);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Editor Box */}
      <div className="bg-white border border-neutral-200 rounded p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              Mesaj Şablonu
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              WhatsApp metin mesajında kullanılacak şablonu düzenleyin.
            </p>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
            title="Varsayılan şablona dön"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Sıfırla</span>
          </button>
        </div>

        {/* Variable Buttons */}
        <div>
          <span className="text-[11px] font-medium text-neutral-500 block mb-1.5">
            Kullanılabilir Değişkenler:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleInsert('{veli_adi}')}
              className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-800 rounded font-mono text-xs transition-colors"
            >
              + {'{veli_adi}'}
            </button>
            <button
              onClick={() => handleInsert('{ogrenci_adi}')}
              className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-800 rounded font-mono text-xs transition-colors"
            >
              + {'{ogrenci_adi}'}
            </button>
          </div>
        </div>

        {/* Text Area */}
        <div>
          <textarea
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            rows={8}
            className="w-full p-3 border border-neutral-300 rounded text-xs text-neutral-900 font-sans focus:outline-hidden focus:ring-1 focus:ring-neutral-900 leading-relaxed resize-y"
            placeholder="Mesaj metnini buraya yazın..."
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-neutral-400">
            {currentText.length} karakter
          </span>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-xs"
          >
            {isSaved ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Kaydedildi</span>
              </>
            ) : (
              <span>Şablonu Kaydet</span>
            )}
          </button>
        </div>
      </div>

      {/* Live Preview Box */}
      <div className="bg-white border border-neutral-200 rounded p-5 space-y-4">
        <div className="border-b border-neutral-100 pb-3">
          <h2 className="text-sm font-semibold text-neutral-900">
            Canlı Önizleme
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Örnek öğrenci ({sampleStudent.studentName} / {sampleStudent.parentName}) için görünüm:
          </p>
        </div>

        {/* WhatsApp Chat Bubble Mockup */}
        <div className="p-4 bg-neutral-100/70 border border-neutral-200 rounded flex flex-col justify-end min-h-[220px]">
          <div className="max-w-[85%] self-end bg-white border border-neutral-200 rounded-lg p-3 shadow-xs space-y-2">
            <p className="text-xs text-neutral-800 whitespace-pre-wrap leading-relaxed">
              {preview}
            </p>
            <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[10px] text-neutral-400">
              <span className="font-mono">{sampleStudent.studentName}.pdf</span>
              <span>12:00 ✓✓</span>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-neutral-500 bg-neutral-50 p-2.5 rounded border border-neutral-200">
          Not: Her öğrencinin velisine önce bu metin mesajı iletilir, hemen ardından ilgili öğrencinin sınav karnesi PDF olarak gönderilir.
        </div>
      </div>
    </div>
  );
};
