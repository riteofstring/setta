import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import apiMiddlewarePlugin from "./src/api/vitePlugin";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",
    }),
    svgr(),
    apiMiddlewarePlugin(),
  ],
  resolve: {
    alias: {
      components: resolve(__dirname, "./src/components"),
      state: resolve(__dirname, "./src/state"),
      services: resolve(__dirname, "./src/services"),
      utils: resolve(__dirname, "./src/utils"),
      constants: resolve(__dirname, "../constants"),
      forks: resolve(__dirname, "./src/forks"),
      requests: resolve(__dirname, "./src/requests"),
      api: resolve(__dirname, "./src/api"),
    },
  },
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
  },
});
