import { ApiError, request } from "../../core/http.js";

/**
 * Adapter Google Apps Script (prototipe database Google Sheets).
 * - POST memakai Content-Type text/plain → "simple request", tanpa preflight
 *   CORS (Apps Script tidak menangani OPTIONS).
 * - Token sesi dikirim di body, bukan URL (tidak tercatat di log/riwayat).
 * - Respons standar: { ok: true, data } | { ok: false, error: { code, message } }
 */
export function createGasAdapter({ baseUrl, timeoutMs, retries }) {
  async function call(action, payload = {}, { token, method = "POST" } = {}) {
    const json =
      method === "GET"
        ? await request(`${baseUrl}?action=${encodeURIComponent(action)}`, { timeoutMs, retries })
        : await request(baseUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action, payload, token }),
            timeoutMs,
            retries: 0, // POST tidak di-retry otomatis (tidak idempoten)
          });

    if (!json || json.ok !== true) {
      const err = json?.error ?? {};
      throw new ApiError(err.code || "unknown", err.message, { details: err.details });
    }
    return json.data;
  }

  return {
    mode: "gas",
    register: (payload) => call("register", payload),
    verifyOtp: (payload) => call("verifyOtp", payload),
    resendOtp: (payload) => call("resendOtp", payload),
    login: (payload) => call("login", payload),
    logout: (token) => call("logout", {}, { token }),
    me: (token) => call("me", {}, { token }),
    forgotPassword: (payload) => call("forgotPassword", payload),
    resetPassword: (payload) => call("resetPassword", payload),
    getFaq: () => call("faq", {}, { method: "GET" }),
    getAnnouncements: () => call("announcements", {}, { method: "GET" }),
  };
}
