import { keyActivationCommands } from "./keyActivationCommands";
import { isTabLikeShortcut } from "./keyShortcutMatching";
import {
  getFocusShortcutRegistrations,
  getPaneNavigationShortcutRegistrations,
} from "./keyShortcutNavigationRegistrations";
import {
  createParamShortcutRegistration,
  createShortcutRegistration,
} from "./keyShortcutRegistrationFactories";
import type {
  SettingsShortcuts,
  ShortcutRegistration,
} from "./keyShortcutRegistrationTypes";
import { getTooltipShortcutRegistrations } from "./keyShortcutTooltipRegistrations";
import {
  getCanvasShortcutRegistrations,
  getCreationShortcutRegistrations,
  getInteractionModeShortcutRegistrations,
  getProjectCommandShortcutRegistrations,
} from "./keyShortcutWorkspaceRegistrations";
export type {
  KeyAction,
  KeyActionEvent,
  KeyUpAction,
  ShortcutRegistration,
  ShortcutTrackingName,
} from "./keyShortcutRegistrationTypes";

function getParamShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  const registrations: Array<ShortcutRegistration> = [];

  if (!isTabLikeShortcut(shortcuts.paramIndentShortcut)) {
    registrations.push(
      createParamShortcutRegistration(
        shortcuts.paramIndentShortcut,
        keyActivationCommands.indentSelectedParams,
      ),
    );
  }

  if (!isTabLikeShortcut(shortcuts.paramUnindentShortcut)) {
    registrations.push(
      createParamShortcutRegistration(
        shortcuts.paramUnindentShortcut,
        keyActivationCommands.unindentSelectedParams,
      ),
    );
  }

  registrations.push(
    createParamShortcutRegistration(
      shortcuts.paramMoveUpShortcut,
      keyActivationCommands.moveSelectedParamsUp,
      true,
    ),
  );
  registrations.push(
    createParamShortcutRegistration(
      shortcuts.paramMoveDownShortcut,
      keyActivationCommands.moveSelectedParamsDown,
      true,
    ),
  );
  registrations.push(
    createShortcutRegistration(
      shortcuts.paramSelect,
      keyActivationCommands.activateParamSelect,
      keyActivationCommands.deactivateParamSelect,
    ),
  );

  return registrations;
}

export function createShortcutRegistrations(
  shortcuts: SettingsShortcuts,
): Array<ShortcutRegistration> {
  return [
    ...getFocusShortcutRegistrations(shortcuts),
    ...getCreationShortcutRegistrations(shortcuts),
    ...getTooltipShortcutRegistrations(shortcuts),
    ...getProjectCommandShortcutRegistrations(shortcuts),
    ...getParamShortcutRegistrations(shortcuts),
    ...getCanvasShortcutRegistrations(shortcuts),
    ...getPaneNavigationShortcutRegistrations(shortcuts),
    ...getInteractionModeShortcutRegistrations(shortcuts),
  ];
}
