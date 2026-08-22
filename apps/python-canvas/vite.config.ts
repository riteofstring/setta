import { defineConfig } from "vite";

const apiProxy = {
  "/api": {
    target: process.env.PYTHON_CANVAS_BACKEND_ORIGIN ?? "http://127.0.0.1:8080",
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
