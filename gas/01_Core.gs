/**
 * ============================================================================
 * LAYER: CORE (shared kernel)
 * Error standar, envelope respons, validasi skema, sanitasi, kripto,
 * rate limiting, lock (unit of work), dan logging terstruktur.
 * Tidak bergantung pada domain mana pun → dapat dipakai ulang (DRY).
 * ============================================================================
 */

/* ------------------------------- Errors -------------------------------- */
/** Kode galat ↔ status HTTP semantik (Apps Script selalu membalas 200,
 *  sehingga status disertakan di envelope agar klien tetap dapat membedakan). */
const ERROR_STATUS = Object.freeze({
  validation: 422,
  badRequest: 400,
  unknownAction: 404,
  notFound: 404,
  invalidCredentials: 401,
  sessionExpired: 401,
  notVerified: 403,
  forbidden: 403,
  emailTaken: 409,
  invalidOtp: 400,
  rateLimited: 429,
  busy: 503,
  server: 500,
});

class AppError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code] || 500;
    this.details = details;
  }
}

/* ------------------------------ Response ------------------------------- */
const Http = {
  ok(data, meta) {
    return Http.json({ ok: true, data, meta });
  },
  fail(error, meta) {
    const appError = error instanceof AppError ? error : new AppError('server', 'Terjadi kesalahan pada server.');
    return Http.json({
      ok: false,
      error: { code: appError.code, status: appError.status, message: appError.message, details: appError.details },
      meta,
    });
  },
  json(body) {
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  },
};

/* ------------------------------ Sanitizer ------------------------------ */
const Sanitize = {
  /** Teks satu baris: buang kontrol & tag, rapikan spasi, batasi panjang. */
  text(value, maxLength) {
    return String(value == null ? '' : value)
      .normalize('NFKC')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength || 500);
  },
  email(value) {
    return Sanitize.text(value, 120).toLowerCase().replace(/\s/g, '');
  },
  digits(value, maxLength) {
    return String(value == null ? '' : value).replace(/[^\d+]/g, '').slice(0, maxLength || 16);
  },
  /**
   * Nilai teks ditulis dengan awalan apostrof → disimpan Sheets sebagai teks
   * literal: mencegah formula/CSV injection DAN konversi otomatis yang merusak
   * data (nol di depan nomor ponsel, hash hex dibaca angka, tanggal ISO).
   */
  cell(value) {
    return typeof value === 'string' && value !== '' ? "'" + value : value;
  },
};

/* ------------------------- Schema validation --------------------------- */
const Rules = {
  required: (label) => (v) => (v === undefined || v === null || String(v).trim() === '' ? label + ' wajib diisi.' : null),
  email: () => (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Format email tidak valid.'),
  minLength: (label, n) => (v) => (!v || String(v).length >= n ? null : label + ' minimal ' + n + ' karakter.'),
  maxLength: (label, n) => (v) => (String(v || '').length <= n ? null : label + ' maksimal ' + n + ' karakter.'),
  pattern: (re, message) => (v) => (!v || re.test(String(v)) ? null : message),
  passwordMix: () => (v) => (!v || (/[A-Za-z]/.test(v) && /\d/.test(v)) ? null : 'Kata sandi harus memuat huruf dan angka.'),
  oneOf: (list, message) => (v) => (!v || list.indexOf(v) > -1 ? null : message),
};

/** Validasi DTO terhadap skema; lempar AppError('validation') berisi detail per kolom. */
function validate(schema, dto) {
  const fields = {};
  Object.keys(schema).forEach((name) => {
    for (const rule of schema[name]) {
      const message = rule(dto[name], dto);
      if (message) {
        fields[name] = message;
        break;
      }
    }
  });
  if (Object.keys(fields).length) throw new AppError('validation', 'Data yang dikirim belum valid.', { fields });
  return dto;
}

/* -------------------------------- Crypto -------------------------------- */
const Crypto = {
  toHex(bytes) {
    return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  },
  sha256(text) {
    return Crypto.toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
  },
  randomToken() {
    return Crypto.sha256(Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random());
  },
  randomOtp(length) {
    const max = Math.pow(10, length);
    const value = parseInt(Crypto.sha256(Utilities.getUuid()).slice(0, 12), 16) % max;
    return String(value).padStart(length, '0');
  },
  /** Hash kata sandi: HMAC-SHA256 berulang dengan salt per-pengguna + pepper global. */
  hashPassword(password, salt, iterations) {
    const key = Config.pepper() + salt;
    let digest = password;
    for (let i = 0; i < iterations; i++) {
      digest = Crypto.toHex(Utilities.computeHmacSha256Signature(digest, key, Utilities.Charset.UTF_8));
    }
    return digest;
  },
  encodePassword(password) {
    const salt = Crypto.randomToken().slice(0, 32);
    const iterations = Config.auth.hashIterations;
    return ['hmac-sha256', iterations, salt, Crypto.hashPassword(password, salt, iterations)].join('$');
  },
  verifyPassword(password, encoded) {
    const parts = String(encoded || '').split('$');
    if (parts.length !== 4) return false;
    return Crypto.safeEqual(Crypto.hashPassword(password, parts[2], Number(parts[1])), parts[3]);
  },
  /** Perbandingan waktu-konstan untuk mencegah timing attack. */
  safeEqual(a, b) {
    a = String(a);
    b = String(b);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
  },
};

/* ------------------------------ Rate limit ------------------------------ */
const RateLimiter = {
  /** Fixed-window counter di CacheService (terbagi antar-eksekusi → stateless). */
  check(action, identity) {
    const rule = Config.rateLimit[action];
    if (!rule) return;
    const cache = CacheService.getScriptCache();
    const key = 'rl:' + action + ':' + Crypto.sha256(String(identity || 'anon')).slice(0, 24);
    const count = Number(cache.get(key) || 0) + 1;
    cache.put(key, String(count), rule[1]);
    if (count > rule[0]) throw new AppError('rateLimited', 'Terlalu banyak percobaan. Coba lagi nanti.');
  },
};

/* ------------------------- Lock / Unit of Work -------------------------- */
/** Menjalankan sekumpulan perubahan secara serial (menghindari race condition
 *  antar-eksekusi). Lock dilepas pada akhir, termasuk saat galat. */
function withLock(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(Config.request.lockTimeoutMs)) throw new AppError('busy', 'Server sedang sibuk. Coba lagi sebentar.');
  try {
    const result = work();
    SpreadsheetApp.flush(); // commit seluruh penulisan
    return result;
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------- Logging -------------------------------- */
const Log = {
  /** Log terstruktur (JSON) → Cloud Logging, mudah dicari & diagregasi. */
  info(event, fields) {
    console.log(JSON.stringify(Object.assign({ level: 'info', event, env: Config.env() }, fields || {})));
  },
  error(event, error, fields) {
    console.error(JSON.stringify(Object.assign({ level: 'error', event, code: error && error.code, message: error && error.message, stack: error && error.stack }, fields || {})));
  },
  /** Masking data pribadi sebelum dicatat. */
  maskEmail(email) {
    const parts = String(email || '').split('@');
    return parts.length === 2 ? parts[0].slice(0, 2) + '***@' + parts[1] : '***';
  },
};

const nowIso = () => new Date().toISOString();
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);
