import React, { useState, useMemo } from 'react';
import { Student } from '../types/student';
import { normalizePhoneNumber, isValidTurkishPhone, formatPhoneDisplay } from '../services/normalizer';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Filter,
  Copy,
} from 'lucide-react';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawHeaders: string[];
  rawRows: Record<string, string>[];
  existingStudents: Student[];
  onConfirmImport: (importedStudents: Student[]) => void;
}

type TargetField = 'studentName' | 'parentName' | 'phone' | 'secondaryPhone' | 'group' | 'notes';

const TARGET_FIELDS: { key: TargetField; label: string; required: boolean }[] = [
  { key: 'studentName', label: 'Öğrenci Adı Soyadı', required: true },
  { key: 'parentName', label: 'Veli Adı Soyadı', required: true },
  { key: 'phone', label: '1. Veli WhatsApp Telefonu', required: true },
  { key: 'secondaryPhone', label: '2. Veli Telefonu (Opsiyonel)', required: false },
  { key: 'group', label: 'Sınıf / Grup (Opsiyonel)', required: false },
  { key: 'notes', label: 'Notlar (Opsiyonel)', required: false },
];

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  rawHeaders,
  rawRows,
  existingStudents,
  onConfirmImport,
}) => {
  // 1. Column Mapping State (Initialize with smart auto-detection)
  const [columnMapping, setColumnMapping] = useState<Record<TargetField, string>>(() => {
    const mapping: Record<TargetField, string> = {
      studentName: '',
      parentName: '',
      phone: '',
      secondaryPhone: '',
      group: '',
      notes: '',
    };

    rawHeaders.forEach((header) => {
      const lower = header.toLowerCase().trim();
      if (!mapping.studentName && (lower.includes('öğrenci') || lower.includes('ogrenci') || lower === 'ad soyad' || lower === 'isim')) {
        mapping.studentName = header;
      } else if (!mapping.parentName && (lower.includes('veli') || lower.includes('anne') || lower.includes('baba'))) {
        mapping.parentName = header;
      } else if (!mapping.secondaryPhone && (lower.includes('2.') || lower.includes('ikinci') || lower.includes('tel 2') || lower.includes('anne tel') || lower.includes('baba tel'))) {
        mapping.secondaryPhone = header;
      } else if (!mapping.phone && (lower.includes('telefon') || lower.includes('tel') || lower.includes('gsm') || lower.includes('whatsapp') || lower.includes('numara'))) {
        mapping.phone = header;
      } else if (!mapping.group && (lower.includes('sınıf') || lower.includes('sinif') || lower.includes('grup') || lower.includes('şube') || lower.includes('sube'))) {
        mapping.group = header;
      } else if (!mapping.notes && (lower.includes('not') || lower.includes('açıklama') || lower.includes('aciklama'))) {
        mapping.notes = header;
      }
    });

    return mapping;
  });

  const [filterType, setFilterType] = useState<'all' | 'valid' | 'errors' | 'duplicates'>('all');
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [updateExistingStudents, setUpdateExistingStudents] = useState(true);

  // Map of existing students for quick duplicate detection
  const existingNameMap = useMemo(() => {
    const map = new Map<string, Student>();
    existingStudents.forEach((s) => map.set(s.studentName.toLowerCase().trim(), s));
    return map;
  }, [existingStudents]);

  const existingPhoneMap = useMemo(() => {
    const map = new Map<string, Student>();
    existingStudents.forEach((s) => {
      map.set(s.phone, s);
      if (s.secondaryPhone) map.set(s.secondaryPhone, s);
    });
    return map;
  }, [existingStudents]);

  // 2. Row Validation and Mapping Analysis
  const analyzedRows = useMemo(() => {
    const filePhonesSeen = new Set<string>();

    return rawRows.map((row, index) => {
      const rawName = String(row[columnMapping.studentName] || '').trim();
      const rawParent = String(row[columnMapping.parentName] || '').trim() || 'Veli';
      const rawPhone = String(row[columnMapping.phone] || '').trim();
      const rawSecondary = columnMapping.secondaryPhone ? String(row[columnMapping.secondaryPhone] || '').trim() : '';
      const rawGroup = columnMapping.group ? String(row[columnMapping.group] || '').trim() : 'Genel';
      const rawNotes = columnMapping.notes ? String(row[columnMapping.notes] || '').trim() : '';

      const normalizedPhone = normalizePhoneNumber(rawPhone);
      const normalizedSecondary = rawSecondary ? normalizePhoneNumber(rawSecondary) : '';

      const errors: string[] = [];
      const warnings: string[] = [];

      // Name validation
      if (!rawName) {
        errors.push('Öğrenci adı boş olamaz.');
      }

      // Phone validation
      if (!rawPhone) {
        errors.push('Telefon numarası boş.');
      } else if (!isValidTurkishPhone(normalizedPhone)) {
        errors.push(`Geçersiz telefon formatı (${rawPhone}).`);
      }

      // Secondary phone validation
      if (rawSecondary && !isValidTurkishPhone(normalizedSecondary)) {
        warnings.push(`2. Veli telefonu geçersiz formatta (${rawSecondary}).`);
      }

      // In-file duplicate check
      if (normalizedPhone) {
        if (filePhonesSeen.has(normalizedPhone)) {
          warnings.push('Bu telefon dosyada birden fazla satırda tekrar ediyor.');
        } else {
          filePhonesSeen.add(normalizedPhone);
        }
      }

      // Existing database duplicate checks
      const isExistingStudent = rawName ? existingNameMap.has(rawName.toLowerCase()) : false;
      if (isExistingStudent) {
        warnings.push('Bu isimde öğrenci sistemde zaten kayıtlı (güncellenecektir).');
      }

      const existingPhoneStudent = normalizedPhone ? existingPhoneMap.get(normalizedPhone) : null;
      if (existingPhoneStudent && (!isExistingStudent || existingPhoneStudent.studentName.toLowerCase() !== rawName.toLowerCase())) {
        warnings.push(`Bu telefon no sistemde "${existingPhoneStudent.studentName}" öğrencisine ait.`);
      }

      const isValid = errors.length === 0;

      const studentCandidate: Student = {
        id: isExistingStudent ? existingNameMap.get(rawName.toLowerCase())!.id : `imp_${Date.now()}_${index}`,
        studentName: rawName,
        parentName: rawParent,
        phone: normalizedPhone,
        secondaryPhone: normalizedSecondary || undefined,
        group: rawGroup || 'Genel',
        notes: rawNotes || undefined,
        isActive: true,
      };

      return {
        rowIndex: index + 1,
        student: studentCandidate,
        rawName,
        rawPhone,
        rawParent,
        rawGroup,
        errors,
        warnings,
        isValid,
        isExistingStudent,
      };
    });
  }, [rawRows, columnMapping, existingNameMap, existingPhoneMap]);

  // Statistics
  const totalCount = analyzedRows.length;
  const validCount = analyzedRows.filter((r) => r.isValid).length;
  const errorCount = analyzedRows.filter((r) => !r.isValid).length;
  const warningCount = analyzedRows.filter((r) => r.warnings.length > 0).length;
  const duplicateCount = analyzedRows.filter((r) => r.isExistingStudent).length;

  // Filtered rows for the preview table
  const displayedRows = useMemo(() => {
    switch (filterType) {
      case 'valid':
        return analyzedRows.filter((r) => r.isValid);
      case 'errors':
        return analyzedRows.filter((r) => !r.isValid);
      case 'duplicates':
        return analyzedRows.filter((r) => r.isExistingStudent || r.warnings.length > 0);
      default:
        return analyzedRows;
    }
  }, [analyzedRows, filterType]);

  const handleConfirm = () => {
    const candidateList = skipInvalid ? analyzedRows.filter((r) => r.isValid) : analyzedRows;
    const finalStudents = candidateList.map((r) => r.student);
    onConfirmImport(finalStudents);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/70 dark:bg-neutral-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Excel / CSV İçe Aktarma &amp; Doğrulama
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Sütunları eşleştirin, veri tutarlılığını denetleyin ve önizleyin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* 1. Sütun Eşleştirme (Column Mapping) Section */}
          <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <span>1. Sütun Eşleştirmesi</span>
              </span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Excel dosyanızdaki başlıklar ile sistem alanlarını eşleştirin
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {TARGET_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                  </label>
                  <select
                    value={columnMapping[field.key]}
                    onChange={(e) =>
                      setColumnMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ${
                      field.required && !columnMapping[field.key]
                        ? 'border-rose-400 dark:border-rose-700 bg-rose-50/50'
                        : 'border-neutral-300 dark:border-neutral-700'
                    }`}
                  >
                    <option value="">-- Sütun Seçin --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Validation Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-800 rounded-xl flex flex-col items-center text-center">
              <span className="text-[10px] text-neutral-500 uppercase font-semibold">Toplam Satır</span>
              <span className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">{totalCount}</span>
            </div>

            <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex flex-col items-center text-center">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-semibold">
                Geçerli Satırlar
              </span>
              <span className="text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{validCount}</span>
            </div>

            <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl flex flex-col items-center text-center">
              <span className="text-[10px] text-rose-700 dark:text-rose-300 uppercase font-semibold">Hatalı Satırlar</span>
              <span className="text-base font-bold text-rose-700 dark:text-rose-300 mt-0.5">{errorCount}</span>
            </div>

            <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-col items-center text-center">
              <span className="text-[10px] text-amber-700 dark:text-amber-300 uppercase font-semibold">
                Mevcut / Yinelenen
              </span>
              <span className="text-base font-bold text-amber-700 dark:text-amber-300 mt-0.5">{duplicateCount}</span>
            </div>
          </div>

          {/* 3. Filter Buttons & Options */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-neutral-500 text-[11px] font-medium mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>Filtre:</span>
              </span>
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-neutral-800 text-white dark:bg-white dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                Tümü ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('valid')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  filterType === 'valid'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                Sadece Geçerliler ({validCount})
              </button>
              {errorCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterType('errors')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                    filterType === 'errors'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  Hatalılar ({errorCount})
                </button>
              )}
              {duplicateCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterType('duplicates')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                    filterType === 'duplicates'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  Yinelenen / Uyarı ({duplicateCount})
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={skipInvalid}
                  onChange={(e) => setSkipInvalid(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Hatalı satırları atla</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={updateExistingStudents}
                  onChange={(e) => setUpdateExistingStudents(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Mevcut öğrencileri güncelle</span>
              </label>
            </div>
          </div>

          {/* 4. Preview Table */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-neutral-50 dark:bg-neutral-800 sticky top-0 border-b border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400">
                <tr>
                  <th className="py-2 px-3 font-semibold w-12">Satır</th>
                  <th className="py-2 px-3 font-semibold">Öğrenci Adı</th>
                  <th className="py-2 px-3 font-semibold">Veli</th>
                  <th className="py-2 px-3 font-semibold">1. Veli Telefonu</th>
                  <th className="py-2 px-3 font-semibold">Sınıf</th>
                  <th className="py-2 px-3 font-semibold">Doğrulama Durumu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-neutral-400">
                      Seçilen filtrede kayıt bulunamadı.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => (
                    <tr
                      key={row.rowIndex}
                      className={
                        !row.isValid
                          ? 'bg-rose-50/40 dark:bg-rose-950/20'
                          : row.warnings.length > 0
                          ? 'bg-amber-50/30 dark:bg-amber-950/15'
                          : 'hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30'
                      }
                    >
                      <td className="py-2 px-3 font-mono text-neutral-400">#{row.rowIndex}</td>
                      <td className="py-2 px-3 font-medium text-neutral-900 dark:text-neutral-100">
                        {row.rawName || <span className="text-rose-500 italic">Boş İsim</span>}
                      </td>
                      <td className="py-2 px-3 text-neutral-600 dark:text-neutral-300">{row.rawParent}</td>
                      <td className="py-2 px-3 font-mono text-neutral-700 dark:text-neutral-300">
                        {row.student.phone ? formatPhoneDisplay(row.student.phone) : row.rawPhone || '—'}
                      </td>
                      <td className="py-2 px-3 text-neutral-500">{row.rawGroup || 'Genel'}</td>
                      <td className="py-2 px-3">
                        {row.isValid ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{row.isExistingStudent ? 'Mevcut (Güncellenecek)' : 'Geçerli'}</span>
                            </span>
                            {row.warnings.map((w, wi) => (
                              <p key={wi} className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
                                ⚠️ {w}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>Hatalı Satır</span>
                            </span>
                            {row.errors.map((e, ei) => (
                              <p key={ei} className="text-[10px] text-rose-600 dark:text-rose-400 font-medium leading-tight">
                                ✕ {e}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-800/60 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {validCount > 0
              ? `${validCount} geçerli öğrenci içe aktarılmaya hazır`
              : 'Aktarılacak geçerli satır bulunamadı'}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-lg font-medium text-xs cursor-pointer"
            >
              Vazgeç
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={validCount === 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{validCount} Öğrenciyi Sisteme Aktar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
