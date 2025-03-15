import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",
      fastRefresh: false,
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.js"],
    include: ["**/*.{test,spec}.{js,jsx,ts,tsx}"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
    reporters: ["default"],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      components: resolve(__dirname, "./src/components"),
      state: resolve(__dirname, "./src/state"),
      services: resolve(__dirname, "./src/services"),
      utils: resolve(__dirname, "./src/utils"),
      constants: resolve(__dirname, "./src/constants"),
      forks: resolve(__dirname, "./src/forks"),
      react: resolve(__dirname, "./node_modules/react"),
      "react-dom": resolve(__dirname, "./node_modules/react-dom"),
    },
  },
});
