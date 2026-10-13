/**
 * Pembungkus penyimpanan yang aman: localStorage/sessionStorage dapat
 * melempar galat (mode privat Safari, kuota penuh, diblokir). Bila gagal,
 * otomatis jatuh ke memori agar aplikasi tetap berfungsi.
 */
function resolveBackend(kind) {
  try {
    const store = globalThis[kind];
    const probe = "__findst_probe__";
    store.setItem(probe, probe);
    store.removeItem(probe);
    return store;
  } catch {
    const memory = new Map();
    return {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
    };
  }
}

function createStorage(kind) {
  let backend;
  const get = () => (backend ??= resolveBackend(kind));
  return {
    read(key, fallback = null) {
      try {
        const raw = get().getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        get().setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false; // kuota penuh/mode privat: gagal senyap, state tetap di memori
      }
    },
    remove(key) {
      try {
        get().removeItem(key);
      } catch {
        /* abaikan */
      }
    },
  };
}

export const local = createStorage("localStorage");
export const session = createStorage("sessionStorage");

/** Sinkronisasi antar-tab: panggil cb ketika key berubah di tab lain. */
export function onStorageChange(key, cb) {
  const handler = (event) => {
    if (event.key !== key) return;
    try {
      cb(event.newValue == null ? null : JSON.parse(event.newValue));
    } catch {
      cb(null);
    }
  };
  globalThis.addEventListener?.("storage", handler);
  return () => globalThis.removeEventListener?.("storage", handler);
}
