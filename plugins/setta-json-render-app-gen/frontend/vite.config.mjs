import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pluginFrontendDir = dirname(fileURLToPath(import.meta.url));
const repoRootDir = resolve(pluginFrontendDir, "../../..");
const sharedFrontendDir = resolve(repoRootDir, "frontend");
const sharedFrontendSrcDir = resolve(sharedFrontendDir, "src");
const sharedNodeModulesDir = resolve(sharedFrontendDir, "node_modules");

export default {
  root: sharedFrontendDir,
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
  resolve: {
    alias: {
      "@setta/app-subsystem-frontend-sdk": resolve(
        repoRootDir,
        "frontend/plugin-sdk/app-subsystem/src",
      ),
      "@radix-ui/react-accordion": resolve(
        sharedNodeModulesDir,
        "@radix-ui/react-accordion",
      ),
      "@radix-ui/react-dialog": resolve(
        sharedNodeModulesDir,
        "@radix-ui/react-dialog",
      ),
      "@radix-ui/react-switch": resolve(
        sharedNodeModulesDir,
        "@radix-ui/react-switch",
      ),
      "@json-render/core": resolve(
        sharedNodeModulesDir,
        "@json-render/core/dist/index.mjs",
      ),
      "@json-render/react": resolve(
        sharedNodeModulesDir,
        "@json-render/react/dist/index.mjs",
      ),
      components: resolve(sharedFrontendSrcDir, "components"),
      forks: resolve(sharedFrontendSrcDir, "forks"),
      "katex/dist/katex.min.css": resolve(
        sharedNodeModulesDir,
        "katex/dist/katex.min.css",
      ),
      lodash: resolve(sharedNodeModulesDir, "lodash"),
      openapi: resolve(sharedFrontendSrcDir, "openapi"),
      plugins: resolve(sharedFrontendSrcDir, "plugins"),
      react: resolve(sharedNodeModulesDir, "react"),
      "react-icons/hi2": resolve(sharedNodeModulesDir, "react-icons/hi2/index.js"),
      "react/jsx-dev-runtime": resolve(
        sharedNodeModulesDir,
        "react/jsx-dev-runtime.js",
      ),
      "react/jsx-runtime": resolve(
        sharedNodeModulesDir,
        "react/jsx-runtime.js",
      ),
      "react-dom": resolve(sharedNodeModulesDir, "react-dom"),
      "react-dom/client": resolve(
        sharedNodeModulesDir,
        "react-dom/client.js",
      ),
      "react-markdown": resolve(
        sharedNodeModulesDir,
        "react-markdown/index.js",
      ),
      "react-router-dom": resolve(
        sharedNodeModulesDir,
        "react-router-dom/dist/index.js",
      ),
      "rehype-katex": resolve(sharedNodeModulesDir, "rehype-katex/index.js"),
      "remark-gfm": resolve(sharedNodeModulesDir, "remark-gfm/index.js"),
      "remark-math": resolve(sharedNodeModulesDir, "remark-math/index.js"),
      state: resolve(sharedFrontendSrcDir, "state"),
      utils: resolve(sharedFrontendSrcDir, "utils"),
      zustand: resolve(sharedNodeModulesDir, "zustand"),
    },
    dedupe: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/lint",
      "@codemirror/language",
      "@codemirror/autocomplete",
    ],
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
      cssFileName: "index",
    },
  },
};
