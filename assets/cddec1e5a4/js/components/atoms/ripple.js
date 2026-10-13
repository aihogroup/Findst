import { delegate, isLowPerf, prefersReducedMotion } from "../../core/dom.js";
import { haptic } from "../../core/haptics.js";

/**
 * Ripple + umpan balik taktil untuk semua .btn lewat SATU listener terdelegasi.
 * Animasi memakai Web Animations API (transform & opacity saja → GPU).
 */
export function initRipple(root = document) {
  return delegate(root, "pointerdown", ".btn", (event, button) => {
    if (button.matches("[aria-disabled='true'], :disabled, [aria-busy='true']")) return;
    if (button.hasAttribute("data-haptic")) haptic("light");
    if (prefersReducedMotion() || isLowPerf() || !button.animate) return;

    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.append(ripple);

    ripple
      .animate(
        [
          { transform: "scale(0)", opacity: 0.22 },
          { transform: "scale(1)", opacity: 0 },
        ],
        { duration: 550, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      )
      .finished.finally(() => ripple.remove());
  });
}
