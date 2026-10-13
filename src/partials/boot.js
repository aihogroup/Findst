/* Boot sebaris (sebelum render pertama): tema, font, skala, tier performa,
   mode standalone, dan pemuatan CSS non-blocking. ES5 agar aman di browser lama.
   Kunci & nilai harus sinkron dengan features/preferences/preferences.store.js */
(function (d, w) {
  var root = d.documentElement;
  var prefs = {};
  try {
    prefs = JSON.parse(w.localStorage.getItem("findst:prefs:v1")) || {};
  } catch (e) {
    prefs = {};
  }
  var mm = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var pref = /^(light|dark|system)$/.test(prefs.theme) ? prefs.theme : "system";
  var dark = pref === "dark" || (pref === "system" && mm("(prefers-color-scheme: dark)"));
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.setAttribute("data-font", /^(serif|poppins|arial)$/.test(prefs.font) ? prefs.font : "serif");
  var scale = parseFloat(prefs.fontScale);
  if (scale >= 0.875 && scale <= 1.5) root.style.setProperty("--font-scale", String(scale));
  var meta = d.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "{{site.themeColorDark}}" : "{{site.themeColorLight}}");
  root.className += " js";

  var n = w.navigator;
  var c = n.connection || {};
  if ((n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || c.saveData) {
    root.setAttribute("data-perf", "low");
  }
  if (mm("(display-mode: standalone)") || n.standalone) root.setAttribute("data-standalone", "");

  // Pengumuman yang sudah ditutup disembunyikan sebelum render (tanpa CLS)
  try {
    var dismissed = JSON.parse(w.localStorage.getItem("findst:dismissed:v1")) || [];
    if (dismissed.indexOf("{{announcementId}}") > -1) root.setAttribute("data-ann-dismissed", "");
  } catch (e) {}

  // Tangkap prompt pemasangan sedini mungkin (modul JS dimuat belakangan)
  w.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    w.__findstInstallEvent = e;
  });

  var s = d.currentScript;
  var hrefs = s ? [s.getAttribute("data-css"), s.getAttribute("data-page-css")] : [];
  for (var i = 0; i < hrefs.length; i++) {
    if (!hrefs[i]) continue;
    var l = d.createElement("link");
    l.rel = "stylesheet";
    l.href = hrefs[i];
    l.setAttribute("data-async-css", "");
    d.head.appendChild(l);
  }
})(document, window);
