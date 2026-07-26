import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

const aliases = {
  "@generated": resolve("src/generated"),
  "@renderer": resolve("src/renderer/src"),
  "@shared": resolve("src/shared"),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: aliases,
    },
    build: {
      rollupOptions: {
        input: resolve("src/main/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: aliases,
    },
    build: {
      rollupOptions: {
        input: resolve("src/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: aliases,
    },
    build: {
      rollupOptions: {
        input: {
          // The app shell.
          index: resolve("src/renderer/index.html"),
          // The Setta 4 graph measurement page: the canvas, its fixtures, and
          // nothing else, so frame samples and pixel checks see only the graph.
          "director-graph": resolve("src/renderer/director-graph.html"),
          // Development gallery for Go-owned Director projection fixtures.
          "director-graph-gallery": resolve("src/renderer/director-graph-gallery.html"),
        },
      },
    },
  },
});
