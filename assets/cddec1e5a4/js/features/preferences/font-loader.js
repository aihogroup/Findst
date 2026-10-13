import { appConfig } from "../../config/app.config.js";

/**
 * Pemuatan font malas: Poppins hanya diunduh saat dipilih, dan hanya bobot
 * yang dipakai (400 & 600). Urutan sumber:
 *   1) berkas self-host di /fonts (jalankan `npm run fonts`)
 *   2) cadangan Google Fonts bila berkas lokal tidak tersedia
 *   3) fallback sistem bermetrik serupa (tanpa unduhan) bila keduanya gagal
 * Serif default sudah dideklarasikan di CSS & di-preload; Arial adalah font sistem.
 */
const loading = new Map();

function loadFromGoogle(href) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) return resolve();
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href });
    link.onload = resolve;
    link.onerror = reject;
    document.head.append(link);
  });
}

async function loadPoppins() {
  const { family, weights, localUrl, fallbackCss } = appConfig.fonts.poppins;
  if (!("FontFace" in window)) return loadFromGoogle(fallbackCss);
  try {
    const faces = await Promise.all(
      weights.map((weight) =>
        new FontFace(family, `url(${localUrl.replace("{weight}", weight)}) format("woff2")`, {
          weight: String(weight),
          style: "normal",
          display: "swap",
        }).load(),
      ),
    );
    faces.forEach((face) => document.fonts.add(face));
  } catch {
    await loadFromGoogle(fallbackCss);
  }
}

const LOADERS = { poppins: loadPoppins };

/** Pastikan font tersedia; aman dipanggil berkali-kali (hasil di-cache). */
export function ensureFont(font) {
  const loader = LOADERS[font];
  if (!loader) return Promise.resolve();
  if (!loading.has(font)) loading.set(font, loader().catch((e) => (loading.delete(font), Promise.reject(e))));
  return loading.get(font);
}
