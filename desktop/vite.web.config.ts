import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const aliases = {
  "@generated": resolve("src/generated"),
  "@renderer": resolve("src/renderer/src"),
  "@shared": resolve("src/shared"),
};

export default defineConfig({
  root: resolve("src/renderer"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: aliases,
  },
  build: {
    emptyOutDir: true,
    outDir: resolve("../internal/webapp/static"),
  },
});
