import { BrainCircuit, KeyRound, Palette, type LucideIcon, Volume2 } from "lucide-react";

export type SettingsSubtab = "theme" | "roles" | "speech" | "codex-account";

export const settingsSubtabs = [
  { Icon: Palette, id: "theme", label: "Theme" },
  { Icon: BrainCircuit, id: "roles", label: "AI Roles" },
  { Icon: Volume2, id: "speech", label: "Voices" },
  { Icon: KeyRound, id: "codex-account", label: "Codex Account" },
] as const satisfies Array<{
  Icon: LucideIcon;
  id: SettingsSubtab;
  label: string;
}>;
