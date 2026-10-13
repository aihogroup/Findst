# Findst.id — Web & PWA

Landing page dan PWA manajemen investasi saham Indonesia (machine learning + *dynamic threshold*).
Dibangun dengan **HTML, CSS, dan JavaScript murni** — tanpa framework dan tanpa dependensi npm.

## Menjalankan

```bash
npm run dev        # build + server lokal + rebuild otomatis → http://localhost:4173
npm test           # 24 unit & integration test (frontend + backend Apps Script)
npm run build      # hasil produksi di dist/
npm run fonts      # (opsional, sekali) unduh font self-host Source Serif 4 & Poppins
npm run icons      # (Windows) buat ulang ikon PNG & gambar Open Graph
```

Tanpa konfigurasi apa pun, aplikasi berjalan dalam **mode demo**: pendaftaran, OTP, login, dan dasbor
disimulasikan di `localStorage`, dan kode OTP ditampilkan di layar.

## Strategi rendering

| Jenis halaman | Strategi | Implementasi |
|---|---|---|
| Publik (landing, legal) | **SSG** | `scripts/build.mjs` merender `src/pages` + `src/partials` menjadi HTML jadi |
| Komponen interaktif | **Islands + partial hydration** | `[data-island]` + `[data-hydrate="load\|idle\|visible\|interaction"]`, dimuat lewat `import()` |
| FAQ & pengumuman | **ISR** | HTML dibangun dari `src/content/*.json`; island merevalidasi di latar belakang dan mengganti bila `version` lebih baru |
| `/app/` (user, admin, superadmin) | **CSR** di balik autentikasi | Router History API, penjaga peran, `noindex` |

## Struktur

```
src/
  pages/            Halaman (front matter <!--@page {...} -->)
  partials/         head, header, footer + dialog, field, boot.js (skrip tema sebaris)
  content/          site.json, faq.json, announcements.json (sumber SSG/ISR)
  public/           manifest, sw.js, _headers, _redirects, ikon, fonts/
  assets/styles/
    tokens/         primitives → semantic (tema) → components   (3 lapis design token)
    base/ layout/ utilities/
    components/     atoms/ molecules/ organisms/                (Atomic Design)
    features/       landing/ auth/ app/ legal/
    bundles/        critical (sebaris) · main · auth · app
  assets/js/
    config/         app.config.js  ← semua pengaturan (URL API, fitur, jam bursa)
    core/           store, query cache (SWR), islands, http, i18n, storage, sanitize
    components/     button, ripple, toast/snackbar, dialog, accordion, confirm, pull-to-refresh
    features/       preferences · pwa · consent · network · navbar · landing · auth · app
    services/       api (adapter Apps Script / demo) · session
gas/                Backend prototipe Google Apps Script + Google Sheets
tests/              node:test (tanpa dependensi)
```

Setiap fitur hanya membuka antarmuka publiknya (`initX()` atau `mount(el)`), sehingga perubahan satu
fitur tidak merambat ke fitur lain. Island baru cukup ditambahkan satu baris di `core/islands.registry.js`.

## Backend prototipe: Google Apps Script + Sheets

Arsitektur berlapis: `00_Config` → `01_Core` (error, envelope, validasi, kripto, rate limit, lock) →
`02_Repositories` (adapter Sheets) → `03_Services` (use case auth & konten) → `04_Controller` (router Web App).

### Langkah uji coba

1. Buat Google Spreadsheet baru → **Extensions → Apps Script**.
2. Buat berkas sesuai isi folder `gas/` (`00_Config.gs` … `06_Tests.gs`). Aktifkan
   *Project Settings → Show "appsscript.json"* lalu tempel isi `gas/appsscript.json`.
3. Pilih fungsi **`setup`** → Run → izinkan akses. Fungsi ini membuat sheet `Users, Otps, Sessions, Faq,
   Announcements, AuditLog`, mengisi FAQ & pengumuman, membuat `PEPPER` acak, dan memasang trigger.
4. Jalankan **`runUnitTests`**, **`runSmokeTestAuth`**, dan **`runSmokeTestHttp`**; hasilnya ada di *Execution log*.
5. **Deploy → New deployment → Web app** · *Execute as: Me* · *Who has access: Anyone* → salin URL `/exec`.
6. Tempel URL ke `src/assets/js/config/app.config.js` → `api.baseUrl`, lalu `npm run dev`.
7. Uji: `<URL>/exec?action=health` dan `<URL>/exec?action=faq` di browser.

### Script properties

| Kunci | Bawaan | Keterangan |
|---|---|---|
| `ENV` | `development` | `development` / `staging` / `production` |
| `SPREADSHEET_ID` | kosong | Isi untuk memisahkan spreadsheet per lingkungan |
| `PEPPER` | acak | Rahasia hash; **jangan diubah** setelah ada pengguna |
| `DEV_MODE` | `true` | OTP dikembalikan di respons. **Set `false` di produksi** |
| `SEND_EMAIL` | `false` | `true` → OTP dikirim lewat email (MailApp) |

### Kontrak API v1

`GET ?action=health|faq|announcements` · `POST` body JSON (Content-Type `text/plain` agar tanpa preflight CORS):
`{ "action": "register|verifyOtp|resendOtp|login|logout|me|forgotPassword|resetPassword", "payload": {}, "token": "", "apiVersion": "v1" }`

Respons seragam: `{ ok, data, meta: { requestId, apiVersion, durationMs } }` atau
`{ ok: false, error: { code, status, message, details }, meta }`. Apps Script selalu membalas HTTP 200,
sehingga status semantik (401, 409, 422, 429, …) ada di `error.status`.

Konten FAQ/pengumuman cukup diedit langsung di sheet: trigger `onContentEdit` memperbarui `updatedAt`
dan membersihkan cache, lalu frontend mengambil versi baru (ISR).

## Deploy frontend

Unggah `dist/` ke CDN statis (Cloudflare Pages/Netlify). `_headers` mengatur header keamanan dan cache
(aset berhash `immutable` 1 tahun), `_redirects` menangani *deep link* `/app/*`. CSP per halaman berbasis
hash SHA-256 disisipkan otomatis oleh build. Brotli diaktifkan oleh CDN (server lokal juga meniru Brotli).

## Batasan & catatan

- Halaman publik **hanya memuat contoh visual berlabel**, bukan rekomendasi saham.
- Isi kebijakan privasi, syarat & ketentuan, dan pernyataan risiko masih **draf** dan wajib ditinjau pihak
  hukum (UU PDP No. 27/2022, ketentuan OJK).
- Apps Script + Sheets adalah **prototipe**: kuota harian, latensi ±1 detik, dan token sesi disimpan di
  `localStorage`. Untuk produksi gunakan backend sungguhan dengan cookie `HttpOnly; Secure; SameSite`.
- Target Lighthouse (≥ 90) dan Core Web Vitals perlu diukur di perangkat mobile sungguhan / DevTools throttling.
- Uji dengan pembaca layar sungguhan (NVDA, VoiceOver, TalkBack) sebelum rilis.
