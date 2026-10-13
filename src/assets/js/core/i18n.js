import id from "../locales/id.js";
import { interpolate } from "./utils.js";

/**
 * i18n ringan: teks, format angka/tanggal/mata uang lewat Intl, dan arah
 * tulisan (RTL). Tidak menyentuh DOM saat diimpor → dapat diuji di Node.
 */
const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);
const loaders = { en: () => import("../locales/en.js") };
const dictionaries = { id };

let currentLang = (globalThis.document?.documentElement.lang || "id").split("-")[0];
const fallbackLang = "id";

const lookup = (dict, key) => key.split(".").reduce((node, part) => (node == null ? node : node[part]), dict);

/** t("auth.welcome", { name }) → string terjemahan (fallback: id → key). */
export function t(key, params) {
  const value = lookup(dictionaries[currentLang], key) ?? lookup(dictionaries[fallbackLang], key);
  if (value == null) return key;
  return typeof value === "string" ? interpolate(value, params) : value;
}

export const getLang = () => currentLang;
export const isRtl = (lang = currentLang) => RTL_LANGS.has(lang);

export async function setLang(lang) {
  if (!dictionaries[lang] && loaders[lang]) dictionaries[lang] = (await loaders[lang]()).default;
  currentLang = dictionaries[lang] ? lang : fallbackLang;
  const root = globalThis.document?.documentElement;
  if (root) {
    root.lang = currentLang;
    root.dir = isRtl(currentLang) ? "rtl" : "ltr";
  }
  return currentLang;
}

const intlLocale = () => (currentLang === "id" ? "id-ID" : currentLang);
const nfCache = new Map();
const numberFormat = (opts) => {
  const key = intlLocale() + JSON.stringify(opts);
  if (!nfCache.has(key)) nfCache.set(key, new Intl.NumberFormat(intlLocale(), opts));
  return nfCache.get(key);
};

export const fmt = {
  number: (n, opts = { maximumFractionDigits: 2 }) => numberFormat(opts).format(n),
  decimal: (n, digits = 2) => numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n),
  percent: (n, digits = 0) => numberFormat({ style: "percent", maximumFractionDigits: digits }).format(n),
  currency: (n, currency = "IDR") => numberFormat({ style: "currency", currency, maximumFractionDigits: 0 }).format(n),
  date: (d, opts = { dateStyle: "long" }, timeZone = "Asia/Jakarta") =>
    new Intl.DateTimeFormat(intlLocale(), { ...opts, timeZone }).format(new Date(d)),
  time: (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}.${String(minutes % 60).padStart(2, "0")}`,
};
