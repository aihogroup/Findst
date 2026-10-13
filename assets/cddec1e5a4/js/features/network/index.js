import { uiStore } from "../../core/app-state.js";
import { qs } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { toast } from "../../components/molecules/toast.js";

/**
 * FITUR: Status koneksi. Banner offline muncul (role=status) sementara
 * konten tersimpan tetap ditampilkan; toast saat koneksi pulih.
 * Antarmuka publik: initNetwork(), isOnline()
 */
export const isOnline = () => uiStore.getState().online;

export function initNetwork() {
  const banner = qs("[data-net-banner]");
  const set = (online) => uiStore.setState({ online });

  uiStore.subscribe(
    (online, wasOnline) => {
      if (banner) banner.hidden = online;
      if (online && wasOnline === false) toast({ message: t("network.online"), tone: "success" });
    },
    (s) => s.online,
  );

  window.addEventListener("online", () => set(true));
  window.addEventListener("offline", () => set(false));
  if (banner) banner.hidden = navigator.onLine !== false;
  set(navigator.onLine !== false);
}
