import type { AppearanceMasterVoiceShortcut } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";

export interface MasterShortcutEvent {
  altKey: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

const defaultMasterVoiceShortcut: AppearanceMasterVoiceShortcut = "mod_shift_k";

interface MasterVoiceModifierPattern {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function isMasterOverlayShortcut(event: MasterShortcutEvent): boolean {
  return (
    event.key.toLowerCase() === "k" &&
    !event.altKey &&
    !event.shiftKey &&
    (event.metaKey || Boolean(event.ctrlKey))
  );
}

export function isMasterVoiceShortcut(
  event: MasterShortcutEvent,
  platform: DesktopPlatform,
  shortcut: AppearanceMasterVoiceShortcut = defaultMasterVoiceShortcut,
): boolean {
  return (
    isShiftK(event) &&
    eventMatchesModifierPattern(event, masterVoiceModifierPattern(platform, shortcut))
  );
}

export function masterOverlayShortcutLabel(platform: DesktopPlatform): string {
  return platform === "darwin" ? "⌘K" : "Ctrl+K";
}

export function masterVoiceShortcutLabel(
  platform: DesktopPlatform,
  shortcut: AppearanceMasterVoiceShortcut = defaultMasterVoiceShortcut,
): string {
  return masterVoiceShortcutParts(platform, shortcut).join("+");
}

export function masterVoiceShortcutParts(
  platform: DesktopPlatform,
  shortcut: AppearanceMasterVoiceShortcut = defaultMasterVoiceShortcut,
): string[] {
  switch (shortcut) {
    case "mod_shift_k":
      return [platform === "darwin" ? "⌘" : "Ctrl", "Shift", "K"];
    case "ctrl_shift_k":
      return ["Ctrl", "Shift", "K"];
    case "alt_shift_k":
      return ["Alt", "Shift", "K"];
    default:
      return assertNever(shortcut);
  }
}

function isShiftK(event: MasterShortcutEvent): boolean {
  return event.key.toLowerCase() === "k" && event.shiftKey;
}

function masterVoiceModifierPattern(
  platform: DesktopPlatform,
  shortcut: AppearanceMasterVoiceShortcut,
): MasterVoiceModifierPattern {
  switch (shortcut) {
    case "mod_shift_k":
      return platform === "darwin"
        ? { altKey: false, ctrlKey: false, metaKey: true }
        : { altKey: false, ctrlKey: true, metaKey: false };
    case "ctrl_shift_k":
      return { altKey: false, ctrlKey: true, metaKey: false };
    case "alt_shift_k":
      return { altKey: true, ctrlKey: false, metaKey: false };
    default:
      return assertNever(shortcut);
  }
}

function eventMatchesModifierPattern(
  event: MasterShortcutEvent,
  pattern: MasterVoiceModifierPattern,
): boolean {
  return (
    event.altKey === pattern.altKey &&
    Boolean(event.ctrlKey) === pattern.ctrlKey &&
    event.metaKey === pattern.metaKey
  );
}

function assertNever(value: never): never {
  throw new Error(`Unsupported master shortcut value: ${String(value)}`);
}
