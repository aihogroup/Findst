/**
 * Entry point (type="module" → otomatis ditunda, tidak memblokir render).
 * Hanya fitur lintas-halaman yang kecil diinisialisasi langsung; seluruh
 * komponen interaktif lain di-hydrate sebagai island (code splitting).
 */
import { initRipple } from "./components/atoms/ripple.js";
import { consumeFlash } from "./components/molecules/toast.js";
import { hydrateIslands } from "./core/islands.js";
import { initConsent } from "./features/consent/index.js";
import { initNetwork } from "./features/network/index.js";
import { initPreferences } from "./features/preferences/index.js";
import { initPwa } from "./features/pwa/index.js";
import { appConfig } from "./config/app.config.js";

function safely(name, init) {
  try {
    const result = init();
    if (result?.catch) result.catch((error) => console.error(`[${name}]`, error));
  } catch (error) {
    // Satu fitur gagal tidak menjatuhkan fitur lain (feature isolation)
    console.error(`[${name}]`, error);
  }
}

safely("preferences", initPreferences);
safely("network", initNetwork);
safely("islands", hydrateIslands);
safely("consent", initConsent);
safely("pwa", initPwa);
if (appConfig.features.ripple) safely("ripple", initRipple);
safely("flash", consumeFlash);

// Tombol "Coba lagi" generik (mis. halaman offline)
document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="reload"]')) {
    event.preventDefault();
    location.reload();
  }
});
