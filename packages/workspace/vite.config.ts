import { defineConfig } from "vitest/config";
import {
  bundledEditorNotices,
  externalWorkspaceDependency,
} from "./editorBuild";

export default defineConfig({
  plugins: [bundledEditorNotices()],
  build: {
    lib: {
      entry: { index: "src/index.ts", browser: "src/browser/index.ts" },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },

    minify: false,
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      external: externalWorkspaceDependency,
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],

    alias: {
      "@uiw/react-codemirror": "@uiw/react-codemirror/esm/index.js",
      "@uiw/codemirror-theme-github":
        "@uiw/codemirror-theme-github/esm/index.js",
      "@uiw/codemirror-themes": "@uiw/codemirror-themes/esm/index.js",
      "@uiw/codemirror-extensions-basic-setup":
        "@uiw/codemirror-extensions-basic-setup/esm/index.js",
    },
  },
});
