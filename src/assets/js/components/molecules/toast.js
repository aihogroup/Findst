import { appConfig } from "../../config/app.config.js";
import { h, icon, qs } from "../../core/dom.js";
import { t } from "../../core/i18n.js";

/**
 * Toast (otomatis hilang) & snackbar (dengan aksi cepat).
 * - Muncul di live region → diumumkan pembaca layar tanpa merebut fokus.
 * - Timer dijeda saat kursor/fokus berada di toast.
 * - Galat memakai role="alert" agar segera diumumkan.
 *
 * toast({ message, tone: "info"|"success"|"warning"|"danger", duration, action: { label, onClick } })
 */
const ICONS = { info: "info", success: "check-circle", warning: "warning", danger: "alert" };
const active = new Set();

export function toast({ message, tone = "info", duration = appConfig.ui.toastDurationMs, action, dismissible = true } = {}) {
  const region = qs("[data-toast-region]");
  if (!region) return { dismiss() {} };

  // Batasi jumlah toast agar layar tidak penuh
  if (active.size >= appConfig.ui.maxToasts) [...active][0].dismiss();

  let timer;
  let remaining = duration;
  let startedAt = 0;

  const el = h(
    "div",
    { class: "toast", "data-tone": tone, role: tone === "danger" ? "alert" : undefined },
    icon(ICONS[tone] ?? "info", "toast__icon"),
    h("p", { class: "toast__message" }, message),
    action &&
      h(
        "button",
        {
          class: "toast__action",
          type: "button",
          onClick: () => {
            action.onClick?.();
            api.dismiss();
          },
        },
        action.label,
      ),
    dismissible &&
      h(
        "button",
        { class: "btn btn--ghost btn--icon btn--sm toast__close", type: "button", "aria-label": t("common.close"), onClick: () => api.dismiss() },
        icon("close", "icon--sm"),
      ),
  );

  const start = () => {
    if (!Number.isFinite(remaining)) return;
    startedAt = Date.now();
    timer = setTimeout(() => api.dismiss(), remaining);
  };
  const pause = () => {
    clearTimeout(timer);
    remaining -= Date.now() - startedAt;
  };

  const api = {
    dismiss() {
      if (!active.has(api)) return;
      active.delete(api);
      clearTimeout(timer);
      el.classList.add("is-leaving");
      const remove = () => el.remove();
      el.addEventListener("animationend", remove, { once: true });
      setTimeout(remove, 400); // cadangan bila animasi dimatikan
    },
  };

  el.addEventListener("pointerenter", pause);
  el.addEventListener("pointerleave", start);
  el.addEventListener("focusin", pause);
  el.addEventListener("focusout", start);
  el.addEventListener("keydown", (e) => e.key === "Escape" && api.dismiss());

  active.add(api);
  region.append(el);
  start();
  return api;
}

/** Snackbar: toast dengan aksi (mis. Urungkan, Muat ulang). Durasi lebih panjang. */
export const snackbar = ({ message, actionLabel, onAction, tone = "info", duration = 8000 }) =>
  toast({ message, tone, duration, action: { label: actionLabel, onClick: onAction } });

/* ---- Flash: pesan yang bertahan melewati satu navigasi halaman ---- */
const FLASH_KEY = "findst:flash";

export function setFlash(message, tone = "info") {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, tone }));
  } catch {
    /* mode privat: abaikan */
  }
}

export function consumeFlash() {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(FLASH_KEY);
    const { message, tone } = JSON.parse(raw);
    if (message) toast({ message: String(message), tone });
  } catch {
    /* abaikan */
  }
}
