import workspacePreset from "@setta/workspace/tailwind-preset";

// The playground's Tailwind covers only its own host chrome; the package surface arrives fully
// compiled through `@setta/workspace/styles.css`. The preset supplies the setta palette the host
// chrome shares with the reference application shell.
export default {
  presets: [workspacePreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
};
