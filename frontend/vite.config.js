import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",
    }),
  ],
  resolve: {
    alias: {
      components: resolve(__dirname, "./src/components"),
      state: resolve(__dirname, "./src/state"),
      services: resolve(__dirname, "./src/services"),
      utils: resolve(__dirname, "./src/utils"),
      constants: resolve(__dirname, "./src/constants"),
      forks: resolve(__dirname, "./src/forks"),
    },
  },
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
  },
});
