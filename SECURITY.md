# Vatsap — Security Standard

> **Belge:** `SECURITY.md`  
> **Kapsam:** Vatsap V2  
> **Durum:** Zorunlu güvenlik standardı  
> **Amaç:** Öğrenci, veli, PDF ve WhatsApp verilerinin güvenli işlenmesi; Electron uygulamasının saldırı yüzeyinin azaltılması; yanlış veri paylaşımı ve yetkisiz gönderim risklerinin önlenmesi.

---

# 1. Bu Belgenin Amacı

Vatsap; öğrenci bilgileri, veli bilgileri, telefon numaraları, PDF dosyaları, sınav sonuçları, WhatsApp kimlik bilgileri ve mesaj içerikleri işleyebilen bir masaüstü uygulamasıdır.

Bu nedenle güvenlik yalnızca:

```text
API key'i gizlemek
```

anlamına gelmez.

Vatsap için güvenlik şu alanların tamamını kapsar:

```text
Uygulama güvenliği
+
Electron güvenliği
+
IPC güvenliği
+
Dosya sistemi güvenliği
+
Credential güvenliği
+
WhatsApp güvenliği
+
PDF güvenliği
+
Kişisel veri güvenliği
+
Veri tabanı güvenliği
+
Backup güvenliği
+
Log güvenliği
+
Queue güvenliği
+
Network güvenliği
+
Supply-chain güvenliği
+
Güncelleme güvenliği
```

Bu dosyadaki kritik kurallar V2 geliştirmesinde isteğe bağlı değildir.

---

# 2. Güvenlik Öncelikleri

Vatsap için güvenlik öncelikleri aşağıdaki sıradadır:

```text
1. Yanlış kişiye veri gönderilmesini önlemek
2. Secret / credential bilgilerinin korunması
3. Renderer → Main saldırı yüzeyini azaltmak
4. Dosya sistemi erişimini sınırlandırmak
5. Network / SSRF risklerini azaltmak
6. Öğrenci ve veli verilerini korumak
7. Duplicate / yanlış WhatsApp gönderimlerini önlemek
8. Backup ve log güvenliği
9. Dependency / supply-chain güvenliği
10. Güncelleme ve release güvenliği
```

---

# 3. Güvenlik Felsefesi

Vatsap aşağıdaki güvenlik prensiplerini kullanmalıdır:

## 3.1 Least Privilege

Her bileşen yalnızca ihtiyaç duyduğu yetkiye sahip olmalıdır.

Örneğin:

```text
React Renderer
```

API token okuyamamalıdır.

---

## 3.2 Zero Trust Between Processes

Renderer güvenilir bir backend gibi kabul edilmemelidir.

Renderer'dan gelen her veri:

```text
untrusted input
```

olarak değerlendirilmelidir.

---

## 3.3 Secure by Default

Varsayılan yapı güvenli olmalıdır.

Örneğin:

```text
Secret export → kapalı
LAN server → kapalı
Debug logging → kapalı
Auto-send low confidence → kapalı
Unknown retry → kapalı
```

Kullanıcının ayrıca güvenliği açması gerekmemelidir.

---

## 3.4 Fail Closed

Bir işlem doğrulanamıyorsa sistem güvenli tarafta durmalıdır.

Örneğin:

```text
PDF eşleşmesi doğrulanamadı
        ↓
Gönderme
```

ve:

```text
Gönderimin başarılı olup olmadığı bilinmiyor
        ↓
Otomatik retry yapma
```

---

# 4. Tehdit Modeli

Vatsap aşağıdaki tehditleri dikkate almalıdır.

## 4.1 Yerel Saldırgan

Bilgisayara fiziksel veya kullanıcı hesabı seviyesinde erişebilen kişi.

Riskler:

- localStorage okuma
- SQLite dosyasını kopyalama
- backup dosyasını alma
- logları okuma
- Electron IPC'yi manipüle etme
- uygulama dosyalarını değiştirme

---

## 4.2 Kötü Amaçlı Dosya

Kullanıcının seçtiği PDF klasöründe kötü amaçlı veya bozuk PDF bulunabilir.

Riskler:

- parser exploit
- memory exhaustion
- çok büyük dosya
- path manipulation
- malformed PDF
- decompression bomb benzeri kaynak tüketimi

---

## 4.3 Kötü Amaçlı Network Endpoint

OpenWA veya başka bir provider endpointi kötüye kullanılabilir.

Riskler:

- SSRF
- internal network scan
- localhost servislerine erişim
- metadata endpoint erişimi
- credential leakage

---

## 4.4 Kötü Amaçlı Renderer Input

Renderer üzerinden:

- URL
- dosya yolu
- öğrenci ID
- provider
- IPC parametresi

manipüle edilebilir.

---

## 4.5 Ele Geçirilmiş Credential

Bir API token veya API key ele geçirilirse saldırgan:

- WhatsApp mesajı gönderebilir,
- API kullanımını kötüye kullanabilir,
- maliyet oluşturabilir,
- hesabı abuse edebilir.

Bu nedenle credentialların renderer'a verilmemesi gerekir.

---

# 5. Güvenlik Sınırları

Vatsap aşağıdaki güvenlik sınırlarına ayrılmalıdır:

```text
┌───────────────────────────────┐
│ Renderer                      │
│ React / UI                    │
│                               │
│ Güvenilmez input              │
└───────────────┬───────────────┘
                │
             Secure IPC
                │
┌───────────────▼───────────────┐
│ Electron Main                 │
│                               │
│ Validation                    │
│ File access                   │
│ Secrets                       │
│ Providers                     │
│ Queue                         │
└───────────┬───────────┬───────┘
            │           │
       ┌────▼────┐ ┌────▼─────┐
       │ SQLite  │ │ Secrets  │
       │         │ │ Storage  │
       └─────────┘ └──────────┘
```

Renderer ile Main arasındaki sınır kritik güvenlik sınırıdır.

---

# 6. Electron Güvenlik Standardı

`BrowserWindow` aşağıdaki temel güvenlik özelliklerini korumalıdır:

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}
```

Bu ayarlar gerekçesiz şekilde kapatılmamalıdır.

---

# 7. Node Integration

Aşağıdaki kullanım yasaktır:

```ts
nodeIntegration: true
```

Renderer'ın doğrudan:

```ts
require(...)
```

veya Node API'lerine erişmesi engellenmelidir.

---

# 8. Context Isolation

Aşağıdaki yapı korunmalıdır:

```ts
contextIsolation: true
```

Renderer ile preload/Main dünyaları birbirinden izole edilmelidir.

---

# 9. Sandbox

Mümkün olduğunca:

```ts
sandbox: true
```

kullanılmalıdır.

Sandbox yalnızca teknik bir engel değil, renderer compromise durumunda hasarı sınırlayan savunma katmanıdır.

---

# 10. Remote Content

Vatsap renderer içine rastgele remote web sitesi yüklememelidir.

Kaçınılacak:

```ts
window.location = externalUrl
```

ve:

```ts
mainWindow.loadURL(userProvidedUrl)
```

gibi yapılar.

Uygulama UI'sı güvenilir local build üzerinden yüklenmelidir.

---

# 11. External Links

Kullanıcı bir web bağlantısına tıklarsa:

```text
Electron renderer
        ↓
validated URL
        ↓
system browser
```

şeklinde açılmalıdır.

Arbitrary URL'nin uygulama içinde render edilmesine izin verilmemelidir.

---

# 12. Preload Güvenliği

`preload.cjs` yalnızca gerekli API'leri expose etmelidir.

Yanlış:

```ts
contextBridge.exposeInMainWorld("electron", {
  ipcRenderer
});
```

Bu yapı renderer'a fazla yetki verir.

Doğru yaklaşım:

```ts
contextBridge.exposeInMainWorld("vatsap", {
  students: {
    list: () => ipcRenderer.invoke("students:list"),
    create: (data) => ipcRenderer.invoke("students:create", data)
  },

  messages: {
    validate: (data) => ipcRenderer.invoke("messages:validate", data),
    send: (data) => ipcRenderer.invoke("messages:send", data)
  }
});
```

Renderer doğrudan `ipcRenderer` almamalıdır.

---

# 13. IPC Allowlist

Her IPC kanalı açıkça tanımlanmalıdır.

Örnek:

```text
students:list
students:create
students:update
students:delete

pdf:scan
pdf:match
pdf:read

messages:validate
messages:send
messages:cancel

queue:pause
queue:resume
queue:retry

provider:status

settings:get
settings:update

backup:create
backup:restore
```

Bilinmeyen IPC channel reddedilmelidir.

---

# 14. IPC Input Validation

IPC güvenlik sınırıdır.

Aşağıdaki yaklaşım yasaktır:

```ts
ipcMain.handle("send", (_, data) => {
  return sendMessage(data);
});
```

Eğer `data` doğrulanmıyorsa renderer istediği alanları gönderebilir.

Her handler:

```text
Receive
 ↓
Validate
 ↓
Normalize
 ↓
Authorize
 ↓
Execute
 ↓
Sanitize response
```

akışını kullanmalıdır.

---

# 15. IPC Schema Validation

Mümkünse IPC payloadları schema ile doğrulanmalıdır.

Örnek:

```text
studentId → string
phone → normalized phone
provider → enum
templateId → valid ID
pdfId → valid ID
```

Bilinmeyen alanlar mümkünse reddedilmelidir.

---

# 16. Dosya Yolu Güvenliği

Renderer'dan gelen dosya yolları güvenilir değildir.

Örneğin:

```text
../../secret.txt
```

gibi path traversal denenebilir.

Path işlemleri:

```text
resolve
normalize
validate
```

sırasıyla yapılmalıdır.

---

# 17. PDF Klasörü Güvenliği

Kullanıcı bir PDF klasörü seçtiğinde uygulama:

1. absolute path oluşturmalı,
2. path'i normalize etmeli,
3. klasör olduğunu doğrulamalı,
4. dosyaları filtrelemeli,
5. yalnızca izin verilen dosya tiplerini işlemeli.

Örneğin:

```text
.pdf
```

dışındaki dosyalar varsayılan olarak işlenmemelidir.

---

# 18. Arbitrary File Read

Renderer'a:

```text
readFile(path)
```

gibi genel bir API verilmemelidir.

Özellikle mevcut yapıda PDF base64 okuma işlemleri sınırlandırılmalıdır.

İdeal yapı:

```text
User-selected PDF
        ↓
Main process validation
        ↓
PDF parser
```

Renderer istediği sistem dosyasını okuyamamalıdır.

---

# 19. PDF Güvenliği

PDF dosyaları güvenilmeyen input kabul edilmelidir.

Kontroller:

- dosya uzantısı
- MIME/type
- dosya boyutu
- parse başarısı
- timeout
- memory kullanımı
- hata yönetimi

uygulanmalıdır.

---

# 20. PDF Boyut Limiti

Aşırı büyük PDF'ler uygulamanın RAM'ini tüketebilir.

Bir maksimum dosya boyutu belirlenmelidir.

Örneğin:

```text
MAX_PDF_SIZE
```

config üzerinden tanımlanabilir.

Limit kullanıcı ihtiyacına göre belirlenmeli ancak sınırsız bırakılmamalıdır.

---

# 21. PDF Base64 Kullanımı

Base64 binary veriyi yaklaşık olarak daha büyük hale getirir.

Bu nedenle:

```text
10 MB PDF
```

işlenirken bellekte daha yüksek kullanım oluşabilir.

Büyük dosyalar mümkün olduğunca:

```text
stream
veya
temporary file
```

üzerinden işlenmelidir.

Tüm PDF'leri aynı anda RAM'e yüklemekten kaçınılmalıdır.

---

# 22. Temporary Files

Geçici PDF veya upload dosyaları:

- uygulama tarafından oluşturulmalı,
- tahmin edilebilir isim kullanılmamalı,
- işlem sonunda silinmeli,
- mümkünse application-specific temporary directory kullanılmalı.

Örneğin:

```text
temp/vatsap/<job-id>/
```

---

# 23. Temporary File Cleanup

Gönderim tamamlandığında:

```text
success
failed
cancelled
```

durumlarının tamamında cleanup çalışmalıdır.

`unknown` durumunda ise veri kaybına neden olmayacak şekilde kontrollü cleanup uygulanmalıdır.

---

# 24. Secret Management

Secret bilgiler aşağıdaki kategorilere ayrılır:

```text
OpenWA API Key
Meta Access Token
Provider Credentials
Session Secrets
OAuth Tokens
Future API Credentials
```

Bunların hiçbirisi normal application state olarak tutulmamalıdır.

---

# 25. localStorage Güvenlik Kuralı

Aşağıdaki bilgiler `localStorage` içine yazılmamalıdır:

```text
API key
Access token
Refresh token
Password
Session secret
Private key
Cookie
WhatsApp authentication secret
```

Mevcut `storageService` içindeki config yapısı bu nedenle refactor edilmelidir.

---

# 26. safeStorage Kullanımı

Electron `safeStorage` kullanılmalıdır.

Önerilen yapı:

```text
React
 ↓
settings:setCredential
 ↓
IPC
 ↓
Electron Main
 ↓
safeStorage.encryptString()
 ↓
OS-protected storage
```

Okuma:

```text
React
 ↓
provider:status / send
 ↓
Main
 ↓
safeStorage.decryptString()
 ↓
Provider
```

Token renderer'a geri gönderilmez.

---

# 27. Secret API Tasarımı

Renderer'ın:

```text
getMetaToken()
```

gibi bir API çağırmasına izin verilmemelidir.

Bunun yerine:

```text
hasMetaCredential()
```

veya:

```text
setMetaCredential()
clearMetaCredential()
```

gibi işlemler kullanılabilir.

Örneğin UI:

```text
Meta Cloud API
● Yapılandırıldı

[Tokenu Değiştir]
[Tokenu Sil]
```

şeklinde çalışmalıdır.

---

# 28. Secret Logging Yasağı

Şunlar loglanmamalıdır:

```text
Authorization header
Bearer token
API key
Cookie
Session ID
Refresh token
Private credential
```

Örneğin:

```ts
console.log(response);
```

kullanımı bile provider response credential içeriyorsa risklidir.

---

# 29. Error Message Güvenliği

Kullanıcıya:

```text
ENOENT /Users/.../secret/path
```

gibi hassas filesystem bilgileri gösterilmemelidir.

Provider hataları da kontrollü şekilde map edilmelidir.

Örneğin:

```text
TOKEN_INVALID
RATE_LIMITED
NETWORK_ERROR
INVALID_PHONE
INVALID_TEMPLATE
UNKNOWN_PROVIDER_ERROR
```

---

# 30. Log Güvenliği

Log sistemi:

```text
DEBUG
INFO
WARN
ERROR
```

seviyelerine ayrılabilir.

Production'da:

```text
DEBUG = kapalı
```

olmalıdır.

---

# 31. Hassas Veri Maskesi

Log veya hata raporunda:

```text
+905321234567
```

yerine gerekirse:

```text
+90532*****67
```

kullanılabilir.

Öğrenci adı gerekiyorsa:

```text
A**** Y*****
```

gibi maskelenebilir.

---

# 32. Production Debug Yasağı

Production build içinde:

```text
API response dump
PDF text dump
student database dump
token dump
```

olmamalıdır.

---

# 33. OpenWA Proxy Güvenliği

OpenWA proxy kritik bir saldırı yüzeyidir.

Özellikle:

```text
renderer → arbitrary URL → main → fetch
```

yapısı SSRF riskidir.

---

# 34. SSRF Koruması

Renderer'ın istediği herhangi bir URL'ye request yapılmamalıdır.

Yanlış:

```text
fetch(userProvidedUrl)
```

Doğru:

```text
provider action
        ↓
known endpoint
        ↓
validated base URL
        ↓
request
```

---

# 35. OpenWA Endpoint Allowlist

Örneğin yalnızca belirli endpointler:

```text
/session/*
/messages/send-text
/messages/send-document
/messages/status
```

gibi izinli olabilir.

Gerçek endpointler OpenWA sürümüne göre doğrulanmalıdır.

Renderer endpoint path'i istediği gibi belirlememelidir.

---

# 36. OpenWA Base URL

Base URL kullanıcı tarafından değiştirilebiliyorsa:

- URL parse edilmeli,
- protocol kontrol edilmeli,
- host kontrol edilmeli,
- port kontrol edilmeli,
- localhost/private network kuralları uygulanmalı.

Advanced mode dışında kullanıcıdan serbest URL almak mümkün olduğunca engellenmelidir.

---

# 37. Localhost Binding

Vatsap'ın local server'ı:

```text
127.0.0.1
```

üzerinden çalışmalıdır.

Aşağıdaki varsayılan olarak kullanılmamalıdır:

```text
0.0.0.0
```

Çünkü bu servis LAN üzerindeki diğer cihazlardan erişilebilir hale gelebilir.

---

# 38. Local Server Authentication

Local server gerekli değilse kaldırılması tercih edilir.

Gerekliyse:

- random local auth token,
- origin validation,
- method allowlist,
- endpoint allowlist,
- rate limiting

gibi ek korumalar değerlendirilebilir.

---

# 39. CORS

CORS güvenlik mekanizması olarak tek başına kullanılmamalıdır.

Ancak server varsa yalnızca uygulamanın ihtiyaç duyduğu originlere izin verilmelidir.

Örneğin:

```text
file://
```

veya uygulamanın gerçek local origin'i.

`*` gereksiz yere kullanılmamalıdır.

---

# 40. Network Timeout

Provider requestleri sonsuza kadar beklememelidir.

Her request:

```text
timeout
```

ile sınırlandırılmalıdır.

Örneğin:

```text
connect timeout
request timeout
upload timeout
```

ayrı değerlendirilebilir.

---

# 41. Rate Limit

Provider API rate limit döndürürse:

```text
429
```

otomatik agresif retry yapılmamalıdır.

Backoff kullanılmalıdır.

Örneğin:

```text
1s
2s
4s
8s
```

ve maksimum retry sayısı.

---

# 42. Retry Güvenliği

Retry mekanizması duplicate mesaj üretebilir.

Örnek:

```text
WhatsApp
  ↓
message accepted
  ↓
network connection lost
  ↓
Vatsap response alamadı
  ↓
failed?
```

Bu durumda doğrudan retry yapmak tehlikelidir.

Durum:

```text
unknown
```

olmalıdır.

---

# 43. Idempotency

Her send job benzersiz bir kimliğe sahip olmalıdır.

Örnek:

```text
jobId
idempotencyKey
attemptId
providerMessageId
```

saklanmalıdır.

Aynı job'ın tekrar çalıştırılması öncesinde sistem mevcut durumu kontrol etmelidir.

---

# 44. Duplicate Send Protection

Aşağıdaki kombinasyon duplicate korumasında kullanılabilir:

```text
studentId
+
documentHash
+
templateId
+
sendSessionId
```

Ancak iş kuralına göre tasarlanmalıdır.

Aynı öğrenciye gerçekten yeni PDF gönderilecekse sistem bunu duplicate sanmamalıdır.

Bu nedenle yalnızca:

```text
studentId
```

üzerinden duplicate engellemek yanlıştır.

---

# 45. Unknown State

Gönderim sonucunun doğrulanamadığı durum:

```text
unknown
```

olmalıdır.

UI:

> Gönderim sonucu doğrulanamadı. Tekrar göndermeden önce geçmiş durumu kontrol edin.

demelidir.

Otomatik retry varsayılan olarak yapılmamalıdır.

---

# 46. Queue State Machine

Queue state'leri kontrollü geçiş yapmalıdır.

Örneğin:

```text
pending
   ↓
validating
   ↓
sending
   ├──→ success
   ├──→ failed
   └──→ unknown
```

Retry:

```text
failed
 ↓
retrying
 ↓
sending
```

Unknown:

```text
unknown
 ↓
manual review
```

---

# 47. Queue Manipulation

Renderer:

```text
queue:sendDirectly
```

gibi kontrolsüz bir API kullanmamalıdır.

Gönderim yalnızca validated `send_job` üzerinden yapılmalıdır.

---

# 48. PDF Matching Güvenliği

PDF matching yalnızca doğruluk özelliği değildir.

Aynı zamanda privacy/security özelliğidir.

Yanlış eşleşme:

```text
Ahmet'in sınav sonucu
        ↓
Mehmet'in velisine
```

gibi ciddi veri ihlaline dönüşebilir.

---

# 49. Auto-Match Threshold

Önerilen:

```text
95–100
→ otomatik

85–94
→ kullanıcı kontrolü

70–84
→ manuel

<70
→ eşleşmedi
```

Kritik kural:

```text
95 altı → otomatik gönderme yok
```

Bu threshold kullanıcı tarafından kolayca düşürülememelidir.

---

# 50. Matching Explainability

Kullanıcı eşleşmenin neden yapıldığını görebilmelidir.

Örneğin:

```text
Ahmet Yılmaz

Güven: %98

Öğrenci adı       ✓
Soyadı            ✓
Öğrenci no        ✓
Sınıf             ✓
```

Bu özellikle manuel kontrol sırasında güveni artırır.

---

# 51. Duplicate Student Protection

Aynı:

```text
öğrenci numarası
```

varsa sistem duplicate kayıt oluşturmayı engellemelidir.

Aynı isim tek başına duplicate kriteri olmamalıdır.

---

# 52. Phone Number Security

Telefon numaraları normalize edilmelidir.

Örnek:

```text
05321234567
+905321234567
905321234567
```

aynı numarayı ifade edebilir.

Database'te canonical format kullanılmalıdır:

```text
+905321234567
```

---

# 53. Telefon Gizliliği

Telefon numaraları:

- loglanmamalı,
- gereksiz UI alanlarında gösterilmemeli,
- exportlarda kontrollü kullanılmalı,
- hata raporlarına açık şekilde yazılmamalıdır.

---

# 54. Student Data

Minimum veri ilkesi uygulanmalıdır.

Uygulamanın gönderim için ihtiyacı olmayan bilgiler saklanmamalıdır.

Örneğin yalnızca mesaj göndermek için:

```text
öğrenci adı
veli adı
telefon
PDF
```

yeterliyse gereksiz ek kişisel veri toplanmamalıdır.

---

# 55. PDF Privacy

PDF'ler kişisel veri içerebilir.

Bu nedenle PDF:

```text
public asset
```

olarak değerlendirilmemelidir.

PDF'ler:

- Git'e commit edilmemeli,
- public upload edilmemeli,
- loglanmamalı,
- gereksiz yere cache edilmemeli.

---

# 56. `.gitignore`

Aşağıdaki içerikler repository'ye girmemelidir:

```text
.env
.env.*
*.db
*.sqlite
*.sqlite3
backups/
logs/
student-data/
pdfs/
exports/
credentials/
```

Gerekiyorsa `.gitignore` buna göre genişletilmelidir.

`.env.example` yalnızca örnek placeholder değerler içermelidir.

---

# 57. Git Secret Protection

Git history içinde secret bulunmamalıdır.

Eğer yanlışlıkla commit edildiyse:

1. Secret derhal revoke/rotate edilir.
2. Git history temizlenir.
3. Yeni credential oluşturulur.
4. Eski credential artık kullanılmaz.

Sadece dosyayı son committen silmek yeterli değildir.

---

# 58. API Key Rotation

Credential compromise şüphesinde:

```text
revoke
 ↓
rotate
 ↓
update secure storage
 ↓
test
```

yapılmalıdır.

---

# 59. Meta Token Güvenliği

Meta access token:

- source code içine yazılmamalı,
- `.env` içine production credential olarak commit edilmemeli,
- localStorage'da tutulmamalı,
- renderer'a expose edilmemeli,
- loglanmamalı.

---

# 60. OpenWA Credential Güvenliği

OpenWA credentialları da aynı kurallara tabidir.

API key varsa:

```text
safeStorage
```

üzerinde tutulmalıdır.

---

# 61. Backup Security

Backup dosyası öğrenci + veli + geçmiş + mesaj verilerini içerebilir.

Bu nedenle backup:

> Hassas veri

olarak kabul edilmelidir.

---

# 62. Backup Default Policy

Varsayılan backup:

```text
students
templates
history
settings(non-secret)
```

içerebilir.

Ancak:

```text
API keys
tokens
passwords
session secrets
```

içermemelidir.

---

# 63. Backup Encryption

İlerleyen sürümlerde backup encryption düşünülebilir.

Özellikle backup başka bir cihazda saklanacaksa:

```text
encrypted backup
```

tercih edilmelidir.

---

# 64. Backup Import Security

Backup import:

```text
parse
 ↓
schema validate
 ↓
size validate
 ↓
data validate
 ↓
migration
 ↓
transaction
 ↓
commit
```

akışında yapılmalıdır.

Geçersiz backup mevcut database'i bozmamalıdır.

---

# 65. Backup Path Security

Backup path:

- normalize edilmeli,
- kullanıcı seçimiyle belirlenmeli,
- arbitrary system path kullanımına dikkat edilmeli.

---

# 66. Database Security

SQLite dosyası:

```text
application data
```

olarak kabul edilmelidir.

Database:

- repository dışında,
- application data directory içinde,
- mümkünse kullanıcı hesabı erişim sınırları içinde

saklanmalıdır.

---

# 67. SQLite Secret Storage Değildir

Secretlar SQLite içine plain text olarak konulmamalıdır.

SQLite:

```text
students
templates
jobs
history
settings
```

için kullanılabilir.

Credential:

```text
safeStorage
```

için kullanılmalıdır.

---

# 68. Database Transactions

Gönderimle ilişkili kritik işlemler transaction kullanmalıdır.

Örneğin:

```text
create send_job
+
create attempt
```

birlikte yapılmalıdır.

Biri başarılı biri başarısız olacak şekilde yarım state bırakılmamalıdır.

---

# 69. Database Corruption

Uygulama kapanırken database transaction yarıda kalabilir.

Bu nedenle:

- atomic transaction
- migration backup
- integrity check

uygulanmalıdır.

---

# 70. Migration Security

Database migration:

```text
v1
 ↓
v2
 ↓
v3
```

şeklinde kontrollü yapılmalıdır.

Migration başlamadan önce gerekirse otomatik backup alınmalıdır.

Başarısız migration mevcut veriyi bozmayacak şekilde transaction içinde çalışmalıdır.

---

# 71. Data Deletion

Kullanıcı verileri silinebilmelidir.

Ayrı seçenekler:

```text
Öğrencileri sil
Geçmişi sil
PDF cache temizle
Backup temizle
Tüm uygulama verilerini sil
Credentialları sil
```

olabilir.

---

# 72. Credential Deletion

Credential silme:

```text
safeStorage entry
```

üzerinden yapılmalıdır.

Database'deki credential metadata varsa o da temizlenmelidir.

---

# 73. KVKK Perspektifi

Vatsap kişisel veri işleyebildiğinden uygulama tasarımında:

- veri minimizasyonu,
- amaçla sınırlılık,
- erişim kontrolü,
- güvenli saklama,
- gerektiğinde silme,
- backup kontrolü

prensipleri dikkate alınmalıdır.

Bu dosya hukuki danışmanlık yerine teknik güvenlik standardıdır.

KVKK kapsamındaki kurumsal yükümlülükler ayrıca değerlendirilmelidir.

---

# 74. Data Retention

Her veri sonsuza kadar tutulmamalıdır.

Örneğin:

```text
PDF cache → işlem sonrası temizlenebilir
Debug log → kısa süre
Send history → kullanıcı politikasına göre
Audit log → belirlenen retention
```

Retention süreleri ileride Settings üzerinden yönetilebilir.

---

# 75. Application Crash

Crash olduğunda:

- tokenlar crash report'a yazılmamalı,
- öğrenci verileri dump edilmemeli,
- PDF içeriği dump edilmemeli.

Crash report mümkün olduğunca:

```text
error type
app version
OS
provider
job id
```

gibi minimize edilmiş metadata içermelidir.

---

# 76. Error Handling

Kullanıcıya teknik stack trace gösterilmemelidir.

Yanlış:

```text
TypeError: Cannot read properties...
```

Doğru:

> Gönderim sırasında beklenmeyen bir hata oluştu.

Developer logunda detay bulunabilir ancak hassas veri içermemelidir.

---

# 77. XSS Koruması

Mesaj template'i, öğrenci adı veya PDF metni HTML olarak render edilecekse sanitize edilmelidir.

Özellikle:

```text
dangerouslySetInnerHTML
```

kullanımı gerekmedikçe yapılmamalıdır.

Kullanıcıdan gelen veri HTML olarak çalıştırılmamalıdır.

---

# 78. Template Injection

Template değişkenleri yalnızca izin verilen alanlardan oluşturulmalıdır.

Örneğin:

```text
{{ogrenci_adi}}
{{veli_adi}}
{{sinif}}
```

izinlidir.

Arbitrary expression:

```text
{{eval(...) }}
```

gibi bir sistem kesinlikle olmamalıdır.

---

# 79. Message Content Validation

Mesaj gönderilmeden önce:

- recipient
- template
- variables
- character length
- attachment
- provider rules

kontrol edilmelidir.

---

# 80. WhatsApp Template Security

Meta Cloud API kullanılıyorsa uygulama:

```text
Application Template
```

ile:

```text
Meta Approved Template
```

arasındaki farkı korumalıdır.

Kullanıcı bir application template'i Meta-approved template gibi göndermeye çalışmamalıdır.

---

# 81. Provider Response Validation

Provider'dan gelen response güvenilir kabul edilmemelidir.

Kontrol:

```text
HTTP status
body structure
message ID
error code
```

yapılmalıdır.

Beklenmeyen response:

```text
provider_error
```

olarak işlenmelidir.

---

# 82. Provider State

Provider durumları gerçek durumdan türetilmelidir.

Örneğin WhatsApp Web provider:

```text
connected
```

değerini yalnızca gerçekten bağlantıyı doğruladıysa döndürmelidir.

Eğer uygulama yalnızca WhatsApp Web'i açıyorsa:

```text
assisted
requires_user_action
```

gibi bir state kullanılmalıdır.

---

# 83. Authentication State

Bir provider:

```text
configured
```

olabilir ancak:

```text
connected
```

olmayabilir.

Bu iki durum birbirine karıştırılmamalıdır.

Örnek:

```text
Configured ✓
Connected ✕
```

---

# 84. Authorization

Vatsap şu anda tek kullanıcı masaüstü uygulaması olsa bile authorization mantığı net tutulmalıdır.

Örneğin:

```text
UI action
 ↓
IPC
 ↓
permission check
 ↓
operation
```

Gelecekte multi-user yapıya geçiş kolaylaşır.

---

# 85. Scheduler Security

Scheduler eklenirse:

- job validation
- duplicate protection
- persisted job state
- cancellation
- credential state
- provider availability

kontrol edilmelidir.

Scheduler doğrudan provider'a bypass yapmamalıdır.

---

# 86. Auto Send Güvenliği

Otomatik gönderim yalnızca şu koşullar sağlanıyorsa başlamalıdır:

```text
student valid
+
phone valid
+
PDF matched
+
confidence >= threshold
+
template valid
+
provider configured
+
provider ready
+
job unique
```

Bir koşul başarısızsa job gönderime girmemelidir.

---

# 87. Pre-Send Security Gate

Gönderimden hemen önce son bir güvenlik kontrolü yapılmalıdır.

```text
SECURITY GATE
```

kontrolleri:

```text
✓ Student exists
✓ Phone valid
✓ PDF exists
✓ PDF matched
✓ Confidence sufficient
✓ Template valid
✓ Provider ready
✓ Credential available
✓ No duplicate
✓ Job not cancelled
```

---

# 88. Race Condition

Aynı job'ın iki farklı worker tarafından gönderilmesi engellenmelidir.

Örneğin:

```text
worker A → job 123
worker B → job 123
```

aynı anda çalışmamalıdır.

Database state transition atomik olmalıdır.

---

# 89. Concurrency

V2'nin ilk sürümünde güvenli olmak için düşük concurrency tercih edilebilir.

Örneğin:

```text
1 active WhatsApp send
```

ile başlanabilir.

Provider güvenilirliği kanıtlandıkça concurrency artırılabilir.

Daha fazla paralellik her zaman daha iyi değildir.

---

# 90. Cancellation Security

Kullanıcı:

```text
Gönderimi durdur
```

dediğinde:

- yeni job başlamamalı,
- mevcut request mümkünse iptal edilmeli,
- queue state doğru kaydedilmeli,
- tekrar başlatıldığında duplicate oluşmamalıdır.

---

# 91. Pause / Resume

Pause:

```text
new sends → blocked
current safe operation → finish
```

şeklinde uygulanabilir.

Resume:

```text
validate remaining jobs
 ↓
continue
```

yapmalıdır.

---

# 92. Race-Free Retry

Retry butonuna art arda basılması:

```text
retry
retry
retry
```

aynı job için üç ayrı gönderim başlatmamalıdır.

UI disabled state + backend/database guard birlikte kullanılmalıdır.

---

# 93. Frontend Security

Frontend güvenliği tek başına yeterli değildir.

Örneğin:

```ts
button disabled
```

güvenlik kontrolü değildir.

Asıl kontrol:

```text
Main Process
```

tarafında yapılmalıdır.

Renderer'daki disabled state yalnızca UX'tir.

---

# 94. Sensitive UI Data

Token inputları:

```text
type="password"
```

olarak gösterilebilir.

Telefon numaraları mümkünse:

```text
+90532•••••67
```

şeklinde maskelenebilir.

---

# 95. Clipboard Security

Token veya hassas veri kopyalandığında clipboard'da uzun süre kalmamasına dikkat edilmelidir.

Mümkünse:

- token copy özelliği eklenmemeli,
- eklenirse otomatik temizleme düşünülebilir.

---

# 96. Screen / Screenshot Privacy

Uygulama sensitive data gösterdiği için ileride macOS/Windows platformlarına özel:

```text
window privacy
```

özellikleri değerlendirilebilir.

Bu P2/P3 konusudur.

---

# 97. Dependency Security

Her dependency potansiyel saldırı yüzeyidir.

Yeni package eklenmeden önce:

- bakım durumu
- son release
- lisans
- dependency tree
- bilinen CVE
- bundle etkisi

kontrol edilmelidir.

---

# 98. Unused Dependencies

Kullanılmayan dependencyler kaldırılmalıdır.

Özellikle:

```text
AI SDK
animation libraries
unused spreadsheet libraries
```

gibi paketler gerçekten kullanılmıyorsa kaldırılmalıdır.

Daha az dependency:

```text
daha küçük attack surface
```

anlamına gelir.

---

# 99. Lockfile

Package lockfile repository'de tutulmalıdır.

Örneğin:

```text
package-lock.json
```

veya kullanılan package manager'ın eşdeğeri.

CI:

```text
frozen lockfile
```

ile çalışmalıdır.

---

# 100. Dependency Updates

Dependency güncellemeleri:

```text
update
 ↓
test
 ↓
build
 ↓
security review
```

şeklinde yapılmalıdır.

Her şeyi aynı anda güncellemek yerine kontrollü güncelleme tercih edilmelidir.

---

# 101. Supply Chain

NPM package'ları doğrudan güvenilir kabul edilmemelidir.

Şüpheli dependency davranışları:

- install script
- postinstall
- network access
- filesystem access

açısından değerlendirilmelidir.

---

# 102. GitHub Security

Repository'de mümkünse:

- Dependabot
- secret scanning
- code scanning
- branch protection
- required CI checks

aktif edilmelidir.

---

# 103. Pull Request Security

Güvenlik açısından kritik değişikliklerde:

```text
security-sensitive code
```

ayrıca review edilmelidir.

Özellikle:

```text
electron/main
preload
IPC
provider
storage
backup
queue
```

dosyaları kritik kabul edilir.

---

# 104. CI Security

CI pipeline'da:

```text
typecheck
lint
tests
build
dependency audit
```

çalıştırılabilir.

Secretlar CI loglarına yazdırılmamalıdır.

---

# 105. Environment Variables

`.env` yalnızca gerçekten gerekli secretlar için kullanılmalıdır.

Production credential source code'a yazılmamalıdır.

`.env.example`:

```text
META_ACCESS_TOKEN=
OPENWA_API_KEY=
```

gibi boş placeholder içerebilir.

Gerçek değer içeremez.

---

# 106. Build Güvenliği

Production build:

- debug mode kapalı,
- source map politikası kontrollü,
- dev server kapalı,
- test endpointleri kapalı,
- verbose logging kapalı

olmalıdır.

---

# 107. Development Mode

Development ortamında daha fazla debug bilgisi olabilir.

Ancak:

> Development ortamında token loglamak güvenli bir uygulama değildir.

Development'ta bile secret masking uygulanmalıdır.

---

# 108. Electron DevTools

Production build'de DevTools varsayılan olarak açık olmamalıdır.

Development:

```text
dev only
```

olmalıdır.

---

# 109. CSP

Vatsap için Content Security Policy uygulanmalıdır.

Amaç:

- inline script azaltmak,
- arbitrary script injection engellemek,
- remote script yüklenmesini engellemek.

CSP mevcut build sistemiyle uyumlu şekilde hazırlanmalıdır.

---

# 110. Navigation Control

Electron window'ın:

```text
main frame navigation
```

kontrol edilmelidir.

Renderer'ın kullanıcı inputuyla başka domain'e navigate etmesi engellenmelidir.

---

# 111. New Window Control

Renderer'ın:

```text
window.open(...)
```

ile arbitrary Electron window oluşturması engellenmelidir.

Gerekli external linkler sistem browser'ında açılmalıdır.

---

# 112. IPC Event Flooding

Renderer çok hızlı IPC çağrısı yapabilir.

Örneğin:

```text
send
send
send
send
...
```

Bu nedenle kritik IPC'lerde:

- state guard
- debounce
- queue
- rate limit

uygulanabilir.

---

# 113. Resource Exhaustion

Aşağıdaki kaynaklar sınırsız tüketilmemelidir:

```text
PDF size
PDF count
message count
queue size
request body
log size
backup size
```

Makûl limitler tanımlanmalıdır.

---

# 114. Memory Management

Özellikle PDF işlemlerinde:

```text
100 PDF
+
100 base64
+
PDF text
```

hepsini aynı anda bellekte tutmaktan kaçınılmalıdır.

Batch processing tercih edilmelidir.

---

# 115. DoS Benzeri Yerel Riskler

Kötü niyetli veya bozuk input:

```text
çok büyük PDF
çok sayıda PDF
çok uzun message
çok büyük backup
```

ile uygulamayı kilitleyebilir.

Input limitleri belirlenmelidir.

---

# 116. Auditability

Kritik işlemlerin sonucu sonradan anlaşılabilmelidir.

Örneğin:

```text
Job 123
```

için:

```text
created
validated
sending
provider accepted
completed
```

veya:

```text
created
sending
timeout
unknown
```

gibi state history tutulabilir.

---

# 117. Audit Log'da Secret Yasaktır

Audit log:

```text
student_id
job_id
action
timestamp
status
```

tutabilir.

Ancak:

```text
access_token
api_key
password
```

tutamaz.

---

# 118. Time Handling

Timestampler mümkünse:

```text
UTC
```

olarak saklanmalı.

UI'da kullanıcının local timezone'una dönüştürülmelidir.

---

# 119. Clock Manipulation

Local desktop uygulamasında sistem saati güvenilir olmayabilir.

Scheduler veya expiration gibi özellikler eklendiğinde clock manipulation dikkate alınmalıdır.

Bu P2 seviyesindedir.

---

# 120. Security Headers

Local HTTP server kullanılıyorsa mümkün olan güvenlik headerları uygulanmalıdır.

Örneğin:

```text
Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
```

ihtiyaca göre değerlendirilebilir.

---

# 121. No Public API by Default

Vatsap masaüstü uygulaması olduğundan:

```text
internet üzerinden erişilebilir API
```

varsayılan hedef değildir.

Local server yalnızca gerçekten gerekli olduğu durumda çalışmalıdır.

---

# 122. Remote Access

Kullanıcı açıkça istemedikçe:

```text
LAN access
remote API
public webhook
```

açılmamalıdır.

---

# 123. Webhook Security

İleride delivery webhook eklenirse:

- signature verification
- replay protection
- timestamp validation
- payload validation

zorunlu olmalıdır.

Webhook yalnızca provider'ın beklenen imzası doğrulanırsa işlenmelidir.

---

# 124. Replay Attack

Özellikle webhook ve send job sistemlerinde aynı event'in tekrar gönderilmesi mümkün olabilir.

Event ID veya provider message ID ile duplicate event engellenmelidir.

---

# 125. Provider Webhook

Webhook event:

```text
received
 ↓
signature verify
 ↓
timestamp validate
 ↓
event ID check
 ↓
payload validate
 ↓
database update
```

akışından geçmelidir.

---

# 126. WhatsApp Message ID

Provider destekliyorsa:

```text
providerMessageId
```

database'te tutulmalıdır.

Bu değer:

- delivery tracking,
- duplicate detection,
- debugging

için kullanılabilir.

---

# 127. Test Mode

Test gönderimi production job'dan ayrılmalıdır.

Test:

```text
testJob = true
```

veya ayrı job type ile işaretlenebilir.

Test mesajı gerçek öğrenci job history'sini kirletmemelidir.

---

# 128. Dangerous Operations Confirmation

Aşağıdaki işlemler confirmation gerektirmelidir:

```text
Tüm öğrencileri sil
Tüm geçmişi sil
Tüm verileri sil
Credentialları sil
Backup restore
Toplu gönderim
```

Toplu gönderim özellikle açık bir confirmation içermelidir.

---

# 129. Pre-Send Confirmation

Kullanıcıya:

```text
10 öğrenciye
10 PDF
10 WhatsApp mesajı
```

gönderileceği açıkça gösterilmelidir.

Kullanıcı:

```text
[Gönderimi Başlat]
```

ile açıkça onay vermelidir.

---

# 130. Wrong Recipient Protection

Gönderim öncesinde:

```text
Öğrenci
Veli
Telefon
PDF
```

ilişkisi doğrulanmalıdır.

Örneğin:

```text
Ahmet Yılmaz
Veli: Mehmet Yılmaz
Telefon: +90...
PDF: Ahmet-Yilmaz.pdf
```

kullanıcı tarafından kontrol edilebilir.

---

# 131. Manual Override

Kullanıcı eşleşmeyi manuel olarak değiştirebilir.

Ancak:

```text
manual override
```

audit log'a kaydedilebilir.

Örneğin:

```text
PDF 42
Automatic match → Ahmet
Manual match → Mehmet
```

---

# 132. Manual Override Güvenliği

Kullanıcı yanlış eşleşme seçerse sistem bunu otomatik olarak engelleyemez.

Bu nedenle manuel override sonrası:

```text
Bu PDF Mehmet'e gönderilecek.
Onaylıyor musunuz?
```

gibi son kontrol gösterilebilir.

---

# 133. Security Incident

Aşağıdaki durumlar güvenlik olayı kabul edilmelidir:

- yanlış kişiye PDF gönderimi,
- credential sızıntısı,
- API key commit edilmesi,
- token loglanması,
- database sızıntısı,
- backup sızıntısı,
- unauthorized network access,
- malicious PDF nedeniyle uygulama compromise,
- SSRF tespiti.

---

# 134. Incident Response

Bir olay tespit edildiğinde:

```text
1. Gönderimleri durdur
2. Etkilenen credentialları revoke et
3. Yeni credential oluştur
4. Etkilenen veriyi belirle
5. Logları koru
6. Etkilenen kullanıcıları belirle
7. Açığı düzelt
8. Test et
9. Gerekli bildirimleri değerlendir
```

---

# 135. Credential Leak Prosedürü

API key sızdıysa:

```text
STOP
 ↓
REVOKE
 ↓
ROTATE
 ↓
REMOVE FROM SOURCE
 ↓
CLEAN GIT HISTORY
 ↓
UPDATE SAFE STORAGE
 ↓
TEST
```

Eski credential tekrar kullanılmamalıdır.

---

# 136. Wrong PDF Incident

Yanlış PDF gönderildiyse:

1. Queue durdurulur.
2. Etkilenen job belirlenir.
3. Hangi PDF'in kime gönderildiği belirlenir.
4. Provider message ID kayıtları incelenir.
5. Matching algoritması incelenir.
6. Threshold gerekirse yükseltilir.
7. Aynı koşuldaki diğer joblar kontrol edilir.
8. Gerekli veri ihlali değerlendirmesi yapılır.

---

# 137. Security Testing

V2 release öncesi:

```text
IPC tests
path traversal tests
SSRF tests
credential storage tests
queue tests
matching tests
backup tests
provider tests
```

yapılmalıdır.

---

# 138. Path Traversal Testleri

Test örnekleri:

```text
../secret
../../secret
/absolute/path
C:\Windows\...
%2e%2e
encoded traversal
```

uygulanmalıdır.

---

# 139. SSRF Testleri

Provider URL validation:

```text
localhost
127.0.0.1
0.0.0.0
::1
private IP
metadata endpoint
internal hostname
```

gibi hedeflere karşı test edilmelidir.

OpenWA'nın gerçekten localhost üzerinde çalışması gereken senaryolar güvenli allowlist ile istisna olabilir.

---

# 140. IPC Abuse Tests

Renderer'ın:

```text
invalid provider
invalid student ID
invalid PDF path
invalid URL
oversized payload
unknown command
```

göndermesi test edilmelidir.

---

# 141. Credential Tests

Test edilmelidir:

```text
Token localStorage'da mı?
Token renderer'a geliyor mu?
Token loglanıyor mu?
Token backup'a giriyor mu?
Token SQLite'ta plain text mi?
```

Hepsinin cevabı:

```text
Hayır
```

olmalıdır.

---

# 142. Backup Security Tests

Test:

```text
secret included?
malformed JSON?
wrong schema?
oversized backup?
duplicate IDs?
invalid phone?
invalid student?
```

---

# 143. Queue Security Tests

Test:

```text
duplicate send
double retry
retry after unknown
pause during send
cancel during send
app crash during send
provider timeout
network disconnect
```

---

# 144. Matching Security Tests

Test:

```text
same names
similar names
Turkish characters
missing surname
missing student ID
wrong class
multiple candidate PDFs
low confidence
```

Hiçbir low-confidence eşleşme otomatik gönderilmemelidir.

---

# 145. Release Security Checklist

Release öncesi:

```text
[ ] No secrets in repository
[ ] No secrets in localStorage
[ ] safeStorage active
[ ] IPC validated
[ ] IPC allowlist active
[ ] nodeIntegration false
[ ] contextIsolation true
[ ] sandbox true
[ ] CSP configured
[ ] External navigation controlled
[ ] Local server localhost-only
[ ] SSRF protection
[ ] PDF size limit
[ ] File path validation
[ ] Queue idempotency
[ ] Unknown delivery state
[ ] Matching threshold
[ ] Backup validation
[ ] Sensitive logs disabled
[ ] Dependencies audited
[ ] Tests passing
[ ] Production build successful
```

---

# 146. Developer Security Checklist

Her yeni özellikte geliştirici şu soruları cevaplamalıdır:

### Veri

- Bu özellik hangi veriyi okuyor?
- Hangi veriyi yazıyor?
- Hassas veri mi?
- Gereğinden fazla veri mi topluyor?

### IPC

- Renderer bu işlemi tetikleyebiliyor mu?
- Input validate ediliyor mu?
- Main process authorization yapıyor mu?

### Dosya

- Kullanıcı path sağlayabiliyor mu?
- Path traversal mümkün mü?
- Dosya boyutu sınırlı mı?

### Network

- URL kullanıcıdan geliyor mu?
- SSRF mümkün mü?
- Timeout var mı?
- Response validate ediliyor mu?

### Secret

- API key gerekiyor mu?
- Renderer görebiliyor mu?
- Loglanıyor mu?
- Backup'a giriyor mu?

### Queue

- Duplicate olabilir mi?
- Retry güvenli mi?
- Unknown state gerekiyor mu?

### UI

- Hassas veri gereksiz yere gösteriliyor mu?
- Kullanıcı yanlış işlem yapabilir mi?

---

# 147. AI Coding Agent Güvenlik Kuralları

Vatsap üzerinde çalışan AI coding agent aşağıdaki kurallara uymalıdır.

## Kural 1

Secretları source code içine yazma.

## Kural 2

Tokenları renderer'a expose etme.

## Kural 3

`ipcRenderer` nesnesini komple expose etme.

## Kural 4

Validation olmadan IPC handler oluşturma.

## Kural 5

User-provided URL'yi doğrudan `fetch()` etme.

## Kural 6

User-provided file path'i validation olmadan `readFile()` ile açma.

## Kural 7

`nodeIntegration: true` yapma.

## Kural 8

`contextIsolation: false` yapma.

## Kural 9

`sandbox: false` yapmayı gerekçesiz tercih etme.

## Kural 10

Security problemini "sonra düzeltilecek" olarak bırakma.

## Kural 11

Queue'yu bypass ederek doğrudan WhatsApp provider çağırma.

## Kural 12

95 altı matching confidence ile otomatik gönderim yapma.

## Kural 13

Unknown delivery durumunu otomatik failed kabul etme.

## Kural 14

Credentialları loglama.

## Kural 15

Backup'a secret ekleme.

## Kural 16

Güvenlik kontrolünü yalnızca frontend'de yapma.

## Kural 17

Yeni dependency eklemeden önce gerekliliğini değerlendir.

## Kural 18

Güvenlik açısından kritik değişikliklerde test ekle.

---

# 148. Security Review Gerektiren Dosyalar

Aşağıdaki dosya ve modüller kritik kabul edilir:

```text
electron/main.cjs
electron/preload.cjs

server.ts

src/services/storageService.ts
src/services/senderQueue.ts

src/services/whatsapp/*
src/services/pdf/*
src/services/pdfMatcher.ts

src/services/backup/*
```

Bu dosyalarda yapılan değişiklikler security review gerektirebilir.

---

# 149. Kritik Security Boundary

Aşağıdaki akışlarda ekstra dikkat gerekir:

```text
Renderer → IPC
IPC → filesystem
IPC → network
Renderer → provider
PDF → parser
Database → queue
Queue → WhatsApp
Backup → database
Provider → application
```

Her boundary'de validation bulunmalıdır.

---

# 150. Güvenlik Anti-Patternleri

Aşağıdaki kod yaklaşımları Vatsap V2'de kullanılmamalıdır:

```ts
localStorage.setItem("apiKey", token);
```

```ts
fetch(userProvidedUrl);
```

```ts
fs.readFile(userProvidedPath);
```

```ts
ipcMain.handle("anything", (_, args) => execute(args));
```

```ts
contextBridge.exposeInMainWorld("api", {
  ipcRenderer
});
```

```ts
nodeIntegration: true
```

```ts
contextIsolation: false
```

```ts
app.listen(port, "0.0.0.0");
```

```ts
console.log(accessToken);
```

```ts
retryImmediatelyAfterUnknown();
```

```ts
if (score > 70) autoSend();
```

Bu örneklerin yerine güvenli abstraction kullanılmalıdır.

---

# 151. Güvenli İşlem Standardı

Her hassas işlem şu yapıya mümkün olduğunca uymalıdır:

```text
INPUT
  ↓
VALIDATE
  ↓
NORMALIZE
  ↓
AUTHORIZE
  ↓
CHECK STATE
  ↓
EXECUTE
  ↓
VERIFY RESULT
  ↓
AUDIT
  ↓
SANITIZED RESPONSE
```

Örneğin mesaj gönderimi:

```text
Recipient
 ↓
phone validation
 ↓
student/job validation
 ↓
PDF validation
 ↓
template validation
 ↓
provider state
 ↓
duplicate check
 ↓
send
 ↓
provider response validation
 ↓
save attempt
 ↓
return safe result
```

---

# 152. Güvenlikte "UI ile Koruma" Yanılgısı

Aşağıdakiler tek başına güvenlik değildir:

```text
disabled button
hidden button
hidden menu
password input
frontend validation
```

Gerçek güvenlik:

```text
Electron Main
+
Database
+
Provider layer
```

tarafında uygulanmalıdır.

Frontend yalnızca kullanıcı deneyimini iyileştirir.

---

# 153. Güvenlik ve Kullanılabilirlik Dengesi

Güvenlik kullanıcıyı gereksiz şekilde engellememelidir.

Örneğin:

```text
Her mesajda tekrar token istemek
```

kötü UX'tir.

Bunun yerine token:

```text
safeStorage
```

içinde güvenli saklanabilir.

Kullanıcı yalnızca:

```text
Configured ✓
```

durumunu görür.

---

# 154. Güvenlik ve Otomasyon Dengesi

Vatsap'ın otomasyon amacı:

> Kullanıcıyı manuel işten kurtarmak.

Ancak otomasyon:

> Kullanıcının kontrolünü tamamen ortadan kaldırmamalıdır.

Bu nedenle:

```text
Automatic matching
        ↓
Human review
        ↓
Secure send
```

modeli tercih edilir.

---

# 155. V2 Minimum Security Baseline

V2 release edilebilmesi için en az aşağıdakiler zorunludur:

```text
safeStorage
IPC validation
IPC allowlist
localhost-only server
SSRF protection
file path validation
PDF size limits
secret masking
no sensitive logs
SQLite separation
backup validation
phone normalization
matching threshold
idempotency
unknown state
duplicate protection
pre-send security gate
tests
```

Bunlardan kritik birinin eksik olması V2 release'inin ertelenmesi için yeterli sebeptir.

---

# 156. Security Definition of Done

Bir security task tamamlandı kabul edilmeden önce:

```text
[ ] Kod uygulandı
[ ] Input validation eklendi
[ ] Hata senaryosu ele alındı
[ ] Log güvenliği kontrol edildi
[ ] Secret exposure kontrol edildi
[ ] Test eklendi
[ ] Production build test edildi
[ ] Mevcut özellikler bozulmadı
[ ] Security regression kontrol edildi
```

---

# 157. Nihai Güvenlik Hedefi

Vatsap V2'nin güvenlik hedefi:

> **Kullanıcı uygulamayı normal şekilde kullanırken, öğrenci/veli verilerinin yanlış kişiye gönderilmesi, credential bilgilerinin renderer tarafından ele geçirilmesi, local network üzerinden uygulamaya gereksiz erişim sağlanması ve network/PDF kaynaklı saldırı yüzeylerinin mümkün olduğunca azaltılması.**

Güvenlik sistemi:

```text
Electron Security
        +
Secure IPC
        +
Secure Credentials
        +
Validated Files
        +
Validated Network
        +
Safe Matching
        +
Reliable Queue
        +
Protected Database
        +
Secure Backup
        +
Testing
```

birlikte çalışmalıdır.

Tek bir güvenlik mekanizmasına güvenilmemelidir.

---

# 158. Son İlke

Vatsap için en önemli güvenlik kuralı:

> **Bir işlemin doğru olduğunu kanıtlayamıyorsak, işlemi gerçekleştirmemeliyiz.**

Özellikle:

```text
PDF eşleşmesi belirsizse → gönderme.

Telefon geçersizse → gönderme.

Provider hazır değilse → gönderme.

Credential doğrulanamıyorsa → gönderme.

Gönderimin sonucu bilinmiyorsa → tekrar gönderme.

Backup doğrulanamıyorsa → import etme.

IPC input güvenilir değilse → çalıştırma.
```

Vatsap V2'nin güvenlik mimarisi bu "fail closed" yaklaşımı üzerine kurulmalıdır.