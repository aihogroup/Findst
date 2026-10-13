import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, safeRedirectPath, safeUrl, sanitizeEmail, sanitizeText } from "../src/assets/js/core/sanitize.js";
import { createStore } from "../src/assets/js/core/store.js";
import { normalizePrefs, resolveTheme } from "../src/assets/js/features/preferences/preferences.model.js";
import { activeAnnouncement, faqItemsHtml, isNewer } from "../src/assets/js/features/landing/templates.js";

test("store: state immutable & selector hanya memicu saat nilai berubah", () => {
  const store = createStore({ theme: "light", online: true });
  assert.ok(Object.isFrozen(store.getState()));
  const calls = [];
  store.subscribe((v) => calls.push(v), (s) => s.theme);
  store.setState({ online: false }); // slice lain → tidak memicu
  store.setState({ theme: "dark" });
  store.setState({ theme: "dark" }); // nilai sama → tidak memicu
  assert.deepEqual(calls, ["dark"]);
});

test("sanitize: escape HTML & buang tag/kontrol", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
  assert.equal(sanitizeText("  Halo <b>dunia</b>\u0000  "), "Halo dunia");
  assert.equal(sanitizeEmail(" Rina@Contoh.ID "), "rina@contoh.id");
});

test("sanitize: URL & redirect aman", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "#");
  assert.equal(safeUrl("/daftar/"), "/daftar/");
  assert.equal(safeRedirectPath("//evil.com"), "/");
  assert.equal(safeRedirectPath("https://evil.com"), "/");
  assert.equal(safeRedirectPath("/app/akun/"), "/app/akun/");
});

test("preferensi: normalisasi nilai tak valid ke bawaan & snap skala", () => {
  assert.deepEqual(normalizePrefs({ theme: "neon", font: "comic", fontScale: 9 }), { theme: "system", font: "serif", fontScale: 1.5 });
  assert.equal(normalizePrefs({ fontScale: "1.2" }).fontScale, 1.25);
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("light", true), "light");
});

test("template FAQ meng-escape konten (aman dari injeksi)", () => {
  const html = faqItemsHtml([{ id: "x", question: "<script>", answer: "a & b" }]);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("a &amp; b"));
  assert.ok(html.includes('hidden="until-found"'));
});

test("pengumuman: abaikan yang kedaluwarsa atau sudah ditutup", () => {
  const data = {
    items: [
      { id: "lama", text: "a", expiresAt: "2000-01-01T00:00:00Z" },
      { id: "ditutup", text: "b" },
      { id: "aktif", text: "c" },
    ],
  };
  assert.equal(activeAnnouncement(data, { dismissed: ["ditutup"] }).id, "aktif");
  assert.ok(isNewer("2026-10-08T00:00:00Z", "2026-10-07T00:00:00Z"));
  assert.ok(!isNewer("2026-10-07T00:00:00Z", "2026-10-07T00:00:00Z"));
});
