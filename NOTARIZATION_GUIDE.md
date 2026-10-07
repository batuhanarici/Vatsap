# macOS İmzalama (Codesigning) ve Notarization Kılavuzu

Bu belge, **Karne Gönderici** uygulamasının Apple Silicon (M1/M2/M3/M4 - arm64), Intel Mac (x64) ve Universal mimarilerde resmi Apple geliştirici sertifikası ile imzalanması ve noter onayından (Notarization) geçirilmesi adımlarını içerir.

---

## 1. Mimariler ve Build Komutları

Uygulama 3 farklı macOS hedefi için derlenebilir:

- **Apple Silicon (M1/M2/M3/M4 arm64):**
  ```bash
  npm run build:mac:arm64
  ```
- **Intel Mac (x64):**
  ```bash
  npm run build:mac:x64
  ```
- **Universal Binary (Hem Apple Silicon hem Intel tek paket):**
  ```bash
  npm run build:mac:universal
  ```
- **Tüm Mimarileri Derleme:**
  ```bash
  npm run build:mac:all
  ```

---

## 2. Apple Developer ID İmzalama Gereksinimleri

macOS Gatekeeper uyarısı almadan uygulamanın açılabilmesi için "Developer ID Application" sertifikası gereklidir.

1. **Keychain Sertifikasını Doğrulama:**
   ```bash
   security find-identity -p codesigning -v
   ```
   Çıktıda `Developer ID Application: Your Name (TEAM_ID)` sertifikanızı görüntüleyin.

2. **Ortam Değişkenlerini Ayarlama:**
   Terminal oturumunuzda veya `.env` dosyasında şu değişkenleri tanımlayın:
   ```bash
   export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
   export APPLE_ID="apple-id@email.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="YOUR_TEAM_ID"
   ```

---

## 3. Notarization (Noter Onayı) İşlemi

`electron-builder` `hardenedRuntime: true` ve `entitlements.mac.plist` dosyasını otomatik olarak dahil eder.

### Yöntem A: electron-builder Otomatik Noter Onayı
`package.json` içindeki `mac` bloğuna `notarize` parametresi eklenerek otomatik hale getirilebilir:
```json
"mac": {
  "notarize": {
    "teamId": "YOUR_TEAM_ID"
  }
}
```

### Yöntem B: Apple `xcrun notarytool` ile Manuel Onay
Eğer DMG dosyasını bağımsız imzalamak isterseniz:

1. **Kimlik Bilgisi Profili Oluşturma:**
   ```bash
   xcrun notarytool store-credentials "notary-profile" \
     --apple-id "$APPLE_ID" \
     --team-id "$APPLE_TEAM_ID" \
     --password "$APPLE_APP_SPECIFIC_PASSWORD"
   ```

2. **DMG Dosyasını Noter Onayına Gönderme:**
   ```bash
   xcrun notarytool submit "release/Karne Gonderici-1.0.0-universal.dmg" \
     --keychain-profile "notary-profile" \
     --wait
   ```

3. **Noter Onay Damgasını İliştirme (Stapling):**
   ```bash
   xcrun stapler staple "release/Karne Gonderici-1.0.0-universal.dmg"
   ```

4. **Doğrulama:**
   ```bash
   spctl --assess --type open --context context:primary-signature -v "release/Karne Gonderici-1.0.0-universal.dmg"
   ```

---

## 4. Güvenlik İzinleri (`electron/entitlements.mac.plist`)

Uygulamanın macOS sandbox ve Gatekeeper kısıtlamalarına takılmadan çalışması için tanımlanmış yetkiler:
- `com.apple.security.cs.allow-jit`: Node/V8 JIT motorunun çalışması
- `com.apple.security.cs.allow-unsigned-executable-memory`: PDF ve OCR kütüphaneleri
- `com.apple.security.network.client`: OpenWA yerel Docker HTTP bağlantıları
- `com.apple.security.files.user-selected.read-write`: Kullanıcının seçtiği karne PDF klasörlerini ve Excel dosyalarını okuma
