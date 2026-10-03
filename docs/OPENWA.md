# OpenWA Entegrasyon ve API Referansı

Bu doküman, [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA) WhatsApp API Gateway servisinin **WhatsApp Karne Gönderici** uygulaması tarafından kullanılan doğrulanmış REST API endpoint'lerini, mimarisini ve kullanım senaryolarını detaylandırır.

---

## 1. Genel Bakış ve Mimarisi

- **Servis Tipi:** Self-hosted (yerel) WhatsApp API Gateway
- **Varsayılan Port:** `2785`
- **Dashboard URL:** `http://localhost:2785`
- **REST API Base URL:** `http://localhost:2785/api`
- **Swagger API Dokümantasyonu:** `http://localhost:2785/api/docs` (non-production)
- **WhatsApp Motoru:** `whatsapp-web.js` (Puppeteer) veya `baileys` (WebSocket)
- **Oturum Saklama:** SQLite (varsayılan) / `data/` klasörü

---

## 2. macOS Kurulum ve Çalıştırma

### Yöntem 1: Docker (Önerilen)
```bash
docker run -d \
  --name openwa \
  -p 2785:2785 \
  -v openwa_data:/app/data \
  rmyndharis/openwa:latest
```

### Yöntem 2: Doğrudan Node.js (20+)
```bash
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA
npm install
npm run build
npm start
```

---

## 3. Kimlik Doğrulama (Authentication)

OpenWA, REST API çağrılarında `X-API-Key` HTTP başlığını zorunlu kılar.

- **Header:** `X-API-Key: <SENIN_API_KEYIN>`
- **API Key Konumu:** OpenWA ilk kez başlatıldığında `data/.api-key` dosyasına otomatik olarak kaydedilir veya OpenWA Web Dashboard üzerinden görüntülenebilir.
- **Rol Yetkileri:**
  - `ADMIN`: Tüm sisteme tam erişim.
  - `OPERATOR`: Oturum oluşturma, QR alma, mesaj ve belge gönderme yetkisi (Karne Gönderici için yeterlidir).
  - `VIEWER`: Yalnızca okuma yetkisi.

---

## 4. Doğrulanmış API Endpoint'leri

### 4.1. Oturumları Listeleme
- **Metot:** `GET`
- **Yol:** `/api/sessions`
- **Header:** `X-API-Key: <API_KEY>`
- **Response (200 OK):**
```json
[
  {
    "id": "karne-session",
    "status": "ready",
    "engine": "whatsapp-web.js",
    "updatedAt": "2026-10-02T12:00:00.000Z"
  }
]
```

### 4.2. Oturum Durumu Kontrolü
- **Metot:** `GET`
- **Yol:** `/api/sessions/:sessionId`
- **Header:** `X-API-Key: <API_KEY>`
- **Response (200 OK):**
```json
{
  "id": "karne-session",
  "status": "ready"
}
```
**Oturum Durum Değerleri (`status`):**
- `created`: Oturum kaydı var, ancak motor henüz başlatılmadı.
- `initializing`: WhatsApp Web motoru başlatılıyor.
- `qr_ready`: QR kodu hazır, taranmayı bekliyor.
- `authenticating`: QR tarandı, el sıkışması tamamlanıyor.
- `ready`: WhatsApp bağlı ve çalışır durumda. Gönderim yapılabilir.
- `action_required`: Ek kullanıcı onayı gerekiyor.

### 4.3. Yeni Oturum Oluşturma
- **Metot:** `POST`
- **Yol:** `/api/sessions`
- **Header:** `Content-Type: application/json`, `X-API-Key: <API_KEY>`
- **Request Body:**
```json
{
  "sessionId": "karne-session"
}
```

### 4.4. Oturumu Başlatma
- **Metot:** `POST`
- **Yol:** `/api/sessions/:sessionId/start`
- **Header:** `X-API-Key: <API_KEY>`

### 4.5. QR Kodu Alma
- **Metot:** `GET`
- **Yol:** `/api/sessions/:sessionId/qr`
- **Header:** `X-API-Key: <API_KEY>`
- **Response (200 OK):**
```json
{
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "status": "qr_ready"
}
```
*(Arayüz bu QR görselini doğrudan ekrana basarak kullanıcının WhatsApp > Bağlı Cihazlar ile taramasını sağlar).*

---

## 5. Mesaj ve Belge Gönderim Endpoint'leri

### 5.1. Metin Mesajı Gönderme
- **Metot:** `POST`
- **Yol:** `/api/sessions/:sessionId/messages/send-text`
- **Header:** `Content-Type: application/json`, `X-API-Key: <API_KEY>`
- **Request Body:**
```json
{
  "chatId": "905XXXXXXXXX@c.us",
  "text": "Merhaba Mehmet Bey,\n\nAhmet Yılmaz öğrencimizin bu haftaki sınav karnesi ekte yer almaktadır.\n\nBilginize sunarım."
}
```
- **Response (200 OK / 201 Created):**
```json
{
  "success": true,
  "messageId": "true_905XXXXXXXXX@c.us_3EB0...",
  "timestamp": 1727913600
}
```

### 5.2. Belge / PDF Gönderme (`SendMediaMessageDto`)
- **Metot:** `POST`
- **Yol:** `/api/sessions/:sessionId/messages/send-document`
- **Header:** `Content-Type: application/json`, `X-API-Key: <API_KEY>`
- **Request Body:**
```json
{
  "chatId": "905XXXXXXXXX@c.us",
  "base64": "JVBERi0xLjQKJcOkw7zDtsOfCDC...",
  "mimetype": "application/pdf",
  "filename": "Ahmet_Yilmaz.pdf",
  "caption": "Ahmet Yılmaz - Haftalık Sınav Karnesi"
}
```
- **Response (200 OK / 201 Created):**
```json
{
  "success": true,
  "messageId": "true_905XXXXXXXXX@c.us_3EB1...",
  "timestamp": 1727913605
}
```

### 5.3. Numara Kontrolü (Opsiyonel Ön Doğrulama)
- **Metot:** `GET`
- **Yol:** `/api/sessions/:sessionId/contacts/check/:number`
- **Header:** `X-API-Key: <API_KEY>`
- **Örnek:** `/api/sessions/karne-session/contacts/check/905XXXXXXXXX`
- **Response:**
```json
{
  "exists": true,
  "jid": "905XXXXXXXXX@c.us"
}
```

---

## 6. Hata Yanıtları ve Ele Alınması

| HTTP Kodu | Durum | Neden | Uygulama Davranışı |
| :--- | :--- | :--- | :--- |
| `401 Unauthorized` | Hatalı veya eksik API Key | Header eksik veya key geçersiz | Ayarlar ekranına yönlendir, API Key uyarısı ver |
| `404 Not Found` | Oturum veya rota bulunamadı | Oturum henüz oluşturulmamış | Yeni oturum oluşturma akışını başlat |
| `409 Conflict` | Oturum hazır değil (`not ready`) | QR henüz taranmadı veya bağlantı koptu | "WhatsApp bağlantısı gerekli" uyarısı göster |
| `400 Bad Request` | Geçersiz format | Base64 hatalı veya telefon numarası standart dışı | Telefonu doğrula, PDF dosyasını kontrol et |
| `ECONNREFUSED` | OpenWA çalışmıyor | Docker veya servis kapalı | "OpenWA'ya bağlanılamadı" kullanıcı dostu uyarısı |

---

## 7. Güvenlik ve Hız Kuralları
1. **Sıralı Gönderim:** 10 öğrenciye mesaj gönderilirken arka arkaya tek seferde paralel istek atılmaz. Her öğrenci arasında 2-4 saniyelik insani gecikme (delay) uygulanır.
2. **Telefon Maskeleme:** Kayıt tutulurken veli telefon numaraları `905*****123` şeklinde maskelenerek kaydedilir.
3. **Lokal Veri:** Tüm süreç kullanıcının yerel makinesinde kalır, hiçbir harici bulut servisine veri sızdırılmaz.
