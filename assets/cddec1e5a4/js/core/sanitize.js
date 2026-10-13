/**
 * Sanitasi masukan di sisi klien (kenyamanan & pertahanan berlapis).
 * Validasi otoritatif TETAP di server (lihat gas/Code.gs).
 */

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Buang karakter kontrol & tag, normalisasi Unicode, rapikan spasi, batasi panjang. */
export function sanitizeText(value, { maxLength = 500, multiline = false } = {}) {
  let text = String(value ?? "").normalize("NFKC");
  // eslint-disable-next-line no-control-regex
  text = text.replace(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, "");
  text = text.replace(/<[^>]*>/g, "");
  text = multiline ? text.replace(/[ \t]+/g, " ") : text.replace(/\s+/g, " ");
  return text.trim().slice(0, maxLength);
}

export const sanitizeEmail = (value) => sanitizeText(value, { maxLength: 120 }).toLowerCase().replace(/\s/g, "");

export const sanitizeDigits = (value, maxLength = 16) => String(value ?? "").replace(/[^\d+]/g, "").slice(0, maxLength);

/** Hanya izinkan URL relatif, http(s), dan mailto — cegah javascript: dsb. */
export function safeUrl(value, fallback = "#") {
  const url = String(value ?? "").trim();
  if (/^(\/(?!\/)|#|\?)/.test(url)) return url;
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

/** Hanya path internal yang diizinkan sebagai tujuan redirect (cegah open redirect). */
export function safeRedirectPath(value, fallback = "/") {
  const path = String(value ?? "");
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(path) ? path : fallback;
}
