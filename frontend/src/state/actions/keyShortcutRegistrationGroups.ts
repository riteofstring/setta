import { getPaneNavigationShortcutRegistrations } from "./keyShortcutNavigationRegistrations";
import type {
  SettingsShortcuts,
  ShortcutRegistration,
} from "./keyShortcutRegistrationTypes";
import { getCanvasShortcutRegistrations } from "./keyShortcutWorkspaceRegistrations";

export {
  getFocusShortcutRegistrations,
  getPaneNavigationShortcutRegistrations,
} from "./keyShortcutNavigationRegistrations";
export { getTooltipShortcutRegistrations } from "./keyShortcutTooltipRegistrations";
export {
  getCanvasShortcutRegistrations,
  getCreationShortcutRegistrations,
  getInteractionModeShortcutRegistrations,
  getProjectCommandShortcutRegistrations,
} from "./keyShortcutWorkspaceRegistrations";

export function getCanvasAndPaneShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    ...getCanvasShortcutRegistrations(shortcuts),
    ...getPaneNavigationShortcutRegistrations(shortcuts),
  ];
}
