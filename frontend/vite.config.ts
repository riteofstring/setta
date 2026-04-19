import path from "node:path";
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
const srcRoot = path.resolve(__dirname, "src");

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), viteTsconfigPaths(), svgrPlugin()],
  resolve: {
    alias: {
      "@setta/app-subsystem-frontend-sdk": path.resolve(
        __dirname,
        "plugin-sdk/app-subsystem/src",
      ),
      "@json-render/core": path.resolve(
        __dirname,
        "node_modules/@json-render/core/dist/index.mjs",
      ),
      "@json-render/react": path.resolve(
        __dirname,
        "node_modules/@json-render/react/dist/index.mjs",
      ),
      components: path.resolve(srcRoot, "components"),
      forks: path.resolve(srcRoot, "forks"),
      "katex/dist/katex.min.css": path.resolve(
        __dirname,
        "node_modules/katex/dist/katex.min.css",
      ),
      lodash: path.resolve(__dirname, "node_modules/lodash"),
      openapi: path.resolve(srcRoot, "openapi"),
      plugins: path.resolve(srcRoot, "plugins"),
      "react-markdown": path.resolve(
        __dirname,
        "node_modules/react-markdown/index.js",
      ),
      "react-router-dom": path.resolve(
        __dirname,
        "node_modules/react-router-dom/dist/index.js",
      ),
      "rehype-katex": path.resolve(
        __dirname,
        "node_modules/rehype-katex/index.js",
      ),
      "remark-gfm": path.resolve(
        __dirname,
        "node_modules/remark-gfm/index.js",
      ),
      "remark-math": path.resolve(
        __dirname,
        "node_modules/remark-math/index.js",
      ),
      state: path.resolve(srcRoot, "state"),
      utils: path.resolve(srcRoot, "utils"),
      zustand: path.resolve(__dirname, "node_modules/zustand"),
    },
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
