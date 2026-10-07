import React, { useState, useEffect } from 'react';
import { Student, StudentFormData } from '../types/student';
import { normalizePhoneNumber, isValidTurkishPhone, formatPhoneDisplay } from '../services/normalizer';
import { X, UserCheck, UserX, Phone, PhoneCall } from 'lucide-react';

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: StudentFormData) => void;
  studentToEdit?: Student | null;
}

export const StudentModal: React.FC<StudentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  studentToEdit,
}) => {
  const [studentName, setStudentName] = useState('');
  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [group, setGroup] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (studentToEdit) {
      setStudentName(studentToEdit.studentName);
      setParentName(studentToEdit.parentName);
      setPhone(studentToEdit.phone);
      setSecondaryPhone(studentToEdit.secondaryPhone || '');
      setGroup(studentToEdit.group || '');
      setNotes(studentToEdit.notes || '');
      setIsActive(studentToEdit.isActive !== false);
    } else {
      setStudentName('');
      setParentName('');
      setPhone('');
      setSecondaryPhone('');
      setGroup('');
      setNotes('');
      setIsActive(true);
    }
    setError(null);
  }, [studentToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = studentName.trim();
    const cleanParent = parentName.trim();
    const cleanPhone = normalizePhoneNumber(phone);
    const cleanGroup = group.trim() || 'Genel';
    const cleanSecondary = secondaryPhone.trim() ? normalizePhoneNumber(secondaryPhone) : undefined;

    if (!cleanName) {
      setError('Lütfen öğrenci adını girin.');
      return;
    }
    if (!cleanParent) {
      setError('Lütfen veli adını girin.');
      return;
    }
    if (!isValidTurkishPhone(cleanPhone)) {
      setError('1. Veli telefonu geçersiz. Lütfen Türkiye formatında (05XX... veya 905XX...) girin.');
      return;
    }
    if (cleanSecondary && !isValidTurkishPhone(cleanSecondary)) {
      setError('2. Veli telefonu geçersiz. Lütfen doğru bir telefon formatı girin veya boş bırakın.');
      return;
    }

    onSave({
      studentName: cleanName,
      parentName: cleanParent,
      phone: cleanPhone,
      secondaryPhone: cleanSecondary,
      group: cleanGroup,
      notes: notes.trim() || undefined,
      isActive,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-neutral-900 dark:text-neutral-100 transition-colors">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {studentToEdit ? 'Öğrenciyi Düzenle' : 'Yeni Öğrenci Ekle'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Active / Inactive Status Toggle */}
          <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              {isActive ? (
                <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <UserX className="w-4 h-4 text-neutral-400" />
              )}
              <div>
                <span className="text-xs font-semibold block text-neutral-900 dark:text-neutral-100">
                  Öğrenci Durumu: {isActive ? 'Aktif' : 'Pasif'}
                </span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {isActive
                    ? 'Karne eşleştirme ve toplu gönderim listelerine dahil edilir.'
                    : 'Pasif öğrenciler toplu gönderim listesinden çıkarılır, kaydı saklanır.'}
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-neutral-600 peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Öğrenci Adı Soyadı *
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Örn: Ahmet Yılmaz"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Sınıf / Şube / Grup
              </label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="Örn: 8-A veya 12-Sayısal"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Veli Adı Soyadı *
            </label>
            <input
              type="text"
              required
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Örn: Mehmet Yılmaz (veya Fatma Yılmaz)"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
          </div>

          {/* Primary Phone */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>1. Veli WhatsApp Telefon Numarası *</span>
              </span>
              <span className="text-[10px] text-neutral-400">Ana İletişim</span>
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Örn: 0532 111 22 33"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
            {phone && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 font-mono">
                Formatlanan: {formatPhoneDisplay(phone)}
              </p>
            )}
          </div>

          {/* Secondary Phone (Multi-parent contact) */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                <span>2. Veli Telefon Numarası (Opsiyonel)</span>
              </span>
              <span className="text-[10px] text-neutral-400">Anne / Baba 2. Hat</span>
            </label>
            <input
              type="text"
              value={secondaryPhone}
              onChange={(e) => setSecondaryPhone(e.target.value)}
              placeholder="Örn: 0533 222 33 44 (İsteğe bağlı)"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
            {secondaryPhone && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 font-mono">
                Formatlanan: {formatPhoneDisplay(secondaryPhone)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Özel Notlar (Opsiyonel)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Öğrenci veya veli ile ilgili özel notlar..."
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 resize-none"
            />
          </div>

          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs cursor-pointer active:scale-98"
            >
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
