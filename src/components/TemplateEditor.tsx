import React, { useState, useEffect } from 'react';
import { MessageTemplate } from '../types/template';
import { Student } from '../types/student';
import { formatMessage, AVAILABLE_VARIABLES } from '../services/templateService';
import {
  Plus,
  Trash2,
  Copy,
  Star,
  Check,
  RotateCcw,
  Sparkles,
  Tag,
  MessageSquare,
} from 'lucide-react';

interface TemplateEditorProps {
  templates: MessageTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (id: string) => void;
  onSaveTemplates: (templates: MessageTemplate[]) => void;
  sampleStudent?: Student;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  templates,
  activeTemplateId,
  onSelectTemplate,
  onSaveTemplates,
  sampleStudent = {
    id: 'sample',
    studentName: 'Ahmet Yılmaz',
    parentName: 'Mehmet Yılmaz',
    phone: '905321112233',
    group: '8-A',
  },
}) => {
  const currentTemplate =
    templates.find((t) => t.id === activeTemplateId) || templates[0];

  const [title, setTitle] = useState(currentTemplate?.title || '');
  const [content, setContent] = useState(currentTemplate?.content || '');
  const [tag, setTag] = useState(currentTemplate?.tag || '');
  const [isSaved, setIsSaved] = useState(false);

  // Dynamic preview testing controls
  const [examName, setExamName] = useState('LGS 1. Deneme Sınavı');
  const [schoolName, setSchoolName] = useState('Özel Başarı Okulları');

  // Keep editor state in sync when selection changes
  useEffect(() => {
    if (currentTemplate) {
      setTitle(currentTemplate.title);
      setContent(currentTemplate.content);
      setTag(currentTemplate.tag || '');
      setIsSaved(false);
    }
  }, [currentTemplate?.id]);

  const handleSaveCurrent = () => {
    if (!currentTemplate) return;
    const updated = templates.map((t) =>
      t.id === currentTemplate.id
        ? {
            ...t,
            title: title.trim() || 'Başlıksız Şablon',
            content: content.trim(),
            tag: tag.trim() || 'Genel',
            updatedAt: Date.now(),
          }
        : t
    );
    onSaveTemplates(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCreateNew = () => {
    const newId = `tpl_${Date.now()}`;
    const newTemplate: MessageTemplate = {
      id: newId,
      title: `Yeni Şablon (${templates.length + 1})`,
      tag: 'Genel',
      content:
        'Sayın {veli_adi},\n\nÖğrencimiz {ogrenci_adi}\'nin {tarih} tarihli {sinav_adi} karnesi ekte bilgilerinize sunulmuştur.\n\n{okul_adi}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [...templates, newTemplate];
    onSaveTemplates(updated);
    onSelectTemplate(newId);
  };

  const handleDuplicate = (tmpl: MessageTemplate) => {
    const newId = `tpl_${Date.now()}`;
    const copy: MessageTemplate = {
      ...tmpl,
      id: newId,
      title: `${tmpl.title} (Kopya)`,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [...templates, copy];
    onSaveTemplates(updated);
    onSelectTemplate(newId);
  };

  const handleDelete = (id: string) => {
    if (templates.length <= 1) {
      alert('En az 1 şablon bulunmalıdır.');
      return;
    }
    if (window.confirm('Bu şablonu silmek istediğinizden emin misiniz?')) {
      const updated = templates.filter((t) => t.id !== id);
      onSaveTemplates(updated);
      if (activeTemplateId === id) {
        onSelectTemplate(updated[0].id);
      }
    }
  };

  const handleSetDefault = (id: string) => {
    const updated = templates.map((t) => ({
      ...t,
      isDefault: t.id === id,
    }));
    onSaveTemplates(updated);
  };

  const handleInsert = (variable: string) => {
    setContent((prev) => prev + variable);
  };

  const preview = formatMessage(content, sampleStudent, {
    examName,
    schoolName,
  });

  const getTagColor = (t?: string) => {
    switch (t?.toLowerCase()) {
      case 'lgs':
        return 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'yks':
        return 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'haftalık':
        return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'deneme':
        return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'veli toplantısı':
        return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      default:
        return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Template Manager Bar */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 shadow-2xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Kayıtlı WhatsApp Mesaj Şablonları</span>
              <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-mono font-medium border border-neutral-200 dark:border-neutral-700">
                {templates.length}
              </span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Farklı sınavlar, sınıflar veya duyurular için hazır şablonlar oluşturun.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs cursor-pointer shrink-0 active:scale-98"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Şablon Ekle</span>
          </button>
        </div>

        {/* Template Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          {templates.map((tmpl) => {
            const isSelected = tmpl.id === activeTemplateId;
            return (
              <div
                key={tmpl.id}
                onClick={() => onSelectTemplate(tmpl.id)}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? 'border-neutral-900 dark:border-white bg-neutral-50/80 dark:bg-neutral-800/80 shadow-xs ring-1 ring-neutral-900 dark:ring-white'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getTagColor(
                        tmpl.tag
                      )}`}
                    >
                      {tmpl.tag || 'Genel'}
                    </span>
                    {tmpl.isDefault && (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800" title="Varsayılan Şablon">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        <span>Varsayılan</span>
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                    {tmpl.title}
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-1 leading-snug">
                    {tmpl.content}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px]">
                  <span className="text-neutral-400 dark:text-neutral-500 font-mono text-[10px]">
                    {tmpl.content.length} krk
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(tmpl);
                      }}
                      className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded hover:bg-neutral-200/60 dark:hover:bg-neutral-700 transition-colors"
                      title="Şablonu Kopyala"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {templates.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(tmpl.id);
                        }}
                        className="p-1 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors"
                        title="Şablonu Sil"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Editor & Preview Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor Box */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Seçili Şablonu Düzenle
              </span>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {title || 'Başlıksız Şablon'}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {!currentTemplate?.isDefault && (
                <button
                  type="button"
                  onClick={() => handleSetDefault(currentTemplate.id)}
                  className="flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-300 hover:text-amber-800 dark:hover:text-amber-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-amber-50 dark:hover:bg-amber-950/60 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 transition-colors cursor-pointer"
                  title="Varsayılan şablon yap"
                >
                  <Star className="w-3 h-3" />
                  <span>Varsayılan Yap</span>
                </button>
              )}
            </div>
          </div>

          {/* Title and Tag inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Şablon Başlığı (Açıklayıcı Ad)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn: 8. Sınıf Deneme Sınavı"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-neutral-400" />
                <span>Etiket (Tag)</span>
              </label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="Örn: Deneme, Karne"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800"
              />
            </div>
          </div>

          {/* Variable Insertion */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Mesaja Eklenebilir Dinamik Değişkenler:</span>
              </span>
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                (Tıklayarak metne ekleyin)
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_VARIABLES.map((v) => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => handleInsert(v.tag)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/80 hover:text-indigo-900 dark:hover:text-indigo-200 border border-neutral-200 dark:border-neutral-700 hover:border-indigo-300 dark:hover:border-indigo-600 text-neutral-800 dark:text-neutral-200 rounded text-xs transition-all cursor-pointer group shadow-2xs active:scale-95"
                  title={`${v.label}: ${v.description} (Örnek: ${v.example})`}
                >
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold group-hover:text-indigo-600">+</span>
                  <span className="font-semibold font-mono">{v.tag}</span>
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 font-sans">
                    ({v.label})
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              WhatsApp Mesaj Metni
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full p-3 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 font-sans focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 leading-relaxed resize-y bg-white dark:bg-neutral-800"
              placeholder="Mesaj metnini buraya yazın..."
            />
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
              {content.length} karakter
            </span>
            <button
              onClick={handleSaveCurrent}
              className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs cursor-pointer active:scale-98"
            >
              {isSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
                  <span>Şablon Güncellendi</span>
                </>
              ) : (
                <span>Değişiklikleri Kaydet</span>
              )}
            </button>
          </div>
        </div>

        {/* Live Preview Box */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4 shadow-2xs transition-colors">
          <div className="border-b border-neutral-100 dark:border-neutral-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Canlı WhatsApp Önizlemesi
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Tüm değişkenler otomatik olarak çözümlenir:
              </p>
            </div>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getTagColor(
                tag
              )}`}
            >
              🏷️ {tag || 'Genel'}
            </span>
          </div>

          {/* Dynamic parameter test inputs */}
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded-lg space-y-2 text-xs">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300 block text-[11px] uppercase tracking-wider">
              Önizleme Değişken Değerleri:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5 font-mono">
                  {'{sinav_adi}'} Sınav Adı:
                </label>
                <input
                  type="text"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="Sınav adı..."
                  className="w-full px-2.5 py-1 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5 font-mono">
                  {'{okul_adi}'} Okul / Kurum:
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Okul adı..."
                  className="w-full px-2.5 py-1 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
                />
              </div>
            </div>
          </div>

          {/* WhatsApp Chat Bubble Mockup */}
          <div className="p-4 bg-emerald-50/40 dark:bg-emerald-950/20 border border-neutral-200 dark:border-neutral-800 rounded-lg flex flex-col justify-end min-h-[220px]">
            <div className="max-w-[92%] self-end bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3.5 shadow-xs space-y-2">
              <p className="text-xs text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap leading-relaxed font-sans">
                {preview}
              </p>
              <div className="flex items-center justify-between pt-1.5 border-t border-neutral-100 dark:border-neutral-700 text-[10px] text-neutral-400 dark:text-neutral-500">
                <span className="font-mono text-neutral-600 dark:text-neutral-400">📎 {sampleStudent.studentName}_Karne.pdf</span>
                <span>{new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} ✓✓</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/60 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 leading-relaxed">
            💡 <strong>İpucu:</strong> Gönderim sırasında <code>{'{tarih}'}</code> ve <code>{'{gun}'}</code> değişkenleri o günün güncel tarihiyle, <code>{'{sinav_adi}'}</code> ise belirttiğiniz sınav başlığıyla velilere otomatik iletilir.
          </div>
        </div>
      </div>
    </div>
  );
};
