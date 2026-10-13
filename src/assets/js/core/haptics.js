import { appConfig } from "../config/app.config.js";
import { matches, prefersReducedMotion } from "./dom.js";

const PATTERNS = { light: 8, medium: 16, success: [10, 40, 10], error: [30, 40, 30] };

/** Umpan balik taktil hanya pada perangkat sentuh yang mendukung getaran. */
export function haptic(kind = "light") {
  if (!appConfig.features.haptics || prefersReducedMotion() || !matches("(pointer: coarse)")) return;
  try {
    navigator.vibrate?.(PATTERNS[kind] ?? PATTERNS.light);
  } catch {
    /* beberapa browser memblokir vibrate tanpa gestur pengguna */
  }
}
