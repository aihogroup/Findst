import { qs } from "../../core/dom.js";

/**
 * ISLAND: Hero.
 * - Menjeda animasi kartu melayang saat hero di luar layar / tab tersembunyi
 *   (tidak ada animasi tanpa henti di luar layar → hemat memori & baterai).
 * - CTA mengambang (zona ibu jari) muncul setelah tombol aksi hero
 *   tergulir melewati bagian atas layar, sehingga aksi utama selalu terjangkau.
 */
export function mount(hero) {
  const mobileCta = qs("[data-mobile-cta]");
  const heroActions = qs(".hero__actions", hero);
  let heroVisible = true;

  const syncAnimation = () => hero.toggleAttribute("data-offscreen", !heroVisible || document.hidden);

  const heroObserver = new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    syncAnimation();
  });
  heroObserver.observe(hero);

  const ctaObserver = new IntersectionObserver(([entry]) => {
    if (!mobileCta) return;
    const passed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    mobileCta.toggleAttribute("data-visible", passed);
    mobileCta.inert = !passed;
  });
  if (heroActions) ctaObserver.observe(heroActions);

  document.addEventListener("visibilitychange", syncAnimation);

  return () => {
    heroObserver.disconnect();
    ctaObserver.disconnect();
    document.removeEventListener("visibilitychange", syncAnimation);
  };
}
