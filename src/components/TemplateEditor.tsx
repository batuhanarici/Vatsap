import React, { useState } from 'react';
import { Student } from '../types/student';
import { MessageTemplate } from '../types/template';
import { formatMessage, AVAILABLE_VARIABLES } from '../services/templateService';
import {
  Check,
  Plus,
  Trash2,
  Copy,
  Tag,
  Star,
  RotateCcw,
  Sparkles,
  Calendar,
  Layers,
} from 'lucide-react';

interface TemplateEditorProps {
  templates: MessageTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (id: string) => void;
  onSaveTemplates: (templates: MessageTemplate[], activeId?: string) => void;
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
  },
}) => {
  const currentTemplate =
    templates.find((t) => t.id === activeTemplateId) || templates[0];

  const [title, setTitle] = useState(currentTemplate?.title || '');
  const [tag, setTag] = useState(currentTemplate?.tag || '');
  const [content, setContent] = useState(currentTemplate?.content || '');
  const [examName, setExamName] = useState('1. Dönem Genel Değerlendirme Sınavı');
  const [schoolName, setSchoolName] = useState('Özel Başarı Okulları');
  const [isSaved, setIsSaved] = useState(false);

  // Sync state when active template changes
  React.useEffect(() => {
    if (currentTemplate) {
      setTitle(currentTemplate.title);
      setTag(currentTemplate.tag || '');
      setContent(currentTemplate.content);
    }
  }, [currentTemplate?.id]);

  const handleSaveCurrent = () => {
    if (!currentTemplate) return;
    const updated = templates.map((t) =>
      t.id === currentTemplate.id
        ? { ...t, title: title.trim() || 'Başlıksız Şablon', tag: tag.trim() || 'Genel', content }
        : t
    );
    onSaveTemplates(updated, currentTemplate.id);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCreateNew = () => {
    const newId = `tmpl_${Date.now()}`;
    const newTemplate: MessageTemplate = {
      id: newId,
      title: 'Yeni Mesaj Şablonu',
      tag: 'Özel',
      content: `Merhaba {veli_adi},\n\n{ogrenci_adi} öğrencimizin karnesi ekte paylaşılmıştır.\n\nİyi günler dileriz.`,
    };
    const updated = [...templates, newTemplate];
    onSaveTemplates(updated, newId);
    onSelectTemplate(newId);
  };

  const handleDuplicate = (t: MessageTemplate) => {
    const newId = `tmpl_${Date.now()}`;
    const duplicated: MessageTemplate = {
      id: newId,
      title: `${t.title} (Kopya)`,
      tag: t.tag || 'Kopya',
      content: t.content,
    };
    const updated = [...templates, duplicated];
    onSaveTemplates(updated, newId);
    onSelectTemplate(newId);
  };

  const handleDelete = (id: string) => {
    if (templates.length <= 1) {
      alert('En az bir mesaj şablonu kalmalıdır.');
      return;
    }
    const toDelete = templates.find((t) => t.id === id);
    if (!window.confirm(`"${toDelete?.title}" şablonunu silmek istediğinize emin misiniz?`)) {
      return;
    }
    const filtered = templates.filter((t) => t.id !== id);
    const nextActive = filtered[0].id;
    onSaveTemplates(filtered, nextActive);
    onSelectTemplate(nextActive);
  };

  const handleSetDefault = (id: string) => {
    const updated = templates.map((t) => ({
      ...t,
      isDefault: t.id === id,
    }));
    onSaveTemplates(updated, id);
  };

  const handleInsert = (variable: string) => {
    setContent((prev) => prev + variable);
  };

  const preview = formatMessage(content, sampleStudent, {
    examName,
    schoolName,
  });

  const getTagColor = (t: string) => {
    switch (t?.toLowerCase()) {
      case 'haftalık':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'deneme':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'dönem sonu':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'takip':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Template List Bar */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Kayıtlı Mesaj Şablonları</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Farklı sınavlar ve bildirimler için etiketli şablonlar oluşturun. Gönderim ekranında dilediğinizi seçebilirsiniz.
            </p>
          </div>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Şablon Ekle</span>
          </button>
        </div>

        {/* Template Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
          {templates.map((tmpl) => {
            const isSelected = tmpl.id === activeTemplateId;
            return (
              <div
                key={tmpl.id}
                onClick={() => onSelectTemplate(tmpl.id)}
                className={`p-3 rounded-lg border text-left cursor-pointer transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? 'border-neutral-900 bg-neutral-50/80 ring-1 ring-neutral-900 shadow-2xs'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/50'
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
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="Varsayılan Şablon">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        <span>Varsayılan</span>
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-semibold text-neutral-900 truncate">
                    {tmpl.title}
                  </h3>
                  <p className="text-[11px] text-neutral-500 line-clamp-2 mt-1 leading-snug">
                    {tmpl.content}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-neutral-100 text-[11px]">
                  <span className="text-neutral-400 font-mono text-[10px]">
                    {tmpl.content.length} krk
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(tmpl);
                      }}
                      className="p-1 text-neutral-400 hover:text-neutral-700 rounded hover:bg-neutral-200/60"
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
                        className="p-1 text-neutral-400 hover:text-rose-600 rounded hover:bg-rose-50"
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
        <div className="bg-white border border-neutral-200 rounded-lg p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Seçili Şablonu Düzenle
              </span>
              <h3 className="text-sm font-semibold text-neutral-900">
                {title || 'Başlıksız Şablon'}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {!currentTemplate?.isDefault && (
                <button
                  type="button"
                  onClick={() => handleSetDefault(currentTemplate.id)}
                  className="flex items-center gap-1 text-[11px] text-neutral-600 hover:text-amber-800 bg-neutral-100 hover:bg-amber-50 px-2 py-1 rounded border border-neutral-200 transition-colors"
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
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Şablon Başlığı (Açıklayıcı Ad)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn: 8. Sınıf Deneme Sınavı"
                className="w-full px-3 py-2 border border-neutral-300 rounded text-xs text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-neutral-400" />
                <span>Etiket (Tag)</span>
              </label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="Örn: Deneme, Karne"
                className="w-full px-3 py-2 border border-neutral-300 rounded text-xs text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 bg-white"
              />
            </div>
          </div>

          {/* Variable Insertion */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-neutral-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Mesaja Eklenebilir Dinamik Değişkenler:</span>
              </span>
              <span className="text-[10px] text-neutral-400">
                (Tıklayarak metne ekleyin)
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_VARIABLES.map((v) => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => handleInsert(v.tag)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 hover:bg-indigo-50 hover:text-indigo-900 border border-neutral-200 hover:border-indigo-300 text-neutral-800 rounded font-mono text-xs transition-all cursor-pointer group shadow-2xs active:scale-95"
                  title={`${v.label}: ${v.description} (Örnek: ${v.example})`}
                >
                  <span className="text-emerald-600 font-bold group-hover:text-indigo-600">+</span>
                  <span className="font-semibold">{v.tag}</span>
                  <span className="text-[10px] text-neutral-400 group-hover:text-indigo-700 font-sans">
                    ({v.label})
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              WhatsApp Mesaj Metni
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full p-3 border border-neutral-300 rounded text-xs text-neutral-900 font-sans focus:outline-hidden focus:ring-1 focus:ring-neutral-900 leading-relaxed resize-y bg-white"
              placeholder="Mesaj metnini buraya yazın..."
            />
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
            <span className="text-[11px] text-neutral-400 font-mono">
              {content.length} karakter
            </span>
            <button
              onClick={handleSaveCurrent}
              className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer"
            >
              {isSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Şablon Güncellendi</span>
                </>
              ) : (
                <span>Değişiklikleri Kaydet</span>
              )}
            </button>
          </div>
        </div>

        {/* Live Preview Box */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 space-y-4 shadow-2xs">
          <div className="border-b border-neutral-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                Canlı WhatsApp Önizlemesi
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
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
          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2 text-xs">
            <span className="font-semibold text-neutral-700 block text-[11px] uppercase tracking-wider">
              Önizleme Değişken Değerleri:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-neutral-500 block mb-0.5 font-mono">
                  {'{sinav_adi}'} Sınav Adı:
                </label>
                <input
                  type="text"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="Sınav adı..."
                  className="w-full px-2.5 py-1 bg-white border border-neutral-300 rounded text-xs text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 block mb-0.5 font-mono">
                  {'{okul_adi}'} Okul / Kurum:
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Okul adı..."
                  className="w-full px-2.5 py-1 bg-white border border-neutral-300 rounded text-xs text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>
          </div>

          {/* WhatsApp Chat Bubble Mockup */}
          <div className="p-4 bg-emerald-50/40 border border-neutral-200 rounded-lg flex flex-col justify-end min-h-[220px]">
            <div className="max-w-[92%] self-end bg-white border border-neutral-200 rounded-lg p-3.5 shadow-xs space-y-2">
              <p className="text-xs text-neutral-800 whitespace-pre-wrap leading-relaxed font-sans">
                {preview}
              </p>
              <div className="flex items-center justify-between pt-1.5 border-t border-neutral-100 text-[10px] text-neutral-400">
                <span className="font-mono text-neutral-600">📎 {sampleStudent.studentName}_Karne.pdf</span>
                <span>{new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} ✓✓</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-neutral-600 bg-neutral-50 p-3 rounded border border-neutral-200 leading-relaxed">
            💡 <strong>İpucu:</strong> Gönderim sırasında <code>{'{tarih}'}</code> ve <code>{'{gun}'}</code> değişkenleri o günün güncel tarihiyle, <code>{'{sinav_adi}'}</code> ise belirttiğiniz sınav başlığıyla velilere otomatik iletilir.
          </div>
        </div>
      </div>
    </div>
  );
};
