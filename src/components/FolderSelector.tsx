import React, { useRef } from 'react';
import { Folder, FolderOpen, Upload, Sparkles, X } from 'lucide-react';
import { LocalPdfFile } from '../types/pdf';

interface FolderSelectorProps {
  folderPath: string;
  pdfFiles: LocalPdfFile[];
  onFolderSelected: (path: string, files: LocalPdfFile[]) => void;
  onLoadSamplePdfs: () => void;
  onClear: () => void;
}

export const FolderSelector: React.FC<FolderSelectorProps> = ({
  folderPath,
  pdfFiles,
  onFolderSelected,
  onLoadSamplePdfs,
  onClear,
}) => {
  const dirInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle directory selection
  const handleDirectoryClick = async () => {
    // If running inside Electron, use native macOS Finder picker
    // @ts-expect-error electronAPI injected by preload
    if (window.electronAPI?.openDirectoryDialog) {
      // @ts-expect-error electronAPI injected by preload
      const res = await window.electronAPI.openDirectoryDialog();
      if (res && res.folderPath) {
        onFolderSelected(res.folderPath, res.pdfFiles || []);
        return;
      }
    }
    // Browser fallback
    dirInputRef.current?.click();
  };

  const handleDirectoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray: LocalPdfFile[] = [];
    let detectedPath = '';

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.name.toLowerCase().endsWith('.pdf')) {
        // Attempt to extract folder path
        if (!detectedPath && file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          if (parts.length > 1) {
            detectedPath = parts[0];
          }
        }

        filesArray.push({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          file,
        });
      }
    }

    const finalPath = detectedPath ? `/Users/batuhan/Desktop/${detectedPath}` : '/Users/batuhan/Desktop/Karneler';
    onFolderSelected(finalPath, filesArray);
  };

  // Handle direct file selection or drop
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray: LocalPdfFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.name.toLowerCase().endsWith('.pdf')) {
        filesArray.push({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          file,
        });
      }
    }

    onFolderSelected('/Users/batuhan/Desktop/Karneler', filesArray);
  };

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 mb-5 shadow-2xs transition-colors">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Folder Display */}
        <div className="flex-1">
          <label className="block text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
            PDF Klasörü
          </label>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono text-neutral-800 dark:text-neutral-200 overflow-hidden">
              <Folder className="w-4 h-4 text-neutral-400 shrink-0" />
              <span className="truncate">
                {folderPath || 'Henüz bir klasör seçilmedi'}
              </span>
            </div>
            {folderPath && (
              <button
                onClick={onClear}
                className="p-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors cursor-pointer"
                title="Klasör seçimini temizle"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 flex-wrap">
          {/* Native Folder Selector */}
          <input
            type="file"
            // @ts-expect-error webkitdirectory is standard in Chromium / Safari / Firefox
            webkitdirectory="true"
            directory="true"
            multiple
            ref={dirInputRef}
            onChange={handleDirectoryChange}
            className="hidden"
          />
          <button
            onClick={handleDirectoryClick}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-white transition-colors shadow-xs cursor-pointer active:scale-98"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Klasör Seç</span>
          </button>

          {/* Files Selector */}
          <input
            type="file"
            accept=".pdf"
            multiple
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 rounded text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer shadow-2xs"
            title="Klasör yerine doğrudan PDF dosyalarını seçin"
          >
            <Upload className="w-3.5 h-3.5 text-neutral-400" />
            <span>PDF Yükle</span>
          </button>

          {/* Load Sample Files */}
          <button
            onClick={onLoadSamplePdfs}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded text-xs font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
            title="9 öğrenci PDF'i yükler (1 öğrenci eksik kalarak test senaryosu simüle edilir)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Örnek PDF'leri Yükle</span>
          </button>
        </div>
      </div>

      {/* Summary line */}
      {folderPath && (
        <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <div>
            Klasörde bulunan PDF sayısı: <span className="font-semibold text-neutral-800 dark:text-neutral-200">{pdfFiles.length}</span>
          </div>
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
            Türkçe karakter ve yazım varyasyonları otomatik eşleştirilir.
          </div>
        </div>
      )}
    </div>
  );
};
