import type {
  AppearanceShortcutsSettings,
  AppearanceWorkspaceNavigationShortcut,
} from "@generated/backend";

import type { PaneDirection } from "./layout-engine-helpers";
import { useAppearanceStore } from "../stores/appearance-store";

interface WorkspaceShortcutKeyEvent {
  altKey: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

const defaultWorkspaceNavigationShortcut: AppearanceWorkspaceNavigationShortcut = "mod_alt_arrows";

const defaultShortcutsSettings: AppearanceShortcutsSettings = {
  workspaceNavigation: defaultWorkspaceNavigationShortcut,
};

function currentShortcutsSettings(): AppearanceShortcutsSettings {
  return (
    (useAppearanceStore.getState().draft ?? useAppearanceStore.getState().settings)?.shortcuts ??
    defaultShortcutsSettings
  );
}

export function isWorkspaceArrowNavigationShortcut(
  event: WorkspaceShortcutKeyEvent,
  shortcuts: AppearanceShortcutsSettings = currentShortcutsSettings(),
): boolean {
  return isWorkspaceArrowKey(event.key) && workspaceShortcutModifierMatches(event, shortcuts);
}

export function workspaceShortcutModifierMatches(
  event: WorkspaceShortcutKeyEvent,
  shortcuts: AppearanceShortcutsSettings = currentShortcutsSettings(),
): boolean {
  if (!event.altKey) {
    return false;
  }
  switch (shortcuts.workspaceNavigation) {
    case "mod_alt_arrows":
      return event.metaKey;
    case "ctrl_alt_arrows":
      return Boolean(event.ctrlKey);
    default:
      assertNever(shortcuts.workspaceNavigation);
  }
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
): key is "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" {
  return key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp";
}

function assertNever(value: never): never {
  throw new Error(`unsupported workspace navigation shortcut: ${String(value)}`);
}
