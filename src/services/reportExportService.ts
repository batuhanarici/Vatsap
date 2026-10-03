import * as XLSX from 'xlsx';
import { HistoryItem } from '../types/history';
import { formatPhoneDisplay } from './normalizer';

export interface ReportMetadata {
  schoolName?: string;
  teacherName?: string;
  examName?: string;
}

/**
 * Generates and downloads an official Microsoft Excel (.xlsx) Delivery Report
 */
export function exportHistoryToExcel(
  history: HistoryItem[],
  metadata?: ReportMetadata
): void {
  if (history.length === 0) {
    alert('Dışa aktarılacak gönderim geçmişi bulunmuyor.');
    return;
  }

  const schoolName = metadata?.schoolName || 'Okul / Kurum';
  const examName = metadata?.examName || 'Genel Değerlendirme';
  const today = new Date().toLocaleDateString('tr-TR');

  // Build rows array for SheetJS
  const titleRow = [`${schoolName} - KARNE VE BİLGİLENDİRME GÖNDERİM TESLİM RAPORU`];
  const metaRow = [`Rapor Tarihi: ${today}`, `Sınav / Başlık: ${examName}`, `Toplam Kayıt: ${history.length}`];
  const emptyRow: string[] = [];

  const headers = [
    'Sıra No',
    'Tarih',
    'Saat',
    'Öğrenci Adı Soyadı',
    'Veli Adı Soyadı',
    'WhatsApp Telefonu',
    'Gönderilen PDF Dosyası',
    'Sınav / Dönem',
    'İletim Durumu',
    'Hata / Durum Açıklaması',
  ];

  const dataRows = history.map((item, index) => {
    let dateStr = '';
    let timeStr = '';
    try {
      const d = new Date(item.date);
      dateStr = d.toLocaleDateString('tr-TR');
      timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      dateStr = item.date;
    }

    const phoneToDisplay = item.phone ? formatPhoneDisplay(item.phone) : item.maskedPhone;

    return [
      index + 1,
      dateStr,
      timeStr,
      item.studentName,
      item.parentName,
      phoneToDisplay,
      item.pdfFileName,
      item.examName || examName,
      item.status === 'success' ? 'BAŞARILI' : 'BAŞARISIZ',
      item.status === 'success' ? 'İletildi' : item.errorMessage || 'Gönderilemedi',
    ];
  });

  const fullData = [titleRow, metaRow, emptyRow, headers, ...dataRows];

  const worksheet = XLSX.utils.aoa_to_sheet(fullData);

  // Set column widths for clean readability in Excel
  worksheet['!cols'] = [
    { wch: 8 },  // Sıra No
    { wch: 13 }, // Tarih
    { wch: 10 }, // Saat
    { wch: 24 }, // Öğrenci
    { wch: 22 }, // Veli
    { wch: 20 }, // Telefon
    { wch: 28 }, // PDF Dosyası
    { wch: 24 }, // Sınav
    { wch: 15 }, // Durum
    { wch: 30 }, // Açıklama
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Gönderim Raporu');

  const now = new Date();
  const dateFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filename = `Karne_Gonderim_Raporu_${dateFormatted}.xlsx`;

  XLSX.writeFile(workbook, filename);
}

/**
 * Generates an official, printable delivery document (Teslim Tutanağı)
 * formatted for school administration with official header, table, and signature blocks.
 */
export function printOfficialDeliveryReport(
  history: HistoryItem[],
  metadata?: ReportMetadata
): void {
  if (history.length === 0) {
    alert('Yazdırılacak gönderim geçmişi bulunmuyor.');
    return;
  }

  const schoolName = metadata?.schoolName || 'ÖZEL / DEVLET EĞİTİM KURUMU';
  const teacherName = metadata?.teacherName || 'Ders Öğretmeni / Rehberlik Servisi';
  const examName = metadata?.examName || 'Dönem Sonu / Deneme Sınavı';
  const now = new Date();
  const printDate = now.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const printTime = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const totalCount = history.length;
  const successCount = history.filter((h) => h.status === 'success').length;
  const failedCount = history.filter((h) => h.status === 'failed').length;

  const rowsHtml = history
    .map((item, idx) => {
      let time = '';
      try {
        time = new Date(item.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      } catch {
        time = item.date;
      }

      const isSuccess = item.status === 'success';

      return `
        <tr style="border-bottom: 1px solid #e5e7eb; font-size: 11px;">
          <td style="padding: 6px 8px; text-align: center;">${idx + 1}</td>
          <td style="padding: 6px 8px; font-weight: 600;">${item.studentName}</td>
          <td style="padding: 6px 8px;">${item.parentName}</td>
          <td style="padding: 6px 8px; font-family: monospace;">${item.phone ? formatPhoneDisplay(item.phone) : item.maskedPhone}</td>
          <td style="padding: 6px 8px; font-family: monospace; color: #374151;">${item.pdfFileName}</td>
          <td style="padding: 6px 8px; text-align: center;">${time}</td>
          <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: ${isSuccess ? '#15803d' : '#b91c1c'};">
            ${isSuccess ? '✓ İletildi' : '✗ Başarısız'}
          </td>
        </tr>
      `;
    })
    .join('');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Yazdırma penceresi açılamadı. Lütfen tarayıcınızın pop-up engelleyicisini kontrol edin.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Karne Gönderim Teslim Tutanağı - ${schoolName}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 15mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #111827;
          background: #ffffff;
          margin: 0;
          padding: 20px;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #111827;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .header h3 {
          margin: 0;
          font-size: 12px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #4b5563;
        }
        .header h1 {
          margin: 4px 0;
          font-size: 16px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .header h2 {
          margin: 2px 0 0 0;
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
        }
        .statement {
          font-size: 11px;
          text-align: justify;
          margin-bottom: 16px;
          padding: 8px 12px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 16px;
          font-size: 11px;
        }
        .summary-card {
          border: 1px solid #e5e7eb;
          padding: 8px;
          border-radius: 4px;
          background: #fafafa;
        }
        .summary-card strong {
          display: block;
          font-size: 14px;
          margin-top: 2px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        th {
          background-color: #f3f4f6;
          border: 1px solid #d1d5db;
          padding: 7px 8px;
          font-size: 11px;
          font-weight: 600;
          text-align: left;
        }
        td {
          border: 1px solid #e5e7eb;
        }
        .signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          page-break-inside: avoid;
        }
        .sig-box {
          width: 42%;
          text-align: center;
          font-size: 12px;
        }
        .sig-line {
          margin-top: 45px;
          border-top: 1px dashed #6b7280;
          padding-top: 6px;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h3>T.C. MİLLÎ EĞİTİM BAKANLIĞI</h3>
        <h1>${schoolName}</h1>
        <h2>KARNE VE DÖNEM DEĞERLENDİRME BELGELERİ VELİ BİLGİLENDİRME TESLİM TUTANAĞI</h2>
      </div>

      <div class="statement">
        <strong>RESMÎ BEYAN VE TUTANAK:</strong> İşbu tutanak, yukarıda adı geçen kurum bünyesinde öğrenim gören öğrencilerin <strong>${examName}</strong> kapsamındaki karne, gelişim ve sonuç belgelerinin; velilerine ait doğrulanmış telefon numaralarına WhatsApp veli iletişim sistemi üzerinden elektronik ortamda teslim edildiğini ve okul idaresine ibraz edilmek üzere tanzim olunduğunu tevsik eder.
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <span>Tutanak Tarihi / Saati:</span>
          <strong>${printDate} - ${printTime}</strong>
        </div>
        <div class="summary-card">
          <span>Toplam Hedef Veli:</span>
          <strong>${totalCount} Öğrenci</strong>
        </div>
        <div class="summary-card" style="color: #15803d;">
          <span>Başarıyla İletilen:</span>
          <strong>${successCount} Karne (%${Math.round((successCount / (totalCount || 1)) * 100)})</strong>
        </div>
        <div class="summary-card" style="color: ${failedCount > 0 ? '#b91c1c' : '#374151'};">
          <span>Ulaşılamayan / Hatalı:</span>
          <strong>${failedCount} Kayıt</strong>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">No</th>
            <th style="width: 20%;">Öğrenci Adı Soyadı</th>
            <th style="width: 18%;">Veli Adı Soyadı</th>
            <th style="width: 18%;">İletilen Telefon</th>
            <th style="width: 22%;">Belge Adı</th>
            <th style="width: 8%; text-align: center;">Saat</th>
            <th style="width: 9%; text-align: center;">Durum</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="signatures">
        <div class="sig-box">
          <p><strong>Gönderimi Gerçekleştiren</strong></p>
          <p style="color: #6b7280; font-size: 11px;">Öğretmen / Yetkili Personel</p>
          <div class="sig-line">
            ${teacherName}<br>
            <span style="font-size: 10px; font-weight: normal; color: #6b7280;">(İmza / Kaşe)</span>
          </div>
        </div>

        <div class="sig-box">
          <p><strong>Okul / Kurum Müdürü</strong></p>
          <p style="color: #6b7280; font-size: 11px;">Tasdik ve Onay</p>
          <div class="sig-line">
            İdare Tasdiki<br>
            <span style="font-size: 10px; font-weight: normal; color: #6b7280;">(Mühür / İmza)</span>
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}
