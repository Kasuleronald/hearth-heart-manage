#!/usr/bin/env node
// Renders the app's static shell HTML for the GitHub Pages build.
//
// Nitro's "static"/"github-pages" preset currently fails in this Nitro+Vite
// version combo — it crashes in its own post-prerender packaging step
// ("rolldownOptions.input should not be an html file when building for SSR"),
// even though the app itself builds fine and prerendering succeeds. Since this
// app is client-rendered almost everywhere already (every route under
// `_authenticated`, plus `/login`, sets `ssr: false`), the "server render" is
// really just the near-static root shell — so this script runs the built SSR
// handler once, saves the HTML as both index.html and 404.html (the standard
// GitHub Pages SPA-fallback trick: any unmatched path serves 404.html, and the
// client router takes it from there), and writes .nojekyll so GitHub Pages
// doesn't mangle the `_`-prefixed asset folders Vite generates.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.env.PAGES_BASE ?? "/hearth-heart-manage/";
const outDir = fileURLToPath(new URL("../dist/client", import.meta.url));
const serverEntryUrl = new URL("../dist/server/server.js", import.meta.url);

const { default: server } = await import(serverEntryUrl.href);
const request = new Request(new URL(base, "http://localhost"));
const response = await server.fetch(request, {}, {});
const html = await response.text();

if (response.status >= 400 || !html || html.length < 100) {
  throw new Error(
    `Rendered shell looks wrong (status ${response.status}, ${html.length} chars) — aborting.\n${html.slice(0, 500)}`,
  );
}

await writeFile(`${outDir}/index.html`, html);
await writeFile(`${outDir}/404.html`, html);
await writeFile(`${outDir}/.nojekyll`, "");
console.log(
  `Wrote index.html, 404.html, .nojekyll to ${outDir} (${html.length} chars, status ${response.status})`,
);
