/**
 * ============================================================================
 * SETUP, MIGRASI & PEMELIHARAAN
 *   setup()           → jalankan SEKALI: buat sheet, seed konten, properti, trigger
 *   createSuperadmin()→ buat akun superadmin (ubah parameter di fungsi dulu)
 *   purgeExpired()    → retensi data (dijalankan trigger harian)
 *   onContentEdit(e)  → trigger: perbarui updatedAt & invalidasi cache ISR
 * ============================================================================
 */
function setup() {
  const ss = Db.spreadsheet();

  // 1) Skema sheet (idempoten: aman dijalankan ulang)
  Object.keys(SCHEMA).forEach((name) => {
    const columns = SCHEMA[name];
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold').setBackground('#f5eddc');
    sheet.setFrozenRows(1);
  });

  // Sembunyikan sheet sensitif dari pandangan sekilas (bukan pengganti izin akses)
  ['Otps', 'Sessions'].forEach((name) => ss.getSheetByName(name).hideSheet());

  // 2) Seed konten publik bila masih kosong
  seedContent_();

  // 3) Properti bawaan yang aman
  const props = PropertiesService.getScriptProperties();
  const defaults = { ENV: 'development', DEV_MODE: 'true', SEND_EMAIL: 'false' };
  Object.keys(defaults).forEach((key) => {
    if (props.getProperty(key) === null) props.setProperty(key, defaults[key]);
  });
  if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', Crypto.randomToken());

  // 4) Trigger
  installTriggers_();

  Log.info('setup.done', { spreadsheet: ss.getUrl() });
  return 'Setup selesai. Deploy sebagai Web App lalu salin URL /exec ke app.config.js (api.baseUrl).';
}

function seedContent_() {
  const faq = new SheetRepository('Faq');
  if (!faq.findAll().length) {
    const now = nowIso();
    [
      ['apa-itu-findst', 'Apa itu Findst?', 'Findst adalah aplikasi manajemen investasi saham Indonesia yang memakai machine learning dengan metode dynamic threshold untuk membantu Anda menyaring, memantau, dan mengevaluasi saham di Bursa Efek Indonesia. Findst adalah alat bantu analisis, bukan penasihat investasi.'],
      ['dynamic-threshold', 'Apa yang dimaksud dengan dynamic threshold?', 'Ambang batas keputusan yang tidak bernilai tetap. Parameternya dihitung ulang secara berkala mengikuti kondisi bursa seperti volatilitas dan likuiditas.'],
      ['jaminan-keuntungan', 'Apakah Findst menjamin keuntungan?', 'Tidak. Investasi saham mengandung risiko, termasuk kemungkinan kehilangan modal. Hasil uji historis tidak menjamin hasil di masa depan.'],
      ['transaksi', 'Apakah Findst melakukan transaksi atas nama saya?', 'Tidak. Findst tidak mengeksekusi transaksi dan tidak meminta akses ke rekening efek Anda.'],
      ['pasang-aplikasi', 'Apakah saya harus memasang aplikasi?', 'Tidak wajib. Findst berjalan di browser dan dapat dipasang sebagai aplikasi (PWA) di Android, iOS, Windows, macOS, maupun Linux.'],
      ['keamanan-data', 'Bagaimana Findst menjaga data saya?', 'Koneksi memakai HTTPS, kata sandi tidak disimpan dalam bentuk asli, dan data pribadi tidak disimpan di cache publik perangkat.'],
      ['gratis-premium', 'Apa beda akun gratis dan premium?', 'Akun gratis memberi akses ke watchlist dan ringkasan pasar. Premium menambahkan pemindaian sinyal lengkap, riwayat evaluasi model, notifikasi kustom, dan ekspor data.'],
      ['atur-tampilan', 'Bisakah saya mengatur tampilan aplikasi?', 'Bisa: tema terang atau gelap, jenis huruf (Serif, Poppins, Arial), dan ukuran huruf.'],
    ].forEach((row, i) => faq.insert({ id: row[0], question: row[1], answer: row[2], order: i + 1, published: true, updatedAt: now }));
  }

  const ann = new SheetRepository('Announcements');
  if (!ann.findAll().length) {
    ann.insert({
      id: 'beta-terbuka-2026',
      tone: 'info',
      text: 'Findst sedang dalam tahap beta terbuka. Daftar untuk mencoba fitur dasar secara gratis.',
      href: '/daftar/',
      linkLabel: 'Ikut beta',
      startsAt: '',
      expiresAt: '',
      published: true,
      updatedAt: nowIso(),
    });
  }
}

function installTriggers_() {
  const existing = ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  if (existing.indexOf('onContentEdit') === -1) {
    ScriptApp.newTrigger('onContentEdit').forSpreadsheet(Db.spreadsheet()).onEdit().create();
  }
  if (existing.indexOf('purgeExpired') === -1) {
    ScriptApp.newTrigger('purgeExpired').timeBased().everyDays(1).atHour(2).create();
  }
}

/** ISR: edit manual pada sheet konten → updatedAt diperbarui & cache dibersihkan. */
function onContentEdit(e) {
  const sheet = e && e.range && e.range.getSheet();
  if (!sheet || ['Faq', 'Announcements'].indexOf(sheet.getName()) === -1 || e.range.getRow() < 2) return;
  const columns = SCHEMA[sheet.getName()];
  const updatedCol = columns.indexOf('updatedAt') + 1;
  if (e.range.getColumn() !== updatedCol) {
    sheet.getRange(e.range.getRow(), updatedCol, e.range.getNumRows(), 1).setValues(
      Array.from({ length: e.range.getNumRows() }, () => ["'" + nowIso()]),
    );
  }
  CacheService.getScriptCache().removeAll(Object.values(PublicContentService.CACHE_KEYS));
}

/** Retensi data: hapus OTP & sesi kedaluwarsa serta log audit lama (bulk). */
function purgeExpired() {
  const now = Date.now();
  const auditCutoff = now - Config.retention.auditDays * 864e5;
  withLock(() => {
    const otps = new OtpRepository().removeWhere((r) => Number(r.expiresAt) < now);
    const sessions = new SessionRepository().removeWhere((r) => Number(r.expiresAt) < now);
    const audits = new AuditRepository().removeWhere((r) => Date.parse(r.timestamp) < auditCutoff);
    Log.info('purge.done', { otps: otps, sessions: sessions, audits: audits });
  });
}

/**
 * Buat akun superadmin. Ubah nilai di bawah, jalankan sekali, lalu HAPUS
 * kata sandi dari kode. Kata sandi disimpan sebagai hash.
 */
function createSuperadmin() {
  const email = Sanitize.email('admin@findst.id');
  const name = 'Superadmin Findst';
  const password = 'GantiSegera123'; // ← ganti sebelum dijalankan
  const users = new UserRepository();
  return withLock(() => {
    const user = users.findByEmail(email) || { id: Utilities.getUuid(), createdAt: nowIso(), version: 0 };
    Object.assign(user, { email: email, name: name, phone: '', role: 'superadmin', plan: 'premium', status: USER_STATUS.ACTIVE, passwordHash: Crypto.encodePassword(password) });
    users.save(user);
    return 'Superadmin siap: ' + email;
  });
}
