import { runParamShortcut } from "./keyActivationHandlers";
import type {
  KeyAction,
  KeyUpAction,
  SettingsShortcuts,
  ShortcutRegistration,
  ShortcutTrackingName,
} from "./keyShortcutRegistrationTypes";

export function createShortcutRegistration(
  keyCombo: string | null | undefined,
  keyDownAction: KeyAction,
  keyUpAction: KeyUpAction | null = null,
  allowRepeat = false,
): ShortcutRegistration {
  return {
    keyCombo,
    keyDownAction,
    keyUpAction,
    allowRepeat,
    trackingName: null,
  };
}

export function createTrackedShortcutRegistration(
  shortcuts: SettingsShortcuts,
  trackingName: ShortcutTrackingName,
  keyDownAction: KeyAction,
  keyUpAction: KeyUpAction | null = null,
  allowRepeat = false,
): ShortcutRegistration {
  return {
    keyCombo: shortcuts[trackingName],
    keyDownAction,
    keyUpAction,
    allowRepeat,
    trackingName,
  };
}

export function createParamShortcutRegistration(
  keyCombo: string | null | undefined,
  action: () => boolean | void,
  allowRepeat = false,
): ShortcutRegistration {
  return createShortcutRegistration(
    keyCombo,
    (event: KeyboardEvent) => runParamShortcut(action, event),
    null,
    allowRepeat,
  );
}
