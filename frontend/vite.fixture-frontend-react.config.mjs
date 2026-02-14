import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
  resolve: {
    alias: {
      react: resolve(__dirname, "node_modules/react/cjs/react.production.js"),
      "react-dom/client": resolve(
        __dirname,
        "node_modules/react-dom/cjs/react-dom-client.production.js",
      ),
    },
  },
  build: {
    outDir: resolve(
      __dirname,
      "../tests/fixtures/plugins/frontend-react/frontend/dist",
    ),
    emptyOutDir: true,
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(
        __dirname,
        "../tests/fixtures/plugins/frontend-react/frontend/src/index.jsx",
      ),
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "index",
    },
  },
});
