import { qs, qsa } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { confirmDialog } from "../../components/organisms/confirm-dialog.js";
import { enablePullToRefresh } from "../../components/molecules/pull-to-refresh.js";
import { setFlash } from "../../components/molecules/toast.js";
import { isAuthenticated, logout, refreshSession, sessionStore } from "../../services/session.js";
import { createRouter } from "./router.js";
import * as views from "./views.js";

/**
 * ISLAND: App shell (Client-Side Rendering di balik autentikasi).
 * - Penjaga rute: tanpa sesi valid → diarahkan ke /masuk/?next=…
 * - Peran: user < admin < superadmin; rute admin dibatasi.
 * - Data akun diambil ulang saat dibuka (sliding session) dengan skeleton,
 *   error state + retry, dan tarik-untuk-memuat-ulang.
 */
const ROLE_RANK = { user: 1, admin: 2, superadmin: 3 };

function redirectToLogin() {
  location.replace(`/masuk/?next=${encodeURIComponent(location.pathname)}`);
}

export function mount(shell) {
  if (!isAuthenticated()) return redirectToLogin();

  const outlet = qs("[data-app-view]", shell);
  const user = () => sessionStore.getState().user ?? {};
  let loggingOut = false;

  async function onLogout() {
    const ok = await confirmDialog({
      title: t("auth.logoutConfirmTitle"),
      message: t("auth.logoutConfirmBody"),
      confirmLabel: t("auth.logoutConfirm"),
    });
    if (!ok) return;
    loggingOut = true; // cegah pengawas sesi mengalihkan ke /masuk/
    await logout();
    setFlash(t("auth.loggedOut"), "success");
    location.assign("/");
  }

  /** Muat data akun terbaru dengan skeleton → sukses/galat. */
  async function withAccount(render) {
    outlet.replaceChildren(views.skeletonCards());
    try {
      await refreshSession();
      return render(user());
    } catch (error) {
      if (error.code === "sessionExpired") {
        setFlash(t("errors.sessionExpired"), "warning");
        redirectToLogin();
      }
      // Offline/timeout: tampilkan data akun tersimpan agar tetap bisa dipakai
      if (["offline", "timeout", "network"].includes(error.code) && user().name) return render(user());
      return views.errorState(error, () => router.refresh());
    }
  }

  const routes = [
    { path: "/app/", title: t("app.overview"), render: () => withAccount(views.overviewView) },
    { path: "/app/watchlist/", title: t("app.watchlist"), render: () => views.watchlistView() },
    { path: "/app/portofolio/", title: t("app.portfolio"), render: () => views.portfolioView() },
    { path: "/app/akun/", title: t("app.account"), render: () => withAccount((u) => views.accountView(u, onLogout)) },
    { path: "/app/admin/", title: t("app.admin"), minRole: "admin", render: () => views.roleView(t("app.admin"), "Panel moderasi konten & pengguna.") },
    { path: "/app/superadmin/", title: t("app.superadmin"), minRole: "superadmin", render: () => views.roleView(t("app.superadmin"), "Pengaturan sistem & parameter model.") },
  ];

  const router = createRouter({
    routes,
    outlet,
    notFound: { path: "*", title: t("app.notFound"), render: views.notFoundView },
    canAccess: (route) => !route.minRole || (ROLE_RANK[user().role] ?? 0) >= ROLE_RANK[route.minRole],
    onRoute: (_, path) =>
      qsa("[data-route-link]", shell).forEach((a) => {
        if (new URL(a.href).pathname === path) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }),
  });

  router.start();

  // Bersihkan parameter sekali pakai dari URL
  if (location.search.includes("selamat=1")) history.replaceState({}, "", location.pathname);

  const stopPtr = enablePullToRefresh(shell, () => router.refresh());
  // Logout dari tab lain → keluar juga di sini
  const stopSession = sessionStore.subscribe((token) => !token && !loggingOut && redirectToLogin(), (s) => s.token);

  return () => {
    router.destroy();
    stopPtr();
    stopSession();
  };
}
