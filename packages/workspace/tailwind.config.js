import containerQueries from "@tailwindcss/container-queries";
import typography from "@tailwindcss/typography";
import workspacePreset from "./tailwind-preset.mjs";

// Compiles the package-owned stylesheet from package source alone. Preflight stays off because
// the compiled sheet must not reset host styles; the package-scoped subset it needs lives in
// src/styles/scopedBase.css. optimizeUniversalDefaults keeps the utility variable defaults on
// the utility classes themselves instead of a host-wide `*` rule, so every emitted selector is
// scoped to a class the package renders.
export default {
  presets: [workspacePreset],
  // Dark variants follow package-owned roots, including portals mounted outside the canvas.
  // The compound selector keeps appearance scoped instead of depending on a host html.dark class.
  darkMode: ["selector", ".setta-workspace.setta-workspace-dark"],
  content: ["./src/**/*.{ts,tsx}"],
  // Python Canvas renders main's ListRoot incrementer through the registered-content seam. Keep
  // that exact donor utility set in the package stylesheet even though the consumer owns markup.
  safelist: [
    "-mx-2",
    "items-center",
    "gap-1",
    "rounded-lg",
    "bg-setta-100",
    "pl-2",
    "pr-1",
    "dark:bg-setta-950",
    "text-setta-300",
    "dark:text-setta-600",
    "text-[10px]",
    "font-bold",
    "text-setta-500",
    "max-w-[3ch]",
    "cursor-auto",
    "rounded-md",
    "bg-white",
    "px-2",
    "text-xs",
    "focus-visible:ring-2",
    "dark:bg-setta-800",
    "dark:text-setta-300",
    "rounded-full",
  ],
  corePlugins: { preflight: false },
  experimental: { optimizeUniversalDefaults: true },
  // The built-in Text section renders Markdown through the same typography plugin the reference
  // uses, compiled under a package-owned class name so the shipped stylesheet cannot redefine a
  // host's own `prose` classes.
  plugins: [containerQueries, typography({ className: "setta-prose" })],
};
