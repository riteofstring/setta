import { defineConfig } from "vite";

const apiProxy = {
  "/api": {
    target: process.env.SETTA_BENCH_BACKEND_ORIGIN ?? "http://127.0.0.1:8082",
  },
};
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 3_000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") {
          warn(warning);
        }
      },
    },
  },
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
