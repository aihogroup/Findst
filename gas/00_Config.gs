/**
 * ============================================================================
 * LAYER: CONFIGURATION
 * Seluruh konfigurasi terpusat. Nilai sensitif & per-lingkungan dibaca dari
 * Script Properties (Project Settings → Script properties), BUKAN ditulis
 * di kode. Jalankan setup() sekali untuk membuat nilai bawaan yang aman.
 *
 *   ENV            development | staging | production
 *   SPREADSHEET_ID ID spreadsheet per lingkungan (kosong = spreadsheet terikat)
 *   PEPPER         rahasia tambahan untuk hash kata sandi/OTP (dibuat acak)
 *   DEV_MODE       "true" → kode OTP dikembalikan di respons (UJI COBA SAJA)
 *   SEND_EMAIL     "true" → kirim OTP via email (MailApp)
 * ============================================================================
 */
const API_VERSION = 'v1';

const Config = (() => {
  const props = PropertiesService.getScriptProperties();
  const read = (key, fallback) => {
    const value = props.getProperty(key);
    return value === null || value === '' ? fallback : value;
  };

  return Object.freeze({
    env: () => read('ENV', 'development'),
    spreadsheetId: () => read('SPREADSHEET_ID', ''),
    pepper: () => {
      const pepper = read('PEPPER', '');
      if (!pepper) throw new AppError('server', 'Konfigurasi PEPPER belum diatur. Jalankan setup().');
      return pepper;
    },
    devMode: () => read('DEV_MODE', 'false') === 'true',
    sendEmail: () => read('SEND_EMAIL', 'false') === 'true',

    auth: Object.freeze({
      passwordMinLength: 8,
      hashIterations: 1500,           // HMAC-SHA256 berulang (PBKDF2-like)
      otpLength: 6,
      otpTtlMinutes: 10,
      otpMaxAttempts: 5,
      sessionDays: Object.freeze({ remember: 30, default: 1 }),
    }),

    rateLimit: Object.freeze({
      // aksi: [maks permintaan, jendela detik]
      register: [5, 600],
      login: [10, 600],
      verifyOtp: [10, 600],
      resendOtp: [3, 300],
      forgotPassword: [3, 600],
      resetPassword: [10, 600],
    }),

    content: Object.freeze({ cacheTtlSeconds: 300 }),
    request: Object.freeze({ maxBodyBytes: 10 * 1024, lockTimeoutMs: 10000 }),
    retention: Object.freeze({ auditDays: 180 }),
  });
})();

/** Skema "tabel" (sheet). Urutan kolom = kontrak penyimpanan. */
const SCHEMA = Object.freeze({
  Users: ['id', 'email', 'name', 'phone', 'role', 'plan', 'status', 'passwordHash', 'createdAt', 'updatedAt', 'lastLoginAt', 'version'],
  Otps: ['key', 'email', 'purpose', 'otpHash', 'expiresAt', 'attempts', 'createdAt'],
  Sessions: ['tokenHash', 'userId', 'expiresAt', 'createdAt', 'lastSeenAt'],
  Faq: ['id', 'question', 'answer', 'order', 'published', 'updatedAt'],
  Announcements: ['id', 'tone', 'text', 'href', 'linkLabel', 'startsAt', 'expiresAt', 'published', 'updatedAt'],
  AuditLog: ['timestamp', 'requestId', 'action', 'actor', 'outcome', 'detail'],
});

const ROLES = Object.freeze(['user', 'admin', 'superadmin']);
const USER_STATUS = Object.freeze({ PENDING: 'pending', ACTIVE: 'active', DISABLED: 'disabled' });
