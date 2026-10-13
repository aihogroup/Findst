import { appConfig } from "../config/app.config.js";
import { createStore } from "../core/store.js";
import { local, onStorageChange, session as sessionStorageSafe } from "../core/storage.js";
import { api } from "./api/index.js";

/**
 * Sesi pengguna (persistent sesuai pilihan "tetap masuk"):
 * - remember → localStorage (bertahan antar-sesi browser)
 * - tidak    → sessionStorage (hilang saat tab ditutup)
 * - Sliding expiration melalui refreshSession().
 * - Logout di satu tab ikut mengeluarkan tab lain.
 * Catatan produksi: gunakan cookie HttpOnly + SameSite dari server.
 */
const KEY = appConfig.storageKeys.session;
const EMPTY = { token: null, user: null, expiresAt: 0 };

function readPersisted() {
  const data = local.read(KEY) ?? sessionStorageSafe.read(KEY);
  return data && data.expiresAt > Date.now() ? data : EMPTY;
}

export const sessionStore = createStore(readPersisted());

export const isAuthenticated = () => {
  const { token, expiresAt } = sessionStore.getState();
  return Boolean(token) && expiresAt > Date.now();
};

export function saveSession({ token, user, expiresAt }, { remember = true } = {}) {
  const data = { token, user, expiresAt };
  (remember ? local : sessionStorageSafe).write(KEY, data);
  (remember ? sessionStorageSafe : local).remove(KEY);
  sessionStore.setState(data);
}

export function clearSession() {
  local.remove(KEY);
  sessionStorageSafe.remove(KEY);
  sessionStore.setState(EMPTY);
}

export async function refreshSession() {
  const { token } = sessionStore.getState();
  if (!token) return null;
  try {
    const { user, expiresAt } = await api.me(token);
    const remember = Boolean(local.read(KEY));
    saveSession({ token, user, expiresAt }, { remember });
    return user;
  } catch (error) {
    if (error.code === "sessionExpired") clearSession();
    throw error;
  }
}

export async function logout() {
  const { token } = sessionStore.getState();
  clearSession();
  if (token) await api.logout(token).catch(() => {});
}

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";

onStorageChange(KEY, (value) => {
  if (!value) sessionStore.setState(EMPTY);
  else sessionStore.setState(value);
});
