import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pluginFrontendDir = dirname(fileURLToPath(import.meta.url));
const repoRootDir = resolve(pluginFrontendDir, "../../..");
const frontendPackageRequire = createRequire(
  resolve(repoRootDir, "frontend/package.json"),
);
const frontendSdkPackageRequire = createRequire(
  resolve(repoRootDir, "frontend/plugin-sdk/app-subsystem/package.json"),
);

const resolvePackageRoot = (requireFn, specifier) => {
  let currentDir = dirname(requireFn.resolve(specifier));
  while (!existsSync(resolve(currentDir, "package.json"))) {
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Could not resolve package root for ${specifier}`);
    }
    currentDir = parentDir;
  }
  return currentDir;
};
const resolveFrontendDependency = (specifier) =>
  frontendPackageRequire.resolve(specifier);
const resolveFrontendDependencyRoot = (specifier) =>
  resolvePackageRoot(frontendPackageRequire, specifier);
const resolveFrontendDependencySubpath = (specifier, subpath) =>
  resolve(resolvePackageRoot(frontendPackageRequire, specifier), subpath);
const resolveFrontendSdkArtifact = (specifier) =>
  frontendSdkPackageRequire.resolve(specifier);

export default {
  root: pluginFrontendDir,
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
  resolve: {
    alias: {
      // Consume the explicit SDK package surface instead of host source aliases.
      "@setta/app-subsystem-frontend-sdk": resolveFrontendSdkArtifact(
        "./dist/index.js",
      ),
      "@radix-ui/react-accordion": resolveFrontendDependencyRoot(
        "@radix-ui/react-accordion",
      ),
      "@radix-ui/react-dialog": resolveFrontendDependencyRoot(
        "@radix-ui/react-dialog",
      ),
      "@radix-ui/react-switch": resolveFrontendDependencyRoot(
        "@radix-ui/react-switch",
      ),
      "@json-render/core": resolveFrontendDependencySubpath(
        "@json-render/core",
        "dist/index.mjs",
      ),
      "@json-render/react": resolveFrontendDependencySubpath(
        "@json-render/react",
        "dist/index.mjs",
      ),
      "katex/dist/katex.min.css": resolveFrontendDependencySubpath(
        "katex",
        "dist/katex.min.css",
      ),
      lodash: resolveFrontendDependencyRoot("lodash"),
      react: resolveFrontendDependencyRoot("react"),
      "react-icons/hi2": resolveFrontendDependencySubpath(
        "react-icons",
        "hi2/index.js",
      ),
      "react/jsx-dev-runtime": resolveFrontendDependency(
        "react/jsx-dev-runtime",
      ),
      "react/jsx-runtime": resolveFrontendDependency(
        "react/jsx-runtime",
      ),
      "react-dom": resolveFrontendDependencyRoot("react-dom"),
      "react-dom/client": resolveFrontendDependency("react-dom/client"),
      "react-markdown": resolveFrontendDependencySubpath(
        "react-markdown",
        "index.js",
      ),
      "react-router-dom": resolveFrontendDependencySubpath(
        "react-router-dom",
        "dist/index.js",
      ),
      "rehype-katex": resolveFrontendDependencySubpath(
        "rehype-katex",
        "index.js",
      ),
      "remark-gfm": resolveFrontendDependencySubpath("remark-gfm", "index.js"),
      "remark-math": resolveFrontendDependencySubpath("remark-math", "index.js"),
      zustand: resolveFrontendDependencyRoot("zustand"),
      "zustand/traditional": resolveFrontendDependency(
        "zustand/traditional",
      ),
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
