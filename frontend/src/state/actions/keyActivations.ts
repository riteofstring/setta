import { useSettings } from "state/stores/uiPreferenceStores";
import { isMacOs } from "utils/utils";
import {
  clearPressedModShortcut,
  getPressedKeys,
  handlePressedKeyRelease,
  hasPressedModShortcut,
  noteModShortcutPressed,
  recordPressedKey,
  resetPressedKeyState,
  startKeyDownCycle,
} from "./keyActivationPressedKeys";
import {
  createKeyActivationShortcutInfo,
  getModShortcutInfo,
  runShortcutKeyUpActions,
  type ShortcutInfo,
} from "./keyActivationShortcutInfo";
import { getIsInput } from "./keyShortcutInputPolicy";
import {
  getNormalizedEventCode,
  isShortcutPressed,
  modifierKeyCodes,
} from "./keyShortcutMatching";

function attachEventListenerAndReturnCleanup(
  attachTo: Document | Window,
  eventName: string,
  action: EventListener,
) {
  attachTo.addEventListener(eventName, action);
  return () => {
    attachTo.removeEventListener(eventName, action);
  };
}

function attachKeyDownListener(action: (event: KeyboardEvent) => void) {
  return attachEventListenerAndReturnCleanup(document, "keydown", action);
}

function attachKeyUpListener(action: (event: KeyboardEvent) => void) {
  return attachEventListenerAndReturnCleanup(document, "keyup", action);
}

export function attachKeyEventListeners() {
  const shortcuts = useSettings.getState().shortcuts;
  const cleanupFunctions: Array<() => void> = [];
  const isMacOsHost = isMacOs();
  const shortcutInfo = createKeyActivationShortcutInfo({
    shortcuts,
    isMacOsHost,
    getPressedKeys,
  });

  let cleanup = attachKeyDownListener((event) => {
    startKeyDownCycle();

    const eventCode = getNormalizedEventCode(event);
    if (eventCode && !modifierKeyCodes.has(eventCode)) {
      recordPressedKey(eventCode);
    }

    const isInput = getIsInput(event);

    for (const info of shortcutInfo) {
      if (
        isShortcutPressed(
          event,
          info.parsedShortcut,
          isMacOsHost,
          getPressedKeys(),
        )
      ) {
        if (info.ignoreWhenInInputField && isInput) {
          continue;
        }
        if (info.shouldPreventDefault) {
          event.preventDefault();
        }
        if (event.repeat && !info.allowRepeat) {
          continue;
        }
        info.keyDownAction(event);
        info.wasPressed = true;
        if (info.parsedShortcut.mod) {
          noteModShortcutPressed();
        }
      } else if (info.wasPressed && !info.keepKeyDownCondition?.(event)) {
        info.keyUpAction?.(event);
        info.wasPressed = false;
      }
    }
  });
  cleanupFunctions.push(cleanup);

  cleanup = attachKeyUpListener((event) => {
    handlePressedKeyRelease({
      eventCode: getNormalizedEventCode(event),
      eventKey: event.key,
      isMacOsHost,
    });
    runShortcutKeyUpActions(event, shortcutInfo);
  });
  cleanupFunctions.push(cleanup);

  cleanup = attachEventListenerAndReturnCleanup(window, "blur", (event) => {
    resetPressedKeyState();
    runShortcutKeyUpActions(event, shortcutInfo);
  });
  cleanupFunctions.push(cleanup);

  if (isMacOsHost) {
    cleanup = specialModTabCase(shortcutInfo);
    if (cleanup) {
      cleanupFunctions.push(cleanup);
    }
  }

  return () => {
    cleanupFunctions.forEach((cleanupFn) => cleanupFn());
  };
}

// When you do mod + tab in macos, but change your mind and don't change programs
// neither blur nor keyup get triggered. So shortcuts that consist of just "mod"
// never call their keyup action.
// The workaround here is to detect mouse movement
// (something the user will almost certainly do if they don't press any keys),
// and if metaKey is false, then call the keyup actions if necessary.
// If the user doesn't move the mouse, then they'll probably press a key, in which case
// the keyup action will be called in the keydown listener (since wasPressed is true).
function specialModTabCase(shortcutInfo: Array<ShortcutInfo>) {
  const modShortcuts = getModShortcutInfo(shortcutInfo);
  if (modShortcuts.length === 0) {
    return null;
  }

  return attachEventListenerAndReturnCleanup(window, "mousemove", (event) => {
    if (!(event instanceof MouseEvent)) {
      return;
    }
    if (hasPressedModShortcut() && !event.metaKey) {
      modShortcuts.forEach((info) => {
        if (info.wasPressed) {
          info.keyUpAction?.(event);
          info.wasPressed = false;
        }
      });
      clearPressedModShortcut();
    }
  });
}
