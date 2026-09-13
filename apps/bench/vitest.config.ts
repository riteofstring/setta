import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const workspaceTestSource = fileURLToPath(
  new URL("../../packages/workspace/src/index.ts", import.meta.url),
);

export default defineConfig({
  test: {
    alias: {
      "@setta/workspace": workspaceTestSource,
      "@uiw/codemirror-extensions-basic-setup":
        "@uiw/codemirror-extensions-basic-setup/esm/index.js",
      "@uiw/codemirror-theme-github":
        "@uiw/codemirror-theme-github/esm/index.js",
      "@uiw/codemirror-themes": "@uiw/codemirror-themes/esm/index.js",
      "@uiw/react-codemirror": "@uiw/react-codemirror/esm/index.js",
    },
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
