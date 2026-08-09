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
  },
});
