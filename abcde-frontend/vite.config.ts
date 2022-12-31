/// <reference types="vite" />
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import svgrPlugin from "vite-plugin-svgr";
import viteTsconfigPaths from "vite-tsconfig-paths";
import type { UserConfig as VitestUserConfigInterface } from "vitest/config";

const vitestConfig: VitestUserConfigInterface = {
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), viteTsconfigPaths(), svgrPlugin()],
  server: {
    port: 3000,
    open: true,
    fs: {
      // Allow serving files from one level up to the project root
      allow: [searchForWorkspaceRoot(process.cwd()), "../abcde-test"],
    },
  },
  test: vitestConfig.test,
});
