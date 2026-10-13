/**
 * ============================================================================
 * LAYER: APPLICATION — Service (use case) & Port eksternal
 * Berisi aturan bisnis. Dependensi (repository, mailer) DISUNTIKKAN lewat
 * konstruktor (Dependency Inversion) → mudah diuji & diganti.
 * ============================================================================
 */

/* ------------------------------- DTO ------------------------------------ */
/** Hanya kolom aman yang keluar dari boundary (tidak pernah passwordHash). */
const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  plan: user.plan,
  createdAt: user.createdAt,
});

/* ------------------------------ Mailer port ------------------------------ */
class MailAppMailer {
  sendOtp(email, otp, purpose) {
    const subject = purpose === 'reset' ? 'Kode atur ulang kata sandi Findst' : 'Kode verifikasi akun Findst';
    const minutes = Config.auth.otpTtlMinutes;
    MailApp.sendEmail({
      to: email,
      subject: subject,
      name: 'Findst',
      body: 'Kode Anda: ' + otp + '\nBerlaku ' + minutes + ' menit. Abaikan email ini jika Anda tidak memintanya.',
      htmlBody:
        '<div style="font-family:Georgia,serif;color:#15110e">' +
        '<p>Kode Anda:</p><p style="font-size:28px;letter-spacing:6px;color:#7f1f31"><strong>' + otp + '</strong></p>' +
        '<p>Berlaku ' + minutes + ' menit. Abaikan email ini jika Anda tidak memintanya.</p>' +
        '<p style="color:#5a4e45;font-size:12px">Findst tidak pernah meminta kata sandi atau kode ini melalui telepon/chat.</p></div>',
    });
  }
}

class LogMailer {
  sendOtp(email, otp, purpose) {
    Log.info('mail.skipped', { to: Log.maskEmail(email), purpose: purpose }); // OTP tidak dicatat
  }
}

/* ------------------------------ Validation ------------------------------- */
/** Dibuat malas (lazy) agar tidak bergantung pada urutan pemuatan berkas .gs. */
let authSchemasCache;
function authSchemas() {
  if (authSchemasCache) return authSchemasCache;
  const r = Rules;
  const min = Config.auth.passwordMinLength;
  const otpRule = r.pattern(new RegExp('^\\d{' + Config.auth.otpLength + '}$'), 'Kode verifikasi harus ' + Config.auth.otpLength + ' digit.');
  authSchemasCache = {
    register: {
      name: [r.required('Nama'), r.minLength('Nama', 2), r.maxLength('Nama', 80), r.pattern(/^[\p{L}][\p{L} .'-]*$/u, 'Nama mengandung karakter tidak valid.')],
      email: [r.required('Email'), r.email(), r.maxLength('Email', 120)],
      phone: [r.pattern(/^(\+62|62|0)8[1-9]\d{6,11}$/, 'Nomor ponsel tidak valid.')],
      password: [r.required('Kata sandi'), r.minLength('Kata sandi', min), r.maxLength('Kata sandi', 128), r.passwordMix()],
      plan: [r.oneOf(['free', 'premium'], 'Paket tidak dikenal.')],
    },
    login: { email: [r.required('Email'), r.email()], password: [r.required('Kata sandi')] },
    verifyOtp: { email: [r.required('Email'), r.email()], otp: [r.required('Kode verifikasi'), otpRule] },
    resendOtp: { email: [r.required('Email'), r.email()], purpose: [r.oneOf(['verify', 'reset'], 'Tujuan kode tidak dikenal.')] },
    forgotPassword: { email: [r.required('Email'), r.email()] },
    resetPassword: {
      email: [r.required('Email'), r.email()],
      otp: [r.required('Kode verifikasi'), otpRule],
      password: [r.required('Kata sandi'), r.minLength('Kata sandi', min), r.maxLength('Kata sandi', 128), r.passwordMix()],
    },
  };
  return authSchemasCache;
}

/* ------------------------------ AuthService ------------------------------ */
class AuthService {
  constructor(deps) {
    this.users = deps.users;
    this.otps = deps.otps;
    this.sessions = deps.sessions;
    this.audit = deps.audit;
    this.mailer = deps.mailer;
  }

  /* ---- Use case: daftar → kirim OTP ---- */
  register(input) {
    const dto = validate(authSchemas().register, {
      name: Sanitize.text(input.name, 80),
      email: Sanitize.email(input.email),
      phone: Sanitize.digits(input.phone),
      password: String(input.password || ''),
      plan: input.plan || 'free',
    });
    RateLimiter.check('register', dto.email);

    const otp = withLock(() => {
      const existing = this.users.findByEmail(dto.email);
      if (existing && existing.status !== USER_STATUS.PENDING) throw new AppError('emailTaken', 'Email sudah terdaftar.');
      const user = Object.assign(existing || { id: Utilities.getUuid(), role: 'user', createdAt: nowIso(), version: 0 }, {
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        plan: dto.plan === 'premium' ? 'premium-trial' : 'free',
        status: USER_STATUS.PENDING,
        passwordHash: Crypto.encodePassword(dto.password),
      });
      this.users.save(user);
      return this.issueOtp(dto.email, 'verify');
    });

    this.audit.record({ action: 'register', actor: Log.maskEmail(dto.email), outcome: 'otp_sent' });
    return this.withDevOtp({ email: dto.email }, otp);
  }

  /* ---- Use case: verifikasi email → aktifkan akun & buat sesi ---- */
  verifyOtp(input) {
    const dto = validate(authSchemas().verifyOtp, { email: Sanitize.email(input.email), otp: Sanitize.digits(input.otp, 6) });
    RateLimiter.check('verifyOtp', dto.email);

    return withLock(() => {
      const user = this.users.findByEmail(dto.email);
      if (!user) throw new AppError('invalidOtp', 'Kode verifikasi salah atau kedaluwarsa.');
      this.consumeOtp(dto.email, 'verify', dto.otp);
      if (user.status === USER_STATUS.PENDING) {
        user.status = USER_STATUS.ACTIVE;
        this.users.save(user);
      }
      this.audit.record({ action: 'verifyOtp', actor: user.id, outcome: 'success' });
      return this.createSession(user, true);
    });
  }

  resendOtp(input) {
    const dto = validate(authSchemas().resendOtp, { email: Sanitize.email(input.email), purpose: input.purpose || 'verify' });
    RateLimiter.check('resendOtp', dto.email);
    const user = this.users.findByEmail(dto.email);
    const eligible = user && (dto.purpose === 'verify' ? user.status === USER_STATUS.PENDING : user.status === USER_STATUS.ACTIVE);
    const otp = eligible ? withLock(() => this.issueOtp(dto.email, dto.purpose)) : null;
    // Respons seragam: tidak membocorkan apakah email terdaftar
    return this.withDevOtp({ sent: true }, otp);
  }

  /* ---- Use case: masuk ---- */
  login(input) {
    const dto = validate(authSchemas().login, { email: Sanitize.email(input.email), password: String(input.password || '') });
    RateLimiter.check('login', dto.email);

    const user = this.users.findByEmail(dto.email);
    const valid = user ? Crypto.verifyPassword(dto.password, user.passwordHash) : (Crypto.encodePassword(dto.password), false); // samakan waktu respons
    if (!valid) {
      this.audit.record({ action: 'login', actor: Log.maskEmail(dto.email), outcome: 'invalid_credentials' });
      throw new AppError('invalidCredentials', 'Email atau kata sandi tidak cocok.');
    }
    if (user.status === USER_STATUS.DISABLED) throw new AppError('forbidden', 'Akun dinonaktifkan.');
    if (user.status === USER_STATUS.PENDING) {
      const otp = withLock(() => this.issueOtp(dto.email, 'verify'));
      throw new AppError('notVerified', 'Akun belum diverifikasi.', this.withDevOtp({ email: dto.email }, otp));
    }

    return withLock(() => {
      user.lastLoginAt = nowIso();
      this.users.save(user);
      this.audit.record({ action: 'login', actor: user.id, outcome: 'success' });
      return this.createSession(user, Boolean(input.remember));
    });
  }

  logout(token) {
    const session = token ? this.sessions.findByTokenHash(Crypto.sha256(String(token))) : null;
    if (session) withLock(() => this.sessions.remove(session));
    return { ok: true };
  }

  /* ---- Use case: profil sesi saat ini (+ sliding expiration) ---- */
  me(token) {
    const { user, session } = this.authenticate(token);
    return { user: toPublicUser(user), expiresAt: Number(session.expiresAt) };
  }

  /** Autentikasi + otorisasi berbasis peran (RBAC) untuk endpoint terproteksi. */
  authenticate(token, minRole) {
    const session = token ? this.sessions.findByTokenHash(Crypto.sha256(String(token))) : null;
    if (!session || Number(session.expiresAt) < Date.now()) throw new AppError('sessionExpired', 'Sesi berakhir. Silakan masuk kembali.');
    const user = this.users.findById(session.userId);
    if (!user || user.status !== USER_STATUS.ACTIVE) throw new AppError('sessionExpired', 'Sesi berakhir. Silakan masuk kembali.');
    if (minRole && ROLES.indexOf(user.role) < ROLES.indexOf(minRole)) throw new AppError('forbidden', 'Akses ditolak.');

    // Sliding expiration: perpanjang sesi yang hampir habis (sisa < 12 jam)
    if (Number(session.expiresAt) - Date.now() < 12 * 3600 * 1000) {
      session.expiresAt = Date.now() + Config.auth.sessionDays.default * 864e5;
    }
    session.lastSeenAt = nowIso();
    withLock(() => this.sessions.update(session));
    return { user, session };
  }

  /* ---- Use case: lupa & atur ulang kata sandi ---- */
  forgotPassword(input) {
    const dto = validate(authSchemas().forgotPassword, { email: Sanitize.email(input.email) });
    RateLimiter.check('forgotPassword', dto.email);
    const user = this.users.findByEmail(dto.email);
    const otp = user && user.status === USER_STATUS.ACTIVE ? withLock(() => this.issueOtp(dto.email, 'reset')) : null;
    this.audit.record({ action: 'forgotPassword', actor: Log.maskEmail(dto.email), outcome: otp ? 'otp_sent' : 'ignored' });
    return this.withDevOtp({ sent: true }, otp);
  }

  resetPassword(input) {
    const dto = validate(authSchemas().resetPassword, {
      email: Sanitize.email(input.email),
      otp: Sanitize.digits(input.otp, 6),
      password: String(input.password || ''),
    });
    RateLimiter.check('resetPassword', dto.email);

    return withLock(() => {
      const user = this.users.findByEmail(dto.email);
      if (!user) throw new AppError('invalidOtp', 'Kode verifikasi salah atau kedaluwarsa.');
      this.consumeOtp(dto.email, 'reset', dto.otp);
      user.passwordHash = Crypto.encodePassword(dto.password);
      this.users.save(user);
      this.sessions.removeByUser(user.id); // cabut seluruh sesi lama
      this.audit.record({ action: 'resetPassword', actor: user.id, outcome: 'success' });
      return { ok: true };
    });
  }

  /* ---------------------------- Helper domain ---------------------------- */
  otpHash(email, purpose, otp) {
    return Crypto.sha256(Config.pepper() + ':' + purpose + ':' + email + ':' + otp);
  }

  issueOtp(email, purpose) {
    const otp = Crypto.randomOtp(Config.auth.otpLength);
    this.otps.upsert({
      email: email,
      purpose: purpose,
      otpHash: this.otpHash(email, purpose, otp),
      expiresAt: addMinutes(new Date(), Config.auth.otpTtlMinutes).getTime(),
      attempts: 0,
      createdAt: nowIso(),
    });
    try {
      this.mailer.sendOtp(email, otp, purpose);
    } catch (error) {
      Log.error('mail.failed', error, { to: Log.maskEmail(email) });
      if (!Config.devMode()) throw new AppError('server', 'Email verifikasi gagal dikirim. Coba lagi.');
    }
    return otp;
  }

  consumeOtp(email, purpose, otp) {
    const record = this.otps.find(email, purpose);
    const invalid = new AppError('invalidOtp', 'Kode verifikasi salah atau kedaluwarsa.');
    if (!record || Number(record.expiresAt) < Date.now() || Number(record.attempts) >= Config.auth.otpMaxAttempts) throw invalid;
    if (!Crypto.safeEqual(record.otpHash, this.otpHash(email, purpose, otp))) {
      record.attempts = Number(record.attempts) + 1;
      this.otps.update(record);
      throw invalid;
    }
    this.otps.remove(record); // sekali pakai
  }

  createSession(user, remember) {
    const days = remember ? Config.auth.sessionDays.remember : Config.auth.sessionDays.default;
    const token = Crypto.randomToken();
    const expiresAt = Date.now() + days * 864e5;
    // Hanya HASH token yang disimpan → kebocoran sheet tidak membocorkan sesi
    this.sessions.insert({ tokenHash: Crypto.sha256(token), userId: user.id, expiresAt: expiresAt, createdAt: nowIso(), lastSeenAt: nowIso() });
    return { token: token, expiresAt: expiresAt, user: toPublicUser(user) };
  }

  /** OTP hanya disertakan pada DEV_MODE (uji coba tanpa email). */
  withDevOtp(payload, otp) {
    if (otp && Config.devMode()) payload.devOtp = otp;
    return payload;
  }
}

/* -------------------------- PublicContentService ------------------------- */
/**
 * Konten publik ISR (FAQ & pengumuman). Respons di-cache (TTL) dan cache
 * diinvalidasi otomatis saat sheet diedit (trigger onContentEdit).
 * `version` = updatedAt terbaru → klien mengganti HTML statis bila lebih baru.
 */
class PublicContentService {
  constructor(deps) {
    this.faqRepo = deps.faqRepo;
    this.announcementRepo = deps.announcementRepo;
    this.cache = CacheService.getScriptCache();
  }

  cached(key, compute) {
    const hit = this.cache.get(key);
    if (hit) return JSON.parse(hit);
    const value = compute();
    this.cache.put(key, JSON.stringify(value), Config.content.cacheTtlSeconds);
    return value;
  }

  static latestVersion(rows) {
    const times = rows.map((r) => Date.parse(r.updatedAt)).filter((t) => !isNaN(t));
    return new Date(times.length ? Math.max.apply(null, times) : 0).toISOString();
  }

  static isPublished(value) {
    return value === true || String(value).toLowerCase() === 'true' || String(value) === '1';
  }

  getFaq() {
    return this.cached(PublicContentService.CACHE_KEYS.faq, () => {
      const rows = this.faqRepo.findAll().filter((r) => r.id && PublicContentService.isPublished(r.published));
      rows.sort((a, b) => Number(a.order) - Number(b.order));
      return {
        version: PublicContentService.latestVersion(rows),
        items: rows.map((r) => ({
          id: Sanitize.text(r.id, 60),
          question: Sanitize.text(r.question, 300),
          answer: Sanitize.text(r.answer, 2000),
        })),
      };
    });
  }

  getAnnouncements() {
    return this.cached(PublicContentService.CACHE_KEYS.announcements, () => {
      const now = Date.now();
      const rows = this.announcementRepo.findAll().filter((r) => {
        const starts = Date.parse(r.startsAt);
        return r.id && PublicContentService.isPublished(r.published) && (isNaN(starts) || starts <= now);
      });
      return {
        version: PublicContentService.latestVersion(rows),
        items: rows.map((r) => ({
          id: Sanitize.text(r.id, 60),
          tone: ['info', 'warning', 'success'].indexOf(r.tone) > -1 ? r.tone : 'info',
          text: Sanitize.text(r.text, 300),
          href: /^(\/(?!\/)|https:\/\/)/.test(String(r.href)) ? String(r.href) : '', // hanya tautan aman
          linkLabel: Sanitize.text(r.linkLabel, 40),
          expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
        })),
      };
    });
  }

  invalidate() {
    this.cache.removeAll(Object.values(PublicContentService.CACHE_KEYS));
  }
}
PublicContentService.CACHE_KEYS = Object.freeze({ faq: 'content:faq:v1', announcements: 'content:announcements:v1' });
