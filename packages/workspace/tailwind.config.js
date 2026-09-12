import containerQueries from "@tailwindcss/container-queries";
import typography from "@tailwindcss/typography";
import workspacePreset from "./tailwind-preset.mjs";

export default {
  presets: [workspacePreset],

  darkMode: ["selector", ".setta-workspace.setta-workspace-dark"],
  content: ["./src/**/*.{ts,tsx}"],

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

  plugins: [containerQueries, typography({ className: "setta-prose" })],
};
