import React, { useState, useRef } from 'react';
import { Student, StudentFormData } from '../types/student';
import { StudentModal } from './StudentModal';
import { formatPhoneDisplay, normalizePhoneNumber } from '../services/normalizer';
import { storageService, SAMPLE_TEST_STUDENTS } from '../services/storageService';
import * as XLSX from 'xlsx';
import {
  Plus,
  Edit2,
  Trash2,
  FileSpreadsheet,
  Download,
  Upload,
  ShieldCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface StudentManagementProps {
  students: Student[];
  onAddStudent: (data: StudentFormData) => void;
  onUpdateStudent: (id: string, data: StudentFormData) => void;
  onDeleteStudent: (id: string) => void;
  onResetToDefaults: () => void;
  onBulkAddStudents?: (newStudents: Student[]) => void;
  onClearAllStudents?: () => void;
}

export const StudentManagement: React.FC<StudentManagementProps> = ({
  students,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onBulkAddStudents,
  onClearAllStudents,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

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

  // 1. Excel / CSV File Import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        if (!rows || rows.length === 0) {
          alert('Excel dosyasında öğrenci verisi bulunamadı.');
          return;
        }

        const newStudents: Student[] = [];

        rows.forEach((row, idx) => {
          // Normalize column keys
          const keys = Object.keys(row);
          const findKey = (searchTerms: string[]) => {
            return keys.find((k) =>
              searchTerms.some((term) =>
                k.toLowerCase().trim().replace(/_/g, ' ').includes(term)
              )
            );
          };

          const studentKey = findKey(['öğrenci', 'ogrenci', 'öğrenci adı', 'ad soyad', 'isim']);
          const parentKey = findKey(['veli', 'veli adı', 'veli ad']);
          const phoneKey = findKey(['telefon', 'tel', 'whatsapp', 'cep', 'gsm', 'phone']);
          const groupKey = findKey(['sınıf', 'sinif', 'şube', 'sube', 'grup', 'group', 'class', 'alan']);

          const studentName = studentKey ? String(row[studentKey] || '').trim() : '';
          const parentName = parentKey ? String(row[parentKey] || '').trim() : '';
          const rawPhone = phoneKey ? String(row[phoneKey] || '').trim() : '';
          const groupName = groupKey ? String(row[groupKey] || '').trim() : '';

          if (studentName) {
            newStudents.push({
              id: `imported_${Date.now()}_${idx}`,
              studentName,
              parentName: parentName || 'Sayın Velimiz',
              phone: normalizePhoneNumber(rawPhone),
              group: groupName || 'Genel',
            });
          }
        });

        if (newStudents.length > 0) {
          if (onBulkAddStudents) {
            onBulkAddStudents(newStudents);
          } else {
            newStudents.forEach((st) => onAddStudent(st));
          }
          alert(`${newStudents.length} öğrenci Excel dosyasından sınıflarıyla birlikte başarıyla eklendi!`);
        } else {
          alert('Excel dosyasında "Öğrenci Adı", "Veli Adı", "Telefon" sütunları tespit edilemedi.');
        }
      } catch (err) {
        alert('Excel dosyası okunurken hata oluştu: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // 2. Download Sample Excel Template
  const handleDownloadSampleExcel = () => {
    const sampleData = [
      {
        'Sınıf / Şube': '8-A',
        'Öğrenci Adı': 'Ali Yılmaz',
        'Veli Adı': 'Mehmet Yılmaz',
        'WhatsApp Telefon': '0532 111 22 33',
      },
      {
        'Sınıf / Şube': '8-B',
        'Öğrenci Adı': 'Ayşe Demir',
        'Veli Adı': 'Fatma Demir',
        'WhatsApp Telefon': '0533 222 33 44',
      },
      {
        'Sınıf / Şube': '12-Sayısal',
        'Öğrenci Adı': 'Can Öztürk',
        'Veli Adı': 'Kemal Öztürk',
        'WhatsApp Telefon': '0535 333 44 55',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğrenciler');
    XLSX.writeFile(workbook, 'Ornek_Ogrenci_Listesi.xlsx');
  };

  // 3. Export JSON Backup
  const handleExportBackup = () => {
    const jsonString = storageService.exportFullBackup();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Karne_Gonderici_Yedek_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 4. Import JSON Backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = String(evt.target?.result || '');
        const success = storageService.importFullBackup(text);
        if (success) {
          alert('Tüm verileriniz ve ayarlarınız başarıyla geri yüklendi! Sayfa güncelleniyor...');
          window.location.reload();
        } else {
          alert('Yedek dosyası doğrulanamadı. Lütfen geçerli bir JSON yedek dosyası seçin.');
        }
      } catch {
        alert('Yedek dosyası okunurken hata oluştu.');
      } finally {
        if (backupInputRef.current) backupInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // 5. Load Sample Test Students
  const handleLoadSampleData = () => {
    if (onBulkAddStudents) {
      onBulkAddStudents(SAMPLE_TEST_STUDENTS);
      alert('10 örnek öğrenci başarıyla eklendi! Ana ekrandan test PDF eşleşmelerini görebilirsiniz.');
    }
  };

  // 6. Clear All Students
  const handleClearAll = () => {
    if (students.length === 0) return;
    if (window.confirm('Tüm kayıtlı öğrenci listesi silinecektir. Emin misiniz?')) {
      if (onClearAllStudents) {
        onClearAllStudents();
      }
    }
  };

  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');

  // Extract unique groups
  const availableGroups = Array.from(
    new Set(students.map((s) => s.group || 'Genel'))
  ).sort();

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.parentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm) ||
      (s.group && s.group.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesGroup =
      selectedGroupFilter === 'all'
        ? true
        : (s.group || 'Genel') === selectedGroupFilter;

    return matchesSearch && matchesGroup;
  });

  return (
    <div className="space-y-4">
      {/* Top Banner: Data Persistence Guarantee */}
      <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950 dark:text-emerald-200 shadow-2xs transition-colors">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-900 dark:text-emerald-300 block">
              Verileriniz Kalıcı Olarak Saklanır
            </span>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300/80 leading-relaxed mt-0.5">
              Eklediğiniz öğrenciler, veli telefonları ve mesaj şablonlarınız uygulamanın yerel hafızasında saklanır. Sayfayı yenilediğinizde veya bilgisayarınızı kapattığınızda <strong>verileriniz kesinlikle kaybolmaz</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-neutral-900 hover:bg-emerald-100/60 dark:hover:bg-neutral-800 border border-emerald-300 dark:border-emerald-700 rounded text-emerald-900 dark:text-emerald-300 font-medium text-xs transition-colors shadow-2xs cursor-pointer"
            title="Tüm verilerinizi kendi bilgisayarınıza JSON yedeği olarak indirin"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
            <span>Yedek İndir</span>
          </button>

          <button
            onClick={() => backupInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-neutral-900 hover:bg-emerald-100/60 dark:hover:bg-neutral-800 border border-emerald-300 dark:border-emerald-700 rounded text-emerald-900 dark:text-emerald-300 font-medium text-xs transition-colors shadow-2xs cursor-pointer"
            title="Daha önce indirdiğiniz yedeği geri yükleyin"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
            <span>Yedek Yükle</span>
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            onChange={handleImportBackup}
            className="hidden"
          />
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-2xs transition-colors">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <span>Kayıtlı Öğrenciler</span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-mono font-medium border border-neutral-200 dark:border-neutral-700">
              {students.length} öğrenci
            </span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Sınav karneleri bu listedeki öğrenci adlarına ve veli telefonlarına iletilir.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Hidden File Input for Excel */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Excel Import Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 transition-colors shadow-2xs cursor-pointer"
            title="Excel dosyanızdaki öğrencileri içe aktarın"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Excel / CSV Yükle</span>
          </button>

          {/* Download Excel Template */}
          <button
            onClick={handleDownloadSampleExcel}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
            title="Örnek Excel şablonunu indirin"
          >
            <Download className="w-3 h-3 text-neutral-400" />
            <span>Örnek Excel Şablonu</span>
          </button>

          {/* Clear All Button */}
          {students.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/40 hover:bg-rose-100/60 dark:hover:bg-rose-900/40 text-xs font-medium transition-colors cursor-pointer"
              title="Tüm öğrenci listesini temizle"
            >
              <Trash2 className="w-3 h-3 text-rose-600 dark:text-rose-400" />
              <span>Listeyi Temizle</span>
            </button>
          )}

          {/* Load Sample Test Data */}
          {students.length === 0 && (
            <button
              onClick={handleLoadSampleData}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-xs text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
              title="Test amaçlı 10 örnek öğrenciyi listeye yükle"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Örnek Veri Yükle (Test)</span>
            </button>
          )}

          {/* Add Student Button */}
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 text-xs font-semibold transition-colors shadow-xs cursor-pointer active:scale-98"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Öğrenci Ekle</span>
          </button>
        </div>
      </div>

      {/* Filter / Search & Group Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-2xs transition-colors">
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 flex items-center gap-1 mr-1">
            🏷️ Sınıf / Şube:
          </span>
          <button
            type="button"
            onClick={() => setSelectedGroupFilter('all')}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              selectedGroupFilter === 'all'
                ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold shadow-2xs'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
            }`}
          >
            Tüm Sınıflar ({students.length})
          </button>
          {availableGroups.map((g) => {
            const count = students.filter((s) => (s.group || 'Genel') === g).length;
            const isSelected = selectedGroupFilter === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGroupFilter(g)}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
                }`}
              >
                <span>{g}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? 'bg-indigo-700 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="İsim, veli veya tel ara..."
            className="w-full px-3 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400"
          />
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden shadow-2xs transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                <th className="py-2.5 px-4 font-semibold w-12">#</th>
                <th className="py-2.5 px-4 font-semibold">Öğrenci Adı Soyadı</th>
                <th className="py-2.5 px-4 font-semibold">Sınıf / Şube</th>
                <th className="py-2.5 px-4 font-semibold">Veli Adı Soyadı</th>
                <th className="py-2.5 px-4 font-semibold">WhatsApp Numarası</th>
                <th className="py-2.5 px-4 font-semibold text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400 dark:text-neutral-500">
                    <div className="max-w-xs mx-auto space-y-2">
                      <p className="font-medium text-neutral-600 dark:text-neutral-300">Bu sınıfta kayıtlı öğrenci bulunamadı.</p>
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                        Arama filtrenizi temizleyebilir veya yeni öğrenci ekleyebilirsiniz.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, idx) => (
                  <tr key={student.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-neutral-400 text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-semibold text-neutral-900 dark:text-white">
                      {student.studentName}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                        {student.group || 'Genel'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400">
                      {student.parentName}
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-600 dark:text-neutral-400">
                      {formatPhoneDisplay(student.phone)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(student)}
                          className="p-1.5 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
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
                          className="p-1.5 rounded text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
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
