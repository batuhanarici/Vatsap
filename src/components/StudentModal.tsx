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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (studentToEdit) {
      setStudentName(studentToEdit.studentName);
      setParentName(studentToEdit.parentName);
      setPhone(studentToEdit.phone);
    } else {
      setStudentName('');
      setParentName('');
      setPhone('');
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
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-neutral-50/50">
          <h2 className="text-sm font-semibold text-neutral-900">
            {studentToEdit ? 'Öğrenciyi Düzenle' : 'Yeni Öğrenci Ekle'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Öğrenci Adı Soyadı
            </label>
            <input
              type="text"
              required
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Örn: Ahmet Yılmaz"
              className="w-full px-3 py-2 border border-neutral-300 rounded text-xs text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Veli Adı Soyadı
            </label>
            <input
              type="text"
              required
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Örn: Mehmet Yılmaz"
              className="w-full px-3 py-2 border border-neutral-300 rounded text-xs text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              WhatsApp Telefon Numarası
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Örn: 0532 111 22 33"
              className="w-full px-3 py-2 border border-neutral-300 rounded text-xs font-mono text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
            />
            {phone && (
              <p className="text-[11px] text-neutral-500 mt-1 font-mono">
                Formatlanan: {formatPhoneDisplay(phone)}
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800 transition-colors shadow-xs"
            >
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
