import React, { useState, useEffect } from 'react';
import { MatchedItem } from '../types/pdf';
import { formatPhoneDisplay } from '../services/normalizer';
import {
  X,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Phone,
  GraduationCap,
} from 'lucide-react';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentItem: MatchedItem | null;
  allItems: MatchedItem[];
  onSelectIndex: (index: number) => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  isOpen,
  onClose,
  currentItem,
  allItems,
  onSelectIndex,
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(100);

  // Filter only items that have a pdfFile for smooth next/prev navigation
  const validItems = allItems.filter((i) => Boolean(i.pdfFile));
  const currentIndex = validItems.findIndex((i) => i.id === currentItem?.id);

  // Create Object URL if actual File object exists
  useEffect(() => {
    if (!isOpen || !currentItem?.pdfFile?.file) {
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(currentItem.pdfFile.file);
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [isOpen, currentItem?.pdfFile?.file]);

  // Keyboard navigation (Escape to close, Left/Right arrows to cycle)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && currentIndex < validItems.length - 1) {
        const next = validItems[currentIndex + 1];
        const originalIndex = allItems.findIndex((i) => i.id === next.id);
        onSelectIndex(originalIndex);
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        const prev = validItems[currentIndex - 1];
        const originalIndex = allItems.findIndex((i) => i.id === prev.id);
        onSelectIndex(originalIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, validItems, allItems, onClose, onSelectIndex]);

  if (!isOpen || !currentItem) return null;

  const handlePrev = () => {
    if (currentIndex > 0) {
      const prev = validItems[currentIndex - 1];
      const originalIndex = allItems.findIndex((i) => i.id === prev.id);
      onSelectIndex(originalIndex);
    }
  };

  const handleNext = () => {
    if (currentIndex < validItems.length - 1) {
      const next = validItems[currentIndex + 1];
      const originalIndex = allItems.findIndex((i) => i.id === next.id);
      onSelectIndex(originalIndex);
    }
  };

  const handleDownload = () => {
    if (objectUrl) {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = currentItem.pdfFile?.name || 'karne.pdf';
      a.click();
    } else {
      alert('Bu örnek bir sanal PDF kaydıdır. Gerçek bir PDF dosyası seçtiğinizde bilgisayarınıza indirebilirsiniz.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white border border-neutral-200 rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
        {/* Top Control Bar */}
        <div className="px-5 py-3.5 bg-neutral-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white tracking-wide">
                  {currentItem.student.studentName}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Eşleşme Doğrulandı</span>
                </span>
              </div>
              <p className="text-xs text-neutral-400 flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3 text-neutral-500" />
                  <span>Veli: {currentItem.student.parentName}</span>
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3 h-3 text-neutral-500" />
                  <span>{formatPhoneDisplay(currentItem.student.phone)}</span>
                </span>
              </p>
            </div>
          </div>

          {/* Quick Pagination & Actions */}
          <div className="flex items-center gap-2">
            {/* Gallery Navigation */}
            {validItems.length > 1 && (
              <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700 text-xs">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex <= 0}
                  className="p-1.5 text-neutral-300 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-300 transition-colors"
                  title="Önceki Öğrenci (Sol Ok)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-[11px] text-neutral-300">
                  {currentIndex + 1} / {validItems.length}
                </span>
                <button
                  onClick={handleNext}
                  disabled={currentIndex >= validItems.length - 1}
                  className="p-1.5 text-neutral-300 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-300 transition-colors"
                  title="Sonraki Öğrenci (Sağ Ok)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Zoom Controls (only for simulated preview) */}
            {!objectUrl && (
              <div className="hidden sm:flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700 text-xs">
                <button
                  onClick={() => setZoom((z) => Math.max(70, z - 10))}
                  className="p-1.5 text-neutral-300 hover:text-white"
                  title="Küçült"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-[11px] text-neutral-300 font-mono">{zoom}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  className="p-1.5 text-neutral-300 hover:text-white"
                  title="Büyüt"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {objectUrl && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium border border-neutral-700 transition-colors"
                title="PDF'i İndir"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">İndir</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 bg-neutral-800 hover:bg-rose-900/60 hover:text-rose-200 text-neutral-400 rounded-lg transition-colors ml-1"
              title="Kapat (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-header File Info Bar */}
        <div className="px-5 py-2 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between text-xs text-neutral-600 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold text-neutral-700">Eşleşen Dosya:</span>
            <code className="bg-white px-2 py-0.5 rounded border border-neutral-200 font-mono text-neutral-900 truncate">
              {currentItem.pdfFile?.name}
            </code>
            {currentItem.pdfFile?.size && (
              <span className="text-neutral-400 font-mono text-[11px]">
                ({Math.round(currentItem.pdfFile.size / 1024)} KB)
              </span>
            )}
          </div>

          <div className="text-[11px] text-neutral-500 hidden md:block">
            İpucu: Klavyedeki <kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded font-mono text-[10px]">←</kbd> ve <kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded font-mono text-[10px]">→</kbd> tuşlarıyla öğrenciler arasında geçiş yapabilirsiniz.
          </div>
        </div>

        {/* Main Preview Container */}
        <div className="flex-1 bg-neutral-200/70 p-4 sm:p-6 overflow-auto flex items-center justify-center">
          {objectUrl ? (
            /* Real PDF Viewer */
            <div className="w-full h-full bg-white rounded-lg shadow-md border border-neutral-300 overflow-hidden">
              <iframe
                src={`${objectUrl}#toolbar=1&navpanes=0`}
                title={`Karne - ${currentItem.student.studentName}`}
                className="w-full h-full border-none"
              />
            </div>
          ) : (
            /* High-fidelity Realistic Report Card Simulation (When real File binary isn't attached yet) */
            <div
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
              className="bg-white w-full max-w-2xl min-h-[620px] rounded-lg shadow-xl border border-neutral-300 p-8 text-neutral-900 transition-transform duration-100 flex flex-col justify-between"
            >
              {/* Document Header */}
              <div className="border-b-2 border-neutral-900 pb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-neutral-900">
                    <GraduationCap className="w-7 h-7 text-neutral-800" />
                    <div>
                      <h1 className="text-base font-bold uppercase tracking-wider">
                        ÖĞRENCİ GELİŞİM VE SINAV KARNESİ
                      </h1>
                      <p className="text-[11px] text-neutral-500 font-medium">
                        2025 - 2026 EĞİTİM VE ÖĞRETİM YILI
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-mono text-neutral-400 block">Tarih</span>
                    <span className="text-xs font-semibold text-neutral-800">
                      {new Date().toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </div>

                {/* Student Info Card */}
                <div className="grid grid-cols-2 gap-4 pt-3 text-xs bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                      Öğrenci Adı Soyadı
                    </span>
                    <span className="text-sm font-bold text-neutral-900">
                      {currentItem.student.studentName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                      Veli Bilgisi & İletişim
                    </span>
                    <span className="font-medium text-neutral-800">
                      {currentItem.student.parentName} ({formatPhoneDisplay(currentItem.student.phone)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Sample Exam Report Card Table */}
              <div className="py-4 space-y-3">
                <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wide">
                  Ders Başarı Dağılımı ve Net Sonuçları
                </h3>
                <table className="w-full text-left text-xs border border-neutral-200">
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-700 font-semibold border-b border-neutral-200">
                      <th className="py-2 px-3">Ders Adı</th>
                      <th className="py-2 px-3 text-center">Soru Sayısı</th>
                      <th className="py-2 px-3 text-center">Doğru</th>
                      <th className="py-2 px-3 text-center">Yanlış</th>
                      <th className="py-2 px-3 text-center">Net</th>
                      <th className="py-2 px-3 text-right">Başarı Oranı</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-800">
                    <tr>
                      <td className="py-2 px-3 font-medium">Türkçe</td>
                      <td className="py-2 px-3 text-center font-mono">20</td>
                      <td className="py-2 px-3 text-center font-mono text-emerald-700 font-semibold">18</td>
                      <td className="py-2 px-3 text-center font-mono text-rose-700">2</td>
                      <td className="py-2 px-3 text-center font-mono font-bold">17.33</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-800">%87</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Matematik</td>
                      <td className="py-2 px-3 text-center font-mono">20</td>
                      <td className="py-2 px-3 text-center font-mono text-emerald-700 font-semibold">17</td>
                      <td className="py-2 px-3 text-center font-mono text-rose-700">1</td>
                      <td className="py-2 px-3 text-center font-mono font-bold">16.67</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-800">%83</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Fen Bilimleri</td>
                      <td className="py-2 px-3 text-center font-mono">20</td>
                      <td className="py-2 px-3 text-center font-mono text-emerald-700 font-semibold">19</td>
                      <td className="py-2 px-3 text-center font-mono text-rose-700">1</td>
                      <td className="py-2 px-3 text-center font-mono font-bold">18.67</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-800">%93</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Sosyal Bilgiler</td>
                      <td className="py-2 px-3 text-center font-mono">10</td>
                      <td className="py-2 px-3 text-center font-mono text-emerald-700 font-semibold">9</td>
                      <td className="py-2 px-3 text-center font-mono text-rose-700">1</td>
                      <td className="py-2 px-3 text-center font-mono font-bold">8.67</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-800">%87</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Yabancı Dil (İngilizce)</td>
                      <td className="py-2 px-3 text-center font-mono">10</td>
                      <td className="py-2 px-3 text-center font-mono text-emerald-700 font-semibold">10</td>
                      <td className="py-2 px-3 text-center font-mono text-neutral-400">0</td>
                      <td className="py-2 px-3 text-center font-mono font-bold">10.00</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-800">%100</td>
                    </tr>
                    <tr className="bg-neutral-50 font-bold border-t border-neutral-300">
                      <td className="py-2.5 px-3">TOPLAM & PUAN</td>
                      <td className="py-2.5 px-3 text-center font-mono">80</td>
                      <td className="py-2.5 px-3 text-center font-mono text-emerald-700">73</td>
                      <td className="py-2.5 px-3 text-center font-mono text-rose-700">5</td>
                      <td className="py-2.5 px-3 text-center font-mono text-neutral-900">71.34</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-900 text-sm">468.50 Puan</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Teacher Assessment / Notes */}
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs space-y-1">
                <span className="font-semibold text-neutral-800">Öğretmen Değerlendirmesi:</span>
                <p className="text-neutral-600 leading-relaxed">
                  Öğrencimiz bu haftaki deneme sınavında özellikle Fen Bilimleri ve İngilizce derslerinde üstün bir başarı sergilemiştir. Matematik problem çözümlerindeki soru analizi gelişim göstermektedir. Tebrik eder, başarılarının devamını dileriz.
                </p>
              </div>

              {/* Document Footer */}
              <div className="pt-4 border-t border-neutral-200 flex items-center justify-between text-[11px] text-neutral-400">
                <span>Belge Doğrulama Kodu: {currentItem.id.toUpperCase()}</span>
                <span>Okul / Kurs Yönetimi • Resmi Sınav Raporu</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="px-5 py-3 bg-white border-t border-neutral-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="font-medium text-neutral-800">
              Bu karne <strong>{currentItem.student.studentName}</strong> öğrencisi ile eşleştirildi.
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded font-medium text-xs transition-colors cursor-pointer"
          >
            Tamam, Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
