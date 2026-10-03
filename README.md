# WhatsApp Karne Gönderici

macOS üzerinde haftalık sınav karne PDF'lerini velilere WhatsApp üzerinden göndermeyi otomatikleştiren, sade ve güvenilir masaüstü yardımcı aracı.

---

## Mimari

```text
┌──────────────────────────────┐
│      Karne Gönderici         │
│   React + Vite + TypeScript  │
│                              │
│ • Öğrenci / Veli yönetimi    │
│ • PDF klasör tarama          │
│ • Türkçe normalizasyon       │
│ • Mesaj şablonu              │
│ • Sıralı gönderim kuyruğu    │
│ • Gönderim geçmişi           │
└──────────────┬───────────────┘
               │
               │ HTTP / REST (X-API-Key)
               ▼
┌──────────────────────────────┐
│            OpenWA            │
│   (rmyndharis/OpenWA)        │
│   http://localhost:2785      │
│                              │
│ • WhatsApp Web bağlantısı    │
│ • QR kod oturumu             │
│ • Send-Text                  │
│ • Send-Document (PDF)        │
└──────────────┬───────────────┘
               │
               ▼
            WhatsApp
               │
               ▼
             Veli
```

---

## Özellikler

1. **Apple + Notion Sade Arayüzü:** Gereksiz karmaşa, animasyon kalabalığı veya reklam ifadeleri olmadan, bir öğretmenin her hafta 1 dakikada işini tamamlamasını sağlayan minimal tasarım.
2. **Akıllı PDF Eşleştirme:** `Ahmet Yılmaz.pdf`, `Ahmet_Yilmaz.pdf`, `ahmet-yilmaz-haftalik.pdf` gibi farklı formatlardaki dosyaları Türkçe karakterleri (`ç, ğ, ı, ö, ş, ü`) normalize ederek otomatik olarak doğru öğrenciyle eşleştirir.
3. **Güvenli ve Sıralı Gönderim:** WhatsApp bağlantısını korumak adına tüm mesajları arka arkaya toplu basmak yerine öğrenciler arasına 3 saniyelik insani bekleme koyar.
4. **Hata İzolasyonu:** Bir öğrencinin gönderimi başarısız olsa bile tüm süreç durmaz, diğer öğrenciler gönderilir ve başarısız olan öğrenci için tek tıkla "Tekrar Dene" imkanı sunulur.
5. **Yerel & Gizlilik Odaklı:** Tüm veriler kendi makinenizde kalır, harici bulut veritabanı veya ücretli API kullanılmaz.

---

## Hızlı Başlangıç

### 1. OpenWA Servisini Başlatın
```bash
docker run -d \
  --name openwa \
  -p 2785:2785 \
  -v openwa_data:/app/data \
  rmyndharis/openwa:latest
```

### 2. Uygulamayı Çalıştırın
```bash
npm install
npm run dev
```

Tarayıcınızda veya Electron penceresinde `http://localhost:3000` adresine gidin.

### 3. Kullanım Akışı
1. **WhatsApp Bağlantısı:** İlk açılışta Ayarlar modalından QR kodunu telefonunuzdaki WhatsApp ile okutun.
2. **PDF Klasörü Seç:** Karne PDF'lerinizin bulunduğu klasörü seçin (veya denemek için *Örnek PDF'leri Yükle* butonuna basın).
3. **Eşleştirmeyi Kontrol Edin:** Tabloda hangi öğrenciye hangi PDF'in gideceğini gözden geçirin.
4. **Gönderime Başla:** Onay verin ve karnelerin sırayla iletilmesini izleyin.
