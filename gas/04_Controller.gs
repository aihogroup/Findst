/**
 * ============================================================================
 * LAYER: INTERFACE — HTTP controller (Web App)
 *
 * Kontrak API v1 (satu endpoint Web App, aksi dipilih lewat `action`):
 *   GET  ?action=health | faq | announcements
 *   POST body (Content-Type text/plain, isi JSON):
 *        { "action": "...", "payload": { ... }, "token": "...", "apiVersion": "v1" }
 *        aksi: register, verifyOtp, resendOtp, login, logout, me,
 *              forgotPassword, resetPassword
 *
 * Envelope respons seragam:
 *   sukses: { ok: true,  data, meta: { requestId, apiVersion, durationMs } }
 *   gagal : { ok: false, error: { code, status, message, details }, meta }
 * Catatan: Apps Script selalu mengembalikan HTTP 200; status semantik ada di
 * error.status. Untuk produksi, letakkan API di belakang gateway/REST asli.
 * ============================================================================
 */

/** Composition root: satu-satunya tempat merakit dependensi (DI container). */
const Container = (() => {
  let instance;
  return {
    get() {
      if (!instance) {
        const users = new UserRepository();
        instance = {
          auth: new AuthService({
            users: users,
            otps: new OtpRepository(),
            sessions: new SessionRepository(),
            audit: new AuditRepository(),
            mailer: Config.sendEmail() ? new MailAppMailer() : new LogMailer(),
          }),
          content: new PublicContentService({
            faqRepo: new SheetRepository('Faq'),
            announcementRepo: new SheetRepository('Announcements'),
          }),
        };
      }
      return instance;
    },
  };
})();

/** Tabel rute (Open/Closed: aksi baru = satu baris baru). */
const Routes = {
  GET: {
    health: () => ({ status: 'ok', apiVersion: API_VERSION, env: Config.env(), time: nowIso() }),
    faq: (req, c) => c.content.getFaq(),
    announcements: (req, c) => c.content.getAnnouncements(),
  },
  POST: {
    register: (req, c) => c.auth.register(req.payload),
    verifyOtp: (req, c) => c.auth.verifyOtp(req.payload),
    resendOtp: (req, c) => c.auth.resendOtp(req.payload),
    login: (req, c) => c.auth.login(req.payload),
    logout: (req, c) => c.auth.logout(req.token),
    me: (req, c) => c.auth.me(req.token),
    forgotPassword: (req, c) => c.auth.forgotPassword(req.payload),
    resetPassword: (req, c) => c.auth.resetPassword(req.payload),
  },
};

function doGet(e) {
  return handleRequest('GET', e);
}

function doPost(e) {
  return handleRequest('POST', e);
}

/** Penanganan galat terpusat: endpoint tidak perlu try/catch sendiri. */
function handleRequest(method, e) {
  const started = Date.now();
  const meta = { requestId: Utilities.getUuid(), apiVersion: API_VERSION };
  let action = 'unknown';
  try {
    const request = parseRequest(method, e);
    action = request.action;
    const handler = Routes[method][action];
    if (!handler) throw new AppError('unknownAction', 'Aksi "' + action + '" tidak dikenal untuk ' + method + '.');
    const data = handler(request, Container.get());
    meta.durationMs = Date.now() - started;
    Log.info('request.ok', { requestId: meta.requestId, method: method, action: action, durationMs: meta.durationMs });
    return Http.ok(data, meta);
  } catch (error) {
    meta.durationMs = Date.now() - started;
    const known = error instanceof AppError;
    if (known && error.status < 500) Log.info('request.rejected', { requestId: meta.requestId, action: action, code: error.code });
    else Log.error('request.failed', error, { requestId: meta.requestId, action: action });
    return Http.fail(error, meta);
  }
}

/** Parsing + validasi bentuk request (bukan aturan bisnis). */
function parseRequest(method, e) {
  if (method === 'GET') {
    return { action: String((e && e.parameter && e.parameter.action) || 'health') };
  }
  const raw = e && e.postData ? e.postData.contents : '';
  if (!raw) throw new AppError('badRequest', 'Body permintaan kosong.');
  if (raw.length > Config.request.maxBodyBytes) throw new AppError('badRequest', 'Body permintaan terlalu besar.');

  let body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    throw new AppError('badRequest', 'Body harus berupa JSON yang valid.');
  }
  if (!body || typeof body.action !== 'string') throw new AppError('badRequest', 'Field "action" wajib diisi.');
  if (body.apiVersion && body.apiVersion !== API_VERSION) throw new AppError('badRequest', 'Versi API tidak didukung: ' + body.apiVersion);

  return {
    action: body.action,
    payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
    token: typeof body.token === 'string' ? body.token.slice(0, 128) : '',
  };
}
