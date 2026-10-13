/**
 * Registri island (code splitting). Menambah fitur interaktif baru cukup
 * dengan satu baris di sini + atribut data-island di HTML — tanpa mengubah
 * kode yang sudah ada (Open/Closed, Extensibility).
 *
 * Setiap modul mengekspor: mount(element) → (opsional) fungsi cleanup.
 */
export const islandRegistry = {
  navbar: () => import("../features/navbar/index.js"),
  hero: () => import("../features/landing/hero.js"),
  "hero-parallax": () => import("../features/landing/hero-parallax.js"),
  "market-clock": () => import("../features/landing/market-clock.js"),
  "threshold-diagram": () => import("../features/landing/threshold-diagram.js"),
  disclosure: () => import("../features/landing/disclosure.island.js"),
  faq: () => import("../features/landing/faq.js"),
  announcements: () => import("../features/landing/announcements.js"),
  auth: () => import("../features/auth/index.js"),
  "app-shell": () => import("../features/app/index.js"),
};
