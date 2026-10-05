import { resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "model-byte-sizes",
      resolveId(id) {
        if (id === "virtual:model-sizes") return "\0virtual:model-sizes";
      },
      load(id) {
        if (id !== "\0virtual:model-sizes") return;
        const directory = resolve(import.meta.dirname, "public/models");
        const sizes = Object.fromEntries(
          readdirSync(directory)
            .filter((name) => name.endsWith(".glb"))
            .map((name) => [`/models/${name}`, statSync(resolve(directory, name)).size]),
        );
        return `export default ${JSON.stringify(sizes)};`;
      },
    },
    {
      name: "absolute-social-image-urls",
      transformIndexHtml(html) {
        const domain =
          process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
        if (!domain) return html;

        const imageUrl = new URL(
          "/og/deepwood-signal.png",
          `https://${domain}`,
        ).href;
        return html.replaceAll(
          'content="/og/deepwood-signal.png"',
          `content="${imageUrl}"`,
        );
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        game: resolve(import.meta.dirname, "game-v1.html"),
      },
    },
  },
});
