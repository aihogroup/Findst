/** Utilitas murni tanpa ketergantungan DOM (aman diuji di Node). */

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function debounce(fn, wait = 200) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

/** Menyatukan banyak pemanggilan menjadi satu per frame (hemat CPU/baterai). */
export function rafThrottle(fn) {
  let frame = 0;
  let lastArgs;
  const throttled = (...args) => {
    lastArgs = args;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fn(...lastArgs);
    });
  };
  throttled.cancel = () => cancelAnimationFrame(frame);
  return throttled;
}

let uidCounter = 0;
export const uid = (prefix = "uid") => `${prefix}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;

export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/** Interpolasi string sederhana: "Halo {name}" → "Halo Rina". */
export const interpolate = (template, params = {}) =>
  String(template).replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`));
