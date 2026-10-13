import { appConfig } from "../../config/app.config.js";
import { uiStore } from "../../core/app-state.js";
import { announce } from "../../core/a11y.js";
import { delegate, matches, prefersReducedMotion, qs, qsa } from "../../core/dom.js";
import { fmt, t } from "../../core/i18n.js";
import { local, onStorageChange } from "../../core/storage.js";
import { openDialog } from "../../components/organisms/dialog.js";
import { snackbar, toast } from "../../components/molecules/toast.js";
import { ensureFont } from "./font-loader.js";
import { normalizePrefs, PREFS_KEY, resolveTheme } from "./preferences.model.js";

/**
 * FITUR: Preferensi tampilan (tema, font, ukuran font).
 * Antarmuka publik: initPreferences(), setPreference(), openSettings()
 * - Persistent state di localStorage (gagal senyap di mode privat).
 * - Auto save: setiap perubahan langsung disimpan & diterapkan (pratinjau instan).
 * - Sinkron antar-tab dan mengikuti perubahan tema sistem saat "system".
 */
const root = document.documentElement;
const systemDark = () => matches("(prefers-color-scheme: dark)");

function applyToDocument(state, { animate = false } = {}) {
  const apply = () => {
    root.dataset.theme = state.resolvedTheme;
    root.dataset.font = state.font;
    root.style.setProperty("--font-scale", String(state.fontScale));
    qs('meta[name="theme-color"]')?.setAttribute("content", appConfig.preferences.themeColors[state.resolvedTheme]);
    qsa('[data-action="toggle-theme"]').forEach((btn) => btn.setAttribute("aria-pressed", String(state.resolvedTheme === "dark")));
  };

  if (!animate || prefersReducedMotion()) return apply();
  // Transisi halus: View Transitions bila ada, selain itu transisi warna sesaat
  if (document.startViewTransition) return document.startViewTransition(apply);
  root.classList.add("is-theme-transitioning");
  apply();
  setTimeout(() => root.classList.remove("is-theme-transitioning"), 450);
}

function persist() {
  const { theme, font, fontScale } = uiStore.getState();
  local.write(PREFS_KEY, { theme, font, fontScale });
}

export function setPreference(key, value) {
  const current = uiStore.getState();
  const next = normalizePrefs({ theme: current.theme, font: current.font, fontScale: current.fontScale, [key]: value });
  uiStore.setState({ ...next, resolvedTheme: resolveTheme(next.theme, systemDark()) });
}

function syncForm(form, state) {
  if (!form) return;
  form.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.checked = state[input.name] === input.value;
  });
  const range = form.querySelector('input[name="fontScale"]');
  if (range) {
    range.value = String(state.fontScale);
    range.setAttribute("aria-valuetext", fmt.percent(state.fontScale));
  }
  const output = form.querySelector("[data-scale-output]");
  if (output) output.textContent = fmt.percent(state.fontScale);
}

export function openSettings(trigger) {
  openDialog(qs("#settings-dialog"), { trigger });
}

function resetWithUndo() {
  const before = uiStore.getState();
  const { defaults } = appConfig.preferences;
  Object.entries(defaults).forEach(([k, v]) => setPreference(k, v));
  snackbar({
    message: t("prefs.reset"),
    actionLabel: t("common.undo"),
    onAction: () => ["theme", "font", "fontScale"].forEach((k) => setPreference(k, before[k])),
  });
}

export function initPreferences() {
  // 1. Muat state awal dari storage (boot script sudah menerapkannya ke DOM)
  const saved = normalizePrefs(local.read(PREFS_KEY, {}) ?? {});
  uiStore.setState({ ...saved, resolvedTheme: resolveTheme(saved.theme, systemDark()) });
  applyToDocument(uiStore.getState());
  if (saved.font !== "serif") ensureFont(saved.font).catch(() => {});

  const form = qs("[data-prefs-form]");
  syncForm(form, uiStore.getState());

  // 2. Reaksi terhadap perubahan state (selector → minimal re-render)
  uiStore.subscribe(
    (prefs, prev) => {
      applyToDocument(uiStore.getState(), { animate: prev.resolvedTheme !== prefs.resolvedTheme });
      syncForm(form, prefs);
      persist();
      if (prefs.font !== prev.font) {
        ensureFont(prefs.font).catch(() => toast({ message: t("prefs.fontLoadFailed"), tone: "warning" }));
      }
      if (prefs.resolvedTheme !== prev.resolvedTheme) announce(t(`theme.${prefs.theme === "system" ? "system" : prefs.resolvedTheme}`));
    },
    (s) => ({ theme: s.theme, resolvedTheme: s.resolvedTheme, font: s.font, fontScale: s.fontScale }),
  );

  // 3. Interaksi (delegasi: satu listener untuk semua tombol, termasuk di drawer)
  delegate(document, "click", '[data-action="toggle-theme"]', () => {
    setPreference("theme", uiStore.getState().resolvedTheme === "dark" ? "light" : "dark");
  });
  delegate(document, "click", '[data-action="open-settings"]', (_, btn) => openSettings(btn));
  delegate(document, "click", '[data-action="reset-prefs"]', resetWithUndo);

  form?.addEventListener("input", (event) => {
    const { name, value } = event.target;
    if (["theme", "font", "fontScale"].includes(name)) setPreference(name, value);
  });
  form?.addEventListener("submit", (e) => e.preventDefault());

  // 4. Ikuti tema sistem bila pengguna memilih "system"
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (uiStore.getState().theme === "system") setPreference("theme", "system");
  });

  // 5. Sinkron antar-tab
  onStorageChange(PREFS_KEY, (value) => {
    const next = normalizePrefs(value ?? {});
    uiStore.setState({ ...next, resolvedTheme: resolveTheme(next.theme, systemDark()) });
  });
}
