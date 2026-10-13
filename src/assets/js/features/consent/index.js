import { appConfig } from "../../config/app.config.js";
import { delegate, qs, whenStylesReady } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { local } from "../../core/storage.js";
import { toast } from "../../components/molecules/toast.js";

/**
 * FITUR: Persetujuan cookie/penyimpanan opsional.
 * - Banner non-modal (tidak mengunci fokus), tombol tolak & terima setara.
 * - Persetujuan tersimpan bersama versi; versi baru → minta ulang.
 * Antarmuka publik: initConsent(), getConsent(), onConsentChange(cb)
 */
const KEY = appConfig.storageKeys.consent;
const listeners = new Set();

export function getConsent() {
  const value = local.read(KEY);
  return value?.version === appConfig.consentVersion ? value : null;
}

export const onConsentChange = (cb) => (listeners.add(cb), () => listeners.delete(cb));

function save(status) {
  const value = { status, analytics: status === "accepted", version: appConfig.consentVersion, decidedAt: new Date().toISOString() };
  local.write(KEY, value);
  listeners.forEach((cb) => cb(value));
  return value;
}

export async function initConsent() {
  const banner = qs("[data-consent]");
  if (!banner || !appConfig.features.consentBanner) return;

  const show = async (focus = false) => {
    await whenStylesReady();
    banner.hidden = false;
    if (focus) banner.querySelector("button")?.focus();
  };

  delegate(banner, "click", "[data-consent-choice]", (_, button) => {
    const { status } = save(button.dataset.consentChoice);
    banner.hidden = true;
    toast({ message: t(`consent.${status}`), tone: "success" });
  });

  delegate(document, "click", '[data-action="open-consent"]', () => show(true));

  if (!getConsent()) show();
}
