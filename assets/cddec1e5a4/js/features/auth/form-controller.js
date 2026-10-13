import { appConfig } from "../../config/app.config.js";
import { announce } from "../../core/a11y.js";
import { qs, qsa } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { sanitizeDigits, sanitizeEmail, sanitizeText } from "../../core/sanitize.js";
import { session as sessionStore } from "../../core/storage.js";
import { debounce } from "../../core/utils.js";
import { isBusy, setBusy } from "../../components/atoms/button.js";
import { passwordStrength, validateAll, validateField } from "./validation.js";

/**
 * Pengendali form generik (terpisah dari aturan & aksi):
 * - Validasi inline saat kolom ditinggalkan (blur), lalu live saat mengetik
 *   setelah galat muncul.
 * - Galat terhubung via aria-describedby + aria-invalid.
 * - Submit gagal → fokus ke galat pertama.
 * - Tombol memasuki kondisi memuat & mencegah kirim ganda.
 * - Draf kolom non-sensitif disimpan otomatis (sessionStorage) agar isian
 *   tidak hilang saat gagal/terputus. Kata sandi & OTP TIDAK PERNAH disimpan.
 */
const SENSITIVE = new Set(["password", "confirmPassword", "otp"]);

const SANITIZERS = {
  email: sanitizeEmail,
  phone: (v) => sanitizeDigits(v, 16),
  otp: (v) => sanitizeDigits(v, appConfig.auth.otpLength),
  name: (v) => sanitizeText(v, { maxLength: 80 }),
};

export function readValues(form) {
  const values = {};
  for (const el of form.elements) {
    if (!el.name || el.type === "submit") continue;
    if (el.type === "checkbox") values[el.name] = el.checked;
    else if (el.type === "radio") {
      if (el.checked) values[el.name] = el.value;
    } else values[el.name] = SENSITIVE.has(el.name) && el.name !== "otp" ? el.value : (SANITIZERS[el.name] ?? sanitizeText)(el.value);
  }
  return values;
}

export function createFormController(form, { schema, onSubmit, draftKey }) {
  const touched = new Set();
  const submitButton = qs("[data-submit]", form);
  const draftStorageKey = draftKey ? `${appConfig.storageKeys.draftPrefix}${draftKey}` : null;

  const control = (name) => form.elements.namedItem(name);
  const errorEl = (name) => qs(`[data-error-for="${name}"]`, form);

  function showError(name, message) {
    const input = control(name);
    const el = errorEl(name);
    if (!input || !el) return;
    if (message) {
      input.setAttribute("aria-invalid", "true");
      el.querySelector("span").textContent = message;
      el.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      el.querySelector("span").textContent = "";
      el.hidden = true;
    }
  }

  const validateOne = (name) => {
    const message = validateField(schema, name, readValues(form));
    showError(name, message);
    return message;
  };

  /* ---- Validasi inline ---- */
  form.addEventListener("focusout", (event) => {
    const { name } = event.target;
    if (!name || !(name in schema)) return;
    if (event.target.value === "" && !touched.has(name) && event.target.type !== "checkbox") return; // jangan memarahi kolom yang baru dilewati
    touched.add(name);
    validateOne(name);
  });

  form.addEventListener("input", (event) => {
    const { name } = event.target;
    if (name === "otp") event.target.value = sanitizeDigits(event.target.value, appConfig.auth.otpLength);
    if (touched.has(name) || event.target.getAttribute("aria-invalid") === "true") validateOne(name);
    // Konfirmasi kata sandi ikut divalidasi ulang saat kata sandi berubah
    if (name === "password" && touched.has("confirmPassword")) validateOne("confirmPassword");
    saveDraft();
  });

  form.addEventListener("change", (event) => {
    if (event.target.type === "checkbox" && event.target.name in schema) {
      touched.add(event.target.name);
      validateOne(event.target.name);
    }
  });

  /* ---- Meter kekuatan kata sandi ---- */
  qsa("[data-meter-for]", form).forEach((meter) => {
    const input = form.querySelector(`#${meter.dataset.meterFor}`);
    const label = form.querySelector(`[data-meter-label-for="${meter.dataset.meterFor}"]`);
    const levels = t("form.strength");
    input?.addEventListener("input", () => {
      const level = input.value ? passwordStrength(input.value) : 0;
      meter.dataset.level = String(level);
      if (label) label.textContent = level ? t("form.strengthLabel", { level: levels[level] }) : "";
    });
  });

  /* ---- Tampilkan/sembunyikan kata sandi ---- */
  qsa("[data-reveal]", form).forEach((button) => {
    const input = form.querySelector(`#${button.dataset.reveal}`);
    button.addEventListener("click", () => {
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.setAttribute("aria-pressed", String(reveal));
      button.querySelector("use")?.setAttribute("href", reveal ? "#i-eye-off" : "#i-eye");
      button.querySelector(".sr-only").textContent = t(reveal ? "form.conceal" : "form.reveal");
      input.focus();
    });
  });

  /* ---- Draf otomatis (auto save) ---- */
  const saveDraft = debounce(() => {
    if (!draftStorageKey) return;
    const values = readValues(form);
    SENSITIVE.forEach((k) => delete values[k]);
    sessionStore.write(draftStorageKey, values);
  }, 300);

  function restoreDraft() {
    if (!draftStorageKey) return false;
    const draft = sessionStore.read(draftStorageKey);
    if (!draft) return false;
    let restored = false;
    Object.entries(draft).forEach(([name, value]) => {
      const el = control(name);
      if (!el || SENSITIVE.has(name) || el.type === "hidden") return;
      if (el.type === "checkbox") el.checked = Boolean(value);
      else if (value) {
        el.value = value;
        restored = true;
      }
    });
    return restored;
  }

  const clearDraft = () => draftStorageKey && sessionStore.remove(draftStorageKey);

  /* ---- Submit ---- */
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isBusy(submitButton)) return; // cegah kirim ganda

    const values = readValues(form);
    const { valid, errors } = validateAll(schema, values);
    Object.keys(schema).forEach((name) => {
      touched.add(name);
      showError(name, errors[name] ?? null);
    });

    if (!valid) {
      const first = Object.keys(schema).find((name) => errors[name]);
      control(first)?.focus();
      announce(t("form.errorsFound", { count: Object.keys(errors).length }), { assertive: true });
      return;
    }

    setBusy(submitButton, true);
    try {
      await onSubmit(values, { showError });
      clearDraft();
    } finally {
      setBusy(submitButton, false);
    }
  });

  return { restoreDraft, clearDraft, showError, reset: () => form.reset() };
}
