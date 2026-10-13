import { appConfig } from "../../config/app.config.js";
import { uiStore } from "../../core/app-state.js";
import { delegate, matches, qs, qsa } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openDialog } from "../../components/organisms/dialog.js";
import { snackbar, toast } from "../../components/molecules/toast.js";

/**
 * FITUR: PWA — service worker, pembaruan versi, dan tombol pemasangan.
 * Antarmuka publik: initPwa()
 *
 * Pembaruan: SW baru menunggu (waiting) → snackbar "Muat ulang" → hanya
 * setelah pengguna setuju SW diaktifkan, sehingga aktivitas tidak terputus.
 *
 * Pemasangan: event beforeinstallprompt ditangkap sedini mungkin oleh boot
 * script (window.__findstInstallEvent). iOS tidak punya event ini → dialog
 * petunjuk bergambar. Setelah terpasang tombol berubah status "Terpasang".
 */
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matches("(display-mode: standalone)") || navigator.standalone === true;

let deferredPrompt = window.__findstInstallEvent ?? null;

/* ---------------- Tombol pemasangan ---------------- */
function renderInstallState(state) {
  qsa("[data-install-button]").forEach((button) => {
    button.dataset.state = state;
    const label = button.querySelector("[data-install-label]");
    const iconUse = button.querySelector("[data-install-icon] use");
    if (label) label.textContent = t(state === "installed" ? "pwa.installed" : state === "installing" ? "pwa.installing" : "pwa.install");
    iconUse?.setAttribute("href", state === "installed" ? "#i-check-circle" : "#i-download");
    if (state === "installed") button.setAttribute("aria-disabled", "true");
    else button.removeAttribute("aria-disabled");
    if (state === "installing") button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  });
  const status = qs("[data-install-status]");
  if (status) status.textContent = state === "installed" ? t("pwa.installedStatus") : isIos() && !isStandalone() ? t("pwa.iosHint") : "";
}

function showGuide(kind) {
  const dialog = qs("#install-dialog");
  if (!dialog) return;
  qsa("[data-install-guide]", dialog).forEach((el) => (el.hidden = el.dataset.installGuide !== kind));
  openDialog(dialog);
}

async function onInstallClick(button) {
  if (button.dataset.state === "installed") return;
  if (deferredPrompt) {
    renderInstallState("installing");
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome !== "accepted") {
      renderInstallState("idle");
      toast({ message: t("pwa.dismissed") });
    }
    return;
  }
  showGuide(isIos() ? "ios" : "generic");
}

function initInstall() {
  renderInstallState(isStandalone() ? "installed" : "idle");

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    renderInstallState("ready");
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    renderInstallState("installed");
    toast({ message: t("pwa.installedToast"), tone: "success" });
  });

  // Tampilan menyesuaikan saat aplikasi berjalan standalone
  matchMedia("(display-mode: standalone)").addEventListener?.("change", (e) => {
    document.documentElement.toggleAttribute("data-standalone", e.matches);
    uiStore.setState({ standalone: e.matches });
  });
  uiStore.setState({ standalone: isStandalone() });

  delegate(document, "click", "[data-install-button]", (_, button) => onInstallClick(button));
}

/* ---------------- Service worker ---------------- */
function promptUpdate(registration) {
  snackbar({
    message: t("pwa.updateAvailable"),
    actionLabel: t("common.reload"),
    duration: Infinity,
    onAction: () => registration.waiting?.postMessage({ type: "SKIP_WAITING" }),
  });
}

async function registerServiceWorker() {
  if (!appConfig.features.serviceWorker || !("serviceWorker" in navigator)) return;
  const secure = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!secure) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    if (registration.waiting && navigator.serviceWorker.controller) promptUpdate(registration);

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) promptUpdate(registration);
      });
    });

    // Muat ulang SEKALI setelah pengguna menyetujui pembaruan
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    // Periksa pembaruan saat tab kembali aktif (tanpa polling berlebihan)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update().catch(() => {});
    });
  } catch (error) {
    console.warn("[pwa] service worker gagal didaftarkan", error);
  }
}

export function initPwa() {
  initInstall();
  // Ditunda hingga halaman selesai dimuat agar tidak bersaing dengan LCP
  if (document.readyState === "complete") registerServiceWorker();
  else window.addEventListener("load", registerServiceWorker, { once: true });
}
