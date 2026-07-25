import type {
  AppearanceMasterVoiceShortcut,
  AppearanceShortcutsSettings,
  AppearanceWorkspaceNavigationShortcut,
} from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";

import type { PaneDirection } from "./layout-engine-helpers";
import { useAppearanceStore } from "../stores/appearance-store";

interface WorkspaceShortcutKeyEvent {
  altKey: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

interface WorkspaceShortcutModifierPattern {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

const defaultWorkspaceNavigationShortcut: AppearanceWorkspaceNavigationShortcut = "mod_arrows";
const defaultMasterVoiceShortcut: AppearanceMasterVoiceShortcut = "mod_shift_k";

export const defaultShortcutsSettings: AppearanceShortcutsSettings = {
  workspaceNavigation: defaultWorkspaceNavigationShortcut,
  masterVoice: defaultMasterVoiceShortcut,
};

function currentShortcutsSettings(): AppearanceShortcutsSettings {
  return (
    (useAppearanceStore.getState().draft ?? useAppearanceStore.getState().settings)?.shortcuts ??
    defaultShortcutsSettings
  );
}

export function isWorkspaceArrowNavigationShortcut(
  event: WorkspaceShortcutKeyEvent,
  platform: DesktopPlatform,
  workspaceRowsEnabled: boolean,
  shortcuts: AppearanceShortcutsSettings = currentShortcutsSettings(),
): boolean {
  return (
    isWorkspaceArrowKey(event.key, workspaceRowsEnabled) &&
    workspaceShortcutModifierMatches(event, platform, shortcuts)
  );
}

export function workspaceShortcutModifierMatches(
  event: WorkspaceShortcutKeyEvent,
  platform: DesktopPlatform,
  shortcuts: AppearanceShortcutsSettings = currentShortcutsSettings(),
): boolean {
  const pattern = workspaceShortcutModifierPattern(platform, shortcuts.workspaceNavigation);
  return (
    event.altKey === pattern.altKey &&
    Boolean(event.ctrlKey) === pattern.ctrlKey &&
    event.metaKey === pattern.metaKey
  );
}

function workspaceShortcutModifierPattern(
  platform: DesktopPlatform,
  shortcut: AppearanceWorkspaceNavigationShortcut,
): WorkspaceShortcutModifierPattern {
  const primary = platformPrimaryModifierPattern(platform);
  switch (shortcut) {
    case "mod_arrows":
      return { ...primary, altKey: false };
    case "ctrl_arrows":
      return { altKey: false, ctrlKey: true, metaKey: false };
    case "mod_alt_arrows":
      return { ...primary, altKey: true };
    case "ctrl_alt_arrows":
      return { altKey: true, ctrlKey: true, metaKey: false };
    default:
      return assertNever(shortcut);
  }
}

function platformPrimaryModifierPattern(
  platform: DesktopPlatform,
): Pick<WorkspaceShortcutModifierPattern, "ctrlKey" | "metaKey"> {
  return platform === "darwin"
    ? { ctrlKey: false, metaKey: true }
    : { ctrlKey: true, metaKey: false };
}

export function workspaceArrowDirection(key: string): PaneDirection {
  switch (key) {
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    default:
      throw new Error(`unsupported workspace focus key: ${key}`);
  }
}

function isWorkspaceArrowKey(
  key: string,
  workspaceRowsEnabled: boolean,
): key is "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    (workspaceRowsEnabled && (key === "ArrowDown" || key === "ArrowUp"))
  );
}

function assertNever(value: never): never {
  throw new Error(`unsupported workspace navigation shortcut: ${String(value)}`);
}
