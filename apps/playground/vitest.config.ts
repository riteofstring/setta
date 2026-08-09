import { defineConfig } from "vitest/config";

// Test-only configuration: the playground dev server and build stay on vite's zero-config
// entry (index.html); this file exists so the host-presentation regression runs with the
// same setup shape as the package suite (per-file jsdom environments, the ResizeObserver
// stub installed before any test module loads).
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
