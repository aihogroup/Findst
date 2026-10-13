/**
 * Konfigurasi aplikasi — satu-satunya tempat mengubah perilaku tanpa
 * menyentuh kode fitur (Configurability). Nilai dibekukan agar immutable.
 */
const deepFreeze = (obj) => {
  Object.values(obj).forEach((v) => v && typeof v === "object" && deepFreeze(v));
  return Object.freeze(obj);
};

export const appConfig = deepFreeze({
  appName: "Findst",
  locale: "id-ID",
  supportedLocales: ["id", "en"],
  timeZone: "Asia/Jakarta",
  currency: "IDR",

  api: {
    /**
     * URL Web App Google Apps Script (berakhiran /exec).
     * Kosongkan untuk MODE DEMO: data disimulasikan di localStorage.
     */
    baseUrl: "",
    timeoutMs: 15000,
    retries: 2,
  },

  content: {
    // Sumber statis hasil build (fallback ISR bila API belum dikonfigurasi)
    faqUrl: "/content/faq.json",
    announcementsUrl: "/content/announcements.json",
    staleTimeMs: 5 * 60 * 1000,
  },

  storageKeys: {
    prefs: "findst:prefs:v1",
    consent: "findst:consent:v1",
    session: "findst:session:v1",
    queryCache: "findst:query:v1",
    draftPrefix: "findst:draft:",
    dismissed: "findst:dismissed:v1",
    mockDb: "findst:mock-db:v1",
  },

  preferences: {
    defaults: { theme: "system", font: "serif", fontScale: 1 },
    themes: ["light", "dark", "system"],
    fonts: ["serif", "poppins", "arial"],
    fontScale: { min: 0.875, max: 1.5, step: 0.125 },
    themeColors: { light: "#f5eddc", dark: "#000000" },
  },

  fonts: {
    poppins: {
      family: "Poppins",
      weights: [400, 600],
      localUrl: "/fonts/poppins-latin-{weight}-normal.woff2",
      fallbackCss: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap",
    },
  },

  /** Jam perdagangan BEI (menit sejak 00.00 WIB). Perkiraan; tanpa hari libur bursa. */
  market: {
    timeZone: "Asia/Jakarta",
    weekdays: [1, 2, 3, 4, 5],
    schedule: {
      default: { preOpen: [525, 540], session1: [540, 720], session2: [810, 950], preClose: [950, 961] },
      friday: { preOpen: [525, 540], session1: [540, 690], session2: [840, 950], preClose: [950, 961] },
    },
  },

  auth: {
    otpLength: 6,
    otpResendSeconds: 60,
    passwordMinLength: 8,
    sessionDays: { remember: 30, default: 1 },
    afterLoginPath: "/app/",
  },

  features: {
    serviceWorker: true,
    consentBanner: true,
    haptics: true,
    ripple: true,
  },

  ui: {
    toastDurationMs: 4500,
    searchDebounceMs: 200,
    maxToasts: 3,
  },

  consentVersion: 1,
});
