import React, { useState } from 'react';
import { Student, StudentFormData } from '../types/student';
import { StudentModal } from './StudentModal';
import { formatPhoneDisplay } from '../services/normalizer';
import { Plus, Edit2, Trash2, RotateCcw, AlertCircle } from 'lucide-react';

interface StudentManagementProps {
  students: Student[];
  onAddStudent: (data: StudentFormData) => void;
  onUpdateStudent: (id: string, data: StudentFormData) => void;
  onDeleteStudent: (id: string) => void;
  onResetToDefaults: () => void;
}

export const StudentManagement: React.FC<StudentManagementProps> = ({
  students,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onResetToDefaults,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const isLimitReached = students.length >= 10;

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setIsModalOpen(true);
  };

  const handleSave = (data: StudentFormData) => {
    if (editingStudent) {
      onUpdateStudent(editingStudent.id, data);
    } else {
      onAddStudent(data);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 border border-neutral-200 rounded">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            Kayıtlı Öğrenciler ({students.length}/10)
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Sınav karneleri bu listedeki öğrenci ve velilere iletilir.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onResetToDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
            title="Örnek 10 öğrenci listesine dön"
          >
            <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
            <span>Varsayılana Sıfırla</span>
          </button>

          <button
            onClick={handleOpenAdd}
            disabled={isLimitReached}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium transition-colors shadow-xs ${
              isLimitReached
                ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                : 'bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Öğrenci Ekle</span>
          </button>
        </div>
      </div>

      {isLimitReached && (
        <div className="p-3 bg-neutral-50 border border-neutral-200 rounded flex items-center gap-2 text-xs text-neutral-600">
          <AlertCircle className="w-4 h-4 text-neutral-400 shrink-0" />
          <span>
            Maksimum öğrenci kapasitesine (10 öğrenci) ulaşıldı. Yeni eklemek için mevcut bir kaydı silebilirsiniz.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-medium">
                <th className="py-2.5 px-4 font-semibold w-12">#</th>
                <th className="py-2.5 px-4 font-semibold">Öğrenci Adı</th>
                <th className="py-2.5 px-4 font-semibold">Veli Adı</th>
                <th className="py-2.5 px-4 font-semibold">WhatsApp Numarası</th>
                <th className="py-2.5 px-4 font-semibold text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-neutral-400">
                    Henüz kayıtlı öğrenci yok.
                  </td>
                </tr>
              ) : (
                students.map((student, idx) => (
                  <tr key={student.id} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-neutral-400 text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-medium text-neutral-900">
                      {student.studentName}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      {student.parentName}
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-600">
                      {formatPhoneDisplay(student.phone)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(student)}
                          className="p-1.5 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                          title="Düzenle"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`${student.studentName} öğrencisini silmek istediğinizden emin misiniz?`)) {
                              onDeleteStudent(student.id);
                            }
                          }}
                          className="p-1.5 rounded text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StudentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        studentToEdit={editingStudent}
      />
    </div>
  );
};
