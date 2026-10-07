# Vatsap V2 — Architecture

> **Belge:** `ARCHITECTURE.md`  
> **Proje:** Vatsap  
> **Sürüm:** V2  
> **Durum:** Ana teknik mimari referansı  
> **İlişkili belgeler:** `V2_ROADMAP.md`, `SECURITY.md`

---

# 1. Belgenin Amacı

Bu belge Vatsap V2'nin:

- uygulama mimarisini,
- klasör yapısını,
- veri akışlarını,
- Electron katmanlarını,
- IPC mimarisini,
- veri tabanı yapısını,
- WhatsApp provider sistemini,
- PDF pipeline'ını,
- matching sistemini,
- queue sistemini,
- backup yapısını,
- güvenlik sınırlarını,
- test mimarisini

tanımlar.

Bu belge, Vatsap üzerinde çalışan geliştirici veya AI coding agent için **teknik kaynak dokümanıdır**.

Bir geliştirme kararı bu belgeyle çelişiyorsa, değişiklik yapılmadan önce mimari gerekçe oluşturulmalıdır.

---

# 2. Temel Mimari Karar

Vatsap V2:

> **Electron + React + TypeScript + SQLite + Secure IPC + Provider Architecture**

üzerine kurulacaktır.

Hedef mimari:

```text
┌──────────────────────────────────────────────┐
│                 React Renderer               │
│                                              │
│ UI / State / User Interaction               │
│                                              │
│ Students / PDF / Matching / Send / History  │
└──────────────────────┬───────────────────────┘
                       │
                 Secure IPC
                       │
┌──────────────────────▼───────────────────────┐
│              Electron Main Process           │
│                                              │
│ IPC Handlers                                 │
│ Application Services                         │
│ Queue                                        │
│ File Access                                  │
│ Provider Orchestration                       │
│ Database                                     │
│ Secure Credentials                           │
└───────────┬─────────────┬────────────────────┘
            │             │
     ┌──────▼──────┐ ┌────▼─────────────┐
     │   SQLite    │ │ Electron         │
     │             │ │ safeStorage      │
     │ App Data    │ │ Credentials      │
     └─────────────┘ └──────────────────┘
            │
     ┌──────▼───────────────────────────────┐
     │          WhatsApp Providers          │
     │                                      │
     │ Meta Cloud API                       │
     │ OpenWA                               │
     │ Assisted WhatsApp Web                │
     └──────────────────────────────────────┘
```

---

# 3. Mimari Prensipler

V2 aşağıdaki prensiplere dayanır.

## 3.1 Separation of Concerns

Her katmanın tek bir temel sorumluluğu olmalıdır.

```text
Renderer
→ UI

IPC
→ Process boundary

Application Services
→ Business operations

Domain
→ Business rules

Infrastructure
→ Database / filesystem / network

Provider
→ WhatsApp integration
```

---

# 4. Renderer'ın Sorumluluğu

React Renderer:

- UI gösterir,
- kullanıcı etkileşimini yönetir,
- form state tutar,
- loading/error state gösterir,
- güvenli IPC API'lerini çağırır.

Renderer:

- database'e doğrudan erişmez,
- filesystem'e doğrudan erişmez,
- secret okuyamaz,
- WhatsApp API'sine doğrudan bağlanmaz,
- OpenWA endpointine doğrudan bağlanmaz.

---

# 5. Electron Main'in Sorumluluğu

Electron Main:

- IPC handlerları çalıştırır,
- database'e erişir,
- dosya sistemine erişir,
- secret yönetir,
- WhatsApp providerlarını yönetir,
- queue çalıştırır,
- PDF işlemlerini başlatır,
- backup işlemlerini yönetir,
- güvenlik kontrollerini uygular.

Main Process V2'nin güvenilir uygulama katmanıdır.

---

# 6. Preload'un Sorumluluğu

Preload yalnızca:

> Renderer ile Main arasında kontrollü bir API köprüsü

olmalıdır.

Preload:

- `ipcRenderer` nesnesinin tamamını expose etmez,
- Node API'lerini expose etmez,
- filesystem API expose etmez,
- secret expose etmez.

---

# 7. Domain Layer

Domain layer uygulamanın business logic'ini içerir.

Örneğin:

```text
Student
SendJob
SendAttempt
Template
PdfDocument
PdfMatch
Provider
```

gibi entity'ler burada tanımlanabilir.

Domain layer mümkün olduğunca:

- React'ten,
- Electron API'lerinden,
- SQLite implementation detaylarından

bağımsız tutulmalıdır.

---

# 8. Application Layer

Application layer use-case'leri yönetir.

Örneğin:

```text
CreateStudent
UpdateStudent
ImportStudents
ScanPdfFolder
MatchPdfs
ValidateSendBatch
CreateSendJobs
StartSendQueue
PauseQueue
ResumeQueue
RetrySendJob
CreateBackup
RestoreBackup
```

Bu katman:

```text
UI
```

ile:

```text
Infrastructure
```

arasındaki business orchestration katmanıdır.

---

# 9. Infrastructure Layer

Infrastructure:

```text
SQLite
Filesystem
safeStorage
HTTP
PDF parser
OpenWA
Meta API
```

gibi dış sistemleri yönetir.

Domain logic doğrudan:

```text
fetch()
fs.readFile()
sqlite.query()
```

yapmamalıdır.

---

# 10. Önerilen Klasör Yapısı

Hedef yapı:

```text
vatsap/
│
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   │
│   ├── ipc/
│   │   ├── index.ts
│   │   ├── studentHandlers.ts
│   │   ├── pdfHandlers.ts
│   │   ├── messageHandlers.ts
│   │   ├── queueHandlers.ts
│   │   ├── providerHandlers.ts
│   │   ├── settingsHandlers.ts
│   │   └── backupHandlers.ts
│   │
│   └── security/
│       ├── navigation.ts
│       ├── permissions.ts
│       └── validation.ts
│
├── src/
│   │
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── providers.tsx
│   │
│   ├── features/
│   │   ├── students/
│   │   ├── pdf-matching/
│   │   ├── messaging/
│   │   ├── queue/
│   │   ├── templates/
│   │   ├── history/
│   │   ├── settings/
│   │   └── backup/
│   │
│   ├── domain/
│   │   ├── student/
│   │   ├── pdf/
│   │   ├── message/
│   │   ├── send-job/
│   │   ├── provider/
│   │   └── common/
│   │
│   ├── services/
│   │   ├── api/
│   │   ├── pdf/
│   │   ├── whatsapp/
│   │   ├── backup/
│   │   └── validation/
│   │
│   ├── components/
│   │   ├── ui/
│   │   └── shared/
│   │
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   └── utils/
│
├── database/
│   ├── migrations/
│   ├── schema/
│   └── seed/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── fixtures/
│
├── docs/
│   ├── V2_ROADMAP.md
│   ├── SECURITY.md
│   └── ARCHITECTURE.md
│
├── package.json
├── tsconfig.json
└── README.md
```

Bu yapı bir anda uygulanmak zorunda değildir.

Mevcut dosyalar kademeli olarak taşınmalıdır.

---

# 11. Mevcut Koddan V2'ye Migration

V1'deki mevcut yapı:

```text
App.tsx
storageService
senderQueue
OpenWAProvider
WhatsAppWebProvider
MetaCloudProvider
pdfMatcher
pdfTextExtractor
```

tamamen silinmemelidir.

Migration:

```text
Mevcut servis
      ↓
test
      ↓
interface oluştur
      ↓
yeni katmana taşı
      ↓
eski importları güncelle
      ↓
eski implementation kaldır
```

şeklinde ilerlemelidir.

---

# 12. App.tsx

`App.tsx` zamanla application shell haline gelmelidir.

`App.tsx` içinde:

- tüm business logic,
- PDF matching,
- WhatsApp send,
- database operations,
- backup logic

bulunmamalıdır.

Hedef:

```text
App.tsx
→ layout
→ navigation
→ global providers
→ route/page composition
```

---

# 13. Feature Architecture

Her büyük feature kendi sorumluluk alanına sahip olabilir.

Örneğin:

```text
features/students/
├── components/
├── hooks/
├── api/
├── types.ts
└── index.ts
```

---

# 14. Students Feature

Sorumluluk:

```text
Student CRUD
Search
Filter
Import
Export
Duplicate detection
Phone validation
```

Student feature WhatsApp API çağırmamalıdır.

---

# 15. PDF Matching Feature

Sorumluluk:

```text
Folder selection
PDF scanning
Text extraction
Matching
Confidence
Manual matching
Review
```

PDF matching sonucunda:

```text
PdfMatch
```

domain nesnesi oluşturulmalıdır.

---

# 16. Messaging Feature

Sorumluluk:

```text
Template selection
Message preview
Recipient preview
Pre-send validation
Test send
Send confirmation
```

Gerçek provider iletişimi application/provider layer üzerinden yapılmalıdır.

---

# 17. Queue Feature

Sorumluluk:

```text
Pending jobs
Progress
Pause
Resume
Retry
Cancel
Unknown
Failure
Success
```

Queue UI state'i ile backend queue state'i birbirinden ayrılmalıdır.

---

# 18. History Feature

History:

```text
Send history
Attempt history
Provider message ID
Error
Timestamp
```

gösterir.

Audit log history'den ayrı tutulabilir.

---

# 19. Settings Feature

Settings:

```text
WhatsApp
Sending
Templates
Privacy
Backup
Advanced
About
```

şeklinde organize edilmelidir.

Secret değerleri doğrudan UI state'e taşımamalıdır.

---

# 20. Domain Entities

## Student

```ts
type Student = {
  id: string;
  studentNumber?: string;
  firstName: string;
  lastName: string;
  parentName?: string;
  phone: string;
  email?: string;
  className?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
```

---

# 21. PDF Document

```ts
type PdfDocument = {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileHash?: string;
  createdAt: string;
};
```

`filePath` renderer'a gereksiz yere expose edilmemelidir.

---

# 22. PDF Match

```ts
type PdfMatch = {
  pdfId: string;
  studentId: string;
  score: number;
  status:
    | "automatic"
    | "review"
    | "manual"
    | "unmatched";
  reasons: MatchReason[];
};
```

---

# 23. Match Reason

Örneğin:

```ts
type MatchReason =
  | {
      field: "studentNumber";
      score: number;
    }
  | {
      field: "firstName";
      score: number;
    }
  | {
      field: "lastName";
      score: number;
    }
  | {
      field: "className";
      score: number;
    };
```

Amaç:

> Matching kararının açıklanabilir olması.

---

# 24. Message Template

```ts
type MessageTemplate = {
  id: string;
  name: string;
  content: string;
  variables: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
```

---

# 25. Send Job

```ts
type SendJob = {
  id: string;
  studentId: string;
  pdfId: string;
  templateId?: string;
  provider: ProviderType;
  status: SendJobStatus;
  idempotencyKey: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};
```

---

# 26. Send Job Status

```ts
type SendJobStatus =
  | "pending"
  | "validating"
  | "sending"
  | "success"
  | "failed"
  | "unknown"
  | "partial"
  | "retrying"
  | "paused"
  | "cancelled";
```

---

# 27. Send Attempt

```ts
type SendAttempt = {
  id: string;
  jobId: string;
  attemptNumber: number;
  status: string;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
};
```

---

# 28. Provider Interface

Tüm WhatsApp providerları ortak interface kullanmalıdır.

Örnek:

```ts
interface WhatsAppProvider {
  readonly type: ProviderType;

  getStatus(): Promise<ProviderStatus>;

  validateRecipient(
    phone: string
  ): Promise<RecipientValidationResult>;

  sendText(
    request: SendTextRequest
  ): Promise<SendResult>;

  sendDocument(
    request: SendDocumentRequest
  ): Promise<SendResult>;
}
```

Provider implementation'ı UI tarafından doğrudan çağrılmamalıdır.

---

# 29. Provider Types

```ts
type ProviderType =
  | "meta-cloud"
  | "openwa"
  | "assisted-web";
```

---

# 30. Provider Status

```ts
type ProviderStatus =
  | {
      state: "not_configured";
    }
  | {
      state: "configured";
    }
  | {
      state: "ready";
    }
  | {
      state: "requires_user_action";
    }
  | {
      state: "offline";
    }
  | {
      state: "error";
      code: string;
    };
```

`configured` ile `ready` aynı şey değildir.

---

# 31. Meta Cloud Provider

Sorumluluk:

```text
Meta API
Authentication
Template sending
Document sending
Response parsing
Provider error mapping
```

Secret:

```text
safeStorage
```

üzerinden Main Process tarafından alınmalıdır.

---

# 32. OpenWA Provider

Sorumluluk:

```text
OpenWA API
Session state
Text sending
Document sending
Response parsing
Error mapping
```

Renderer OpenWA API'ye doğrudan erişmez.

---

# 33. Assisted Web Provider

Bu provider gerçek API otomasyonu değildir.

Amaç:

```text
WhatsApp Web
+
kullanıcı kontrollü gönderim
```

olmalıdır.

Provider status:

```text
requires_user_action
```

gibi durumları doğru şekilde bildirmelidir.

---

# 34. Provider Factory

Provider seçimi merkezi bir factory üzerinden yapılabilir.

```ts
getWhatsAppProvider(type)
```

Örneğin:

```text
Meta
 ↓
MetaCloudProvider

OpenWA
 ↓
OpenWAProvider

Assisted Web
 ↓
AssistedWhatsAppWebProvider
```

UI provider implementation import etmemelidir.

---

# 35. Provider Error Mapping

Providerların kendi hata formatları application seviyesine taşınmamalıdır.

Örneğin:

```text
Meta 401
OpenWA 401
```

uygulamada:

```text
AUTHENTICATION_FAILED
```

olarak normalize edilebilir.

---

# 36. Application Error Model

Ortak hata yapısı:

```ts
type AppError = {
  code: string;
  message: string;
  retryable: boolean;
  userMessage: string;
};
```

Örnek:

```text
NETWORK_ERROR
retryable: true
```

ve:

```text
INVALID_PHONE
retryable: false
```

---

# 37. Queue Architecture

Queue doğrudan UI state'i değildir.

Hedef:

```text
React UI
   ↓
Queue Application Service
   ↓
Send Job Store
   ↓
Queue Worker
   ↓
Provider
```

---

# 38. Queue Worker

Worker:

1. pending job bulur,
2. job lock eder,
3. validation yapar,
4. provider seçer,
5. send attempt oluşturur,
6. gönderimi yapar,
7. provider response'u doğrular,
8. state günceller.

---

# 39. Queue Locking

Aynı job aynı anda iki worker tarafından alınmamalıdır.

Örneğin database state:

```text
pending
```

iken transaction ile:

```text
sending
```

haline getirilmelidir.

Bu geçiş atomik olmalıdır.

---

# 40. Queue Lifecycle

```text
created
   ↓
pending
   ↓
validating
   ↓
sending
   ├───────────────┐
   ↓               ↓
success          unknown
   │               │
   ↓               ↓
completed       manual review
```

Hata:

```text
sending
   ↓
failed
   ↓
retrying
   ↓
sending
```

---

# 41. Unknown State

`unknown` kritik bir domain state'dir.

Örneğin:

```text
Provider accepted?
Unknown.

Network response?
Lost.

Message actually sent?
Possibly.
```

Bu nedenle:

```text
unknown
```

otomatik olarak:

```text
failed
```

değildir.

---

# 42. Idempotency

Her job:

```text
idempotencyKey
```

taşımalıdır.

Provider destekliyorsa provider tarafında da idempotency kullanılmalıdır.

Desteklemiyorsa Vatsap kendi job state'i ve provider message ID'si üzerinden duplicate kontrolü yapmalıdır.

---

# 43. Retry Policy

Retry yalnızca `retryable=true` hatalarda yapılmalıdır.

Örnek:

```text
NETWORK_ERROR
TIMEOUT
RATE_LIMIT
TEMPORARY_PROVIDER_ERROR
```

Retry edilebilir.

Şunlar retry edilmemelidir:

```text
INVALID_PHONE
AUTHENTICATION_FAILED
INVALID_TEMPLATE
FILE_NOT_FOUND
MATCHING_FAILED
```

---

# 44. Retry Backoff

Önerilen:

```text
Attempt 1 → 1 sec
Attempt 2 → 2 sec
Attempt 3 → 4 sec
Attempt 4 → stop
```

Gerçek değerler provider limitlerine göre değişebilir.

---

# 45. Queue Persistence

Queue yalnızca memory'de tutulmamalıdır.

Uygulama kapanırsa:

```text
pending
sending
retrying
unknown
```

jobları database'den yeniden değerlendirilebilmelidir.

---

# 46. Crash Recovery

Uygulama:

```text
sending
```

durumunda kapanırsa açılışta job doğrudan tekrar gönderilmemelidir.

Önce:

```text
last attempt
provider message ID
provider status
idempotency key
```

kontrol edilmelidir.

Sonuç bilinmiyorsa:

```text
unknown
```

durumuna geçebilir.

---

# 47. PDF Pipeline

PDF sistemi:

```text
Folder Selection
       ↓
File Discovery
       ↓
File Validation
       ↓
PDF Parsing
       ↓
Text Extraction
       ↓
Normalization
       ↓
Matching
       ↓
Confidence
       ↓
Review
       ↓
Send Job
```

şeklinde çalışmalıdır.

---

# 48. File Discovery

Klasör taramasında:

- yalnızca izin verilen extension,
- dosya boyutu,
- okunabilirlik,
- duplicate dosya

kontrol edilmelidir.

---

# 49. PDF Hash

PDF için mümkünse hash oluşturulmalıdır.

Örneğin:

```text
SHA-256
```

Hash:

- duplicate detection,
- idempotency,
- aynı PDF'in tekrar import edilmesini önleme

amacıyla kullanılabilir.

---

# 50. Text Extraction

Mevcut `pdfTextExtractor` korunabilir ancak abstraction altına alınmalıdır.

Örneğin:

```ts
interface PdfTextExtractor {
  extract(
    file: PdfInput
  ): Promise<PdfTextResult>;
}
```

---

# 51. OCR

OCR gelecekte aynı abstraction üzerinden eklenebilir:

```text
PdfTextExtractor
├── TextLayerExtractor
└── OcrExtractor
```

Fallback:

```text
Text layer available
        ↓
use text extraction

No usable text
        ↓
OCR
```

OCR V2'nin ilk release zorunluluğu değildir.

---

# 52. Text Normalization

Matching için:

```text
lowercase
trim
whitespace normalization
Turkish character normalization
punctuation normalization
```

uygulanabilir.

Ancak database'deki orijinal öğrenci adı değiştirilmez.

---

# 53. Matching Architecture

Matching:

```text
PDF text
   ↓
Candidate extraction
   ↓
Candidate scoring
   ↓
Confidence
   ↓
Threshold
   ├── automatic
   ├── review
   ├── manual
   └── unmatched
```

---

# 54. Matching Algorithm

V1'deki greedy sorting yaklaşımı küçük veri setlerinde kullanılabilir.

Ancak ölçek büyüdüğünde:

```text
students × PDFs
```

confidence matrix oluşturulabilir.

Gelecekte global assignment algoritması uygulanabilir.

Bu P2 seviyesindedir.

---

# 55. Matching Confidence

Standart:

```text
95–100 → automatic
85–94  → review
70–84  → manual
<70    → unmatched
```

Bu threshold güvenlik gereğidir.

---

# 56. Matching Rules

Öncelik:

```text
Student Number
        ↓
Exact Name
        ↓
Name + Class
        ↓
Fuzzy Name
```

Öğrenci numarası varsa güçlü identifier olarak tercih edilmelidir.

---

# 57. Manual Matching

Kullanıcı:

```text
PDF
↓
candidate students
↓
manual selection
```

yapabilir.

Manual override:

```text
audit log
```

içinde tutulabilir.

---

# 58. Pre-Send Validation Pipeline

Gönderimden önce:

```text
Student
 ↓
Phone
 ↓
PDF
 ↓
Match
 ↓
Confidence
 ↓
Template
 ↓
Provider
 ↓
Credential
 ↓
Duplicate
 ↓
Queue
```

kontrol edilmelidir.

---

# 59. Security Gate

Tek bir application service:

```text
validateSendJob()
```

veya:

```text
validateSendBatch()
```

kullanılabilir.

Amaç:

> Gönderim kurallarını UI componentlerine dağıtmamak.

---

# 60. Send Batch

Kullanıcı:

```text
10 öğrenci
```

seçtiğinde:

```text
SendBatch
```

oluşturulur.

Batch:

```text
batchId
createdAt
provider
template
jobIds
```

içerebilir.

---

# 61. Batch State

```text
draft
validated
running
paused
completed
partial
cancelled
```

olabilir.

---

# 62. Send Flow

```text
User
 ↓
Select Students
 ↓
Select PDF Folder
 ↓
Scan
 ↓
Match
 ↓
Review
 ↓
Select Template
 ↓
Pre-Send Validation
 ↓
Create Batch
 ↓
Create Jobs
 ↓
Start Queue
 ↓
Provider
 ↓
Track Results
 ↓
Report
```

---

# 63. Database Architecture

SQLite V2'nin ana local persistence katmanıdır.

Önerilen tablolar:

```text
students
pdf_documents
pdf_matches
templates
send_batches
send_jobs
send_attempts
message_history
audit_logs
settings
app_metadata
```

---

# 64. Students Table

```sql
students
--------
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

Index:

```text
student_number
phone
last_name
active
```

---

# 65. PDF Documents Table

```sql
pdf_documents
-------------
id
file_name
file_path
file_size
file_hash
created_at
updated_at
```

PDF içeriğinin tamamını database'e yazmak zorunlu değildir.

---

# 66. PDF Matches Table

```sql
pdf_matches
-----------
id
pdf_id
student_id
score
status
reasons_json
created_at
updated_at
```

---

# 67. Templates Table

```sql
templates
---------
id
name
content
type
meta_template_id
variables_json
active
created_at
updated_at
```

`type`:

```text
application
meta
```

olabilir.

---

# 68. Send Batches Table

```sql
send_batches
------------
id
provider
template_id
status
total_jobs
successful_jobs
failed_jobs
unknown_jobs
created_at
started_at
completed_at
```

---

# 69. Send Jobs Table

```sql
send_jobs
---------
id
batch_id
student_id
pdf_id
template_id
provider
status
idempotency_key
created_at
started_at
completed_at
```

---

# 70. Send Attempts Table

```sql
send_attempts
-------------
id
job_id
attempt_number
status
provider_message_id
error_code
error_message
started_at
finished_at
```

---

# 71. Audit Logs Table

```sql
audit_logs
----------
id
action
entity_type
entity_id
metadata_json
created_at
```

Hassas credential bilgileri metadata içinde tutulamaz.

---

# 72. Settings Table

Settings:

```text
key
value
updated_at
```

gibi tutulabilir.

Ancak secret değerler burada plain text tutulmamalıdır.

Örneğin:

```text
meta_configured = true
```

saklanabilir.

Token:

```text
safeStorage
```

üzerinde tutulur.

---

# 73. App Metadata

```sql
app_metadata
------------
key
value
```

Örneğin:

```text
schema_version
last_migration
first_launch
```

---

# 74. Database Repository

Domain/application katmanı doğrudan SQL yazmamalıdır.

Örneğin:

```ts
studentRepository.findById(id)
```

kullanılabilir.

Repository:

```text
Application
 ↓
Repository
 ↓
SQLite
```

şeklinde çalışır.

---

# 75. Repository Interfaces

Örnek:

```ts
interface StudentRepository {
  findById(id: string): Promise<Student | null>;
  list(): Promise<Student[]>;
  create(student: NewStudent): Promise<Student>;
  update(id: string, data: UpdateStudent): Promise<Student>;
  delete(id: string): Promise<void>;
}
```

---

# 76. Transaction Boundary

Birden fazla database işlemi tek business action oluşturuyorsa transaction kullanılmalıdır.

Örneğin:

```text
createBatch
+
create10Jobs
```

tek transaction olabilir.

---

# 77. Database Migration

Her schema değişikliği migration olarak tutulmalıdır.

```text
database/migrations/
├── 001_initial.sql
├── 002_add_pdf_hash.sql
├── 003_add_send_attempts.sql
└── 004_add_audit_logs.sql
```

---

# 78. Migration Rules

Migration:

- versioned,
- deterministic,
- idempotent olmaya mümkün olduğunca yakın,
- transaction-safe

olmalıdır.

Migration dosyaları sonradan değiştirilmemelidir.

Yeni değişiklik yeni migration oluşturmalıdır.

---

# 79. Secure Storage Architecture

Credential storage:

```text
CredentialService
       ↓
Electron safeStorage
       ↓
OS-protected storage
```

Application code:

```text
MetaCloudProvider
        ↓
CredentialService
```

şeklinde credential almalıdır.

Provider doğrudan safeStorage API çağırmamalıdır.

---

# 80. Credential Service

Önerilen:

```ts
interface CredentialService {
  has(key: CredentialKey): Promise<boolean>;
  set(key: CredentialKey, value: string): Promise<void>;
  clear(key: CredentialKey): Promise<void>;
  get(key: CredentialKey): Promise<string | null>;
}
```

`get()` yalnızca Main Process içinde kullanılmalıdır.

---

# 81. Credential Keys

```ts
type CredentialKey =
  | "meta_access_token"
  | "openwa_api_key"
  | "openwa_session_secret";
```

Yeni credential eklenirken explicit enum/type güncellenmelidir.

---

# 82. Filesystem Service

Dosya işlemleri tek bir service üzerinden yönetilebilir.

```ts
interface FileService {
  selectFolder(): Promise<SelectedFolder>;
  listPdfs(folder: FolderId): Promise<PdfFile[]>;
  readPdf(id: PdfId): Promise<Buffer>;
  deleteTempFile(id: string): Promise<void>;
}
```

Renderer `fs` kullanmaz.

---

# 83. Network Service

Provider requestleri doğrudan UI'dan yapılmamalıdır.

Örneğin:

```text
MetaCloudProvider
 ↓
HttpClient
 ↓
Meta API
```

HttpClient:

- timeout,
- abort,
- response parsing,
- safe error handling

sağlayabilir.

---

# 84. HTTP Client Güvenliği

HTTP client:

- arbitrary URL kabul etmemeli,
- timeout zorunlu olmalı,
- response size kontrol edilebilmeli,
- JSON validation yapılmalı.

---

# 85. Backup Architecture

Backup service:

```text
Database
 ↓
Export DTO
 ↓
Schema validation
 ↓
Optional encryption
 ↓
File
```

Restore:

```text
File
 ↓
Parse
 ↓
Validate
 ↓
Migration
 ↓
Transaction
 ↓
Database
```

---

# 86. Backup DTO

Database'in doğrudan dump'ı yerine versioned DTO tercih edilebilir.

Örneğin:

```json
{
  "schemaVersion": 1,
  "appVersion": "2.0.0",
  "exportedAt": "...",
  "students": [],
  "templates": [],
  "history": []
}
```

---

# 87. UI State Architecture

React UI state:

```text
local UI state
```

ile:

```text
persistent application state
```

ayrılmalıdır.

Örneğin:

```text
Modal açık mı?
```

React state.

```text
Öğrenci kim?
```

Database.

```text
Queue hangi jobda?
```

Application state + database.

---

# 88. Server State

Electron IPC'den gelen bilgiler UI state'e aktarılabilir.

Örneğin:

```text
useStudents()
useSendBatch()
useProviderStatus()
```

gibi hooklar kullanılabilir.

Ancak hooklar business logic'in tamamını içermemelidir.

---

# 89. Event Architecture

Queue ilerlemesi için Main → Renderer eventleri kullanılabilir.

Örneğin:

```text
queue:progress
queue:job-updated
queue:completed
provider:status-changed
```

Event payloadları minimal olmalıdır.

Secret veya gereksiz kişisel veri gönderilmemelidir.

---

# 90. Event Validation

Renderer'a gelen eventler de güvenilir kabul edilmemelidir.

Payload schema doğrulanabilir.

---

# 91. Main → Renderer Communication

Örnek:

```text
Main
 ↓
queue:job-updated
 ↓
Preload
 ↓
React hook
 ↓
UI
```

Preload event listener abstraction sağlar.

---

# 92. IPC API Tasarımı

Preload:

```ts
window.vatsap.students.list()
window.vatsap.students.create()
window.vatsap.pdf.scan()
window.vatsap.pdf.match()
window.vatsap.send.validate()
window.vatsap.send.start()
window.vatsap.queue.pause()
window.vatsap.queue.resume()
window.vatsap.provider.status()
```

gibi domain-oriented API sunmalıdır.

---

# 93. IPC API'de Kaçınılacak Yapı

Aşağıdaki yapı kullanılmamalıdır:

```ts
window.vatsap.invoke(channel, payload)
```

Böyle bir generic API renderer'a gereğinden fazla güç verir.

Domain-specific API daha güvenlidir.

---

# 94. Main IPC Handler Pattern

Her handler:

```text
IPC
 ↓
Parse
 ↓
Validate
 ↓
Application Service
 ↓
Repository / Provider
 ↓
Safe Response
```

kullanmalıdır.

Örneğin:

```text
messages:send
 ↓
validateSendRequest()
 ↓
sendMessageUseCase.execute()
 ↓
queue
 ↓
provider
```

---

# 95. UI ile Provider Arasında Doğrudan Bağlantı Yok

Yanlış:

```text
React
 ↓
MetaCloudProvider
```

Doğru:

```text
React
 ↓
IPC
 ↓
SendMessageUseCase
 ↓
ProviderFactory
 ↓
MetaCloudProvider
```

---

# 96. UI ile Database Arasında Doğrudan Bağlantı Yok

Yanlış:

```text
React
 ↓
SQLite
```

Doğru:

```text
React
 ↓
IPC
 ↓
StudentService
 ↓
StudentRepository
 ↓
SQLite
```

---

# 97. UI ile Filesystem Arasında Doğrudan Bağlantı Yok

Yanlış:

```text
React
 ↓
fs.readFile
```

Doğru:

```text
React
 ↓
IPC
 ↓
FileService
 ↓
Filesystem
```

---

# 98. Application Services

Önerilen use-case'ler:

```text
CreateStudent
UpdateStudent
DeleteStudent
ImportStudents

ScanPdfFolder
ExtractPdfText
MatchPdfs
ReviewMatches

CreateMessageTemplate
ValidateMessage

ValidateSendBatch
CreateSendBatch
StartSendBatch
PauseSendBatch
ResumeSendBatch
CancelSendBatch
RetrySendJob

GetProviderStatus
ConfigureProvider

CreateBackup
RestoreBackup
```

---

# 99. SendBatch Use Case

`ValidateSendBatch` yalnızca validation yapmalıdır.

Örneğin:

```text
students
PDFs
phone
matches
templates
provider
credentials
duplicates
```

kontrol eder.

Gerçek gönderim yapmaz.

---

# 100. StartSendBatch Use Case

`StartSendBatch`:

1. batch durumunu kontrol eder,
2. validated olduğunu doğrular,
3. jobs oluşturur,
4. queue başlatır.

---

# 101. Provider Status Use Case

Provider status:

```text
configured
ready
requires_user_action
offline
error
```

olarak dönebilir.

Credential değeri dönmez.

---

# 102. Main Process'te Business Logic

Business logic yalnızca IPC handler içinde yazılmamalıdır.

Yanlış:

```ts
ipcMain.handle("send", async (...) => {
  // 200 lines business logic
});
```

Doğru:

```text
IPC Handler
 ↓
SendBatchService
 ↓
QueueService
 ↓
Provider
```

---

# 103. IPC Handler Boyutu

IPC handler mümkün olduğunca ince olmalıdır.

İdeal:

```ts
return sendBatchService.validate(input);
```

---

# 104. Error Boundary

Renderer'da:

```text
App Error Boundary
```

olmalıdır.

Main process'te de:

```text
uncaught exception
unhandled rejection
```

kontrollü şekilde ele alınmalıdır.

Ancak hatayı gizlemek yerine güvenli şekilde kaydetmek gerekir.

---

# 105. Logging Architecture

Önerilen:

```text
Logger
├── info
├── warn
├── error
└── debug
```

Production:

```text
debug disabled
```

Sensitive fields mask edilir.

---

# 106. Logger Redaction

Logger otomatik olarak:

```text
token
authorization
apiKey
phone
email
```

gibi alanları maskeyebilir.

---

# 107. UI Logging

React componentleri doğrudan production log spam'i üretmemelidir.

Özellikle:

```text
console.log(student)
console.log(pdfText)
console.log(response)
```

kullanımlarından kaçınılmalıdır.

---

# 108. Observability

V2'de gözlemlenebilirlik:

```text
Queue status
Provider status
Error code
Job ID
Batch ID
```

üzerinden yapılmalıdır.

Tam kişisel veri loglamak gözlemlenebilirlik değildir.

---

# 109. Performance Architecture

PDF işlemleri UI thread'i bloklamamalıdır.

Ağır işlemler:

```text
Main process
worker
```

üzerinden yapılabilir.

Özellikle:

- PDF parsing
- OCR
- büyük matching işlemleri

için worker yaklaşımı ileride kullanılabilir.

---

# 110. Renderer Performance

Renderer:

- tüm PDF textlerini state'te tutmamalı,
- binlerce öğrenci için gereksiz re-render oluşturmamalı,
- büyük tablolar için virtualization değerlendirmeli.

---

# 111. Queue Performance

İlk V2 sürümünde güvenli düşük concurrency tercih edilir.

Önerilen başlangıç:

```text
1 active send
```

Daha sonra provider limitlerine göre artırılabilir.

---

# 112. Batch Processing

PDF işlemleri:

```text
scan
 ↓
process one
 ↓
store result
 ↓
next
```

şeklinde yapılabilir.

Tüm dosyaları RAM'e almak tercih edilmez.

---

# 113. Application Lifecycle

Başlangıç:

```text
App launch
 ↓
Database initialize
 ↓
Migrations
 ↓
Credential service initialize
 ↓
Recover unfinished jobs
 ↓
Register IPC
 ↓
Create BrowserWindow
```

---

# 114. Database Initialization

Database initialization başarısızsa uygulama:

```text
normal mode
```

ile devam etmemelidir.

Kullanıcıya açık bir recovery ekranı gösterilebilir.

---

# 115. Crash Recovery

Açılışta:

```text
sending
retrying
```

durumundaki joblar kontrol edilir.

Provider sonucu doğrulanabiliyorsa state güncellenir.

Doğrulanamıyorsa:

```text
unknown
```

yapılır.

---

# 116. Graceful Shutdown

Uygulama kapanırken:

```text
1. Yeni job alma
2. Queue state kaydet
3. Aktif requestleri mümkünse abort et
4. Database transactionları tamamla
5. Temporary files cleanup
6. Window kapat
```

yapılmalıdır.

---

# 117. Application Startup Recovery

Örneğin:

```text
Job 123 = sending
```

uygulama çöktü.

Açılış:

```text
Job 123
 ↓
Previous attempt exists
 ↓
Provider result unknown
 ↓
unknown
```

olmalıdır.

Otomatik blind retry yapılmamalıdır.

---

# 118. Security Architecture

Güvenlik sınırları:

```text
                    UNTRUSTED
                       │
                 ┌─────▼─────┐
                 │  Renderer │
                 └─────┬─────┘
                       │
                  Secure IPC
                       │
                 ┌─────▼─────┐
                 │   Main    │
                 └─────┬─────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
   Database       Credential       Providers
       │           safeStorage          │
       │               │                │
       └───────────────┼────────────────┘
                       │
                  External APIs
```

---

# 119. External Trust Boundary

External sistemlerden gelen her response:

```text
untrusted external input
```

olarak değerlendirilmelidir.

Örneğin Meta API response'u bile schema validation'dan geçebilir.

---

# 120. UI Navigation Architecture

Ana navigasyon:

```text
Gönder
Öğrenciler
Geçmiş
Ayarlar
```

olabilir.

Gönder ekranı ana workflow'u yönetir.

---

# 121. Gönder Ekranı

Gönder:

```text
Step 1
Öğrenciler

Step 2
PDF

Step 3
Eşleştirme

Step 4
Kontrol

Step 5
Gönder

Step 6
Sonuç
```

şeklinde step-based tasarlanabilir.

Ancak kullanıcı her işlemde gereksiz wizard zorunluluğuna sokulmamalıdır.

---

# 122. Pre-Send Review UI

Review ekranı:

```text
Student
Parent
Phone
PDF
Match score
Template preview
Provider
```

gösterebilir.

Sorunlar ayrı gösterilir:

```text
10 hazır
1 kontrol gerekiyor
0 geçersiz
```

---

# 123. Sending UI

Gönderim sırasında:

```text
8 / 10
```

gibi progress gösterilmelidir.

Her job:

```text
✓ Başarılı
✕ Başarısız
? Doğrulanamadı
```

olarak gösterilebilir.

---

# 124. Result UI

Gönderim sonunda:

```text
Tamamlandı

8 başarılı
1 başarısız
1 doğrulanamadı
```

gösterilir.

`unknown` özellikle görünür olmalıdır.

---

# 125. Design Architecture

UI:

```text
Neutral
Minimal
Functional
Trust-oriented
```

olmalıdır.

Tasarım:

```text
Apple / Notion
```

sadelik anlayışından ilham alabilir.

---

# 126. Design Anti-Patterns

Kaçınılacak:

```text
AI dashboard
Purple gradient
Gradient text
Glassmorphism
Excessive cards
Excessive shadows
Huge rounded containers
Decorative AI icons
Emoji-based actions
```

---

# 127. Component Architecture

Shared UI:

```text
Button
Input
Select
Dialog
Table
Badge
Progress
Toast
EmptyState
ErrorState
```

feature componentleri:

```text
StudentTable
PdfMatchTable
SendReview
QueueProgress
ProviderStatus
```

---

# 128. Component Rules

Component:

- business logic'i minimum tutmalı,
- IPC çağrısını doğrudan her yerde yapmamalı,
- reusable logic hook/service'e taşınmalı.

---

# 129. Hooks

Örneğin:

```text
useStudents()
usePdfMatching()
useSendBatch()
useQueue()
useProviderStatus()
useTemplates()
```

kullanılabilir.

Hooklar IPC abstraction'ını kullanır.

---

# 130. API Client Layer

Renderer:

```text
window.vatsap
```

API'sini kullanır.

Örneğin:

```ts
const students = await window.vatsap.students.list();
```

---

# 131. Type Sharing

IPC request/response type'ları ortak TypeScript type'ları üzerinden tanımlanmalıdır.

Örneğin:

```text
shared/
├── ipc.ts
├── student.ts
├── pdf.ts
├── message.ts
└── provider.ts
```

---

# 132. IPC Contract

Her IPC için:

```text
channel
request
response
errors
```

tanımlanmalıdır.

Örneğin:

```text
students:list

Request:
{
  activeOnly?: boolean
}

Response:
Student[]
```

---

# 133. IPC Versioning

Şimdilik gerekli değilse versioning aşırı karmaşıklaştırılmamalıdır.

Ancak büyük API değişikliklerinde:

```text
v2
```

veya migration layer düşünülebilir.

---

# 134. Shared Types

Shared type'lar:

```text
Renderer
Main
Tests
```

tarafından kullanılabilir.

Ancak shared type içine Node-specific dependency konulmamalıdır.

---

# 135. Security-Critical Types

Özellikle:

```text
Credential
ProviderConfig
FilePath
SendJob
```

type'ları dikkatle tasarlanmalıdır.

Örneğin `ProviderConfig` renderer'da token içermemelidir.

---

# 136. Provider Config

Renderer-safe config:

```ts
type ProviderConfigView = {
  provider: ProviderType;
  configured: boolean;
  ready: boolean;
};
```

Secret içeren config:

```ts
type ProviderSecretConfig = {
  accessToken: string;
};
```

sadece Main Process'te kullanılmalıdır.

---

# 137. Database ID

ID'ler:

```text
UUID
```

veya güvenilir unique ID sistemiyle oluşturulabilir.

ID generation tek bir abstraction üzerinden yapılabilir.

---

# 138. Time

Database timestamp:

```text
ISO / UTC
```

formatında tutulabilir.

UI local timezone gösterir.

---

# 139. Hashing

PDF duplicate detection için:

```text
SHA-256
```

kullanılabilir.

Password hashing şu an Vatsap'ın temel ihtiyacı değildir çünkü kullanıcı password sistemi yoktur.

---

# 140. Encryption

V2'de:

```text
Credential encryption
```

zorunludur.

Normal database encryption ise kullanım senaryosuna göre değerlendirilebilir.

SQLite encryption eklemek için rastgele custom crypto yazılmamalıdır.

---

# 141. Cryptography Rule

Kendi encryption algoritması yazılmayacak.

Güvenilir platform/API:

```text
Electron safeStorage
Web Crypto
Node crypto
```

gibi standart çözümler kullanılmalıdır.

---

# 142. Randomness

Idempotency key veya temporary filename gibi security-sensitive random değerlerde:

```text
cryptographically secure random
```

kullanılmalıdır.

`Math.random()` kullanılmamalıdır.

---

# 143. Temporary Names

Geçici dosya isimleri:

```text
student-result.pdf
```

gibi tahmin edilebilir olmamalıdır.

Random ID kullanılmalıdır.

---

# 144. Import Security

CSV/Excel import:

```text
parse
 ↓
validate headers
 ↓
validate rows
 ↓
normalize
 ↓
duplicate check
 ↓
preview
 ↓
commit
```

şeklinde çalışmalıdır.

---

# 145. CSV Formula Injection

CSV export/import yapılırken spreadsheet formula injection dikkate alınmalıdır.

Örneğin:

```text
=HYPERLINK(...)
```

gibi değerlerin Excel tarafından formula olarak yorumlanması engellenmelidir.

---

# 146. Export Security

CSV/Excel export:

- kullanıcı seçtiği path'e yazmalı,
- hassas veri içerdiğini belirtmeli,
- gereksiz alanları export etmemeli.

---

# 147. Import Preview

Bulk import doğrudan database'e yazılmamalıdır.

Önce:

```text
Preview
```

gösterilmelidir.

Örneğin:

```text
120 satır
115 geçerli
3 duplicate
2 hatalı telefon
```

---

# 148. Search

Öğrenci araması:

- local database üzerinden yapılabilir,
- hassas veri dış servise gönderilmemelidir.

---

# 149. No Unnecessary Cloud Dependency

Vatsap'ın temel workflow'u:

```text
Students
PDF
Matching
Queue
```

için cloud service zorunlu olmamalıdır.

Bu hem privacy hem reliability açısından daha iyidir.

---

# 150. Offline Architecture

Mümkün olduğu kadar:

```text
Student management
PDF matching
Templates
History
Backup
```

offline çalışabilmelidir.

WhatsApp gönderimi provider bağlantısına bağlıdır.

---

# 151. Provider Offline State

Provider bağlantısı yoksa:

```text
Queue paused
```

olabilir.

Ancak kullanıcı verileri kaybolmamalıdır.

---

# 152. Connectivity Recovery

Network geri geldiğinde:

```text
provider ready
 ↓
revalidate queue
 ↓
continue safe jobs
```

yapılabilir.

`unknown` joblar otomatik blind retry edilmemelidir.

---

# 153. Auto Recovery

Otomatik recovery:

```text
safe deterministic states
```

için kullanılabilir.

Belirsiz state:

```text
unknown
```

için manuel review tercih edilir.

---

# 154. Testing Architecture

Testler:

```text
tests/
├── unit/
├── integration/
├── security/
└── fixtures/
```

olarak ayrılabilir.

---

# 155. Unit Tests

Unit:

```text
phoneNormalizer
textNormalizer
matchScorer
templateRenderer
retryPolicy
stateMachine
```

test edilir.

---

# 156. Integration Tests

Integration:

```text
SQLite
repositories
queue
provider mock
backup
IPC
```

test edilir.

---

# 157. Security Tests

Security:

```text
IPC abuse
path traversal
SSRF
secret exposure
XSS
backup injection
oversized payload
```

test edilir.

---

# 158. Provider Mock

Gerçek WhatsApp API testlerde kullanılmamalıdır.

Mock provider:

```ts
FakeWhatsAppProvider
```

oluşturulabilir.

Senaryolar:

```text
success
timeout
rate limit
auth error
unknown response
```

---

# 159. End-to-End Test

E2E:

```text
Student import
 ↓
PDF import
 ↓
Match
 ↓
Review
 ↓
Create batch
 ↓
Send
 ↓
Report
```

akışını test edebilir.

Gerçek WhatsApp hesabı kullanılmamalıdır.

---

# 160. CI Pipeline

GitHub Actions:

```text
checkout
 ↓
install
 ↓
typecheck
 ↓
lint
 ↓
unit tests
 ↓
integration tests
 ↓
security tests
 ↓
build
```

---

# 161. Build Pipeline

Production:

```text
React build
 ↓
Electron package
 ↓
sign
 ↓
artifact
 ↓
release
```

---

# 162. Release Artifacts

Release:

```text
Windows
macOS
```

hedeflerine göre paketlenebilir.

Platform-specific security requirements ayrıca değerlendirilmelidir.

---

# 163. macOS

macOS için ileride:

- code signing,
- notarization,
- hardened runtime

kullanılmalıdır.

---

# 164. Windows

Windows için ileride:

- code signing,
- installer integrity,
- update signature

değerlendirilmelidir.

---

# 165. Auto Update

Auto update mimariye sonradan eklenebilir.

Update sistemi:

```text
Check
 ↓
Verify
 ↓
Download
 ↓
Install
```

şeklinde güvenli olmalıdır.

---

# 166. Feature Flags

Feature flag kullanılacaksa güvenlik özelliğini bypass etmek için kullanılmamalıdır.

Örneğin:

```text
DISABLE_MATCHING_THRESHOLD=true
```

gibi production bypass flagleri olmamalıdır.

---

# 167. Environment Separation

```text
development
test
production
```

ortamları ayrılmalıdır.

Production database testte kullanılmamalıdır.

Production WhatsApp credentials testlerde kullanılmamalıdır.

---

# 168. Test Data

Testler:

```text
Ahmet Test
Ayşe Test
```

gibi fake data kullanmalıdır.

Gerçek öğrenci/veli verileri repository'ye veya test fixture'larına konulmamalıdır.

---

# 169. Test PDF

Test PDF'leri:

```text
tests/fixtures/
```

altında anonim/fake data ile tutulabilir.

Gerçek sınav sonuçları repository'ye konulmamalıdır.

---

# 170. Configuration Architecture

Config üç kategoriye ayrılabilir:

```text
Public App Config
Secure Config
Runtime State
```

---

# 171. Public App Config

Örnek:

```text
theme
language
default provider
UI preferences
```

---

# 172. Secure Config

Örnek:

```text
Meta token
OpenWA API key
session secret
```

safeStorage.

---

# 173. Runtime State

Örnek:

```text
active batch
queue status
provider connection
current scan
```

memory/database üzerinden yönetilebilir.

---

# 174. Config Access

Renderer:

```text
getPublicSettings()
```

alabilir.

Secret:

```text
getSecret()
```

renderer'a açılmaz.

---

# 175. Migration from localStorage

Mevcut localStorage:

```text
students
templates
history
config
```

kullanımı kademeli olarak kaldırılmalıdır.

Migration:

```text
read old localStorage
 ↓
validate
 ↓
transform
 ↓
insert SQLite
 ↓
verify
 ↓
mark migrated
```

---

# 176. Secret Migration

Eski localStorage'da secret varsa:

```text
read
 ↓
validate
 ↓
move to safeStorage
 ↓
verify
 ↓
delete old localStorage secret
```

yapılmalıdır.

Eski secret temizlenmeden migration tamamlanmış sayılmaz.

---

# 177. Migration Failure

Migration yarıda kalırsa:

```text
original data
```

korunmalıdır.

Secret migration sırasında özellikle:

```text
copy
verify
delete
```

sırası kullanılmalıdır.

---

# 178. LocalStorage Final State

V2 sonunda localStorage yalnızca:

```text
UI preference
temporary UI state
```

gibi düşük hassasiyetli bilgiler için kullanılabilir.

Ana business data:

```text
SQLite
```

olmalıdır.

---

# 179. Architecture Decision Rule

Yeni bir feature için:

### UI mı?

Renderer.

### Business logic mi?

Application/Domain.

### Database mi?

Repository/Infrastructure.

### External API mi?

Provider/Infrastructure.

### Credential mı?

CredentialService/Main.

### Dosya mı?

FileService/Main.

Bu ayrım korunmalıdır.

---

# 180. Dependency Direction

Hedef:

```text
Renderer
   ↓
IPC
   ↓
Application
   ↓
Domain
   ↑
Infrastructure
```

Infrastructure domain'i implement eder.

Domain infrastructure'a doğrudan bağımlı olmamalıdır.

---

# 181. Forbidden Dependencies

Domain layer:

```text
React
Electron
fs
ipcRenderer
window
```

kullanmamalıdır.

Renderer:

```text
fs
sqlite
safeStorage
provider implementation
```

kullanmamalıdır.

---

# 182. Circular Dependency

Modüller arasında circular dependency oluşturulmamalıdır.

Örneğin:

```text
Provider → UI → Provider
```

yasaktır.

---

# 183. Naming Rules

Entity:

```text
Student
SendJob
PdfDocument
```

Service:

```text
StudentService
QueueService
BackupService
```

Repository:

```text
StudentRepository
SendJobRepository
```

Provider:

```text
MetaCloudProvider
OpenWAProvider
```

Use Case:

```text
CreateStudent
StartSendBatch
```

---

# 184. File Naming

Dosya isimleri domain'e göre açık olmalıdır.

Kaçınılacak:

```text
utils2.ts
helper.ts
misc.ts
manager.ts
```

Tercih:

```text
phoneNormalizer.ts
matchScorer.ts
sendJobRepository.ts
credentialService.ts
```

---

# 185. Generic Utils

`utils/` klasörü her şeyi atılan bir klasör olmamalıdır.

Bir utility yalnızca gerçekten cross-domain kullanılıyorsa burada bulunmalıdır.

---

# 186. Business Rules

Önemli business rule'lar UI içinde bulunmamalıdır.

Örneğin:

```text
score >= 95
```

şartı component içine hardcode edilmemelidir.

Domain/config seviyesinde bulunmalıdır.

---

# 187. Matching Threshold Config

Örneğin:

```ts
const MATCH_THRESHOLDS = {
  automatic: 95,
  review: 85,
  manual: 70
};
```

Ama güvenlik kritik threshold kullanıcı tarafından güvenli olmayan şekilde değiştirilememelidir.

---

# 188. Provider Configuration

Provider config:

```text
provider type
enabled
```

gibi public metadata içerebilir.

Secretlar ayrı tutulmalıdır.

---

# 189. Template Rendering

Template:

```text
"Merhaba {{veli_adi}}"
```

renderer:

```text
variables
```

ile güvenli şekilde doldurulmalıdır.

Arbitrary JavaScript evaluation kesinlikle kullanılmamalıdır.

---

# 190. Template Engine

Kaçınılacak:

```ts
eval(template)
```

veya:

```ts
new Function(template)
```

kullanımı.

Template engine yalnızca whitelist variable replacement yapmalıdır.

---

# 191. PDF Filename Trust

PDF filename:

```text
Ahmet Yılmaz.pdf
```

gibi kullanıcıdan gelebilir.

Filename:

- HTML olarak render edilmemeli,
- SQL'e raw string olarak concat edilmemeli,
- shell command içine escape edilmeden verilmemeli.

---

# 192. Shell Execution

PDF veya filename üzerinden shell command oluşturulmamalıdır.

Özellikle:

```text
exec(userProvidedFilename)
```

yasaktır.

---

# 193. Child Process

OCR veya external CLI kullanılacaksa:

- argument array kullan,
- shell interpolation kullanma,
- timeout koy,
- output size limit koy,
- exit code kontrol et.

---

# 194. External Executables

Gelecekte OCR engine eklenirse executable path kullanıcıdan doğrudan alınmamalıdır.

Allowlist veya trusted installation path kullanılmalıdır.

---

# 195. Process Isolation

Ağır veya riskli PDF/OCR parserları mümkün olduğunda ayrı process/worker içinde çalıştırılabilir.

Bu P2 seviyesinde geliştirilebilir.

---

# 196. Memory Safety

Node/Electron tarafında büyük binary veriler için:

```text
Buffer
stream
worker
```

kullanımı değerlendirilmeli.

Gereksiz:

```text
base64 string
```

çoğaltılmamalıdır.

---

# 197. Large Batch Strategy

10 öğrenci için:

```text
sequential
```

yeterli olabilir.

100+ öğrenci için:

```text
batch
chunk
worker
```

yaklaşımı değerlendirilebilir.

---

# 198. Scaling Strategy

Vatsap'ın mevcut kullanım hacmi küçük olsa bile mimari:

```text
10 students
```

ile sınırlı tasarlanmamalıdır.

Ancak:

> Şimdiki ihtiyacı gereksiz şekilde enterprise seviyesine taşımak da doğru değildir.

---

# 199. Future Multi-Account

İleride birden fazla WhatsApp hesabı desteklenirse:

```text
whatsapp_accounts
```

entity'si eklenebilir.

SendJob:

```text
providerAccountId
```

taşıyabilir.

Bu V2'nin temel zorunluluğu değildir.

---

# 200. Future Cloud Sync

Cloud sync eklenirse:

```text
Local SQLite
        ↕
Sync Engine
        ↕
Cloud
```

ayrı bir abstraction olmalıdır.

V2'nin local-first mimarisi bozulmamalıdır.

---

# 201. Future Team Mode

Ekip kullanıcıları eklenirse:

```text
User
Role
Permission
Organization
```

domainleri eklenebilir.

Mevcut tek kullanıcı mimarisini gereksiz yere karmaşıklaştırmamak gerekir.

---

# 202. Future SaaS

Vatsap ileride SaaS'a dönüşürse mevcut local Electron mimarisi doğrudan backend olarak kullanılmamalıdır.

Yeni architecture:

```text
Electron/Web
     ↓
API
     ↓
Backend
     ↓
Database
     ↓
WhatsApp Providers
```

olabilir.

Ancak bu V2 kapsamı değildir.

---

# 203. Architecture Evolution

V2:

```text
Local-first
```

olmalıdır.

Ana veriler:

```text
local SQLite
```

üzerindedir.

External services yalnızca gerekli olduğunda kullanılır.

---

# 204. Security Boundary Summary

```text
Renderer
❌ secrets
❌ filesystem
❌ database
❌ direct provider

Main
✓ validation
✓ filesystem
✓ database
✓ provider
✓ credential access

safeStorage
✓ credentials

SQLite
✓ application data

Provider
✓ external WhatsApp
```

---

# 205. Complete Data Flow

## Öğrenci ekleme

```text
User
 ↓
Student Form
 ↓
Preload
 ↓
IPC
 ↓
Validate
 ↓
StudentService
 ↓
StudentRepository
 ↓
SQLite
 ↓
Response
 ↓
React
```

---

# 206. PDF Tarama

```text
User selects folder
 ↓
Renderer
 ↓
IPC
 ↓
FileService
 ↓
Validate folder
 ↓
List PDFs
 ↓
PDF Parser
 ↓
Text Extraction
 ↓
Matching
 ↓
Database
 ↓
Review UI
```

---

# 207. PDF Eşleştirme

```text
PDF
 ↓
Text
 ↓
Normalize
 ↓
Extract candidates
 ↓
Score
 ↓
Confidence
 ↓
Threshold
 ├── automatic
 ├── review
 ├── manual
 └── unmatched
```

---

# 208. Mesaj Gönderme

```text
User
 ↓
Pre-send validation
 ↓
Security gate
 ↓
Create batch
 ↓
Create jobs
 ↓
Queue
 ↓
Provider
 ↓
WhatsApp
 ↓
Provider response
 ↓
Validate response
 ↓
Attempt
 ↓
Job state
 ↓
History
 ↓
Report
```

---

# 209. Backup Flow

```text
User
 ↓
Backup Service
 ↓
Read database
 ↓
Remove secrets
 ↓
Create DTO
 ↓
Validate
 ↓
Serialize
 ↓
Write backup
```

---

# 210. Restore Flow

```text
Backup
 ↓
Read
 ↓
Parse
 ↓
Schema validation
 ↓
Migration
 ↓
Preview
 ↓
Transaction
 ↓
SQLite
 ↓
Verify
```

---

# 211. Credential Flow

```text
User enters token
 ↓
Renderer
 ↓
Secure IPC
 ↓
CredentialService
 ↓
safeStorage
 ↓
OS credential protection
```

Token hiçbir noktada:

```text
React state
localStorage
SQLite
log
```

içine yazılmamalıdır.

---

# 212. Queue Recovery Flow

```text
App starts
 ↓
Database
 ↓
Find unfinished jobs
 ↓
Inspect attempts
 ↓
Check provider
 ↓
Determine state
 ├── success
 ├── failed
 ├── unknown
 └── pending
```

---

# 213. Main Process Lifecycle

```text
main()
 ↓
initialize paths
 ↓
initialize database
 ↓
run migrations
 ↓
initialize credential service
 ↓
recover jobs
 ↓
register IPC
 ↓
create window
 ↓
start services
```

---

# 214. Shutdown Lifecycle

```text
shutdown requested
 ↓
stop accepting jobs
 ↓
pause queue
 ↓
persist state
 ↓
abort safe requests
 ↓
cleanup temporary files
 ↓
close database
 ↓
destroy windows
 ↓
quit
```

---

# 215. Logging Flow

```text
Application
 ↓
Logger
 ↓
Redaction
 ↓
Log level
 ↓
Local log
```

Sensitive values logger'a ulaşmadan mümkünse çıkarılmalıdır.

---

# 216. Error Flow

```text
Infrastructure Error
 ↓
Provider/File/DB error
 ↓
Map to AppError
 ↓
Application layer
 ↓
IPC
 ↓
Safe UI error
```

Stack trace kullanıcıya gönderilmez.

---

# 217. Testing Flow

```text
Code
 ↓
Unit
 ↓
Integration
 ↓
Security
 ↓
E2E
 ↓
Build
```

Kritik özellikler test edilmeden production release yapılmamalıdır.

---

# 218. Architecture Definition of Done

Mimari açıdan V2 tamamlanmış sayılabilmesi için:

```text
[ ] Renderer/Main separation
[ ] Secure preload
[ ] Domain-oriented IPC
[ ] SQLite
[ ] Repository layer
[ ] CredentialService
[ ] safeStorage
[ ] Provider abstraction
[ ] Queue service
[ ] Persistent jobs
[ ] Idempotency
[ ] Unknown state
[ ] PDF pipeline
[ ] Matching pipeline
[ ] Backup service
[ ] Audit log
[ ] Test architecture
[ ] CI
```

tamamlanmış olmalıdır.

---

# 219. Mimari Olarak Yapılmaması Gerekenler

V2'de:

```text
❌ React → SQLite
❌ React → filesystem
❌ React → WhatsApp API
❌ React → OpenWA
❌ React → secret
❌ Provider → UI
❌ Domain → Electron API
❌ Domain → React
❌ eval()
❌ arbitrary fetch()
❌ arbitrary fs.readFile()
❌ generic IPC bridge
❌ business logic in App.tsx
❌ giant global state
❌ credentials in localStorage
❌ credentials in SQLite
```

kullanılmamalıdır.

---

# 220. V2 Architecture Summary

Vatsap V2'nin hedef mimarisi:

```text
                     ┌────────────────────┐
                     │      React UI      │
                     │                    │
                     │ Gönder             │
                     │ Öğrenciler         │
                     │ Geçmiş             │
                     │ Ayarlar            │
                     └─────────┬──────────┘
                               │
                         Secure IPC
                               │
                     ┌─────────▼──────────┐
                     │ Electron Main      │
                     │                    │
                     │ Application Layer  │
                     │ Domain Services    │
                     │ Queue              │
                     │ Validation         │
                     └──────┬──────┬──────┘
                            │      │
               ┌────────────┘      └─────────────┐
               │                                  │
       ┌───────▼────────┐                ┌────────▼───────┐
       │ SQLite         │                │ Credential      │
       │                │                │ Service         │
       │ Students       │                │                 │
       │ PDFs           │                │ safeStorage     │
       │ Jobs           │                │                 │
       │ Attempts       │                └─────────────────┘
       │ History        │
       │ Audit          │
       └───────┬────────┘
               │
       ┌───────▼────────────────────────────────┐
       │           Provider Layer               │
       │                                        │
       │ Meta Cloud │ OpenWA │ Assisted Web     │
       └───────────────────┬────────────────────┘
                           │
                    WhatsApp Systems
```

---

# 221. Nihai Mimari İlkesi

Vatsap V2 için temel mimari prensip:

> **UI karar verir, Main Process doğrular, Application Layer işlemi yönetir, Domain kuralları belirler, Infrastructure dış sistemlerle konuşur, Database kalıcı durumu saklar, safeStorage credentialları korur ve Provider Layer WhatsApp entegrasyonunu soyutlar.**

Bu sınırlar korunursa Vatsap:

- daha güvenli,
- daha test edilebilir,
- daha kolay geliştirilebilir,
- daha kolay hata ayıklanabilir,
- yeni WhatsApp providerları eklenebilir,
- gelecekte cloud/web mimarisine taşınabilir

hale gelir.

---

# 222. Üç Ana Dokümanın İlişkisi

Vatsap V2 geliştirmesinde üç belge birlikte kullanılmalıdır:

```text
V2_ROADMAP.md
       │
       │ Ne yapılacak?
       ▼
ARCHITECTURE.md
       │
       │ Nasıl yapılacak?
       ▼
SECURITY.md
       │
       │ Hangi güvenlik kuralları korunacak?
       ▼
Implementation
```

Çelişki durumunda:

```text
SECURITY.md
        ↓
ARCHITECTURE.md
        ↓
V2_ROADMAP.md
```

güvenlik önceliği korunacak şekilde değerlendirilmelidir.

---

# 223. AI Coding Agent İçin Son Kural

Vatsap V2 üzerinde çalışan AI coding agent:

1. Önce mevcut kodu incelemelidir.
2. Bu mimariye uygun mevcut modülü bulmalıdır.
3. Gereksiz yeni abstraction oluşturmamalıdır.
4. Mevcut çalışan özelliği korumalıdır.
5. Security boundary'lerini bozmamalıdır.
6. Renderer'a yeni yetki verirken gerekçelendirmelidir.
7. Yeni database erişimini repository üzerinden yapmalıdır.
8. Yeni provider'ı `WhatsAppProvider` abstraction üzerinden eklemelidir.
9. Queue'yu bypass etmemelidir.
10. Secret storage modelini bypass etmemelidir.
11. Kritik değişikliklerde test eklemelidir.
12. Roadmap dışında büyük özellik geliştirmemelidir.

Bir feature geliştirirken temel soru:

> **"Bu kod hangi katmana ait ve neden?"**

olmalıdır.

Bir kod parçası aynı anda:

```text
UI
+
Database
+
Network
+
Business Logic
```

yapıyorsa mimari sınırlar muhtemelen ihlal ediliyor demektir.

---

# 224. Sonuç

Vatsap V2:

```text
Electron
   +
React
   +
TypeScript
   +
Secure IPC
   +
Application Services
   +
Domain Models
   +
SQLite
   +
safeStorage
   +
Provider Architecture
   +
Persistent Queue
   +
PDF Matching
```

temelinde çalışan **local-first, security-first bir masaüstü uygulaması** olarak geliştirilecektir.

Temel workflow:

```text
Öğrenciler
    ↓
PDF'ler
    ↓
Eşleştirme
    ↓
Kontrol
    ↓
Gönderim
    ↓
Teslimat
    ↓
Rapor
```

mimarinin merkezinde kalacaktır.

Yeni özellikler bu workflow'u desteklemeli; güvenlik, veri bütünlüğü veya kullanıcı kontrolünü azaltıyorsa V2'ye alınmamalıdır.