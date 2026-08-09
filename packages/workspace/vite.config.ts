import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    // The compiled artifact stays readable for parity debugging; consumers minify in their own
    // bundling and the source map covers the rest.
    minify: false,
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      // Every bare specifier is a declared runtime dependency or peer; only package-relative
      // modules bundle (the resolved entry arrives as an absolute path).
      // check-package-boundary.mjs --built verifies the emitted import list.
      external: (id) => !id.startsWith(".") && !id.startsWith("/"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // The @uiw packages ship no `exports` map, so the test runner's node-style resolution
    // (no mainFields) lands on their CJS mains and natively requires them — dragging in CJS
    // copies of the `@codemirror/*` packages while package sources import the ESM builds.
    // Two module instances of the same versions break CodeMirror's extension instanceof
    // checks. Aliasing the @uiw entries to their ESM files keeps tests on the single-instance
    // ESM graph the browser build produces; `test.alias` never touches the build output.
    alias: {
      "@uiw/react-codemirror": "@uiw/react-codemirror/esm/index.js",
      "@uiw/codemirror-theme-github": "@uiw/codemirror-theme-github/esm/index.js",
      "@uiw/codemirror-themes": "@uiw/codemirror-themes/esm/index.js",
      "@uiw/codemirror-extensions-basic-setup":
        "@uiw/codemirror-extensions-basic-setup/esm/index.js",
    },
  },
});
