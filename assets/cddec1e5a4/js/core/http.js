import { sleep } from "./utils.js";

/**
 * Klien HTTP: timeout, retry dengan exponential backoff + jitter, dan
 * normalisasi galat menjadi kode yang dapat diterjemahkan ke bahasa awam.
 */
export class ApiError extends Error {
  constructor(code, message, { status = 0, retryable = false, details } = {}) {
    super(message || code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function toApiError(error, status) {
  if (error instanceof ApiError) return error;
  if (error?.name === "AbortError") return new ApiError("timeout", "Request timeout", { retryable: true });
  if (globalThis.navigator && navigator.onLine === false) return new ApiError("offline", "Offline", { retryable: true });
  if (status === 429) return new ApiError("rateLimited", "Too many requests", { status, retryable: true });
  if (status >= 500) return new ApiError("server", `HTTP ${status}`, { status, retryable: true });
  if (status >= 400) return new ApiError("client", `HTTP ${status}`, { status });
  return new ApiError("network", error?.message || "Network error", { retryable: true });
}

/**
 * request(url, { method, body, headers, timeoutMs, retries, signal })
 * Retry hanya otomatis untuk metode idempoten kecuali `retryUnsafe: true`.
 */
export async function request(url, options = {}) {
  const {
    method = "GET",
    body,
    headers = {},
    timeoutMs = 12000,
    retries = 2,
    retryUnsafe = false,
    signal,
    parse = "json",
  } = options;
  const canRetry = method === "GET" || retryUnsafe;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOuter, { once: true });
    let status = 0;
    try {
      const response = await fetch(url, {
        method,
        body,
        headers,
        signal: controller.signal,
        redirect: "follow",
        credentials: "omit",
      });
      status = response.status;
      if (!response.ok) throw toApiError(null, status);
      return parse === "json" ? await response.json() : await response.text();
    } catch (raw) {
      if (signal?.aborted) throw raw;
      const error = toApiError(raw, status);
      if (!canRetry || !error.retryable || attempt >= retries) throw error;
      await sleep(Math.min(8000, 400 * 2 ** attempt) + Math.random() * 250);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortOuter);
    }
  }
}
