import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureFrontendDir = dirname(fileURLToPath(import.meta.url));
const repoRootDir = resolve(fixtureFrontendDir, "../../../../..");
const sharedFrontendDir = resolve(repoRootDir, "frontend");

export default {
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
  resolve: {
    alias: [
      {
        find: /^react$/,
        replacement: resolve(sharedFrontendDir, "node_modules/react/index.js"),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: resolve(
          sharedFrontendDir,
          "node_modules/react/jsx-runtime.js",
        ),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: resolve(
          sharedFrontendDir,
          "node_modules/react/jsx-dev-runtime.js",
        ),
      },
      {
        find: /^react-dom\/client$/,
        replacement: resolve(
          sharedFrontendDir,
          "node_modules/react-dom/client.js",
        ),
      },
    ],
  },
  build: {
    outDir: resolve(fixtureFrontendDir, "dist"),
    emptyOutDir: true,
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(fixtureFrontendDir, "src/index.tsx"),
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "index",
    },
  },
};
