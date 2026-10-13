import { matches, qs, qsa, whenStylesReady } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { rafThrottle } from "../../core/utils.js";
import { closeDialog, openDialog } from "../../components/organisms/dialog.js";
import { initials, isAuthenticated, sessionStore } from "../../services/session.js";

/**
 * ISLAND: Navbar responsif.
 * - Tombol menu membuka drawer <dialog> (focus trap, Escape, backdrop native).
 * - Section yang sedang dilihat ditandai aria-current lewat IntersectionObserver.
 * - Bayangan header muncul setelah digulir.
 * - Status login mengubah ikon profil & tombol tamu.
 */
function trackScroll(header) {
  const update = rafThrottle(() => header.toggleAttribute("data-scrolled", window.scrollY > 8));
  window.addEventListener("scroll", update, { passive: true });
  update();
  return () => window.removeEventListener("scroll", update);
}

function trackActiveSection() {
  const links = qsa("[data-section-link]");
  const ids = [...new Set(links.map((a) => a.dataset.sectionLink))];
  const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);
  if (!sections.length || !("IntersectionObserver" in window)) return () => {};

  const visible = new Map();
  const setCurrent = (id) =>
    links.forEach((a) => {
      if (a.dataset.sectionLink === id) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      const [best] = [...visible.entries()].filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1]);
      setCurrent(best?.[0] ?? null);
    },
    { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
  );
  sections.forEach((s) => observer.observe(s));
  return () => observer.disconnect();
}

function renderProfile({ user }) {
  const authed = isAuthenticated();
  qsa("[data-auth='guest']").forEach((el) => (el.hidden = authed));
  qsa("[data-profile-link]").forEach((link) => {
    link.href = authed ? "/app/" : "/masuk/";
    link.setAttribute("aria-label", authed ? t("auth.profileLabel", { name: user?.name ?? "" }) : t("auth.profileGuest"));
    const initialsEl = link.querySelector("[data-profile-initials]");
    const iconEl = link.querySelector("[data-profile-icon]");
    const labelEl = link.querySelector("[data-profile-label]");
    if (initialsEl) {
      initialsEl.hidden = !authed;
      initialsEl.textContent = authed ? initials(user?.name) : "";
    }
    if (iconEl) iconEl.style.display = authed ? "none" : "";
    if (labelEl) labelEl.textContent = authed ? t("auth.dashboard") : t("auth.login");
  });
}

export function mount(header) {
  const drawer = qs("#nav-drawer");
  const menuButton = qs("[data-action='open-menu']", header);
  const cleanups = [trackScroll(header), trackActiveSection()];

  menuButton?.addEventListener("click", async () => {
    await whenStylesReady();
    openDialog(drawer, { trigger: menuButton });
  });

  // Tutup drawer saat tautan di dalamnya dipilih
  drawer?.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) closeDialog(drawer);
  });

  // Tutup drawer bila layar melebar melewati breakpoint desktop
  const desktop = matchMedia("(min-width: 64em)");
  const onBreakpoint = (e) => e.matches && closeDialog(drawer);
  desktop.addEventListener?.("change", onBreakpoint);

  renderProfile(sessionStore.getState());
  cleanups.push(sessionStore.subscribe(() => renderProfile(sessionStore.getState()), (s) => s.token));

  if (matches("(min-width: 64em)")) closeDialog(drawer);
  return () => cleanups.forEach((fn) => fn());
}
