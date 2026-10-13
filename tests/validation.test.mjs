import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordStrength, schemas, validateAll, validateField } from "../src/assets/js/features/auth/validation.js";

test("login: email & kata sandi wajib", () => {
  const { valid, errors } = validateAll(schemas.login, { email: "", password: "" });
  assert.equal(valid, false);
  assert.match(errors.email, /wajib/);
  assert.match(errors.password, /wajib/);
});

test("email harus valid", () => {
  assert.ok(validateField(schemas.login, "email", { email: "bukan-email" }));
  assert.equal(validateField(schemas.login, "email", { email: "nama@domain.co.id" }), null);
});

test("pendaftaran: kata sandi minimal 8 karakter & campuran huruf-angka", () => {
  const base = { name: "Rina Santoso", email: "rina@contoh.id", phone: "", confirmPassword: "abc", terms: true };
  assert.match(validateField(schemas.account, "password", { ...base, password: "abc" }), /minimal 8/);
  assert.match(validateField(schemas.account, "password", { ...base, password: "abcdefgh" }), /huruf dan angka/);
  assert.equal(validateField(schemas.account, "password", { ...base, password: "abcdefg1" }), null);
});

test("konfirmasi kata sandi harus sama", () => {
  const values = { password: "rahasia123", confirmPassword: "rahasia124" };
  assert.match(validateField(schemas.account, "confirmPassword", values), /tidak sama/);
});

test("nomor ponsel opsional, tetapi bila diisi harus format Indonesia", () => {
  assert.equal(validateField(schemas.account, "phone", { phone: "" }), null);
  assert.equal(validateField(schemas.account, "phone", { phone: "081234567890" }), null);
  assert.equal(validateField(schemas.account, "phone", { phone: "+6281234567890" }), null);
  assert.ok(validateField(schemas.account, "phone", { phone: "12345" }));
});

test("nama menolak karakter berbahaya", () => {
  assert.ok(validateField(schemas.account, "name", { name: "<script>" }));
  assert.equal(validateField(schemas.account, "name", { name: "Siti Nur'aini" }), null);
});

test("OTP harus 6 digit", () => {
  assert.ok(validateField(schemas.verify, "otp", { otp: "12345" }));
  assert.ok(validateField(schemas.verify, "otp", { otp: "12a456" }));
  assert.equal(validateField(schemas.verify, "otp", { otp: "123456" }), null);
});

test("syarat & ketentuan wajib dicentang", () => {
  assert.ok(validateField(schemas.account, "terms", { terms: false }));
  assert.equal(validateField(schemas.account, "terms", { terms: true }), null);
});

test("kekuatan kata sandi bertingkat 1–4", () => {
  assert.equal(passwordStrength(""), 0);
  assert.equal(passwordStrength("password123"), 1);
  assert.ok(passwordStrength("Abcdefgh1!xyz") >= 3);
});
