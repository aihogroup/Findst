import { rafThrottle } from "../../core/utils.js";

/**
 * ISLAND: Paralaks kartu kaca mengikuti kursor.
 * Hanya di-hydrate bila pointer halus & reduced-motion tidak aktif
 * (lihat data-hydrate-media di HTML). Hanya menulis custom property
 * --px/--py → properti `translate` (GPU), tanpa reflow.
 */
export function mount(visual) {
  const hero = visual.closest(".hero") ?? visual;

  const update = rafThrottle((x, y) => {
    visual.style.setProperty("--px", x.toFixed(3));
    visual.style.setProperty("--py", y.toFixed(3));
  });

  const onMove = (event) => {
    const rect = hero.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    update(x, y);
  };
  const onLeave = () => update(0, 0);

  hero.addEventListener("pointermove", onMove, { passive: true });
  hero.addEventListener("pointerleave", onLeave);

  return () => {
    update.cancel();
    hero.removeEventListener("pointermove", onMove);
    hero.removeEventListener("pointerleave", onLeave);
    visual.style.removeProperty("--px");
    visual.style.removeProperty("--py");
  };
}
