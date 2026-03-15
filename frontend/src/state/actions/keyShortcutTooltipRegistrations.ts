import { keyActivationCommands } from "./keyActivationCommands";
import {
  createShortcutRegistration,
  createTrackedShortcutRegistration,
} from "./keyShortcutRegistrationFactories";
import type {
  SettingsShortcuts,
  ShortcutRegistration,
} from "./keyShortcutRegistrationTypes";

export function getTooltipShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createTrackedShortcutRegistration(
      shortcuts,
      "showTooltipShortcut",
      keyActivationCommands.enableFloatingBox,
      keyActivationCommands.disableFloatingBox,
    ),
    createShortcutRegistration(
      shortcuts.tooltipToPlaintextShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(false),
    ),
    createShortcutRegistration(
      shortcuts.tooltipToMarkdownShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(true),
    ),
    createShortcutRegistration(
      shortcuts.freezeTooltipShortcut,
      keyActivationCommands.freezeFloatingBox,
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipToPlaintextShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(false),
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipToMarkdownShortcut,
      keyActivationCommands.getConvertFloatingBoxToSectionFn(true),
    ),
    createTrackedShortcutRegistration(
      shortcuts,
      "incrementTooltipPageShortcut",
      keyActivationCommands.incrementFloatingBoxIdx,
    ),
    createTrackedShortcutRegistration(
      shortcuts,
      "decrementTooltipPageShortcut",
      keyActivationCommands.decrementFloatingBoxIdx,
    ),
    createTrackedShortcutRegistration(
      shortcuts,
      "copyTooltipTextShortcut",
      keyActivationCommands.copyFloatingBoxContent,
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipIncrementShortcut,
      keyActivationCommands.incrementFrozenFloatingBoxIdx,
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipDecrementShortcut,
      keyActivationCommands.decrementFrozenFloatingBoxIdx,
    ),
    createShortcutRegistration(
      shortcuts.frozenTooltipCopyShortcut,
      keyActivationCommands.copyFrozenFloatingBoxContent,
    ),
  ];
}
