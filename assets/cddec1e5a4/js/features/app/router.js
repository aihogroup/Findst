import { focusElement } from "../../core/a11y.js";
import { announce } from "../../core/a11y.js";

/**
 * Router History API untuk area /app/ (CSR).
 * - URL bersih & dapat ditautkan langsung (deep linking; server melakukan
 *   rewrite /app/* → /app/index.html).
 * - Fokus dipindah ke konten & judul diumumkan setiap pindah halaman.
 * - Rute dapat dibatasi peran (user/admin/superadmin).
 */
const normalize = (path) => (path.endsWith("/") ? path : `${path}/`);

export function createRouter({ routes, notFound, outlet, canAccess, onRoute }) {
  let current = null;

  async function render(pathname, { focus = true } = {}) {
    const path = normalize(pathname);
    const route = routes.find((r) => r.path === path) ?? notFound;
    const allowed = canAccess(route);
    const target = allowed ? route : { ...notFound, forbidden: true };
    current = target;

    outlet.setAttribute("aria-busy", "true");
    const node = await target.render({ forbidden: !allowed });
    if (current !== target) return; // navigasi lain terjadi selama memuat
    outlet.replaceChildren(node);
    outlet.removeAttribute("aria-busy");

    document.title = `${target.title} — Findst`;
    onRoute?.(target, path);
    if (focus) {
      focusElement(outlet.querySelector("h1") ?? outlet);
      announce(target.title);
    }
  }

  function navigate(path, { replace = false } = {}) {
    if (normalize(path) === normalize(location.pathname)) return;
    history[replace ? "replaceState" : "pushState"]({}, "", path);
    render(path);
  }

  const onClick = (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.target || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/app/")) return;
    event.preventDefault();
    navigate(url.pathname);
  };

  const onPop = () => render(location.pathname);

  document.addEventListener("click", onClick);
  window.addEventListener("popstate", onPop);

  return {
    start: () => render(location.pathname, { focus: false }),
    navigate,
    refresh: () => render(location.pathname, { focus: false }),
    destroy() {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
    },
  };
}
