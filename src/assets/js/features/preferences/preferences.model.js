import { appConfig } from "../../config/app.config.js";
import { clamp } from "../../core/utils.js";

/**
 * Model preferensi tampilan (murni, tanpa DOM → mudah diuji).
 * Kunci & nilai harus sinkron dengan src/partials/boot.js.
 */
const { defaults, themes, fonts, fontScale } = appConfig.preferences;

export const PREFS_KEY = appConfig.storageKeys.prefs;

/** Normalisasi masukan dari storage/form → selalu menghasilkan preferensi valid. */
export function normalizePrefs(raw = {}) {
  const scale = Number(raw.fontScale);
  const steps = Number.isFinite(scale) ? Math.round((scale - fontScale.min) / fontScale.step) : null;
  return {
    theme: themes.includes(raw.theme) ? raw.theme : defaults.theme,
    font: fonts.includes(raw.font) ? raw.font : defaults.font,
    fontScale: steps == null ? defaults.fontScale : clamp(fontScale.min + steps * fontScale.step, fontScale.min, fontScale.max),
  };
}

/** Tema efektif: "system" diselesaikan menurut preferensi OS. */
export const resolveTheme = (theme, systemPrefersDark) =>
  theme === "dark" || (theme === "system" && systemPrefersDark) ? "dark" : "light";
