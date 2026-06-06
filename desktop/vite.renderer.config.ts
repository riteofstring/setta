import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

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
});
