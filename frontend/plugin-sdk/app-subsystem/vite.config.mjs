import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));

export default {
  root: packageDir,
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
  build: {
    outDir: resolve(packageDir, "dist"),
    emptyOutDir: true,
    target: "es2020",
    minify: false,
    sourcemap: false,
    lib: {
      entry: resolve(packageDir, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
  },
};
