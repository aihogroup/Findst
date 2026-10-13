import { appConfig } from "../../config/app.config.js";
import { ApiError, request } from "../../core/http.js";
import { local } from "../../core/storage.js";
import { sleep } from "../../core/utils.js";

/**
 * Adapter DEMO (tanpa server): meniru kontrak API Apps Script di localStorage
 * agar seluruh alur (daftar → OTP → masuk → dasbor) bisa diuji offline.
 * Kode OTP dikembalikan sebagai `devOtp` — HANYA untuk mode demo.
 */
const DB_KEY = appConfig.storageKeys.mockDb;
const OTP_TTL = 10 * 60 * 1000;

const readDb = () => local.read(DB_KEY, null) ?? { users: {}, otps: {}, sessions: {} };
const writeDb = (db) => local.write(DB_KEY, db);

async function hash(text) {
  if (!globalThis.crypto?.subtle) return `plain:${text}`; // konteks tidak aman: demo saja
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
const randomOtp = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, plan: u.plan, createdAt: u.createdAt });

async function latency() {
  await sleep(450 + Math.random() * 350);
  if (globalThis.navigator?.onLine === false) throw new ApiError("offline", "Offline", { retryable: true });
}

function issueOtp(db, email, purpose) {
  const otp = randomOtp();
  db.otps[`${purpose}:${email}`] = { otp, expiresAt: Date.now() + OTP_TTL, attempts: 0 };
  return otp;
}

function consumeOtp(db, email, purpose, otp) {
  const key = `${purpose}:${email}`;
  const record = db.otps[key];
  if (!record || record.expiresAt < Date.now() || record.attempts >= 5) throw new ApiError("invalidOtp");
  if (record.otp !== otp) {
    record.attempts += 1;
    writeDb(db);
    throw new ApiError("invalidOtp");
  }
  delete db.otps[key];
}

function createSession(db, user, remember) {
  const days = remember ? appConfig.auth.sessionDays.remember : appConfig.auth.sessionDays.default;
  const token = randomToken();
  const expiresAt = Date.now() + days * 864e5;
  db.sessions[token] = { userId: user.id, expiresAt };
  return { token, expiresAt, user: publicUser(user) };
}

export function createMockAdapter() {
  return {
    mode: "demo",

    async register({ name, email, phone, password, plan }) {
      await latency();
      const db = readDb();
      const existing = db.users[email];
      if (existing?.verified) throw new ApiError("emailTaken");
      const salt = randomToken();
      db.users[email] = {
        id: existing?.id ?? randomToken().slice(0, 12),
        name,
        email,
        phone,
        plan: plan === "premium" ? "premium-trial" : "free",
        role: "user",
        salt,
        passwordHash: await hash(salt + password),
        verified: false,
        createdAt: new Date().toISOString(),
      };
      const devOtp = issueOtp(db, email, "verify");
      writeDb(db);
      return { email, devOtp };
    },

    async verifyOtp({ email, otp }) {
      await latency();
      const db = readDb();
      const user = db.users[email];
      if (!user) throw new ApiError("invalidOtp");
      consumeOtp(db, email, "verify", otp);
      user.verified = true;
      const session = createSession(db, user, true);
      writeDb(db);
      return session;
    },

    async resendOtp({ email, purpose = "verify" }) {
      await latency();
      const db = readDb();
      const devOtp = db.users[email] ? issueOtp(db, email, purpose) : undefined;
      writeDb(db);
      return { sent: true, devOtp };
    },

    async login({ email, password, remember }) {
      await latency();
      const db = readDb();
      const user = db.users[email];
      if (!user || user.passwordHash !== (await hash(user.salt + password))) throw new ApiError("invalidCredentials");
      if (!user.verified) {
        const devOtp = issueOtp(db, email, "verify");
        writeDb(db);
        throw new ApiError("notVerified", undefined, { details: { email, devOtp } });
      }
      const session = createSession(db, user, remember);
      writeDb(db);
      return session;
    },

    async logout(token) {
      await sleep(150);
      const db = readDb();
      delete db.sessions[token];
      writeDb(db);
      return { ok: true };
    },

    async me(token) {
      await latency();
      const db = readDb();
      const session = db.sessions[token];
      if (!session || session.expiresAt < Date.now()) throw new ApiError("sessionExpired");
      const user = Object.values(db.users).find((u) => u.id === session.userId);
      if (!user) throw new ApiError("sessionExpired");
      return { user: publicUser(user), expiresAt: session.expiresAt };
    },

    async forgotPassword({ email }) {
      await latency();
      const db = readDb();
      // Respons selalu sama → tidak membocorkan apakah email terdaftar
      const devOtp = db.users[email]?.verified ? issueOtp(db, email, "reset") : undefined;
      writeDb(db);
      return { sent: true, devOtp };
    },

    async resetPassword({ email, otp, password }) {
      await latency();
      const db = readDb();
      const user = db.users[email];
      if (!user) throw new ApiError("invalidOtp");
      consumeOtp(db, email, "reset", otp);
      user.salt = randomToken();
      user.passwordHash = await hash(user.salt + password);
      // Cabut semua sesi lama
      Object.entries(db.sessions).forEach(([tk, s]) => s.userId === user.id && delete db.sessions[tk]);
      writeDb(db);
      return { ok: true };
    },

    getFaq: () => request(appConfig.content.faqUrl, { timeoutMs: 8000 }),
    getAnnouncements: () => request(appConfig.content.announcementsUrl, { timeoutMs: 8000 }),
  };
}
