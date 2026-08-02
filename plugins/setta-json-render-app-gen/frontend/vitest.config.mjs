import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const pluginFrontendDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: pluginFrontendDir,
  publicDir: false,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
    "process.env": "{}",
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    pool: "forks",
  },
});
