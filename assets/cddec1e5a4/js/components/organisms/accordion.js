import { qsa } from "../../core/dom.js";

/**
 * Accordion (pola WAI-ARIA): tombol di dalam heading + panel.
 * Keyboard: ↑/↓ berpindah antar-judul, Home/End ke awal/akhir.
 * Panel tertutup memakai hidden="until-found" → Ctrl+F tetap menemukan isi,
 * dan event `beforematch` membuka panel otomatis.
 */
export function createAccordion(root, { single = false } = {}) {
  const triggers = () => qsa(".accordion__trigger", root).filter((el) => !el.closest("[hidden]:not(.accordion__panel)"));
  const panelOf = (trigger) => document.getElementById(trigger.getAttribute("aria-controls"));

  function setOpen(trigger, open) {
    const panel = panelOf(trigger);
    if (!panel) return;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "until-found");
  }

  function toggle(trigger) {
    const willOpen = trigger.getAttribute("aria-expanded") !== "true";
    if (single && willOpen) triggers().forEach((t) => t !== trigger && setOpen(t, false));
    setOpen(trigger, willOpen);
  }

  const onClick = (event) => {
    const trigger = event.target.closest(".accordion__trigger");
    if (trigger && root.contains(trigger)) toggle(trigger);
  };

  const onKeydown = (event) => {
    const current = event.target.closest(".accordion__trigger");
    if (!current) return;
    const list = triggers();
    const index = list.indexOf(current);
    const targets = {
      ArrowDown: list[(index + 1) % list.length],
      ArrowUp: list[(index - 1 + list.length) % list.length],
      Home: list[0],
      End: list[list.length - 1],
    };
    const next = targets[event.key];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  const onBeforeMatch = (event) => {
    const panel = event.target.closest(".accordion__panel");
    const trigger = panel && root.querySelector(`[aria-controls="${panel.id}"]`);
    if (trigger) setOpen(trigger, true);
  };

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("beforematch", onBeforeMatch);

  return {
    open: (trigger) => setOpen(trigger, true),
    close: (trigger) => setOpen(trigger, false),
    destroy() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
      root.removeEventListener("beforematch", onBeforeMatch);
    },
  };
}
