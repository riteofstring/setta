import { defineConfig } from "vite";

const apiProxy = {
  "/api": {
    target:
      process.env.SETTA_REALTIME_BACKEND_ORIGIN ?? "http://127.0.0.1:8081",
    ws: true,
  },
};

export default defineConfig({
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
