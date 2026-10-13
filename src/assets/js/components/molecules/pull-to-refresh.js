import { h, icon, prefersReducedMotion } from "../../core/dom.js";
import { haptic } from "../../core/haptics.js";

/**
 * Tarik-untuk-memuat-ulang (gestur sentuh) — hanya aktif di puncak halaman.
 * Indikator hanya memakai transform; aksi juga tersedia lewat tombol biasa
 * agar tidak bergantung pada gestur (aksesibilitas).
 */
export function enablePullToRefresh(container, onRefresh, { threshold = 72 } = {}) {
  if (!("ontouchstart" in window)) return () => {};
  const indicator = h("div", { class: "ptr", "aria-hidden": "true" }, icon("refresh"));
  container.prepend(indicator);

  let startY = 0;
  let pull = 0;
  let active = false;
  let busy = false;

  const set = (y) => {
    indicator.style.transform = `translateY(${y}px) rotate(${y * 3}deg)`;
    indicator.style.opacity = String(Math.min(1, y / threshold));
  };

  const onStart = (e) => {
    if (busy || window.scrollY > 0) return;
    startY = e.touches[0].clientY;
    active = true;
  };
  const onMove = (e) => {
    if (!active) return;
    pull = Math.max(0, Math.min(threshold * 1.6, (e.touches[0].clientY - startY) * 0.5));
    set(pull);
  };
  const onEnd = async () => {
    if (!active) return;
    active = false;
    if (pull >= threshold) {
      busy = true;
      haptic("medium");
      indicator.classList.add("is-refreshing");
      try {
        await onRefresh();
      } finally {
        busy = false;
        indicator.classList.remove("is-refreshing");
      }
    }
    pull = 0;
    if (prefersReducedMotion()) set(0);
    else requestAnimationFrame(() => set(0));
  };

  container.addEventListener("touchstart", onStart, { passive: true });
  container.addEventListener("touchmove", onMove, { passive: true });
  container.addEventListener("touchend", onEnd);
  return () => {
    indicator.remove();
    container.removeEventListener("touchstart", onStart);
    container.removeEventListener("touchmove", onMove);
    container.removeEventListener("touchend", onEnd);
  };
}
