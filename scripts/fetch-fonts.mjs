#!/usr/bin/env node
/**
 * Mengunduh font self-host (subset Latin, woff2) dari CDN Fontsource ke
 * src/public/fonts. Jalankan sekali: npm run fonts
 *  - Source Serif 4 (variabel, satu berkas semua bobot) — default "Luxury"
 *  - Poppins 400 & 600 — dimuat malas hanya saat dipilih pengguna
 * Lisensi: SIL Open Font License 1.1.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/public/fonts");
const FILES = [
  ["https://cdn.jsdelivr.net/fontsource/fonts/source-serif-4:vf@latest/latin-wght-normal.woff2", "source-serif-4-latin-wght.woff2"],
  ["https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-400-normal.woff2", "poppins-latin-400-normal.woff2"],
  ["https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-600-normal.woff2", "poppins-latin-600-normal.woff2"],
];

await fs.mkdir(OUT, { recursive: true });
for (const [url, name] of FILES) {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`✖ ${name}: HTTP ${response.status}`);
    process.exitCode = 1;
    continue;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(path.join(OUT, name), buffer);
  console.log(`✔ ${name} (${(buffer.length / 1024).toFixed(1)} KB)`);
}
console.log("Selesai. Jalankan `npm run build` agar preload & @font-face aktif.");
