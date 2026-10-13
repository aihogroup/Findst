import { appConfig } from "../../config/app.config.js";
import { t } from "../../core/i18n.js";
import { subscribeQuery } from "../../core/query.js";
import { local } from "../../core/storage.js";
import { snackbar } from "../../components/molecules/toast.js";
import { api } from "../../services/api/index.js";
import { activeAnnouncement, announcementInnerHtml, isNewer } from "./templates.js";

/**
 * ISLAND: Pengumuman (konten ISR).
 * - Tutup = optimistic UI (langsung hilang) + snackbar "Urungkan".
 * - Status ditutup bertahan antar-kunjungan; boot script menyembunyikannya
 *   sebelum render pertama sehingga tidak ada pergeseran layout.
 */
const KEY = appConfig.storageKeys.dismissed;
const readDismissed = () => local.read(KEY, []) ?? [];

export function mount(banner) {
  const setHidden = (hidden) => {
    banner.hidden = hidden;
    document.documentElement.toggleAttribute("data-ann-dismissed", hidden);
  };

  banner.addEventListener("click", (event) => {
    if (!event.target.closest("[data-dismiss]")) return;
    const id = banner.dataset.announcementId;
    const before = readDismissed();
    local.write(KEY, [...new Set([...before, id])]);
    setHidden(true); // optimistic
    snackbar({
      message: t("announcement.dismissed"),
      actionLabel: t("common.undo"),
      onAction: () => {
        local.write(KEY, before);
        setHidden(false);
        banner.querySelector("[data-dismiss]")?.focus();
      },
    });
  });

  const { unsubscribe } = subscribeQuery(
    "announcements",
    () => api.getAnnouncements(),
    { staleTime: appConfig.content.staleTimeMs, persist: true },
    ({ data }) => {
      if (!data || !isNewer(data.version, banner.dataset.version)) return;
      const item = activeAnnouncement(data, { dismissed: readDismissed() });
      banner.dataset.version = data.version;
      if (!item) return setHidden(true);
      banner.dataset.announcementId = item.id;
      banner.innerHTML = announcementInnerHtml(item); // ter-escape oleh template
      setHidden(false);
    },
  );

  return unsubscribe;
}
