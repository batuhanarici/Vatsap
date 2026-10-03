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

          const studentName = studentKey ? String(row[studentKey] || '').trim() : '';
          const parentName = parentKey ? String(row[parentKey] || '').trim() : '';
          const rawPhone = phoneKey ? String(row[phoneKey] || '').trim() : '';

          if (studentName) {
            newStudents.push({
              id: `imported_${Date.now()}_${idx}`,
              studentName,
              parentName: parentName || 'Sayın Velimiz',
              phone: normalizePhoneNumber(rawPhone),
            });
          }
        });

        if (newStudents.length > 0) {
          if (onBulkAddStudents) {
            onBulkAddStudents(newStudents);
          } else {
            newStudents.forEach((st) => onAddStudent(st));
          }
          alert(`${newStudents.length} öğrenci Excel dosyasından başarıyla eklendi!`);
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
        'Öğrenci Adı': 'Ali Yılmaz',
        'Veli Adı': 'Mehmet Yılmaz',
        'WhatsApp Telefon': '0532 111 22 33',
      },
      {
        'Öğrenci Adı': 'Ayşe Demir',
        'Veli Adı': 'Fatma Demir',
        'WhatsApp Telefon': '0533 222 33 44',
      },
      {
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
    const a = document.createElement('a');
    a.href = url;
    a.download = `KarneGonderici_Yedek_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 4. Import JSON Backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content && storageService.importFullBackup(content)) {
        alert('Yedek başarıyla geri yüklendi! Sayfa güncelleniyor...');
        window.location.reload();
      } else {
        alert('Yedek dosyası geçersiz.');
      }
    };
    reader.readAsText(file);
  };

  // 5. Load Test Sample Data
  const handleLoadSampleData = () => {
    if (students.length > 0 && !window.confirm('Mevcut listenizin üzerine 10 örnek test öğrencisi eklenecek. Onaylıyor musunuz?')) {
      return;
    }
    if (onBulkAddStudents) {
      onBulkAddStudents(SAMPLE_TEST_STUDENTS);
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

  const filteredStudents = students.filter(
    (s) =>
      s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.parentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-4">
      {/* Top Banner: Data Persistence Guarantee */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-900 block">
              Verileriniz Kalıcı Olarak Saklanır
            </span>
            <p className="text-[11px] text-emerald-800 leading-relaxed mt-0.5">
              Eklediğiniz öğrenciler, veli telefonları ve mesaj şablonlarınız uygulamanın yerel hafızasında saklanır. Uygulamayı kapattığınızda, Mac&apos;inizi yeniden başlattığınızda veya sayfayı yenilediğinizde <strong>verileriniz kesinlikle kaybolmaz</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-100/60 border border-emerald-300 rounded text-emerald-900 font-medium text-xs transition-colors shadow-2xs cursor-pointer"
            title="Tüm verilerinizi kendi bilgisayarınıza JSON yedeği olarak indirin"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Yedek İndir</span>
          </button>

          <button
            onClick={() => backupInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-100/60 border border-emerald-300 rounded text-emerald-900 font-medium text-xs transition-colors shadow-2xs cursor-pointer"
            title="Daha önce indirdiğiniz yedeği geri yükleyin"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-700" />
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <span>Kayıtlı Öğrenciler</span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-xs font-mono font-medium">
              {students.length} öğrenci
            </span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-800 transition-colors shadow-2xs cursor-pointer"
            title="Excel dosyanızdaki öğrencileri içe aktarın"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel / CSV Yükle</span>
          </button>

          {/* Download Excel Template */}
          <button
            onClick={handleDownloadSampleExcel}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-neutral-200 bg-white hover:bg-neutral-50 text-xs text-neutral-600 transition-colors cursor-pointer"
            title="Örnek Excel şablonunu indirin"
          >
            <Download className="w-3 h-3 text-neutral-400" />
            <span>Örnek Excel Şablonu</span>
          </button>

          {/* Clear All Button */}
          {students.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-rose-200 text-rose-700 bg-rose-50/50 hover:bg-rose-100/60 text-xs font-medium transition-colors cursor-pointer"
              title="Tüm öğrenci listesini temizle"
            >
              <Trash2 className="w-3 h-3 text-rose-600" />
              <span>Listeyi Temizle</span>
            </button>
          )}

          {/* Load Sample Test Data */}
          {students.length === 0 && (
            <button
              onClick={handleLoadSampleData}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-xs text-neutral-600 transition-colors cursor-pointer"
              title="Test amaçlı 10 örnek öğrenciyi listeye yükle"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Örnek Veri Yükle (Test)</span>
            </button>
          )}

          {/* Add Student Button */}
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-neutral-900 text-white hover:bg-neutral-800 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Öğrenci Ekle</span>
          </button>
        </div>
      </div>

      {/* Filter / Search input */}
      {students.length > 5 && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Öğrenci adı, veli veya telefon ile ara..."
            className="w-full sm:w-72 px-3 py-1.5 bg-white border border-neutral-300 rounded text-xs text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
          />
        </div>
      )}

      {/* Students Table */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-medium">
                <th className="py-2.5 px-4 font-semibold w-12">#</th>
                <th className="py-2.5 px-4 font-semibold">Öğrenci Adı Soyadı</th>
                <th className="py-2.5 px-4 font-semibold">Veli Adı Soyadı</th>
                <th className="py-2.5 px-4 font-semibold">WhatsApp Numarası</th>
                <th className="py-2.5 px-4 font-semibold text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-400">
                    <div className="max-w-xs mx-auto space-y-2">
                      <p className="font-medium text-neutral-600">Henüz kayıtlı öğrenci bulunmuyor.</p>
                      <p className="text-[11px] text-neutral-400">
                        Yukarıdaki <strong>&quot;Excel / CSV Yükle&quot;</strong> butonuna basarak sınıf listenizi tek seferde yükleyebilir veya <strong>&quot;Öğrenci Ekle&quot;</strong> butonuyla tek tek ekleyebilirsiniz.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, idx) => (
                  <tr key={student.id} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-neutral-400 text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-semibold text-neutral-900">
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
                          className="p-1.5 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
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
                          className="p-1.5 rounded text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
