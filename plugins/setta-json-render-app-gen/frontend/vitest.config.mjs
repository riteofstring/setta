import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const pluginFrontendDir = dirname(fileURLToPath(import.meta.url));
const repoRootDir = resolve(pluginFrontendDir, "../../..");
const hostFrontendDir = resolve(repoRootDir, "frontend");
const hostFrontendSrcDir = resolve(hostFrontendDir, "src");

export default defineConfig({
  root: pluginFrontendDir,
  publicDir: false,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
    "process.env": "{}",
  },
  resolve: {
    alias: {
      "@setta/app-subsystem-frontend-sdk": resolve(
        hostFrontendDir,
        "plugin-sdk/app-subsystem/src",
      ),
      components: resolve(hostFrontendSrcDir, "components"),
      forks: resolve(hostFrontendSrcDir, "forks"),
      openapi: resolve(hostFrontendSrcDir, "openapi"),
      plugins: resolve(hostFrontendSrcDir, "plugins"),
      state: resolve(hostFrontendSrcDir, "state"),
      testUtils: resolve(hostFrontendSrcDir, "testUtils"),
      utils: resolve(hostFrontendSrcDir, "utils"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    pool: "forks",
  },
});
