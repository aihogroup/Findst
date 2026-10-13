import { h, icon } from "../../core/dom.js";
import { fmt, t } from "../../core/i18n.js";
import { errorMessage } from "../../services/api/index.js";

/**
 * Tampilan area pengguna (komposisi dari atom/molekul yang sama dengan
 * halaman publik → konsistensi visual). Hanya membangun DOM; data diberikan
 * oleh pemanggil sehingga mudah diuji.
 */
const breadcrumb = (label) =>
  h("nav", { class: "breadcrumb", "aria-label": "Breadcrumb" },
    h("ol", {},
      h("li", {}, h("a", { href: "/app/" }, t("app.overview"))),
      label !== t("app.overview") && h("li", { "aria-current": "page" }, label),
    ),
  );

const page = (title, ...children) => h("div", { class: "stack u-gap-3" }, breadcrumb(title), ...children);

const emptyState = (iconName, title, body, action) =>
  h("div", { class: "state" },
    icon(iconName, "icon--xl state__icon"),
    h("p", { class: "state__title" }, title),
    h("p", {}, body),
    action,
  );

export const skeletonCards = () =>
  h("div", { class: "app-grid", "aria-hidden": "true" }, ...[1, 2, 3].map(() => h("div", { class: "skeleton", "data-skeleton-card": "" })));

export function errorState(error, onRetry) {
  return h("div", { class: "state state--error", role: "alert" },
    icon("alert", "icon--xl state__icon"),
    h("p", { class: "state__title" }, t("app.loadError")),
    h("p", {}, errorMessage(error)),
    h("button", { class: "btn btn--secondary", type: "button", onClick: onRetry }, icon("refresh", "btn__icon"), t("common.retry")),
  );
}

export function overviewView(user) {
  return page(
    t("app.overview"),
    h("header", { class: "stack u-gap-1" },
      h("h1", { class: "auth__title" }, t("app.greeting", { name: user.name })),
      h("p", { class: "u-text-muted" }, t("app.overviewLead")),
    ),
    h("div", { class: "app-grid" },
      h("article", { class: "card" },
        h("span", { class: "card__icon" }, icon("user", "icon--lg")),
        h("h2", { class: "card__title" }, t("app.plan")),
        h("p", { class: "bento__stat" }, user.plan === "free" ? "Gratis" : "Premium"),
      ),
      h("article", { class: "card" },
        h("span", { class: "card__icon" }, icon("gauge", "icon--lg")),
        h("h2", { class: "card__title" }, "Rezim pasar"),
        h("span", { class: "chip" }, t("app.comingSoon")),
        h("p", { class: "card__body" }, "Ringkasan kondisi bursa harian akan tampil di sini."),
      ),
      h("article", { class: "card" },
        h("span", { class: "card__icon" }, icon("bell", "icon--lg")),
        h("h2", { class: "card__title" }, "Notifikasi"),
        h("p", { class: "card__body" }, "Belum ada notifikasi baru."),
      ),
    ),
  );
}

export const watchlistView = () =>
  page(t("app.watchlist"), h("h1", { class: "auth__title" }, t("app.watchlist")),
    emptyState("list", t("app.emptyWatchlistTitle"), t("app.emptyWatchlistBody"),
      h("button", { class: "btn btn--primary", type: "button", "aria-disabled": "true", title: t("app.comingSoon") }, t("app.comingSoon"))));

export const portfolioView = () =>
  page(t("app.portfolio"), h("h1", { class: "auth__title" }, t("app.portfolio")),
    emptyState("pie", t("app.emptyPortfolioTitle"), t("app.emptyPortfolioBody")));

export function accountView(user, onLogout) {
  const row = (label, value) => h("div", { class: "u-flex u-justify-between u-gap-2" }, h("dt", { class: "u-text-muted" }, label), h("dd", { class: "u-font-semibold" }, value));
  return page(t("app.account"),
    h("h1", { class: "auth__title" }, t("app.account")),
    h("section", { class: "card" },
      h("dl", { class: "stack u-gap-1" },
        row(t("app.email"), user.email),
        row(t("app.plan"), user.plan),
        row(t("app.role"), user.role),
        user.createdAt && row(t("app.memberSince"), fmt.date(user.createdAt)),
      ),
    ),
    h("div", { class: "cluster" },
      h("button", { class: "btn btn--secondary", type: "button", "data-action": "open-settings" }, icon("sliders", "btn__icon"), "Pengaturan tampilan"),
      h("button", { class: "btn btn--ghost", type: "button", onClick: onLogout }, icon("logout", "btn__icon"), t("app.logout")),
    ),
  );
}

export const roleView = (title, description) =>
  page(title, h("h1", { class: "auth__title" }, title), emptyState("shield", t("app.comingSoon"), description));

export const notFoundView = ({ forbidden }) =>
  page(t("app.notFound"), h("h1", { class: "auth__title" }, forbidden ? t("errors.forbidden") : t("app.notFound")),
    h("a", { class: "btn btn--primary", href: "/app/" }, t("app.overview")));
