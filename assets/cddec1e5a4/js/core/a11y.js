import { qs } from "./dom.js";

/**
 * Pengumuman untuk pembaca layar melalui live region yang sudah ada di DOM.
 * Isi dikosongkan dulu agar pesan yang sama tetap diumumkan ulang.
 */
export function announce(message, { assertive = false } = {}) {
  const region = qs(assertive ? "[data-sr-announcer-assertive]" : "[data-sr-announcer]");
  if (!region) return;
  region.textContent = "";
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

/** Pindahkan fokus secara terprogram tanpa menggulir paksa bila tak perlu. */
export function focusElement(el, { preventScroll = false } = {}) {
  if (!el) return;
  if (!el.hasAttribute("tabindex") && !el.matches("a[href], button, input, select, textarea, [tabindex]")) {
    el.setAttribute("tabindex", "-1");
  }
  el.focus({ preventScroll });
}
