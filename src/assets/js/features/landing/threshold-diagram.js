import { announce } from "../../core/a11y.js";
import { h, prefersReducedMotion, qs, replaceChildren } from "../../core/dom.js";
import { fmt, t } from "../../core/i18n.js";
import { buildModel, STATIC_THRESHOLD } from "./threshold-model.js";

/**
 * ISLAND: Diagram dynamic threshold (SVG inline, dimuat saat mendekati viewport).
 * Aksesibilitas:
 *  - <title>/<desc> untuk pembaca layar + tabel data sebagai alternatif teks
 *  - Tooltip muncul via hover MAUPUN fokus keyboard (← → Home End PgUp PgDn)
 *  - Perubahan diumumkan lewat live region
 */
const W = 720;
const H = 360;
const PAD = { top: 16, right: 16, bottom: 36, left: 60 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const toPath = (points) => points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

function scales(length) {
  const x = (i) => PAD.left + (i / (length - 1)) * plotW;
  const y = (v) => PAD.top + (1 - v) * plotH;
  return { x, y };
}

function buildSvg(ids) {
  const { y } = scales(2);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((v) =>
    h("g", {},
      h("line", { class: "tc-grid", x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v) }),
      h("text", { class: "tc-axis-label", x: PAD.left - 8, y: y(v) + 4, "text-anchor": "end" }, fmt.decimal(v)),
    ),
  );

  return h(
    "svg",
    {
      class: "threshold__svg",
      viewBox: `0 0 ${W} ${H}`,
      tabindex: "0",
      role: "group",
      "aria-roledescription": "diagram interaktif",
      "aria-labelledby": ids.title,
      "aria-describedby": ids.desc,
      focusable: "true",
    },
    h("title", { id: ids.title }, t("chart.title")),
    h("desc", { id: ids.desc }),
    h("g", { "aria-hidden": "true" },
      ...grid,
      h("g", { "data-x-labels": "" }),
      h("path", { class: "tc-band", "data-animate": "", "data-band": "" }),
      h("line", { class: "tc-static", x1: PAD.left, x2: W - PAD.right, y1: y(STATIC_THRESHOLD), y2: y(STATIC_THRESHOLD) }),
      h("path", { class: "tc-threshold", "data-animate": "", "data-threshold": "" }),
      h("path", { class: "tc-line", "data-animate": "", "data-line": "" }),
      h("g", { "data-signals": "", "data-animate": "" }),
      h("g", { "data-cursor": "", visibility: "hidden" },
        h("line", { class: "tc-cursor", y1: PAD.top, y2: H - PAD.bottom }),
        h("circle", { class: "tc-cursor-dot", r: 6 }),
      ),
    ),
  );
}

function buildTable(model) {
  const head = t("chart.table");
  return h("table", { class: "data-table tabular" },
    h("caption", { class: "sr-only" }, t("chart.title")),
    h("thead", {}, h("tr", {}, ...[head.day, head.score, head.threshold, head.signal].map((c) => h("th", { scope: "col" }, c)))),
    h("tbody", {},
      ...model.scores.map((score, i) =>
        h("tr", {},
          h("th", { scope: "row" }, String(i + 1)),
          h("td", {}, fmt.decimal(score)),
          h("td", {}, fmt.decimal(model.thresholds[i])),
          h("td", {}, model.dynamicSignals.includes(i) ? head.yes : head.no),
        ),
      ),
    ),
  );
}

export function mount(panel) {
  const chart = qs("[data-chart]", panel);
  const tableWrap = qs("[data-table]", panel);
  const details = tableWrap?.closest("details");
  const status = qs("[data-chart-status]", panel);
  const metrics = {
    static: qs('[data-metric="static"]', panel),
    dynamic: qs('[data-metric="dynamic"]', panel),
    k: qs('[data-metric="k"]', panel),
  };

  const ids = { title: "tc-title", desc: "tc-desc" };
  const svg = buildSvg(ids);
  const tooltip = h("div", { class: "tooltip", role: "presentation", hidden: true });
  replaceChildren(chart, svg, tooltip);

  const el = {
    desc: svg.querySelector("desc"),
    band: svg.querySelector("[data-band]"),
    threshold: svg.querySelector("[data-threshold]"),
    line: svg.querySelector("[data-line]"),
    signals: svg.querySelector("[data-signals]"),
    xLabels: svg.querySelector("[data-x-labels]"),
    cursor: svg.querySelector("[data-cursor]"),
    cursorLine: svg.querySelector(".tc-cursor"),
    cursorDot: svg.querySelector(".tc-cursor-dot"),
  };

  let model;
  let cursor = -1;
  let tableDirty = true;

  function render(regime, { animate = false } = {}) {
    model = buildModel(regime);
    const { x, y } = scales(model.scores.length);
    const apply = () => {
      el.line.setAttribute("d", toPath(model.scores.map((v, i) => [x(i), y(v)])));
      el.threshold.setAttribute("d", toPath(model.thresholds.map((v, i) => [x(i), y(v)])));
      const upper = model.thresholds.map((v, i) => [x(i), y(v)]);
      const lower = model.lower.map((v, i) => [x(i), y(v)]).reverse();
      el.band.setAttribute("d", `${toPath([...upper, ...lower])}Z`);
      replaceChildren(el.signals, ...model.dynamicSignals.map((i) => h("circle", { class: "tc-signal", cx: x(i), cy: y(model.scores[i]), r: 5.5 })));
      svg.classList.remove("is-updating");
    };

    replaceChildren(
      el.xLabels,
      ...model.scores
        .map((_, i) => i)
        .filter((i) => i === 0 || (i + 1) % 10 === 0)
        .map((i) => h("text", { class: "tc-axis-label", x: x(i), y: H - 6, "text-anchor": "middle" }, `H${i + 1}`)),
    );

    if (animate && !prefersReducedMotion()) {
      svg.classList.add("is-updating");
      setTimeout(apply, 180);
    } else apply();

    const counts = { dynamic: model.dynamicSignals.length, static: model.staticSignals.length };
    metrics.static.textContent = fmt.number(counts.static);
    metrics.dynamic.textContent = fmt.number(counts.dynamic);
    metrics.k.textContent = fmt.decimal(model.k, 1);
    const regimeLabel = t(`chart.regimes.${regime}`);
    el.desc.textContent = t("chart.desc", { count: model.scores.length, regime: regimeLabel, ...counts });

    tableDirty = true;
    if (details?.open) renderTable();
    if (cursor >= 0) moveCursor(cursor, { speak: false });
    return { regimeLabel, counts };
  }

  function renderTable() {
    if (!tableDirty || !tableWrap) return;
    replaceChildren(tableWrap, buildTable(model));
    tableDirty = false;
  }

  function moveCursor(index, { speak = true } = {}) {
    cursor = Math.max(0, Math.min(model.scores.length - 1, index));
    const { x, y } = scales(model.scores.length);
    const cx = x(cursor);
    const cy = y(model.scores[cursor]);
    el.cursor.setAttribute("visibility", "visible");
    el.cursorLine.setAttribute("x1", cx);
    el.cursorLine.setAttribute("x2", cx);
    el.cursorDot.setAttribute("cx", cx);
    el.cursorDot.setAttribute("cy", cy);

    const isSignal = model.dynamicSignals.includes(cursor);
    const text = t("chart.point", {
      day: cursor + 1,
      score: fmt.decimal(model.scores[cursor]),
      threshold: fmt.decimal(model.thresholds[cursor]),
      signal: isSignal ? t("chart.signal") : "",
    });
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.style.left = `${(cx / W) * 100}%`;
    tooltip.style.top = `${(cy / H) * 100}%`;
    // Jaga tooltip tetap di dalam area grafik di tepi kiri/kanan
    tooltip.style.translate = cursor < 8 ? "45% 0" : cursor > model.scores.length - 9 ? "-45% 0" : "0 0";
    if (speak && status) status.textContent = text;
  }

  function hideCursor() {
    if (document.activeElement === svg) return;
    el.cursor.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  }

  const indexFromPointer = (event) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((event.clientX - rect.left) / rect.width) * W;
    return Math.round(((vx - PAD.left) / plotW) * (model.scores.length - 1));
  };

  svg.addEventListener("pointermove", (e) => moveCursor(indexFromPointer(e), { speak: false }));
  svg.addEventListener("pointerdown", (e) => moveCursor(indexFromPointer(e), { speak: false }));
  svg.addEventListener("pointerleave", hideCursor);
  svg.addEventListener("focus", () => moveCursor(cursor < 0 ? 0 : cursor));
  svg.addEventListener("blur", () => {
    el.cursor.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  });
  svg.addEventListener("keydown", (e) => {
    const last = model.scores.length - 1;
    const moves = { ArrowRight: cursor + 1, ArrowLeft: cursor - 1, Home: 0, End: last, PageUp: cursor - 10, PageDown: cursor + 10 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    moveCursor(moves[e.key]);
  });

  details?.addEventListener("toggle", () => details.open && renderTable());

  panel.addEventListener("change", (event) => {
    if (event.target.name !== "regime") return;
    const { regimeLabel, counts } = render(event.target.value, { animate: true });
    announce(t("chart.regimeChanged", { regime: regimeLabel, ...counts }));
  });

  const initial = qs('input[name="regime"]:checked', panel)?.value ?? "normal";
  render(initial);
}
