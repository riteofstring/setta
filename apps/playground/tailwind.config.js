import workspacePreset from "@setta/workspace/tailwind-preset";

// Scanning the package source is the provisional Phase 1 arrangement; Phase 2 ships the
// package-owned compiled stylesheet instead.
export default {
  presets: [workspacePreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/workspace/src/**/*.{ts,tsx}"],
};
