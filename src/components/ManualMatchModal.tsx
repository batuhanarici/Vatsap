import React, { useState, useMemo } from 'react';
import { MatchedItem, LocalPdfFile } from '../types/pdf';
import { calculateMatchScore } from '../services/pdfMatcher';
import {
  X,
  Search,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Link,
  Trash2,
  HelpCircle,
  FileCheck,
} from 'lucide-react';

interface ManualMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetItem: MatchedItem | null;
  allItems: MatchedItem[];
  allPdfFiles: LocalPdfFile[];
  onAssignPdf: (studentId: string, pdfFile: LocalPdfFile | null) => void;
}

export const ManualMatchModal: React.FC<ManualMatchModalProps> = ({
  isOpen,
  onClose,
  targetItem,
  allItems,
  allPdfFiles,
  onAssignPdf,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  // Map of which PDF is assigned to which student: pdfOriginalName/name -> studentName
  const pdfAssignedMap = useMemo(() => {
    const map = new Map<string, { studentName: string; studentId: string }>();
    allItems.forEach((item) => {
      if (item.pdfFile) {
        const key = item.pdfFile.originalName || item.pdfFile.name;
        map.set(key, { studentName: item.student.studentName, studentId: item.student.id });
      }
    });
    return map;
  }, [allItems]);

  // Filtered and scored PDFs
  const pdfOptions = useMemo(() => {
    if (!targetItem) return [];

    return allPdfFiles.map((pdf) => {
      const originalKey = pdf.originalName || pdf.name;
      const assignment = pdfAssignedMap.get(originalKey);
      const isAssignedToThisStudent = assignment?.studentId === targetItem.student.id;
      const isAssignedToOther = assignment && !isAssignedToThisStudent;

      const scoreResult = calculateMatchScore(targetItem.student.studentName, originalKey);

      return {
        pdf,
        originalKey,
        assignment,
        isAssignedToThisStudent,
        isAssignedToOther,
        score: scoreResult.score,
        reason: scoreResult.reason,
      };
    });
  }, [allPdfFiles, targetItem, pdfAssignedMap]);

  const filteredPdfs = useMemo(() => {
    return pdfOptions
      .filter((opt) => {
        if (onlyUnassigned && opt.isAssignedToOther) return false;
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          opt.pdf.name.toLowerCase().includes(q) ||
          (opt.pdf.originalName && opt.pdf.originalName.toLowerCase().includes(q)) ||
          (opt.assignment?.studentName && opt.assignment.studentName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // Current assigned first, then by match score descending
        if (a.isAssignedToThisStudent) return -1;
        if (b.isAssignedToThisStudent) return 1;
        return b.score - a.score;
      });
  }, [pdfOptions, searchTerm, onlyUnassigned]);

  if (!isOpen || !targetItem) return null;

  const currentPdfName = targetItem.pdfFile?.originalName || targetItem.pdfFile?.name;

  const handleSelect = (pdf: LocalPdfFile) => {
    onAssignPdf(targetItem.student.id, pdf);
    onClose();
  };

  const handleUnassign = () => {
    onAssignPdf(targetItem.student.id, null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150 text-neutral-900 dark:text-neutral-100 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Link className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Manuel Karne Eşleştirme</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Öğrenciye atanacak PDF dosyasını seçin. Aynı PDF&apos;nin birden fazla öğrenciye atanması otomatik olarak engellenir.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Student Banner */}
        <div className="px-5 py-3 bg-neutral-50 dark:bg-neutral-800/40 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block font-medium">Hedef Öğrenci:</span>
            <span className="font-bold text-sm text-neutral-900 dark:text-white">
              {targetItem.student.studentName}
            </span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 ml-2">
              (Veli: {targetItem.student.parentName || '-'}, Tel: {targetItem.student.phone})
            </span>
          </div>

          {targetItem.pdfFile && (
            <button
              type="button"
              onClick={handleUnassign}
              className="px-2.5 py-1 text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Mevcut Atamayı Kaldır</span>
            </button>
          )}
        </div>

        {/* Toolbar: Search & Filter */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Dosya adına veya öğrenciye göre ara..."
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-600"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-neutral-600 dark:text-neutral-400 select-none">
              <input
                type="checkbox"
                checked={onlyUnassigned}
                onChange={(e) => setOnlyUnassigned(e.target.checked)}
                className="rounded border-neutral-300 dark:border-neutral-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Yalnızca boşta (atanmamış) olan dosyaları göster</span>
            </label>
            <span className="text-[11px] text-neutral-400 font-mono">
              {filteredPdfs.length} / {allPdfFiles.length} dosya listeleniyor
            </span>
          </div>
        </div>

        {/* PDF List */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-neutral-100 dark:divide-neutral-800">
          {filteredPdfs.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400 dark:text-neutral-500">
              Arama kriterinize uygun PDF dosyası bulunamadı.
            </div>
          ) : (
            filteredPdfs.map((opt) => {
              const { pdf, originalKey, assignment, isAssignedToThisStudent, isAssignedToOther, score } = opt;

              return (
                <div
                  key={originalKey}
                  className={`py-3 px-3 rounded-lg flex items-center justify-between gap-3 transition-colors ${
                    isAssignedToThisStudent
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800'
                      : isAssignedToOther
                      ? 'hover:bg-neutral-50 dark:hover:bg-neutral-800/60 opacity-90'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/60'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-neutral-400 dark:text-neutral-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-neutral-900 dark:text-white truncate max-w-xs" title={originalKey}>
                          {originalKey}
                        </span>

                        {/* Match Score Badge */}
                        {score > 0 && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold ${
                              score >= 85
                                ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                                : 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                            }`}
                          >
                            %{score} İsim Uyumu
                          </span>
                        )}

                        {/* Assignment Status Badges */}
                        {isAssignedToThisStudent && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Şu An Bu Öğrenciye Atandı</span>
                          </span>
                        )}

                        {isAssignedToOther && assignment && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>{assignment.studentName} öğrencisine atanmış</span>
                          </span>
                        )}

                        {!assignment && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                            Boşta
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                        <span className="font-mono">{(pdf.size / 1024).toFixed(0)} KB</span>
                        {isAssignedToOther && (
                          <span className="text-amber-700 dark:text-amber-400 text-[10px]">
                            ⚠️ Seçilirse diğer öğrenciden otomatik kaldırılır (Tekil atama garantisi).
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isAssignedToThisStudent ? (
                      <button
                        type="button"
                        onClick={handleUnassign}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-100/60 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                      >
                        Kaldır
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelect(pdf)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                          isAssignedToOther
                            ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-2xs'
                            : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-2xs'
                        }`}
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>{isAssignedToOther ? 'Üzerine Ata' : 'Bu PDF&apos;i Ata'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Bir PDF seçildiğinde dosya adı otomatik olarak {`{Öğrenci_Adı}.pdf`} ile formatlanır.</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
