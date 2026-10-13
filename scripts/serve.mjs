#!/usr/bin/env node
/**
 * Server statis lokal yang meniru CDN produksi (tanpa dependensi):
 * - Kompresi Brotli/gzip, ETag + 304, header dari dist/_headers
 * - URL bersih (/masuk → /masuk/), rewrite SPA /app/* → /app/index.html
 * - 404.html untuk rute tak dikenal
 * Pakai: node scripts/serve.mjs [--watch] [--port 4173]
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build, watchSrc } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const argPort = process.argv.indexOf("--port");
const PORT = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
const COMPRESSIBLE = /\.(html|js|mjs|css|json|webmanifest|svg|xml|txt)$/;

/* ---- Parser _headers (format Netlify/Cloudflare) ---- */
let headerRules = [];
async function loadHeaderRules() {
  const file = path.join(DIST, "_headers");
  if (!existsSync(file)) return (headerRules = []);
  const rules = [];
  let current;
  for (const line of (await fs.readFile(file, "utf8")).split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      current = { pattern, headers: {} };
      rules.push(current);
    } else if (current) {
      const i = line.indexOf(":");
      current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  headerRules = rules;
}

function headersFor(urlPath) {
  const headers = {};
  for (const rule of headerRules) if (rule.pattern.test(urlPath)) Object.assign(headers, rule.headers);
  // Lokal tanpa HTTPS: jangan paksa upgrade/HSTS
  delete headers["Strict-Transport-Security"];
  if (headers["Content-Security-Policy"]) headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace(/;?\s*upgrade-insecure-requests/, "");
  return headers;
}

/* ---- Resolusi berkas ---- */
async function resolve(urlPath) {
  const safe = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const target = path.join(DIST, safe);
  if (!target.startsWith(DIST)) return { status: 403 };

  const stat = await fs.stat(target).catch(() => null);
  if (stat?.isFile()) return { file: target, status: 200 };
  if (stat?.isDirectory()) {
    if (!urlPath.endsWith("/")) return { redirect: `${urlPath}/` };
    const index = path.join(target, "index.html");
    if (existsSync(index)) return { file: index, status: 200 };
  }
  if (!path.extname(urlPath) && existsSync(path.join(target, "index.html"))) return { redirect: `${urlPath}/` };
  if (urlPath.startsWith("/app/")) return { file: path.join(DIST, "app/index.html"), status: 200 };
  return { file: path.join(DIST, "404.html"), status: 404 };
}

const compressed = new Map();
function encode(file, body, mtimeMs, accept) {
  if (!COMPRESSIBLE.test(file)) return { body };
  const encoding = /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
  if (!encoding) return { body };
  const key = `${file}:${mtimeMs}:${encoding}`;
  if (!compressed.has(key)) {
    compressed.set(
      key,
      encoding === "br" ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }) : gzipSync(body, { level: 9 }),
    );
  }
  return { body: compressed.get(key), encoding };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const result = await resolve(url.pathname);
    if (result.redirect) {
      res.writeHead(301, { Location: result.redirect + url.search });
      return res.end();
    }
    if (result.status === 403) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    const stat = await fs.stat(result.file);
    const etag = `W/"${createHash("sha1").update(`${stat.size}-${stat.mtimeMs}`).digest("hex").slice(0, 16)}"`;
    const headers = {
      "Content-Type": TYPES[path.extname(result.file)] ?? "application/octet-stream",
      ETag: etag,
      Vary: "Accept-Encoding",
      ...headersFor(url.pathname),
    };
    if (req.headers["if-none-match"] === etag && result.status === 200) {
      res.writeHead(304, headers);
      return res.end();
    }
    const raw = await fs.readFile(result.file);
    const { body, encoding } = encode(result.file, raw, stat.mtimeMs, req.headers["accept-encoding"] ?? "");
    if (encoding) headers["Content-Encoding"] = encoding;
    headers["Content-Length"] = body.length;
    res.writeHead(result.status, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

if (!existsSync(DIST) || process.argv.includes("--watch")) await build();
await loadHeaderRules();
if (process.argv.includes("--watch")) watchSrc(() => compressed.clear() || loadHeaderRules());

server.listen(PORT, () => {
  console.log(`\n🌐 Findst berjalan di http://localhost:${PORT}`);
});
