import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgrPlugin from "vite-plugin-svgr";
import viteTsconfigPaths from "vite-tsconfig-paths";
import {C} from "./src/utils/c.js"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), viteTsconfigPaths(), svgrPlugin()],
  server: {
    host: C.DEFAULT_HOST,
    port: C.DEV_MODE_FRONTEND_PORT,
    open: false,
  },
  preview: {
    port: C.DEV_MODE_FRONTEND_PORT,
  },
});
