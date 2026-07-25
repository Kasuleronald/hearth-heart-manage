import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Default deploy target is a plain Node process (Oracle Cloud VM, see
// docs/deploy-oracle.md) via Nitro's node-server preset. Override with
// `NITRO_PRESET=cloudflare-module` to build for Cloudflare Workers/Pages
// instead (this project's original target — src/server.ts's custom SSR
// error-wrapper only applies to that preset, since it's written against
// the Cloudflare Workers fetch(request, env, ctx) module shape), or
// `NITRO_PRESET=github-pages` for a static SPA build (see
// .github/workflows/deploy.yml).
const nitroPreset = process.env.NITRO_PRESET || "node-server";
const isGithubPages = nitroPreset === "github-pages";
const isCloudflare = nitroPreset === "cloudflare-module";
// GitHub Pages project sites are served from /<repo-name>/, not the domain root.
const base = isGithubPages ? "/hearth-heart-manage/" : "/";

export default defineConfig(({ command }) => ({
  base,
  server: {
    host: "::",
    port: 8080,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // src/server.ts's error-wrapper is written against the Cloudflare
      // Workers fetch(request, env, ctx) shape — only redirect Start's
      // server entry to it for that preset. node-server (the default) and
      // github-pages both use Nitro's own generated entry unmodified.
      ...(isCloudflare ? { server: { entry: "server" } } : {}),
      importProtection: {
        behavior: "error",
        // Only the raw DB layer (connection string, Drizzle schema/client) is
        // blocked from client bundles — src/server/*.ts files outside db/ are
        // meant to be imported by client route components: they export
        // createServerFn() functions, which TanStack Start's own compiler
        // splits into a server-only chunk + a client-side RPC stub. Blocking
        // the whole **/server/** tree would break that pattern entirely.
        client: { files: ["**/server/db/**"], specifiers: ["server-only"] },
      },
    }),
    // Nitro packages the deployable server bundle for Cloudflare. The GitHub Pages
    // target skips it — its "static" preset hits an internal bug in this Nitro/Vite
    // combo (rolldownOptions.input html-file error, after prerendering already
    // succeeds) — and instead takes the plain client+server build directly; see
    // scripts/prerender-pages.mjs, which renders the static shell itself.
    ...(command === "build" && !isGithubPages ? [nitro({ preset: nitroPreset })] : []),
    viteReact(),
  ],
}));
