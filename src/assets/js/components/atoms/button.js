import { announce } from "../../core/a11y.js";
import { t } from "../../core/i18n.js";

/**
 * Kondisi memuat pada tombol:
 * - aria-busy + aria-disabled (fokus tidak hilang seperti pada `disabled`)
 * - spinner di dalam tombol (CSS .btn__spinner)
 * - mencegah klik ganda lewat flag isBusy()
 */
export function setBusy(button, busy) {
  if (!button) return;
  if (busy) {
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-disabled", "true");
    announce(t("common.processing"));
  } else {
    button.removeAttribute("aria-busy");
    button.removeAttribute("aria-disabled");
  }
}

export const isBusy = (button) => button?.getAttribute("aria-busy") === "true";

/** Bungkus aksi async agar tombol otomatis memasuki/keluar dari kondisi memuat. */
export async function withBusy(button, action) {
  if (isBusy(button)) return undefined;
  setBusy(button, true);
  try {
    return await action();
  } finally {
    setBusy(button, false);
  }
}
