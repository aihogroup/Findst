import { appConfig } from "../../config/app.config.js";
import { fmt, t } from "../../core/i18n.js";
import { getMarketStatus } from "./market-hours.js";

/**
 * ISLAND (Adaptive UI): status sesi BEI menurut jam Jakarta pengunjung.
 * Diperbarui tiap 30 detik hanya saat tab terlihat (hemat baterai).
 */
/** Status → warna indikator (teks tetap menjadi informasi utama). */
const INDICATOR = { pre: "pre", session1: "open", break: "break", session2: "open", preClose: "break", closed: "closed" };

function dayLabel({ dayOffset, weekday }) {
  if (dayOffset === 0) return t("market.today");
  if (dayOffset === 1) return t("market.tomorrow");
  return t("market.days")[weekday];
}

export function mount(el) {
  const text = el.querySelector("[data-market-text]");
  let timer;

  const render = () => {
    const status = getMarketStatus(new Date(), appConfig.market);
    el.dataset.state = INDICATOR[status.state];
    const message = t(`market.${status.state}`, { time: fmt.time(status.at), day: dayLabel(status) });
    text.textContent = `${message} ${t("market.note")}`;
  };

  const start = () => {
    clearInterval(timer);
    render();
    timer = setInterval(render, 30_000);
  };
  const onVisibility = () => (document.hidden ? clearInterval(timer) : start());

  start();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
