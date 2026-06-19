#!/usr/bin/env node
/**
 * Tiny, dependency-free static server for the exported app (apps/web/out).
 *
 * This replaces `next start` (which doesn't support output: export) and is
 * vastly lighter than `next dev`: it just maps URLs to files. Binds to
 * 127.0.0.1 only — this is a personal local launcher, not a public server.
 *
 *   PORT=4317 node scripts/serve-static.mjs
 *
 * Pair it with the systemd user service + i3 keybinding in deploy/.
 */
import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

async function resolve(pathname) {
  // Strip the leading slash, block path traversal, default to index.html.
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, rel);
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
    await stat(file);
    return file;
  } catch {
    // No matching file: SPA-style fallback to the app shell. (Real assets carry
    // an extension; only extensionless "routes" fall through here.)
    if (!extname(rel)) return join(ROOT, "index.html");
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const file = await resolve(url.pathname);
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    const body = await readFile(file);
    const type = MIME[extname(file)] ?? "application/octet-stream";
    // Hashed _next assets are immutable; HTML/SW must always revalidate so a
    // rebuild is picked up.
    const immutable = file.includes("/_next/") && extname(file) !== ".html";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": immutable
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      // Allow the service worker to claim the whole origin.
      ...(file.endsWith("sw.js") ? { "service-worker-allowed": "/" } : {}),
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Server error");
    console.error(err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`grit-web serving ${ROOT} at http://${HOST}:${PORT}`);
});
