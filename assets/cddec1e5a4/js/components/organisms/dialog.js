import { matches, prefersReducedMotion } from "../../core/dom.js";

/**
 * Pengendali <dialog> native:
 * - showModal() → focus trap, Escape, backdrop disediakan browser.
 * - Fokus awal ke elemen pertama; saat ditutup fokus kembali ke pemicu.
 * - Gulir latar dikunci; animasi keluar tetap dihormati.
 * - Bottom sheet dapat ditutup dengan gestur geser ke bawah.
 * - Fallback untuk browser tanpa HTMLDialogElement (degradasi anggun).
 */
const state = new WeakMap(); // dialog → { trigger }
const SUPPORTED = typeof HTMLDialogElement === "function";

function setup(dialog) {
  if (dialog.dataset.dialogReady) return;
  dialog.dataset.dialogReady = "true";

  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-dialog-close]")) return closeDialog(dialog);
    // Klik di backdrop (di luar kotak dialog)
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) closeDialog(dialog);
    }
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault(); // tutup lewat animasi kita sendiri
    closeDialog(dialog);
  });

  // Penutupan native (mis. form method=dialog) tetap difinalisasi
  dialog.addEventListener("close", () => finalizeClose(dialog));
  enableSheetGesture(dialog);
}

export function openDialog(dialog, { trigger = document.activeElement } = {}) {
  if (!dialog || dialog.open) return;
  setup(dialog);
  state.set(dialog, { trigger });
  setExpanded(trigger, true);
  document.documentElement.classList.add("is-scroll-locked");

  if (SUPPORTED && dialog.showModal) dialog.showModal();
  else dialog.setAttribute("open", "");

  const first = dialog.querySelector("[autofocus], .dialog__body a[href], .dialog__body button:not([disabled]), .dialog__body input:not([disabled]), button, a[href]");
  first?.focus();
}

export function closeDialog(dialog) {
  if (!dialog?.open || dialog.classList.contains("is-closing")) return;
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    dialog.classList.remove("is-closing");
    dialog.style.removeProperty("transform");
    if (SUPPORTED && dialog.close) dialog.close();
    else dialog.removeAttribute("open");
    // Finalisasi sinkron: tidak menunggu event "close" yang dijadwalkan asinkron
    finalizeClose(dialog);
  };
  if (prefersReducedMotion()) return done();
  dialog.classList.add("is-closing");
  dialog.addEventListener("animationend", done, { once: true });
  setTimeout(done, 300); // cadangan
}

/** aria-expanded hanya untuk pemicu popup (bukan elemen sembarang yang kebetulan fokus). */
function setExpanded(trigger, expanded) {
  if (trigger?.matches?.("[aria-haspopup], [aria-expanded]")) trigger.setAttribute("aria-expanded", String(expanded));
}

function finalizeClose(dialog) {
  if (!state.has(dialog)) return; // sudah difinalisasi
  const { trigger } = state.get(dialog);
  if (!document.querySelector("dialog[open]")) document.documentElement.classList.remove("is-scroll-locked");
  setExpanded(trigger, false);
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  state.delete(dialog);
  dialog.dispatchEvent(new CustomEvent("dialog:closed"));
}

/** Gestur geser-tutup untuk bottom sheet pada perangkat sentuh. */
function enableSheetGesture(dialog) {
  const grabber = dialog.querySelector("[data-sheet-grabber]");
  if (!grabber || !dialog.classList.contains("dialog--sheet")) return;
  const header = dialog.querySelector(".dialog__header");
  let startY = 0;
  let delta = 0;
  let startTime = 0;
  let dragging = false;

  const onDown = (e) => {
    if (!matches("(max-width: 47.99em)") || e.target.closest("button")) return;
    dragging = true;
    startY = e.clientY;
    startTime = performance.now();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    delta = Math.max(0, e.clientY - startY);
    dialog.style.transform = `translateY(${delta}px)`;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    const velocity = delta / (performance.now() - startTime);
    if (delta > dialog.offsetHeight * 0.3 || velocity > 0.6) closeDialog(dialog);
    else dialog.style.removeProperty("transform");
    delta = 0;
  };

  [grabber, header].forEach((el) => {
    if (!el) return;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });
}
