import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
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
