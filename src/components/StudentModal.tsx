import React, { useState, useEffect } from 'react';
import { Student, StudentFormData } from '../types/student';
import { normalizePhoneNumber, isValidTurkishPhone, formatPhoneDisplay } from '../services/normalizer';
import { X } from 'lucide-react';

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
  const [group, setGroup] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (studentToEdit) {
      setStudentName(studentToEdit.studentName);
      setParentName(studentToEdit.parentName);
      setPhone(studentToEdit.phone);
      setGroup(studentToEdit.group || '');
    } else {
      setStudentName('');
      setParentName('');
      setPhone('');
      setGroup('');
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

    if (!cleanName) {
      setError('Lütfen öğrenci adını girin.');
      return;
    }
    if (!cleanParent) {
      setError('Lütfen veli adını girin.');
      return;
    }
    if (!isValidTurkishPhone(cleanPhone)) {
      setError('Geçersiz telefon numarası. Lütfen Türkiye formatında (05XX... veya 905XX...) girin.');
      return;
    }

    onSave({
      studentName: cleanName,
      parentName: cleanParent,
      phone: cleanPhone,
      group: cleanGroup,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-neutral-900 dark:text-neutral-100 transition-colors">
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Öğrenci Adı Soyadı
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Sınıf / Şube / Grup
              </label>
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                (İsteğe bağlı, örn: 8-A)
              </span>
            </div>
            <input
              type="text"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Örn: 8-A veya 12-Sayısal"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">Hızlı seçim:</span>
              {['8-A', '8-B', '12-Sayısal', '12-EA', 'Hafta Sonu Grubu'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setGroup(s)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 cursor-pointer transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Veli Adı Soyadı
            </label>
            <input
              type="text"
              required
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Örn: Mehmet Yılmaz"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              WhatsApp Telefon Numarası
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
