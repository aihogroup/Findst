/**
 * ============================================================================
 * PENGUJIAN (jalankan dari editor Apps Script, lihat hasil di Execution log)
 *   runUnitTests()     → aturan validasi, sanitasi, kripto (tanpa menulis data)
 *   runSmokeTestAuth() → alur end-to-end: register → OTP → login → me →
 *                        forgot → reset → logout (butuh DEV_MODE=true),
 *                        lalu membersihkan data uji.
 *   runSmokeTestHttp() → mensimulasikan doGet/doPost seperti dari frontend.
 * ============================================================================
 */
function assert_(condition, message) {
  if (!condition) throw new Error('GAGAL: ' + message);
  console.log('✔ ' + message);
}

function expectError_(fn, code, message) {
  try {
    fn();
  } catch (error) {
    assert_(error.code === code, message + ' (kode ' + error.code + ')');
    return;
  }
  throw new Error('GAGAL: ' + message + ' (tidak ada galat)');
}

function runUnitTests() {
  const schema = authSchemas();
  expectError_(() => validate(schema.login, { email: 'salah', password: '' }), 'validation', 'login menolak email & kata sandi kosong');
  expectError_(() => validate(schema.register, { name: '<b>', email: 'a@b.co', phone: '', password: 'abcdefgh', plan: 'free' }), 'validation', 'register menolak nama & kata sandi lemah');
  validate(schema.register, { name: 'Rina Santoso', email: 'rina@contoh.id', phone: '081234567890', password: 'rahasia123', plan: 'free' });
  assert_(true, 'register menerima data valid');

  assert_(Sanitize.text(' <i>hai</i>\u0000 ') === 'hai', 'sanitasi teks membuang tag & karakter kontrol');
  assert_(Sanitize.cell('=SUM(A1)') === "'=SUM(A1)", 'cegah formula injection di sheet');
  assert_(Sanitize.email(' Rina@Contoh.ID ') === 'rina@contoh.id', 'normalisasi email');

  const encoded = Crypto.encodePassword('rahasia123');
  assert_(encoded.split('$').length === 4, 'format hash kata sandi algo$iter$salt$hash');
  assert_(Crypto.verifyPassword('rahasia123', encoded), 'verifikasi kata sandi benar');
  assert_(!Crypto.verifyPassword('rahasia124', encoded), 'tolak kata sandi salah');
  assert_(/^\d{6}$/.test(Crypto.randomOtp(6)), 'OTP 6 digit');
  assert_(Crypto.safeEqual('abc', 'abc') && !Crypto.safeEqual('abc', 'abd'), 'perbandingan waktu-konstan');
  return 'Semua unit test lulus.';
}

function runSmokeTestAuth() {
  if (!Config.devMode()) throw new Error('Set DEV_MODE=true untuk smoke test (OTP dikembalikan di respons).');
  const auth = Container.get().auth;
  const email = 'uji+' + Date.now() + '@findst.test';
  const password = 'UjiCoba123';

  // Lewati rate limiter untuk email uji tunggal ini tidak diperlukan: batas cukup longgar.
  const reg = auth.register({ name: 'Pengguna Uji', email: email, password: password, plan: 'free' });
  assert_(reg.devOtp, 'register mengirim OTP');
  expectError_(() => auth.login({ email: email, password: password }), 'notVerified', 'login ditolak sebelum verifikasi');

  const fresh = auth.resendOtp({ email: email, purpose: 'verify' });
  expectError_(() => auth.verifyOtp({ email: email, otp: '000000' === fresh.devOtp ? '111111' : '000000' }), 'invalidOtp', 'OTP salah ditolak');
  const session = auth.verifyOtp({ email: email, otp: fresh.devOtp });
  assert_(session.token && session.user.email === email, 'verifikasi OTP membuat sesi');
  assert_(!('passwordHash' in session.user), 'DTO tidak membocorkan passwordHash');

  const me = auth.me(session.token);
  assert_(me.user.id === session.user.id, 'me() mengembalikan profil');
  expectError_(() => auth.login({ email: email, password: 'salah1234' }), 'invalidCredentials', 'kata sandi salah ditolak');
  expectError_(() => auth.register({ name: 'Ganda', email: email, password: password }), 'emailTaken', 'email ganda ditolak');

  const forgot = auth.forgotPassword({ email: email });
  auth.resetPassword({ email: email, otp: forgot.devOtp, password: 'BaruSekali456' });
  expectError_(() => auth.me(session.token), 'sessionExpired', 'reset kata sandi mencabut sesi lama');
  const relogin = auth.login({ email: email, password: 'BaruSekali456', remember: true });
  assert_(relogin.token, 'login dengan kata sandi baru');
  auth.logout(relogin.token);
  expectError_(() => auth.me(relogin.token), 'sessionExpired', 'logout menghapus sesi');

  // Bersihkan data uji
  withLock(() => {
    const users = new UserRepository();
    const user = users.findByEmail(email);
    new SessionRepository().removeByUser(user.id);
    users.remove(user);
  });
  return 'Smoke test autentikasi lulus.';
}

function runSmokeTestHttp() {
  const parse = (output) => JSON.parse(output.getContent());
  const health = parse(doGet({ parameter: { action: 'health' } }));
  assert_(health.ok && health.data.status === 'ok', 'GET health');
  const faq = parse(doGet({ parameter: { action: 'faq' } }));
  assert_(faq.ok && Array.isArray(faq.data.items), 'GET faq (' + faq.data.items.length + ' item, versi ' + faq.data.version + ')');
  const bad = parse(doPost({ postData: { contents: '{bukan json' } }));
  assert_(!bad.ok && bad.error.code === 'badRequest' && bad.error.status === 400, 'POST JSON rusak → badRequest 400');
  const unknown = parse(doPost({ postData: { contents: JSON.stringify({ action: 'hapusSemua' }) } }));
  assert_(unknown.error.code === 'unknownAction', 'aksi tak dikenal ditolak');
  const invalid = parse(doPost({ postData: { contents: JSON.stringify({ action: 'login', payload: { email: 'x' } }) } }));
  assert_(invalid.error.code === 'validation' && invalid.error.details.fields.email, 'galat validasi per kolom');
  return 'Smoke test HTTP lulus.';
}
