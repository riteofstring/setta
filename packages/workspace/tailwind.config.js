import containerQueries from "@tailwindcss/container-queries";
import workspacePreset from "./tailwind-preset.mjs";

// Compiles the package-owned stylesheet from package source alone. Preflight stays off because
// the compiled sheet must not reset host styles; the package-scoped subset it needs lives in
// src/styles/scopedBase.css. optimizeUniversalDefaults keeps the utility variable defaults on
// the utility classes themselves instead of a host-wide `*` rule, so every emitted selector is
// scoped to a class the package renders.
export default {
  presets: [workspacePreset],
  content: ["./src/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  experimental: { optimizeUniversalDefaults: true },
  plugins: [containerQueries],
};
