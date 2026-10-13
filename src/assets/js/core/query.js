import { local } from "./storage.js";

/**
 * Pustaka pengambilan data mini dengan cache (pola stale-while-revalidate):
 * - Data tersimpan langsung ditampilkan (termasuk saat offline),
 *   lalu diperbarui di latar belakang bila sudah basi.
 * - Permintaan identik di-dedupe; hasil dapat dipersist ke localStorage.
 * - setQueryData() mendukung optimistic UI.
 */
const PERSIST_KEY = "findst:query:v1";
const MAX_PERSISTED = 20;

const cache = new Map(); // key → { data, error, updatedAt, promise, listeners:Set }
const persisted = local.read(PERSIST_KEY, {}) || {};

function entryFor(key) {
  if (!cache.has(key)) {
    const saved = persisted[key];
    cache.set(key, {
      data: saved?.data,
      error: null,
      updatedAt: saved?.updatedAt ?? 0,
      promise: null,
      listeners: new Set(),
    });
  }
  return cache.get(key);
}

function persist(key, entry) {
  persisted[key] = { data: entry.data, updatedAt: entry.updatedAt };
  const keys = Object.keys(persisted);
  if (keys.length > MAX_PERSISTED) delete persisted[keys[0]];
  local.write(PERSIST_KEY, persisted);
}

const snapshot = (entry, staleTime) => ({
  data: entry.data,
  error: entry.error,
  isFetching: Boolean(entry.promise),
  isStale: Date.now() - entry.updatedAt > staleTime,
  status: entry.error && entry.data === undefined ? "error" : entry.data === undefined ? "loading" : "success",
});

const emit = (entry, staleTime) => entry.listeners.forEach((fn) => fn(snapshot(entry, staleTime)));

export function fetchQuery(key, fetcher, { staleTime = 60_000, persist: shouldPersist = false, force = false } = {}) {
  const entry = entryFor(key);
  const fresh = entry.data !== undefined && Date.now() - entry.updatedAt < staleTime;
  if (fresh && !force) return Promise.resolve(entry.data);
  if (entry.promise) return entry.promise;

  entry.promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      entry.data = data;
      entry.error = null;
      entry.updatedAt = Date.now();
      if (shouldPersist) persist(key, entry);
      return data;
    })
    .catch((error) => {
      entry.error = error;
      throw error;
    })
    .finally(() => {
      entry.promise = null;
      emit(entry, staleTime);
    });
  emit(entry, staleTime);
  return entry.promise;
}

/**
 * Berlangganan sebuah query. Callback langsung menerima snapshot dari cache,
 * lalu dipanggil lagi setelah revalidasi. Mengembalikan { refetch, unsubscribe }.
 */
export function subscribeQuery(key, fetcher, options = {}, listener) {
  const { staleTime = 60_000 } = options;
  const entry = entryFor(key);
  entry.listeners.add(listener);
  listener(snapshot(entry, staleTime));
  const refetch = (force = true) => fetchQuery(key, fetcher, { ...options, force }).catch(() => {});
  refetch(false);
  return { refetch, unsubscribe: () => entry.listeners.delete(listener) };
}

/** Optimistic update: ubah cache segera; kembalikan fungsi rollback. */
export function setQueryData(key, updater) {
  const entry = entryFor(key);
  const previous = entry.data;
  entry.data = typeof updater === "function" ? updater(previous) : updater;
  emit(entry, Infinity);
  return () => {
    entry.data = previous;
    emit(entry, Infinity);
  };
}

export const getQueryData = (key) => entryFor(key).data;
