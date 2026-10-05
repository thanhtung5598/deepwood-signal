import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
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
        lessons: resolve(import.meta.dirname, "index.html"),
        game: resolve(import.meta.dirname, "game-v1.html"),
      },
    },
  },
});
