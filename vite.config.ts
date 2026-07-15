import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// `NITRO_PRESET=github-pages` switches the build to a static SPA output deployable
// to GitHub Pages (see .github/workflows/deploy.yml); unset defaults to the
// Cloudflare Workers build this project already used.
const nitroPreset = process.env.NITRO_PRESET || "cloudflare-module";
const isGithubPages = nitroPreset === "github-pages";
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
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error
      // wrapper) — only relevant to the deployed-server (Cloudflare) build.
      ...(isGithubPages ? {} : { server: { entry: "server" } }),
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
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
