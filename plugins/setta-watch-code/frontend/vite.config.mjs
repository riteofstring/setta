import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pluginFrontendDir = dirname(fileURLToPath(import.meta.url));

export default {
  root: pluginFrontendDir,
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
  build: {
    outDir: resolve(pluginFrontendDir, "dist"),
    emptyOutDir: true,
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(pluginFrontendDir, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "setta-watch-code-frontend",
    },
  },
};
