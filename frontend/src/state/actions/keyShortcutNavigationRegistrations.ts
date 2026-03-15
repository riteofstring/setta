import {
  showParamUITypeTab,
  showProjectOverviewTab,
  showVersionsTab,
} from "components/Panes/paneFns";
import { focusAdjacentTopLevelSection, focusScope } from "utils/focusManager";
import { handleTabKeyDown } from "./keyActivationHandlers";
import { createShortcutRegistration } from "./keyShortcutRegistrationFactories";
import type {
  SettingsShortcuts,
  ShortcutRegistration,
} from "./keyShortcutRegistrationTypes";

export function getFocusShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createShortcutRegistration("tab", handleTabKeyDown),
    createShortcutRegistration("shift + tab", handleTabKeyDown),
    createShortcutRegistration(shortcuts.focusHeaderShortcut, () =>
      focusScope("header"),
    ),
    createShortcutRegistration(shortcuts.focusOverviewShortcut, () =>
      focusScope("overview"),
    ),
    createShortcutRegistration(shortcuts.focusCanvasShortcut, () =>
      focusScope("canvas"),
    ),
    createShortcutRegistration(shortcuts.focusUiEditorShortcut, () =>
      focusScope("ui-editor"),
    ),
    createShortcutRegistration(shortcuts.nextTopLevelSectionShortcut, () =>
      focusAdjacentTopLevelSection({ direction: 1 }),
    ),
    createShortcutRegistration(shortcuts.prevTopLevelSectionShortcut, () =>
      focusAdjacentTopLevelSection({ direction: -1 }),
    ),
  ];
}

export function getPaneNavigationShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    createShortcutRegistration(
      shortcuts.showVersionsTabShortcut,
      showVersionsTab,
    ),
    createShortcutRegistration(
      shortcuts.showParamUITypeTabShortcut,
      showParamUITypeTab,
    ),
    createShortcutRegistration(
      shortcuts.showProjectOverviewTabShortcut,
      showProjectOverviewTab,
    ),
  ];
}
