import { createStore } from "./store.js";

/**
 * State global tampilan (setara Context): dibagikan ke seluruh fitur tanpa
 * prop drilling. Fitur memperbarui slice-nya sendiri; fitur lain cukup
 * berlangganan dengan selector.
 *
 *   theme        → preferensi pengguna: light | dark | system
 *   resolvedTheme→ tema efektif (turunan, dihitung oleh fitur preferences)
 *   font, fontScale
 *   online       → status koneksi
 *   standalone   → dibuka sebagai PWA terpasang
 */
export const uiStore = createStore({
  theme: "system",
  resolvedTheme: "light",
  font: "serif",
  fontScale: 1,
  online: globalThis.navigator?.onLine ?? true,
  standalone: false,
});
