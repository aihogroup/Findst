import { appConfig } from "../../config/app.config.js";
import { t } from "../../core/i18n.js";

/**
 * Skema validasi deklaratif & dapat dipakai ulang, terpisah dari tampilan.
 * Setiap aturan: (value, allValues) → pesan galat | null. Murni → teruji di Node.
 * Catatan: validasi klien hanya kenyamanan; server tetap otoritatif.
 */
const isEmpty = (v) => v == null || v === false || String(v).trim() === "";

export const rules = {
  required: (label) => (v) => (isEmpty(v) ? t("form.required", { label }) : null),
  email: () => (v) => (isEmpty(v) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v)) ? null : t("form.email")),
  minLength: (label, min) => (v) => (isEmpty(v) || String(v).length >= min ? null : t("form.minLength", { label, min })),
  maxLength: (label, max) => (v) => (String(v ?? "").length <= max ? null : t("form.maxLength", { label, max })),
  personName: () => (v) => (isEmpty(v) || /^[\p{L}][\p{L} .'-]*$/u.test(String(v).trim()) ? null : t("form.name")),
  passwordMix: () => (v) => (isEmpty(v) || (/[A-Za-z]/.test(v) && /\d/.test(v)) ? null : t("form.passwordStrength")),
  sameAs: (field) => (v, all) => (isEmpty(v) || v === all[field] ? null : t("form.mismatch")),
  phoneId: () => (v) => (isEmpty(v) || /^(\+62|62|0)8[1-9]\d{6,11}$/.test(String(v).replace(/[\s-]/g, "")) ? null : t("form.phone")),
  otp: () => (v) => (isEmpty(v) || new RegExp(`^\\d{${appConfig.auth.otpLength}}$`).test(String(v)) ? null : t("form.otp")),
  checked: () => (v) => (v ? null : t("form.terms")),
};

const min = appConfig.auth.passwordMinLength;
const r = rules;

export const schemas = {
  login: {
    email: [r.required("Email"), r.email()],
    password: [r.required("Kata sandi")],
  },
  account: {
    name: [r.required("Nama lengkap"), r.minLength("Nama lengkap", 2), r.maxLength("Nama lengkap", 80), r.personName()],
    email: [r.required("Email"), r.email(), r.maxLength("Email", 120)],
    phone: [r.phoneId()],
    password: [r.required("Kata sandi"), r.minLength("Kata sandi", min), r.maxLength("Kata sandi", 128), r.passwordMix()],
    confirmPassword: [r.required("Ulangi kata sandi"), r.sameAs("password")],
    terms: [r.checked()],
  },
  verify: {
    otp: [r.required("Kode verifikasi"), r.otp()],
  },
  request: {
    email: [r.required("Email"), r.email()],
  },
  reset: {
    otp: [r.required("Kode verifikasi"), r.otp()],
    password: [r.required("Kata sandi baru"), r.minLength("Kata sandi baru", min), r.maxLength("Kata sandi baru", 128), r.passwordMix()],
    confirmPassword: [r.required("Ulangi kata sandi baru"), r.sameAs("password")],
  },
};

export function validateField(schema, name, values) {
  for (const rule of schema[name] ?? []) {
    const message = rule(values[name], values);
    if (message) return message;
  }
  return null;
}

export function validateAll(schema, values) {
  const errors = {};
  for (const name of Object.keys(schema)) {
    const message = validateField(schema, name, values);
    if (message) errors[name] = message;
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Skor kekuatan kata sandi 0–4 (heuristik ringan, tanpa pustaka). */
export function passwordStrength(password = "") {
  if (!password) return 0;
  let score = 0;
  if (password.length >= min) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  if (/^(.)\1+$/.test(password) || /^(password|12345678|qwerty)/i.test(password)) score = 1;
  return Math.max(1, Math.min(4, score));
}
