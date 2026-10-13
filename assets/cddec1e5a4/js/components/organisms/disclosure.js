/**
 * Disclosure generik: tombol [aria-expanded][aria-controls] membuka/menutup
 * panel. Status terbuka diumumkan lewat aria-expanded (native di pembaca layar).
 */
export function createDisclosure(root) {
  const onClick = (event) => {
    const button = event.target.closest("button[aria-controls][aria-expanded]");
    if (!button || !root.contains(button)) return;
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    if (!panel) return;
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    if (open) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "until-found");
  };

  const onBeforeMatch = (event) => {
    const id = event.target.id;
    const button = id && root.querySelector(`[aria-controls="${id}"]`);
    if (button) {
      button.setAttribute("aria-expanded", "true");
      event.target.removeAttribute("hidden");
    }
  };

  root.addEventListener("click", onClick);
  root.addEventListener("beforematch", onBeforeMatch);
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("beforematch", onBeforeMatch);
  };
}
