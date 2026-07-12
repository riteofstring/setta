import { Bot, Gauge, KeyRound, Keyboard, Palette, Terminal, type LucideIcon } from "lucide-react";

export type SettingsSubtab =
  | "theme"
  | "chat-defaults"
  | "shortcuts"
  | "developer"
  | "codex-account"
  | "terminal-profiles";

export const settingsSubtabs = [
  { Icon: Palette, id: "theme", label: "Theme" },
  { Icon: Bot, id: "chat-defaults", label: "Chat Defaults" },
  { Icon: Keyboard, id: "shortcuts", label: "Shortcuts" },
  { Icon: Gauge, id: "developer", label: "Developer" },
  { Icon: KeyRound, id: "codex-account", label: "Codex Account" },
  { Icon: Terminal, id: "terminal-profiles", label: "Terminal Profiles" },
] as const satisfies Array<{
  Icon: LucideIcon;
  id: SettingsSubtab;
  label: string;
}>;
