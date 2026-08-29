import { defineConfig } from "vitest/config";

// Test-only configuration: the playground dev server and build stay on vite's zero-config
// entry (index.html); this file exists so the host-presentation regression runs with the
// same setup shape as the package suite (per-file jsdom environments, the ResizeObserver
// stub installed before any test module loads).
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // The built package imports the @uiw CodeMirror wrappers, which ship no `exports` map;
    // the test runner's node-style resolution would natively require their CJS mains and
    // split the `@codemirror/*` modules into CJS and ESM instances, breaking CodeMirror's
    // extension instanceof checks. Mirrors packages/workspace/vite.config.ts.
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
