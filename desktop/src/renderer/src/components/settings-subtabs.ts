import { BrainCircuit, Gauge, KeyRound, Keyboard, Palette, type LucideIcon } from "lucide-react";

export type SettingsSubtab = "theme" | "roles" | "shortcuts" | "developer" | "codex-account";

export const settingsSubtabs = [
  { Icon: Palette, id: "theme", label: "Theme" },
  { Icon: BrainCircuit, id: "roles", label: "AI Roles" },
  { Icon: Keyboard, id: "shortcuts", label: "Shortcuts" },
  { Icon: Gauge, id: "developer", label: "Developer" },
  { Icon: KeyRound, id: "codex-account", label: "Codex Account" },
] as const satisfies Array<{
  Icon: LucideIcon;
  id: SettingsSubtab;
  label: string;
}>;
