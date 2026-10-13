import { islandRegistry } from "./islands.registry.js";
import { qsa } from "./dom.js";

/**
 * Islands Architecture + partial hydration.
 * HTML statis tetap utuh; hanya elemen ber-[data-island] yang diberi JS,
 * sesuai strategi [data-hydrate]:
 *   load        → segera
 *   idle        → saat browser senggang
 *   visible     → saat mendekati viewport (default)
 *   interaction → saat pertama disentuh/difokus
 * [data-hydrate-media] membatasi hydration pada kondisi media tertentu.
 * Kegagalan satu island tidak memengaruhi island lain (feature isolation).
 */
const mounted = new WeakMap();
let visibilityObserver;

async function mount(el) {
  if (mounted.has(el)) return;
  mounted.set(el, null);
  const name = el.dataset.island;
  const loader = islandRegistry[name];
  if (!loader) {
    console.warn(`[islands] "${name}" belum terdaftar.`);
    return;
  }
  try {
    el.dataset.hydrated = "pending";
    const module = await loader();
    const cleanup = await module.mount(el);
    mounted.set(el, typeof cleanup === "function" ? cleanup : null);
    el.dataset.hydrated = "true";
  } catch (error) {
    el.dataset.hydrated = "error";
    console.error(`[islands] gagal memuat "${name}"`, error);
  }
}

export function unmountIsland(el) {
  const cleanup = mounted.get(el);
  cleanup?.();
  mounted.delete(el);
  delete el.dataset.hydrated;
}

function onVisible(el) {
  if (!("IntersectionObserver" in window)) return mount(el);
  visibilityObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        visibilityObserver.unobserve(entry.target);
        mount(entry.target);
      }
    },
    { rootMargin: "300px 0px" },
  );
  visibilityObserver.observe(el);
}

function onIdle(el) {
  const run = () => mount(el);
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 300);
}

function onInteraction(el) {
  const events = ["pointerenter", "focusin", "touchstart"];
  const run = () => {
    events.forEach((type) => el.removeEventListener(type, run));
    mount(el);
  };
  events.forEach((type) => el.addEventListener(type, run, { once: true, passive: true }));
}

const strategies = { load: mount, idle: onIdle, visible: onVisible, interaction: onInteraction };

function schedule(el) {
  const strategy = strategies[el.dataset.hydrate] ?? onVisible;
  const media = el.dataset.hydrateMedia;
  if (!media) return strategy(el);

  const mql = matchMedia(media);
  const apply = () => (mql.matches ? strategy(el) : unmountIsland(el));
  if (mql.matches) strategy(el);
  mql.addEventListener?.("change", apply);
}

export function hydrateIslands(root = document) {
  qsa("[data-island]", root).forEach(schedule);
}
