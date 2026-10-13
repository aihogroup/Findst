/**
 * Helper DOM kecil. `h()` membangun elemen tanpa innerHTML sehingga teks
 * dari server/pengguna tidak pernah dieksekusi sebagai HTML (anti-XSS).
 */
export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Delegasi event: satu listener untuk banyak elemen (hemat memori). */
export function delegate(root, type, selector, handler, options) {
  return on(
    root,
    type,
    (event) => {
      const match = event.target instanceof Element ? event.target.closest(selector) : null;
      if (match && root.contains(match)) handler(event, match);
    },
    options,
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "g", "path", "circle", "line", "rect", "text", "title", "desc", "use", "polyline"]);

/**
 * h("button", { class: "btn", type: "button", dataset: { x: 1 }, onClick }, "Teks")
 * Atribut bernilai false/null diabaikan; true → atribut kosong.
 */
export function h(tag, props = {}, ...children) {
  const isSvg = SVG_TAGS.has(tag) && props.svg !== false;
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false || key === "svg") continue;
    if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "text") el.textContent = value;
    else el.setAttribute(key === "className" ? "class" : key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Ikon dari sprite: icon("check", "icon--sm") */
export const icon = (name, extraClass = "") =>
  h("svg", { class: `icon ${extraClass}`.trim(), "aria-hidden": "true", focusable: "false" }, h("use", { href: `#i-${name}` }));

/** Ganti seluruh anak elemen sekaligus (satu reflow). */
export function replaceChildren(el, ...children) {
  const frag = document.createDocumentFragment();
  append(frag, children);
  el.replaceChildren(frag);
}

/** Tunggu stylesheet non-blocking (disisipkan boot script) selesai dimuat. */
export function whenStylesReady(timeoutMs = 3000) {
  const links = qsa("link[data-async-css]");
  const pending = links.filter((link) => !link.sheet);
  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending.map((link) => new Promise((resolve) => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", resolve, { once: true });
    }))),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export const matches = (query) => globalThis.matchMedia?.(query).matches ?? false;
export const prefersReducedMotion = () => matches("(prefers-reduced-motion: reduce)");
export const isLowPerf = () => document.documentElement.hasAttribute("data-perf");
