# Vatsap V2 Roadmap

> **Belge durumu:** Ana geliştirme yol haritası  
> **Proje:** Vatsap  
> **Hedef:** Mevcut Electron + React + TypeScript uygulamasını güvenli, güvenilir, sürdürülebilir ve profesyonel bir masaüstü uygulamasına dönüştürmek.

---

# 1. V2'nin Amacı

Vatsap V2'nin amacı yeni özellikleri mümkün olduğunca artırmak değildir.

Ana amaç:

> **Öğrenci → PDF → eşleştirme → kontrol → WhatsApp gönderimi → teslimat → raporlama**

akışını güvenli, anlaşılır, hataya dayanıklı ve tekrar kullanılabilir hale getirmektir.

V2 sonunda uygulama:

- yanlış öğrenciye yanlış PDF gönderme riskini azaltmalı,
- WhatsApp gönderimlerinin durumunu doğru göstermeli,
- API anahtarlarını ve erişim tokenlarını güvenli saklamalı,
- öğrenci/veli verilerini daha güvenilir saklamalı,
- başarısız gönderimleri güvenli şekilde tekrar deneyebilmeli,
- duplicate gönderimleri engelleyebilmeli,
- kullanıcıya gönderim öncesinde ne olacağını açıkça göstermeli,
- geçmiş işlemleri denetlenebilir şekilde saklamalı,
- kod tabanı yeni özellikler eklenebilecek kadar modüler olmalıdır.

---

# 2. V2 Temel Prensipleri

V2 geliştirilirken aşağıdaki prensipler değiştirilemez.

## 2.1 Güvenlik önce gelir

Yeni özellik eklemek için güvenlik açığı ertelenmeyecek.

Özellikle:

- API key
- access token
- WhatsApp kimlik bilgileri
- öğrenci bilgileri
- veli telefon numaraları
- PDF dosyaları

korunmalıdır.

---

## 2.2 Renderer güvenilir kabul edilmeyecek

React renderer tarafından gelen hiçbir veri otomatik olarak güvenilir kabul edilmeyecek.

Electron Main Process:

- IPC girdilerini doğrulayacak,
- dosya yollarını kontrol edecek,
- API endpointlerini sınırlandıracak,
- credential işlemlerini yönetecek.

---

## 2.3 Kullanıcı deneyimi güven üzerine kurulacak

Uygulama kullanıcıya yalnızca:

> "Gönderiliyor"

dememeli.

Şunları açıkça göstermeli:

- Kaç öğrenci var?
- Kaç PDF bulundu?
- Kaç PDF eşleşti?
- Kaç eşleşme güvenilir?
- Kaç telefon numarası geçerli?
- Kaç gönderim hazır?
- Kaç problem var?
- Hangi öğrenciler manuel kontrol istiyor?

---

## 2.4 Otomasyon hatadan daha önemli değildir

Özellikle PDF eşleştirme konusunda:

> Yanlış kişiye otomatik gönderim yapmak, eşleştirmenin başarısız olmasından daha kötüdür.

Bu nedenle düşük güvenli eşleşmeler otomatik gönderilmeyecek.

---

## 2.5 Mevcut çalışan özellikler gereksiz yere yeniden yazılmayacak

Mevcut projede çalışan ve doğru mimari üzerinde bulunan özellikler korunacak.

Özellikle:

- Provider abstraction
- PDF matching
- Manual matching
- Sender Queue
- Retry
- Pause / Resume
- History
- Templates
- OpenWA provider
- Meta Cloud provider
- WhatsApp Web assisted provider

tamamen çöpe atılmayacak.

Gerekli yerlerde refactor edilecek.

---

# 3. V2 Ana Kullanıcı Akışı

V2'nin ana kullanıcı akışı:

```text
1. Öğrencileri kontrol et
        ↓
2. PDF klasörünü seç
        ↓
3. PDF'leri tara
        ↓
4. Öğrenci ↔ PDF eşleştir
        ↓
5. Eşleşmeleri kontrol et
        ↓
6. Telefon numaralarını doğrula
        ↓
7. Mesaj şablonunu seç
        ↓
8. Gönderim öncesi kontrol
        ↓
9. WhatsApp bağlantısını kontrol et
        ↓
10. Gönder
        ↓
11. Teslimat durumlarını takip et
        ↓
12. Gönderim raporu oluştur
```

Bu akış uygulamanın merkezidir.

Yeni özellikler bu akışı gereksiz şekilde karmaşıklaştırmamalıdır.

---

# 4. Öncelik Sistemi

Görevler dört seviyeye ayrılır.

### P0 — Kritik

Güvenlik, veri bütünlüğü veya yanlış gönderim riskini etkiler.

V2 yayınından önce tamamlanmalıdır.

### P1 — Önemli

Uygulamanın profesyonel ve güvenilir kullanılmasını sağlar.

### P2 — Geliştirme

V2 sonrasında veya V2'nin son aşamasında yapılabilir.

### P3 — Gelecek

Şimdilik uygulanmayacak.

---

# 5. FAZ 0 — Mevcut Sistemin Dondurulması

## Amaç

Yeni özellik eklemeden mevcut sistemin stabil bir referans noktasını oluşturmak.

### Yapılacaklar

- [ ] Mevcut branch/tag oluştur
- [ ] Mevcut uygulamanın build alınması
- [ ] Mevcut özelliklerin listelenmesi
- [ ] Kritik bugların listelenmesi
- [ ] Mevcut veri formatlarının belgelenmesi
- [ ] Mevcut IPC kanallarının listelenmesi
- [ ] WhatsApp providerlarının belgelenmesi
- [ ] localStorage kullanımının envanterinin çıkarılması
- [ ] secret/credential kullanımının çıkarılması
- [ ] dependency analizi yapılması
- [ ] kullanılmayan dependencylerin belirlenmesi

### Kabul kriteri

V2 geliştirmesine başlamadan önce mevcut V1'in çalışır bir snapshot'ı bulunmalıdır.

---

# 6. FAZ 1 — Güvenlik Hardening

**Öncelik: P0**

Bu faz tamamlanmadan yeni büyük özellik geliştirilmeyecek.

---

## 6.1 Secret Storage

### Mevcut problem

Secret bilgilerin renderer tarafındaki `localStorage` içinde tutulması güvenli değildir.

### Yeni yapı

Secret bilgiler:

```text
React Renderer
      ↓
Secure IPC
      ↓
Electron Main
      ↓
safeStorage / OS Credential Store
```

şeklinde yönetilecek.

### Saklanabilecek secretlar

- OpenWA API key
- Meta access token
- provider credentials
- session credentials
- gelecekteki OAuth credentials

### Kurallar

Renderer:

- token okuyamaz,
- token saklayamaz,
- token loglayamaz,
- token IPC response içinde alamaz.

Renderer yalnızca:

```text
configured: true
configured: false
```

gibi durum bilgisi alabilir.

---

# 7. FAZ 2 — IPC Güvenliği

**Öncelik: P0**

Tüm Electron IPC kanalları incelenecek.

## 7.1 IPC Allowlist

Her IPC kanalı açıkça tanımlanacak.

Örnek:

```text
students:list
students:create
students:update
students:delete

pdf:scan
pdf:match

messages:validate
messages:send

provider:status

settings:get
settings:update

backup:create
backup:restore
```

Renderer'ın rastgele IPC komutu çalıştırması mümkün olmamalıdır.

---

## 7.2 Input Validation

Her IPC isteği doğrulanacak.

Kontrol edilecekler:

- tip
- uzunluk
- enum değerleri
- dosya yolu
- URL
- telefon numarası
- ID
- pagination
- provider
- mesaj içeriği

Mümkünse schema validation kullanılacak.

---

# 8. FAZ 3 — Local Server Güvenliği

**Öncelik: P0**

Mevcut Express server gerekiyorsa yalnızca local makinede dinlemelidir.

### Yanlış

```text
0.0.0.0
```

### Hedef

```text
127.0.0.1
```

Ayrıca:

- endpoint allowlist
- request validation
- method allowlist
- URL validation
- SSRF koruması
- timeout
- payload limit
- hata mesajı sanitization

uygulanmalıdır.

---

# 9. FAZ 4 — Veri Mimarisi

**Öncelik: P0 → P1**

V2'de localStorage ana veri tabanı olmaktan çıkarılacak.

## Hedef

SQLite kullanılacak.

Önerilen yapı:

```text
database/
├── students
├── templates
├── send_jobs
├── send_attempts
├── message_history
├── settings
└── app_metadata
```

---

# 10. Öğrenci Veri Modeli

Örnek:

```text
students
---------
id
student_number
first_name
last_name
parent_name
phone
email
class_name
active
created_at
updated_at
```

Telefon numarası normalized formatta tutulmalıdır.

Örneğin:

```text
+905xxxxxxxxx
```

---

# 11. Send Job Veri Modeli

Her gönderim bağımsız bir job olarak tutulmalıdır.

```text
send_jobs
---------
id
student_id
pdf_id
provider
template_id
status
idempotency_key
created_at
started_at
completed_at
```

---

# 12. Send Attempt Veri Modeli

Bir job birden fazla deneme yapabilir.

```text
send_attempts
-------------
id
job_id
attempt_number
started_at
finished_at
status
provider_message_id
error_code
error_message
```

Bu yapı retry ve audit sistemi için kullanılacaktır.

---

# 13. FAZ 5 — Backup Sistemi

**Öncelik: P0**

Backup sistemi güvenli ve versiyonlanabilir hale getirilecek.

Her backup:

```json
{
  "schemaVersion": 1,
  "appVersion": "...",
  "exportedAt": "...",
  "students": [],
  "templates": [],
  "history": []
}
```

formatına sahip olacak.

### Backup kuralları

- Secretlar varsayılan olarak export edilmeyecek.
- Import sırasında schema doğrulanacak.
- Bozuk backup reddedilecek.
- Eski schema sürümleri migration ile desteklenecek.
- Import öncesi mevcut veri backup'lanabilecek.

---

# 14. FAZ 6 — Telefon Numarası Normalizasyonu

**Öncelik: P0**

Farklı formatlar:

```text
0532 123 45 67
05321234567
+90 532 123 45 67
905321234567
```

tek formata dönüştürülecek:

```text
+905321234567
```

### Kontroller

- ülke kodu
- minimum/maksimum uzunluk
- geçersiz karakterler
- eksik numara
- duplicate numara

Gönderim başlamadan önce geçersiz numaralar listelenecek.

---

# 15. FAZ 7 — PDF Matching V2

**Öncelik: P0**

Mevcut PDF matching sistemi korunacak fakat daha güvenli hale getirilecek.

---

## 15.1 Confidence sistemi

Önerilen:

```text
95–100  → Otomatik eşleşme
85–94   → Kullanıcı kontrolü
70–84   → Manuel eşleştirme
0–69    → Eşleşmedi
```

### Kritik kural

```text
confidence < 95
```

olan PDF otomatik gönderime giremez.

---

## 15.2 İsim normalizasyonu

Türkçe karakterler normalize edilecek:

```text
ç → c
ğ → g
ı → i
ö → o
ş → s
ü → u
```

Ancak orijinal isim hiçbir zaman değiştirilmemelidir.

Normalization yalnızca matching sırasında kullanılmalıdır.

---

## 15.3 Context-aware matching

Sadece:

```text
isim bulundu
```

mantığı kullanılmamalı.

Mümkün olduğunca:

```text
Öğrenci Adı
Öğrenci Soyadı
Öğrenci No
Sınıf
```

gibi alanların birlikte değerlendirilmesi gerekir.

---

## 15.4 Duplicate name problemi

Aynı isimli öğrenciler için:

```text
Ayşe Yılmaz
Ayşe Yılmaz
```

yalnızca isim üzerinden otomatik eşleşme yapılmayacak.

Öğrenci numarası veya başka bir güvenilir identifier tercih edilecek.

---

# 16. FAZ 8 — PDF OCR

**Öncelik: P2**

Mevcut text extraction sistemi gerçek OCR olarak adlandırılmayacak.

UI'da:

> PDF İçerik Taraması

ifadesi kullanılabilir.

Gelecekte:

```text
PDF text layer
      ↓
Text extraction
      ↓
Başarısız
      ↓
OCR
```

fallback sistemi eklenebilir.

OCR V2'nin ilk release kriteri değildir.

---

# 17. FAZ 9 — Queue Güvenilirliği

**Öncelik: P0**

Mevcut queue sistemi korunacak ve güçlendirilecek.

Desteklenecek durumlar:

```text
pending
validating
sending
success
failed
unknown
partial
retrying
paused
cancelled
```

---

# 18. Unknown Delivery State

En önemli V2 değişikliklerinden biridir.

Örneğin:

```text
PDF gönderildi
↓
WhatsApp server cevap vermeden bağlantı koptu
```

Bu durumda:

```text
failed
```

demek yanlış olabilir.

Çünkü mesaj gerçekten gönderilmiş olabilir.

Bu durumda:

```text
unknown
```

durumu kullanılmalıdır.

Kullanıcıya:

> Gönderim sonucu doğrulanamadı.

gösterilir.

---

# 19. Idempotency

Retry sistemi duplicate mesaj üretmemelidir.

Her job için unique idempotency key oluşturulmalıdır.

Örneğin:

```text
studentId
+
documentHash
+
templateId
+
sendSessionId
```

kombinasyonundan deterministik veya benzersiz bir job kimliği üretilebilir.

Aynı job tekrar çalıştırıldığında sistem önce önceki denemeyi kontrol etmelidir.

---

# 20. Retry Politikası

Retry her hatada otomatik yapılmamalıdır.

### Retry yapılabilir

- network timeout
- temporary provider error
- rate limit
- connection reset

### Retry yapılmamalı

- invalid phone
- invalid token
- unauthorized
- invalid template
- file not found
- matching error

---

# 21. FAZ 10 — WhatsApp Provider Mimarisi

Mevcut Provider abstraction korunacak.

Önerilen:

```text
WhatsAppProvider
├── MetaCloudProvider
├── OpenWAProvider
└── AssistedWhatsAppWebProvider
```

---

# 22. WhatsApp Web Provider

Mevcut WhatsApp Web entegrasyonu gerçek API otomasyonu gibi gösterilmemelidir.

UI adı:

> Yardımlı Gönderim

olmalıdır.

Bağlantı durumu:

```text
connected
```

şeklinde sahte olarak verilmemeli.

Örneğin:

```text
ready
assisted
requires_user_action
not_available
```

gibi daha doğru durumlar kullanılabilir.

---

# 23. Meta Cloud API

Meta Cloud API için:

- access token secure storage'da tutulacak,
- token renderer'a gönderilmeyecek,
- template ID desteklenecek,
- template variables desteklenecek,
- customer service window kuralları dikkate alınacak,
- provider response kayıt altına alınacak,
- message ID saklanacak.

Uygulama içindeki genel mesaj şablonları ile Meta tarafından onaylanmış WhatsApp template'leri birbirinden ayrılmalıdır.

---

# 24. OpenWA

OpenWA için:

- endpoint allowlist
- API key secure storage
- timeout
- retry policy
- response validation
- error mapping
- session state

uygulanmalıdır.

Renderer doğrudan OpenWA endpointi seçmemelidir.

---

# 25. FAZ 11 — Gönderim Öncesi Kontrol

**Öncelik: P0**

Gönder butonuna basıldığında doğrudan gönderim başlamamalıdır.

Önce:

# Gönderime Hazır mısınız?

ekranı açılmalıdır.

Örnek:

```text
Öğrenci                 10
PDF                      10
Güvenli eşleşme           9
Kontrol gereken           1
Geçersiz telefon          0
Mesaj hazır              10
WhatsApp bağlantısı       ✓
```

Sonuç:

```text
9 gönderim hazır
1 öğrenci kontrol bekliyor
```

Kullanıcı isterse problemli öğrenciyi düzeltmelidir.

---

# 26. Test Gönderimi

**Öncelik: P1**

Kullanıcı:

> Test Gönder

butonuyla kendi numarasına test mesajı gönderebilmelidir.

Test:

- gerçek öğrenci verisi kullanmamalı,
- örnek PDF kullanmalı,
- gerçek gönderim kuyruğuna dahil olmamalı.

---

# 27. FAZ 12 — Template Sistemi

Mevcut template editor korunacak.

Ancak template sistemi ikiye ayrılabilir:

```text
Application Templates
Meta WhatsApp Templates
```

Application template:

```text
Merhaba {{veli_adi}},
{{ogrenci_adi}} öğrencimizin sınav sonucu ekte...
```

Meta template:

```text
approved_template_id
variables
```

şeklinde tutulabilir.

---

# 28. FAZ 13 — Gönderim Geçmişi

History yalnızca:

> başarıyla gönderildi

listesi olmamalıdır.

Her kayıt:

```text
Öğrenci
Telefon
PDF
Provider
Mesaj
Başlangıç
Bitiş
Deneme sayısı
Sonuç
Hata
Provider Message ID
```

bilgilerini içerebilir.

---

# 29. FAZ 14 — Audit Log

**Öncelik: P1**

Önemli işlemler kaydedilebilir:

```text
student_created
student_updated
student_deleted

pdf_matched
pdf_rematched

send_started
send_completed
send_failed
send_unknown

backup_created
backup_restored

settings_changed
provider_changed
```

Audit log kullanıcıya gösterilecek history'den ayrı tutulmalıdır.

---

# 30. FAZ 15 — Öğrenci Yönetimi

Student Management korunacak.

Eklenmesi önerilenler:

- duplicate detection
- phone validation
- search
- filtering
- sorting
- CSV import
- CSV export
- inactive student
- bulk update

---

# 31. CSV / Excel Import

**Öncelik: P1**

Örnek:

```text
Öğrenci No
Ad
Soyad
Veli
Telefon
Sınıf
```

import edilebilmelidir.

Import sırasında:

- kolon eşleştirme
- duplicate kontrolü
- telefon normalization
- hatalı satır raporu

yapılmalıdır.

---

# 32. FAZ 16 — Ana Dashboard UX

V2 ana ekranı yoğun admin panel görünümünden çıkarılmalıdır.

Ana hedef:

> Hazırla → Kontrol Et → Gönder

---

## Ana ekran

Üst bölüm:

```text
Vatsap

WhatsApp
● Hazır
```

Ana özet:

```text
10 Öğrenci
10 PDF
9 Güvenli Eşleşme
1 Kontrol Gerekiyor
```

Sonrasında:

```text
PDF Klasörü
[ Klasör Seç ]

Mesaj
[ Şablon Seç ]

[ Gönderime Hazırla ]
```

---

# 33. Navigasyon

Önerilen ana navigasyon:

```text
Gönder
Öğrenciler
Geçmiş
```

Ayarlar ayrı bir bölüm olarak açılabilir.

Template yönetimi:

```text
Gönder > Mesaj Şablonu
```

veya

```text
Ayarlar > Şablonlar
```

içinde tutulabilir.

---

# 34. Tasarım Sistemi

V2 tasarım prensipleri:

- sade
- nötr
- güven veren
- profesyonel
- düşük görsel gürültü
- güçlü tipografi
- net hiyerarşi
- minimum dekorasyon

Apple / Notion benzeri sadelik hedeflenebilir.

Kaçınılacak:

- mor/mavi gradient
- gradient text
- aşırı rounded kartlar
- gereksiz shadow
- aşırı glassmorphism
- AI dashboard görünümü
- gereksiz Sparkles ikonları
- emoji tabanlı UI
- her bölümü kart içine alma

---

# 35. Renk Sistemi

Temel UI:

```text
Neutral / White / Black
```

Semantic renkler:

```text
Success → yeşil
Warning → amber
Error → kırmızı
Info → nötr/marka rengi
```

Renkler dekorasyon amacıyla kullanılmayacak.

---

# 36. FAZ 17 — Performans

**Öncelik: P1**

Özellikle PDF işlemlerinde:

- büyük dosyaları aynı anda RAM'e yüklememe,
- batch processing,
- sequential processing,
- progress reporting,
- cancellation,
- memory cleanup

uygulanmalıdır.

Base64 kullanımı gerekiyorsa büyük PDF'lerde memory etkisi dikkate alınmalıdır.

---

# 37. FAZ 18 — Test Sistemi

**Öncelik: P0**

Vitest veya mevcut test altyapısı kullanılabilir.

Minimum test alanları:

### Student

- create
- update
- delete
- duplicate detection

### Phone

- Turkish normalization
- invalid number
- duplicate number

### Matching

- exact match
- fuzzy match
- Turkish characters
- duplicate names
- low confidence
- no match

### Queue

- pending → sending
- sending → success
- sending → failed
- sending → unknown
- retry
- pause
- resume
- cancel
- duplicate protection

### Backup

- valid backup
- invalid backup
- old schema
- missing fields

### Provider

- successful send
- timeout
- unauthorized
- rate limit
- malformed response

---

# 38. FAZ 19 — CI/CD

GitHub Actions kurulacak.

Minimum pipeline:

```text
push
 ↓
install
 ↓
typecheck
 ↓
lint
 ↓
tests
 ↓
build
```

Pull Request:

```text
PR
 ↓
CI
 ↓
tests
 ↓
build
 ↓
merge
```

---

# 39. Dependency Temizliği

Kullanılmayan dependencyler kaldırılmalıdır.

Özellikle:

- kullanılmayan AI SDK
- kullanılmayan animation library
- kullanılmayan spreadsheet dependency
- kullanılmayan utility package

tek tek kontrol edilmelidir.

Dependency sırf gelecekte kullanılabilir diye tutulmamalıdır.

---

# 40. FAZ 20 — Kod Mimarisi Refactor

Büyük `App.tsx` dosyası zamanla küçültülecek.

Önerilen:

```text
src/
├── features/
│   ├── students/
│   ├── pdf-matching/
│   ├── messaging/
│   ├── templates/
│   ├── history/
│   └── settings/
│
├── services/
│   ├── whatsapp/
│   ├── pdf/
│   ├── storage/
│   └── backup/
│
├── domain/
│   ├── student/
│   ├── message/
│   ├── send-job/
│   └── provider/
│
├── components/
├── hooks/
└── utils/
```

Amaç klasör sayısını artırmak değil, sorumlulukları ayırmaktır.

---

# 41. Settings Refactor

Settings tek büyük modal olmaktan çıkarılabilir.

Kategoriler:

```text
WhatsApp
Gönderim
Şablonlar
Gizlilik
Yedekleme
Gelişmiş
Hakkında
```

Secret alanları:

```text
••••••••••
```

şeklinde gösterilmeli.

Renderer tokenın kendisini okumamalıdır.

---

# 42. KVKK ve Veri Saklama

Vatsap öğrenci ve veli bilgileri işlediği için veri minimizasyonu prensibi uygulanmalıdır.

Uygulama:

- gereksiz kişisel veri toplamamalı,
- gereksiz uzun süre saklamamalı,
- kullanıcıya veri silme imkanı vermeli,
- backup konusunda kullanıcıyı bilgilendirmeli,
- PDF cache temizleme özelliğine sahip olmalı.

V2'de ayrıca:

```text
Verileri Temizle
```

özelliği planlanmalıdır.

Bu özellik:

- öğrenciler
- geçmiş
- PDF cache
- loglar
- backup metadata

gibi alanları ayrı ayrı temizleyebilmelidir.

Secretlar normal veri silme mekanizmasından ayrı yönetilmelidir.

---

# 43. FAZ 21 — PDF Cache Yönetimi

PDF'ler geçici olarak işleniyorsa:

```text
scan
 ↓
match
 ↓
send
 ↓
cleanup
```

akışı kullanılmalıdır.

Kullanıcı:

```text
Geçici dosyaları temizle
```

işlemini manuel de başlatabilmelidir.

---

# 44. FAZ 22 — Gönderim Raporu

Gönderim sonunda rapor:

```text
Gönderim tamamlandı

Başarılı       8
Başarısız      1
Kontrol        1
Unknown        0
```

şeklinde gösterilmelidir.

Detay:

```text
Ahmet Yılmaz     ✓
Ayşe Kaya        ✓
Mehmet Demir     ✕ Telefon geçersiz
...
```

CSV export eklenebilir.

---

# 45. FAZ 23 — Auto Update

**Öncelik: P2**

Profesyonel release aşamasında Electron auto-update düşünülebilir.

Öncelikler:

- signed application
- version checking
- update notification
- rollback strategy

Auto-update V2'nin ilk aşaması değildir.

---

# 46. FAZ 24 — İleri Özellikler

Bunlar temel sistem stabil olduktan sonra yapılabilir.

### P2

- OCR
- gelişmiş CSV/Excel import
- gelişmiş raporlar
- istatistikler
- Meta template yönetimi
- delivery webhook
- gelişmiş scheduler

### P3

- çoklu WhatsApp hesapları
- ekip kullanıcıları
- cloud sync
- merkezi yönetim
- web dashboard
- SaaS mimarisi

---

# 47. Scheduler Hakkında

Mevcut küçük kullanıcı hacmi için scheduler kritik değildir.

Bu nedenle:

> Scheduler V2'nin temel özelliği değildir.

Persistent scheduler gerçekten ihtiyaç oluştuğunda eklenmelidir.

---

# 48. V2'de Şimdilik Yapılmayacaklar

Aşağıdaki özellikler roadmap dışına çıkarılmıştır:

- gereksiz AI chatbot
- AI ile otomatik mesaj yazma
- AI dashboard
- gereksiz animasyonlar
- sosyal medya entegrasyonları
- cloud sync
- ekip yönetimi
- SaaS abonelik sistemi
- çoklu tenant
- gereksiz analytics
- gereksiz gamification

Bunlar ürünün ana değerini artırmıyorsa yapılmayacaktır.

---

# 49. V2 Milestone Sıralaması

## Milestone 1 — Security

```text
safeStorage
IPC validation
IPC allowlist
localhost binding
SSRF protection
secret isolation
```

**Çıktı:** Güvenli temel.

---

## Milestone 2 — Data

```text
SQLite
schema
migration
backup validation
phone normalization
```

**Çıktı:** Sağlam veri katmanı.

---

## Milestone 3 — Messaging Reliability

```text
send jobs
attempts
unknown state
idempotency
retry policy
provider state
```

**Çıktı:** Güvenilir gönderim motoru.

---

## Milestone 4 — PDF Reliability

```text
matching confidence
Turkish normalization
duplicate handling
manual review
strict auto-send threshold
```

**Çıktı:** Yanlış PDF gönderme riski azaltılmış sistem.

---

## Milestone 5 — UX

```text
prepare
review
send
report
```

**Çıktı:** Basit ve anlaşılır kullanıcı akışı.

---

## Milestone 6 — Testing

```text
unit tests
integration tests
queue tests
matching tests
backup tests
provider tests
```

**Çıktı:** Regression riski azaltılmış sistem.

---

## Milestone 7 — Release

```text
production build
CI
signed app
release notes
backup migration
```

**Çıktı:** Kullanılabilir V2 release.

---

# 50. V2 Definition of Done

V2 tamamlanmış kabul edilmeden önce aşağıdakilerin tamamı sağlanmalıdır.

## Security

- [ ] Secretlar localStorage'da değil.
- [ ] safeStorage aktif olarak kullanılıyor.
- [ ] Renderer secret alamıyor.
- [ ] IPC validation mevcut.
- [ ] IPC allowlist mevcut.
- [ ] Local server yalnızca localhost'ta.
- [ ] SSRF koruması mevcut.
- [ ] Dosya erişimi sınırlandırılmış.
- [ ] Hassas bilgiler loglanmıyor.

## Data

- [ ] SQLite aktif.
- [ ] Database schema versiyonlu.
- [ ] Migration sistemi mevcut.
- [ ] Backup schema doğrulanıyor.
- [ ] Secretlar backup'a varsayılan olarak dahil değil.
- [ ] Phone normalization mevcut.

## PDF

- [ ] Matching confidence sistemi mevcut.
- [ ] Türkçe normalization mevcut.
- [ ] Duplicate isim kontrolü mevcut.
- [ ] Düşük confidence otomatik gönderilmiyor.
- [ ] Manual matching mevcut.

## Messaging

- [ ] Provider abstraction korunuyor.
- [ ] Meta Cloud provider çalışıyor.
- [ ] OpenWA provider çalışıyor.
- [ ] WhatsApp Web doğru şekilde "yardımlı" olarak tanımlanıyor.
- [ ] Queue state machine mevcut.
- [ ] Unknown state mevcut.
- [ ] Idempotency mevcut.
- [ ] Retry policy mevcut.
- [ ] Duplicate gönderim koruması mevcut.

## UX

- [ ] Gönderim öncesi kontrol ekranı mevcut.
- [ ] Test gönderimi mevcut.
- [ ] Gönderim ilerlemesi anlaşılır.
- [ ] Başarılı/başarısız/unknown durumları net.
- [ ] Final report mevcut.
- [ ] Ana akış sadeleştirilmiş.

## Testing

- [ ] Matching testleri mevcut.
- [ ] Queue testleri mevcut.
- [ ] Phone testleri mevcut.
- [ ] Backup testleri mevcut.
- [ ] Provider testleri mevcut.
- [ ] CI çalışıyor.
- [ ] Production build başarılı.

---

# 51. V2 Başarı Kriterleri

V2'nin başarısı özellik sayısıyla ölçülmeyecek.

Başarı şu kriterlerle ölçülecek:

### 1. Yanlış gönderim

Hedef:

> Otomatik gönderimde yanlış öğrenci/PDF eşleşmesi olmaması.

---

### 2. Secret güvenliği

Hedef:

> API key ve access token renderer/localStorage içerisinde tutulmaması.

---

### 3. Gönderim güvenilirliği

Hedef:

> Network problemi nedeniyle aynı mesajın duplicate gönderilmemesi.

---

### 4. Kullanıcı anlayışı

Kullanıcı uygulamayı açtığında 10 saniye içinde:

- ne yapacağını,
- kaç öğrencinin hazır olduğunu,
- sorun olup olmadığını

anlayabilmelidir.

---

### 5. Recoverability

Uygulama kapanırsa veya bağlantı koparsa:

> İşlemin nerede kaldığı anlaşılabilmeli ve güvenli şekilde devam edilebilmelidir.

---

# 52. Geliştirme Sırasında Değişmez Kurallar

AI coding agent veya geliştirici bu dosyayı uygularken:

1. Roadmap dışında büyük özellik eklememeli.
2. Mevcut çalışan özelliği sebepsiz yere silmemeli.
3. Güvenlik sorunlarını ertelememeli.
4. Secretları renderer'a taşımamalı.
5. localStorage'ı yeni kritik veri için kullanmamalı.
6. Queue sistemini bypass ederek doğrudan mesaj göndermemeli.
7. PDF matching thresholdlarını kullanıcı isteğiyle gevşetmemeli.
8. Unknown delivery durumunu failed olarak göstermemeli.
9. Test yazmadan kritik queue/matching mantığını değiştirmemeli.
10. UI'ı gereksiz şekilde karmaşıklaştırmamalı.
11. AI görünümlü tasarım eklememeli.
12. Yeni dependency eklemeden önce gerçekten gerekli olup olmadığını değerlendirmeli.
13. Her milestone sonunda uygulamanın build alınabilir durumda olması sağlanmalı.

---

# 53. Uygulama Sırası

Geliştirici aşağıdaki sırayı takip etmelidir:

```text
FAZ 0
Mevcut sistemi sabitle
        ↓
FAZ 1
Secret güvenliği
        ↓
FAZ 2
IPC güvenliği
        ↓
FAZ 3
Local server güvenliği
        ↓
FAZ 4
SQLite + data migration
        ↓
FAZ 5
Backup
        ↓
FAZ 6
Phone normalization
        ↓
FAZ 7
PDF matching V2
        ↓
FAZ 8
Queue reliability
        ↓
FAZ 9
WhatsApp provider hardening
        ↓
FAZ 10
Pre-send validation
        ↓
FAZ 11
History + audit
        ↓
FAZ 12
UX redesign
        ↓
FAZ 13
Tests
        ↓
FAZ 14
CI/CD
        ↓
FAZ 15
Production release
```

Bu sıra değiştirilmemelidir; ancak bir fazın teknik bağımlılığı nedeniyle küçük sıralama değişiklikleri gerekiyorsa önceki fazın güvenlik kriterleri korunmalıdır.

---

# 54. Nihai V2 Mimarisi

Hedef mimari:

```text
┌───────────────────────────────────────┐
│              React UI                 │
│                                       │
│ Students / PDF / Review / Send       │
└──────────────────┬────────────────────┘
                   │
              Secure IPC
                   │
┌──────────────────▼────────────────────┐
│          Electron Main Process        │
│                                       │
│ Validation                            │
│ Provider orchestration                │
│ File access                           │
│ Secret management                     │
│ Queue                                 │
└─────────────┬─────────────┬───────────┘
              │             │
       ┌──────▼─────┐ ┌────▼───────────┐
       │   SQLite   │ │  safeStorage    │
       │            │ │                 │
       │ App data   │ │ API credentials │
       └────────────┘ └─────────────────┘
              │
       ┌──────▼─────────────────────────┐
       │       WhatsApp Layer           │
       │                                │
       │ Meta Cloud                     │
       │ OpenWA                         │
       │ Assisted Web                   │
       └────────────────────────────────┘
```

---

# 55. V2'nin Ana Ürün Tanımı

V2 yalnızca:

> "WhatsApp üzerinden PDF gönderen uygulama"

olarak düşünülmemelidir.

Daha doğru ürün tanımı:

> **Öğrenci sonuçlarını güvenli şekilde eşleştirip WhatsApp üzerinden göndermeye yardımcı olan masaüstü dağıtım asistanı.**

Temel değer zinciri:

```text
Öğrenciler
     ↓
PDF'ler
     ↓
Akıllı eşleştirme
     ↓
İnsan kontrolü
     ↓
Güvenli gönderim
     ↓
Teslimat takibi
     ↓
Rapor
```

V2'nin bütün teknik ve tasarım kararları bu zinciri desteklemelidir.

---

# 56. Son Kontrol

V2 geliştirmesinde herhangi bir yeni özellik önerildiğinde şu sorular sorulmalıdır:

### Kullanıcı açısından

> Bu özellik ana işi daha kolay mı yapıyor?

### Güvenlik açısından

> Yeni bir veri veya saldırı yüzeyi oluşturuyor mu?

### Mühendislik açısından

> Mevcut mimariyi sadeleştiriyor mu, karmaşıklaştırıyor mu?

### Tasarım açısından

> Ana akışı daha anlaşılır mı yapıyor?

### Ürün açısından

> Gerçek kullanıcı ihtiyacı mı, yoksa sadece özellik eklemek için mi ekleniyor?

Bu soruların cevabı olumlu değilse özellik V2'ye eklenmemelidir.

---

# 57. Sonuç

Vatsap V2'nin önceliği:

```text
Daha fazla özellik
        ❌

Daha fazla otomasyon
        ❌

Daha fazla AI
        ❌


Daha güvenli
Daha doğru
Daha anlaşılır
Daha dayanıklı
Daha sürdürülebilir
        ✓
```

V2'nin temel hedefi:

> **Kullanıcının yanlış kişiye yanlış dosya gönderme korkusu yaşamadan, birkaç adımda güvenilir şekilde öğrenci sonuçlarını gönderebilmesi.**