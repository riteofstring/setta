import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import svgrPlugin from "vite-plugin-svgr";
import viteTsconfigPaths from "vite-tsconfig-paths";
import { C } from "./src/utils/c.js";

const resolvePort = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

const resolveHost = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }
  return value;
};

const devFrontendPort = resolvePort(
  process.env.SETTA_DEV_FRONTEND_PORT,
  C.DEV_MODE_FRONTEND_PORT
);
const devFrontendHost = resolveHost(
  process.env.SETTA_DEV_FRONTEND_HOST ?? process.env.SETTA_HOST,
  C.DEFAULT_HOST
);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), viteTsconfigPaths(), svgrPlugin()],
  resolve: {
    dedupe: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/lint",
      "@codemirror/language",
      "@codemirror/autocomplete",
    ],
  },
  server: {
    host: devFrontendHost,
    port: devFrontendPort,
    open: false,
    watch: {
      // Playwright/Vitest output can churn rapidly during test runs. If Vite
      // watches these folders it will trigger HMR reloads that can break E2E
      // stability (and can leave the app stuck in a loading state).
      ignored: [
        "**/test-results/**",
        "**/playwright-report/**",
        "**/tests/e2e/.storageState*.json",
      ],
    },
  },
  preview: {
    host: devFrontendHost,
    port: devFrontendPort,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
