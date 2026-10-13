#!/usr/bin/env node
/**
 * Build SSG Findst — tanpa dependensi (Node ≥ 18).
 *
 *  1. Bundling CSS modular (@import) → critical (disisipkan sebaris) + bundle
 *     non-blocking; minifikasi ringan.
 *  2. Salin modul JS ke /assets/<hash>/ (hash konten → cache immutable di CDN).
 *  3. Render halaman dari template + partial + konten (FAQ/pengumuman = ISR source).
 *  4. CSP per halaman berbasis hash SHA-256 skrip/gaya sebaris.
 *  5. sitemap.xml, robots.txt, service worker (versi + daftar precache).
 *
 * Pakai: node scripts/build.mjs [--watch]
 */
import { createHash } from "node:crypto";
import { existsSync, watch } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliCompressSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const DIR = {
  pages: path.join(SRC, "pages"),
  partials: path.join(SRC, "partials"),
  styles: path.join(SRC, "assets", "styles"),
  js: path.join(SRC, "assets", "js"),
  content: path.join(SRC, "content"),
  public: path.join(SRC, "public"),
};
const CSS_BUNDLES = ["main", "auth", "app"];
const SERIF_FONT = "/fonts/source-serif-4-latin-wght.woff2";
const BUDGET_CRITICAL_BR = 14 * 1024; // ±1 round-trip TCP awal

/* ------------------------------------------------------------------ utils */
const read = (file) => fs.readFile(file, "utf8");
const sha = (data, enc = "hex") => createHash("sha256").update(data).digest(enc);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])));
  return files.flat();
}

async function write(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const jsonLdScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

/* -------------------------------------------------------------------- CSS */
async function bundleCss(file, seen = new Set()) {
  if (seen.has(file)) return "";
  seen.add(file);
  const css = await read(file);
  const parts = [];
  let last = 0;
  for (const match of css.matchAll(/@import\s+"([^"]+)";/g)) {
    parts.push(css.slice(last, match.index), await bundleCss(path.resolve(path.dirname(file), match[1]), seen));
    last = match.index + match[0].length;
  }
  parts.push(css.slice(last));
  return parts.join("");
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/:\s+/g, ":")
    .replace(/;}/g, "}")
    .trim();
}

/** Hapus @font-face yang berkasnya belum ada di public/fonts (hindari 404). */
function dropMissingFonts(css) {
  return css.replace(/@font-face\s*{[^}]*}/g, (block) => {
    const url = block.match(/url\("(\/fonts\/[^"]+)"\)/)?.[1];
    return url && !existsSync(path.join(DIR.public, url)) ? "" : block;
  });
}

/* --------------------------------------------------------------- template */
const lookup = (ctx, key) => key.split(".").reduce((v, k) => (v == null ? undefined : v[k]), ctx);
const truthy = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));

function parseParams(raw = "") {
  const params = {};
  for (const m of raw.matchAll(/(\w+)=(?:"([^"]*)"|'([^']*)')/g)) params[m[1]] = m[2] ?? m[3];
  return params;
}

const partialCache = new Map();
async function loadPartial(name) {
  if (!partialCache.has(name)) {
    const file = path.join(DIR.partials, path.extname(name) ? name : `${name}.html`);
    partialCache.set(name, await read(file));
  }
  return partialCache.get(name);
}

async function render(template, ctx, depth = 0) {
  if (depth > 10) throw new Error("Partial terlalu dalam (rekursi?)");
  let out = template;

  // 1) {{> partial key="val"}}
  const includes = [...out.matchAll(/\{\{>\s*([\w.-]+)((?:\s+\w+=(?:"[^"]*"|'[^']*'))*)\s*\}\}/g)];
  for (const m of includes) {
    const html = await render(await loadPartial(m[1]), { ...ctx, ...parseParams(m[2]) }, depth + 1);
    out = out.replace(m[0], () => html);
  }

  // 2) {{#if x}}…{{/if}} / {{#unless x}}…{{/unless}} — paling dalam lebih dulu
  const block = /\{\{#(if|unless)\s+([\w.]+)\s*\}\}((?:(?!\{\{#(?:if|unless)\b)[\s\S])*?)\{\{\/\1\}\}/;
  for (let m = out.match(block); m; m = out.match(block)) {
    const pass = truthy(lookup(ctx, m[2])) === (m[1] === "if");
    out = out.replace(m[0], () => (pass ? m[3] : ""));
  }

  // 3) {{{raw}}} lalu {{escaped}}
  out = out.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => String(lookup(ctx, k) ?? ""));
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => escapeHtml(lookup(ctx, k) ?? ""));
  return out;
}

function parsePage(source) {
  const match = source.match(/^<!--@page\s*([\s\S]*?)-->\s*/);
  return match ? { meta: JSON.parse(match[1]), body: source.slice(match[0].length) } : { meta: {}, body: source };
}

/* -------------------------------------------------------------------- CSP */
function buildCsp(html) {
  const hashes = (re) => [...html.matchAll(re)].map((m) => `'sha256-${sha(m[1], "base64")}'`);
  const scripts = hashes(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g);
  const styles = hashes(/<style[^>]*>([\s\S]*?)<\/style>/g);
  return [
    "default-src 'self'",
    `script-src 'self' ${scripts.join(" ")}`.trim(),
    `style-src 'self' ${styles.join(" ")} https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://fonts.googleapis.com https://fonts.gstatic.com",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/* ---------------------------------------------------------------- JSON-LD */
function structuredData(kinds, { site, faq }) {
  const blocks = {
    organization: { "@context": "https://schema.org", "@type": "Organization", name: site.name, url: site.url, logo: `${site.url}/icons/icon-512.png`, email: site.email, sameAs: site.sameAs },
    website: { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: site.url, inLanguage: "id-ID" },
    faq: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
    },
  };
  return (kinds ?? []).map((k) => jsonLdScript(blocks[k])).join("\n  ");
}

/* ------------------------------------------------------------------ build */
export async function build({ quiet = false } = {}) {
  const started = performance.now();
  partialCache.clear();
  await fs.rm(DIST, { recursive: true, force: true });

  const site = JSON.parse(await read(path.join(DIR.content, "site.json")));
  const faq = JSON.parse(await read(path.join(DIR.content, "faq.json")));
  const announcements = JSON.parse(await read(path.join(DIR.content, "announcements.json")));

  // Template bersama dari kode klien (DRY: build & island memakai markup yang sama)
  const templates = await import(`${pathToFileURL(path.join(DIR.js, "features/landing/templates.js")).href}?t=${Date.now()}`);

  // 1) CSS
  const fontPreload = existsSync(path.join(DIR.public, SERIF_FONT));
  const criticalCss = minifyCss(dropMissingFonts(await bundleCss(path.join(DIR.styles, "bundles/critical.css"))));
  const bundles = {};
  for (const name of CSS_BUNDLES) bundles[name] = minifyCss(await bundleCss(path.join(DIR.styles, `bundles/${name}.css`)));

  // 2) Hash konten aset
  const jsFiles = (await walk(DIR.js)).filter((f) => f.endsWith(".js"));
  const hasher = createHash("sha256");
  for (const f of jsFiles) hasher.update(await fs.readFile(f));
  Object.values(bundles).forEach((css) => hasher.update(css));
  const hash = hasher.digest("hex").slice(0, 10);
  const assetBase = `/assets/${hash}`;

  for (const f of jsFiles) await write(path.join(DIST, assetBase, "js", path.relative(DIR.js, f)), await fs.readFile(f));
  for (const [name, css] of Object.entries(bundles)) await write(path.join(DIST, assetBase, "css", `${name}.css`), css);

  // 3) Public (kecuali sw.js yang diproses)
  for (const f of await walk(DIR.public)) {
    const rel = path.relative(DIR.public, f);
    if (rel === "sw.js" || rel.endsWith(".md")) continue;
    await write(path.join(DIST, rel), await fs.readFile(f));
  }
  await write(path.join(DIST, "content/faq.json"), JSON.stringify(faq));
  await write(path.join(DIST, "content/announcements.json"), JSON.stringify(announcements));

  // 4) Halaman
  const activeAnn = templates.activeAnnouncement(announcements);
  const shared = {
    site,
    year: new Date().getFullYear(),
    asset: assetBase,
    criticalCss,
    fontPreload,
    faqItems: templates.faqItemsHtml(faq.items),
    faqVersion: faq.version,
    faqUpdatedLabel: new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(faq.version)),
    announcement: templates.announcementHtml(activeAnn, announcements.version),
    announcementId: activeAnn?.id ?? "",
  };

  const pageFiles = (await walk(DIR.pages)).filter((f) => f.endsWith(".html"));
  const sitemap = [];
  for (const file of pageFiles) {
    const { meta, body } = parsePage(await read(file));
    const page = { asyncCss: false, ...meta };
    const mainCss = `${assetBase}/css/main.css`;
    const pageCss = page.pageCss ? `${assetBase}/css/${page.pageCss}.css` : "";
    const ctx = {
      ...shared,
      page,
      canonical: `${site.url}${page.path ?? "/"}`,
      robots: page.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
      ogType: "website",
      mainCss,
      pageCss,
      asyncMainCss: page.asyncCss ? mainCss : "",
      asyncPageCss: page.asyncCss ? pageCss : "",
      jsonLd: structuredData(page.jsonLd, { site, faq }),
    };
    // Rapikan baris kosong DULU, baru hitung hash CSP dari HTML final
    let html = (await render(body, ctx)).replace(/\n\s*\n+/g, "\n");
    html = html.replace("__CSP__", buildCsp(html));
    await write(path.join(DIST, path.relative(DIR.pages, file)), html);

    if (page.sitemap && !page.noindex) {
      const { mtime } = await fs.stat(file);
      sitemap.push({ loc: `${site.url}${page.path}`, lastmod: mtime.toISOString().slice(0, 10), ...page.sitemap });
    }
  }

  // 5) SEO
  await write(
    path.join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
      .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
      .join("\n")}\n</urlset>\n`,
  );
  await write(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /app/\n\nSitemap: ${site.url}/sitemap.xml\n`);

  // 6) Service worker
  const precache = [
    "/",
    "/offline.html",
    "/app/",
    "/masuk/",
    "/daftar/",
    "/manifest.webmanifest",
    "/icons/icon.svg",
    "/icons/favicon.svg",
    "/icons/icon-192.png",
    ...(fontPreload ? [SERIF_FONT] : []),
    ...(await walk(path.join(DIST, assetBase))).map((f) => `/${path.relative(DIST, f).split(path.sep).join("/")}`),
  ];
  const sw = (await read(path.join(DIR.public, "sw.js")))
    .replace(/const VERSION = "__BUILD_VERSION__"/, () => `const VERSION = "${hash}"`)
    .replace(/const PRECACHE = __PRECACHE__/, () => `const PRECACHE = ${JSON.stringify(precache, null, 2)}`);
  await write(path.join(DIST, "sw.js"), sw);

  // Laporan anggaran performa
  if (!quiet) {
    const br = (s) => brotliCompressSync(Buffer.from(s)).length;
    const criticalBr = br(criticalCss);
    console.log(`\n✔ Build ${hash} selesai dalam ${Math.round(performance.now() - started)} ms → dist/`);
    console.log(`  halaman: ${pageFiles.length} · modul JS: ${jsFiles.length} · precache: ${precache.length}`);
    console.log(`  CSS kritis: ${kb(criticalCss.length)} (brotli ${kb(criticalBr)})${criticalBr > BUDGET_CRITICAL_BR ? "  ⚠ melebihi anggaran 14 KB" : ""}`);
    for (const [n, css] of Object.entries(bundles)) console.log(`  ${n}.css: ${kb(css.length)} (brotli ${kb(br(css))})`);
    if (!fontPreload) console.log("  ℹ Font serif belum ada → memakai fallback Georgia. Jalankan `npm run fonts`.");
  }
  return { hash };
}

/* ------------------------------------------------------------------ watch */
export function watchSrc(onBuilt) {
  let timer;
  let running = Promise.resolve();
  watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running
        .then(() => build({ quiet: true }))
        .then((r) => {
          console.log(`↻ rebuild ${r.hash} (${new Date().toLocaleTimeString("id-ID")})`);
          onBuilt?.(r);
        })
        .catch((e) => console.error("✖ build gagal:", e.message));
    }, 150);
  });
  console.log("👀 Memantau perubahan di src/ …");
}

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isCli) {
  await build().catch((error) => {
    console.error("✖ Build gagal:", error);
    process.exit(1);
  });
  if (process.argv.includes("--watch")) watchSrc();
}
