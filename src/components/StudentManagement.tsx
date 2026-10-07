import React, { useState, useRef, useMemo } from 'react';
import { Student, StudentFormData } from '../types/student';
import { StudentModal } from './StudentModal';
import { ExcelImportModal } from './ExcelImportModal';
import { formatPhoneDisplay } from '../services/normalizer';
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
  PhoneCall,
  UserCheck,
  UserX,
  CheckSquare,
  Square,
  Users,
  Check,
  X,
  FolderInput,
} from 'lucide-react';

interface StudentManagementProps {
  students: Student[];
  onAddStudent: (data: StudentFormData) => void;
  onUpdateStudent: (id: string, data: StudentFormData) => void;
  onDeleteStudent: (id: string) => void;
  onResetToDefaults: () => void;
  onBulkAddStudents?: (newStudents: Student[]) => void;
  onClearAllStudents?: () => void;
  onInitiateImportBackup?: (fileName: string, jsonString: string) => void;
}

export const StudentManagement: React.FC<StudentManagementProps> = ({
  students,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onBulkAddStudents,
  onClearAllStudents,
  onInitiateImportBackup,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');

  // Excel Import Modal States
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<Record<string, string>[]>([]);

  // Bulk Edit States
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [isBulkGroupModalOpen, setIsBulkGroupModalOpen] = useState(false);
  const [bulkTargetGroup, setBulkTargetGroup] = useState('');

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

  // 1. Excel / CSV File Parsing -> Opens ExcelImportModal
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

        // Read headers
        const headerRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
        const rawHeaders = (headerRows[0] || []).map((h) => String(h || '').trim()).filter(Boolean);

        // Read data rows
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false });

        if (!rows || rows.length === 0 || rawHeaders.length === 0) {
          alert('Excel dosyasında geçerli satır veya başlık bulunamadı.');
          return;
        }

        setExcelHeaders(rawHeaders);
        setExcelRows(rows);
        setIsExcelModalOpen(true);
      } catch (err) {
        alert('Excel dosyası okunurken hata: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // 2. Sample Excel Template
  const handleDownloadSampleExcel = () => {
    const sampleData = [
      {
        'Sınıf / Şube': '8-A',
        'Öğrenci Adı': 'Ali Yılmaz',
        'Veli Adı': 'Mehmet Yılmaz',
        '1. Veli Telefonu': '0532 111 22 33',
        '2. Veli Telefonu': '0533 222 33 44',
      },
      {
        'Sınıf / Şube': '8-B',
        'Öğrenci Adı': 'Ayşe Demir',
        'Veli Adı': 'Fatma Demir',
        '1. Veli Telefonu': '0533 222 33 44',
        '2. Veli Telefonu': '',
      },
      {
        'Sınıf / Şube': '12-Sayısal',
        'Öğrenci Adı': 'Can Öztürk',
        'Veli Adı': 'Kemal Öztürk',
        '1. Veli Telefonu': '0535 333 44 55',
        '2. Veli Telefonu': '0536 444 55 66',
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
        if (onInitiateImportBackup) {
          onInitiateImportBackup(file.name, text);
        } else {
          storageService.importFullBackup(text);
        }
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
    }
  };

  // 6. Clear All Students
  const handleClearAll = () => {
    if (students.length === 0) return;
    if (onClearAllStudents) {
      onClearAllStudents();
    }
  };

  // Extract unique groups
  const availableGroups = useMemo(() => {
    return Array.from(new Set(students.map((s) => s.group || 'Genel'))).sort();
  }, [students]);

  // Statistics
  const activeCount = useMemo(() => students.filter((s) => s.isActive !== false).length, [students]);
  const inactiveCount = useMemo(() => students.filter((s) => s.isActive === false).length, [students]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchesSearch =
        s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.parentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.phone.includes(searchTerm) ||
        (s.secondaryPhone && s.secondaryPhone.includes(searchTerm)) ||
        (s.group && s.group.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesGroup =
        selectedGroupFilter === 'all' ? true : (s.group || 'Genel') === selectedGroupFilter;

      const isStudentActive = s.isActive !== false;
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? isStudentActive
          : !isStudentActive;

      return matchesSearch && matchesGroup && matchesStatus;
    });
  }, [students, searchTerm, selectedGroupFilter, statusFilter]);

  // Bulk Selection Handlers
  const handleToggleSelectAll = () => {
    if (selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map((s) => s.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Bulk Operations
  const handleBulkSetActive = (active: boolean) => {
    selectedStudentIds.forEach((id) => {
      const found = students.find((s) => s.id === id);
      if (found) {
        onUpdateStudent(id, { ...found, isActive: active });
      }
    });
    setSelectedStudentIds(new Set());
  };

  const handleBulkChangeGroup = (newGroup: string) => {
    const cleanGroup = newGroup.trim() || 'Genel';
    selectedStudentIds.forEach((id) => {
      const found = students.find((s) => s.id === id);
      if (found) {
        onUpdateStudent(id, { ...found, group: cleanGroup });
      }
    });
    setSelectedStudentIds(new Set());
    setIsBulkGroupModalOpen(false);
    setBulkTargetGroup('');
  };

  const handleBulkDelete = () => {
    selectedStudentIds.forEach((id) => {
      onDeleteStudent(id);
    });
    setSelectedStudentIds(new Set());
  };

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
              Eklediğiniz öğrenciler, çoklu veli telefonları ve mesaj şablonlarınız uygulamanın yerel hafızasında saklanır. Bilgisayarınızı kapattığınızda <strong>verileriniz kaybolmaz</strong>.
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
            title="Daha önce indirdiğiniz yedeği önizleyerek geri yükleyin"
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
              {students.length} öğrenci ({activeCount} aktif)
            </span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Sınav karneleri bu listedeki aktif öğrencilere ve veli telefonlarına (ana &amp; 2. hat) iletilir.
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
            title="Excel dosyanızdaki öğrencileri sütun eşleştirme ve doğrulama ekranıyla içe aktarın"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Excel / CSV Yükle &amp; Doğrula</span>
          </button>

          {/* Download Excel Template */}
          <button
            onClick={handleDownloadSampleExcel}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
            title="Örnek 2 veli telefonlu Excel şablonunu indirin"
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

      {/* Filter Bar: Status (Aktif/Pasif) & Group Selection */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-2xs transition-colors">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          {/* Active / Inactive Status Filter */}
          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Tümü ({students.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'active'
                  ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              <UserCheck className="w-3 h-3" />
              <span>Aktifler ({activeCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'inactive'
                  ? 'bg-neutral-700 text-white shadow-2xs font-semibold'
                  : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              <UserX className="w-3 h-3" />
              <span>Pasifler ({inactiveCount})</span>
            </button>
          </div>

          {/* Group Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedGroupFilter('all')}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                selectedGroupFilter === 'all'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold shadow-2xs'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
              }`}
            >
              Tüm Sınıflar
            </button>
            {availableGroups.map((g) => {
              const count = students.filter((s) => (s.group || 'Genel') === g).length;
              const isSelected = selectedGroupFilter === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGroupFilter(g)}
                  className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  <span>{g}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected
                        ? 'bg-indigo-700 text-white'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
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

      {/* Floating Bulk Action Bar */}
      {selectedStudentIds.size > 0 && (
        <div className="bg-indigo-900 text-white px-4 py-2.5 rounded-xl shadow-lg border border-indigo-700 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-150 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold bg-indigo-800 px-2.5 py-1 rounded-md font-mono">
              {selectedStudentIds.size} öğrenci seçildi
            </span>
            <span className="text-indigo-200 text-[11px] hidden sm:inline">
              Seçilen öğrenciler için toplu eylem uygulayın:
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsBulkGroupModalOpen(true)}
              className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 rounded font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <FolderInput className="w-3 h-3" />
              <span>Sınıf Değiştir</span>
            </button>

            <button
              type="button"
              onClick={() => handleBulkSetActive(true)}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <UserCheck className="w-3 h-3" />
              <span>Aktif Yap</span>
            </button>

            <button
              type="button"
              onClick={() => handleBulkSetActive(false)}
              className="px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 rounded font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <UserX className="w-3 h-3" />
              <span>Pasif Yap</span>
            </button>

            <button
              type="button"
              onClick={handleBulkDelete}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 rounded font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Seçilenleri Sil</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStudentIds(new Set())}
              className="p-1 hover:bg-indigo-800 rounded text-indigo-300 hover:text-white cursor-pointer ml-1"
              title="Seçimi kaldır"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Students Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden shadow-2xs transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                <th className="py-2.5 px-3 font-semibold w-8">
                  <input
                    type="checkbox"
                    checked={
                      filteredStudents.length > 0 &&
                      selectedStudentIds.size === filteredStudents.length
                    }
                    onChange={handleToggleSelectAll}
                    className="rounded text-indigo-600 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 font-semibold w-10">#</th>
                <th className="py-2.5 px-4 font-semibold">Öğrenci Adı Soyadı</th>
                <th className="py-2.5 px-4 font-semibold">Durum</th>
                <th className="py-2.5 px-4 font-semibold">Sınıf / Şube</th>
                <th className="py-2.5 px-4 font-semibold">Veli Adı Soyadı</th>
                <th className="py-2.5 px-4 font-semibold">WhatsApp Telefonları</th>
                <th className="py-2.5 px-4 font-semibold text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-neutral-400 dark:text-neutral-500">
                    <div className="max-w-xs mx-auto space-y-2">
                      <p className="font-medium text-neutral-600 dark:text-neutral-300">
                        Kriterlere uygun öğrenci bulunamadı.
                      </p>
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                        Arama filtrenizi temizleyebilir veya yeni öğrenci ekleyebilirsiniz.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, idx) => {
                  const isSelected = selectedStudentIds.has(student.id);
                  const isStudentActive = student.isActive !== false;

                  return (
                    <tr
                      key={student.id}
                      className={`hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors ${
                        isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      } ${!isStudentActive ? 'opacity-65' : ''}`}
                    >
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(student.id)}
                          className="rounded text-indigo-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 font-mono text-neutral-400 text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-neutral-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{student.studentName}</span>
                          {student.notes && (
                            <span
                              className="text-[10px] text-neutral-400 cursor-help"
                              title={student.notes}
                            >
                              💬
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateStudent(student.id, {
                              studentName: student.studentName,
                              parentName: student.parentName,
                              phone: student.phone,
                              secondaryPhone: student.secondaryPhone,
                              group: student.group,
                              notes: student.notes,
                              isActive: !isStudentActive,
                            })
                          }
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                            isStudentActive
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200'
                          }`}
                          title="Durumu değiştirmek için tıklayın"
                        >
                          {isStudentActive ? (
                            <>
                              <UserCheck className="w-3 h-3 text-emerald-600" />
                              <span>Aktif</span>
                            </>
                          ) : (
                            <>
                              <UserX className="w-3 h-3 text-neutral-400" />
                              <span>Pasif</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                          {student.group || 'Genel'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400">
                        {student.parentName}
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="font-mono text-neutral-800 dark:text-neutral-200 block">
                            {formatPhoneDisplay(student.phone)}
                          </span>
                          {student.secondaryPhone && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 dark:text-blue-300 font-mono bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-800">
                              <PhoneCall className="w-2.5 h-2.5 text-blue-500" />
                              <span>2. Hat: {formatPhoneDisplay(student.secondaryPhone)}</span>
                            </span>
                          )}
                        </div>
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
                            onClick={() => onDeleteStudent(student.id)}
                            className="p-1.5 rounded text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Group Edit Modal */}
      {isBulkGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 max-w-sm w-full space-y-3 shadow-xl">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Toplu Sınıf / Grup Değiştir
            </h3>
            <p className="text-xs text-neutral-500">
              Seçili {selectedStudentIds.size} öğrenci için yeni sınıf veya grup adı belirleyin:
            </p>
            <input
              type="text"
              value={bulkTargetGroup}
              onChange={(e) => setBulkTargetGroup(e.target.value)}
              placeholder="Örn: 8-C veya Kurs-A"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkGroupModalOpen(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 rounded cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => handleBulkChangeGroup(bulkTargetGroup)}
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded cursor-pointer"
              >
                Uygula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Edit / Add Modal */}
      <StudentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        studentToEdit={editingStudent}
      />

      {/* Excel Import & Validation Modal */}
      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        rawHeaders={excelHeaders}
        rawRows={excelRows}
        existingStudents={students}
        onConfirmImport={(newStudents) => {
          if (onBulkAddStudents) {
            onBulkAddStudents(newStudents);
          }
        }}
      />
    </div>
  );
};
