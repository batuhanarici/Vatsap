# macOS (Apple Silicon M5) Build Kılavuzu

Bu doküman, **WhatsApp Karne Gönderici** uygulamasını MacBook Air (Apple Silicon M-serisi / arm64) üzerinde yerel bir macOS masaüstü uygulaması (`.dmg` veya `.app`) olarak derleme ve çalıştırma adımlarını içerir.

---

## 1. Gereksinimler

Mac'inizde şunların yüklü olması yeterlidir:
- **Node.js**: v20+ LTS (`node -v`)
- **npm**: v10+ (`npm -v`)
- **Xcode Command Line Tools**: `xcode-select --install` (terminalde bir kez çalıştırmanız yeterlidir)

---

## 2. Adım Adım Masaüstü Build Alma

### Adım 1: Proje Bağımlılıklarını Kurun
Terminali açıp proje dizinine gidin ve bağımlılıkları yükleyin:
```bash
npm install
```

Electron ve Electron Builder paketlerini geliştirici bağımlılığı olarak ekleyin (eğer henüz eklenmediyse):
```bash
npm install -D electron electron-builder
```

---

### Adım 2: Apple Silicon (.dmg ve .app) Derlemesi Alın

Terminalde tek bir komutla üretim sürümünü derleyebilirsiniz:

```bash
npm run build:mac:dmg
```

Bu komut sırasıyla:
1. `vite build` çalıştırarak web arayüzünü yüksek performanslı ve optimize edilmiş şekilde `dist/` klasörüne derler.
2. `electron-builder` motorunu tetikleyerek macOS Apple Silicon (`arm64`) mimarisine özel yerel ikili dosyaları (`.dmg` ve `.app`) oluşturur.

---

### Adım 3: Derlenen Dosyaların Konumu

Derleme tamamlandığında çıktılar projenin **`release/`** klasöründe yer alır:

```text
release/
├── Karne Gönderici-1.0.0-arm64.dmg     <-- Yükleme dosyası (Sürükle & Bırak)
├── mac-arm64/
│   └── Karne Gönderici.app             <-- Doğrudan çalıştırılabilir macOS uygulaması
└── builder-effective-config.yaml
```

- **`.dmg` Dosyası:** Çift tıklayarak açabilir ve `Karne Gönderici` ikonunu `Applications` (Uygulamalar) klasörünüze sürükleyip bırakabilirsiniz.

---

## 3. macOS Gatekeeper (İlk Açılış İzni)

Kendi geliştirdiğiniz ve Apple Geliştirici Sertifikasıyla imzalanmamış yerel uygulamalarda macOS Gatekeeper ilk açılışta güvenlik uyarısı verebilir:

### Çözüm A (Grafik Arayüz ile):
1. `Karne Gönderici.app` dosyasına **Control tuşuna basarak** (veya sağ tıklayarak) tıklayın.
2. Açılan menüden **"Aç" (Open)** seçeneğini seçin.
3. Çıkan diyalogda tekrar **"Aç"** butonuna basın. (Bu işlem sadece ilk açılışta bir kez yapılır, sonraki açılışlarda doğrudan açılır).

### Çözüm B (Terminal ile - Karantina İznini Kaldırma):
Eğer `.dmg` içinden Uygulamalar'a attıysanız terminalden şu komutu vermeniz yeterlidir:
```bash
xattr -cr /Applications/"Karne Gönderici.app"
```

---

## 4. Geliştirme (Canlı) Modunda Çalıştırma

Kod üzerinde değişiklik yaparken sürekli build almak yerine anlık sıcak yenileme ile masaüstünde test etmek için:

**1. Terminal (Vite Sunucusu):**
```bash
npm run dev
```

**2. İkinci Terminal (Electron Penceresi):**
```bash
npx electron .
```

Bu sayede masaüstü penceresi canlı geliştirme modunda açılacak ve yaptığınız değişiklikler anında yansıyacaktır.
