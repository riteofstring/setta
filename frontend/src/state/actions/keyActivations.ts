import { useSettings } from "state/stores/uiPreferenceStores";
import { isMacOs } from "utils/utils";
import {
  getIgnoreWhenInInputField,
  getIsInput,
} from "./keyShortcutInputPolicy";
import {
  getNormalizedEventCode,
  getShouldPreventDefault,
  isShortcutPressed,
  modifierKeyCodes,
  parseShortcut,
  type ParsedShortcut,
} from "./keyShortcutMatching";
import {
  createShortcutRegistrations,
  type KeyAction,
  type KeyActionEvent,
  type KeyUpAction,
  type ShortcutRegistration,
  type ShortcutTrackingName,
} from "./keyShortcutRegistrations";

type ShortcutInfo = {
  parsedShortcut: ParsedShortcut;
  wasPressed: boolean;
  shouldPreventDefault: boolean;
  keyDownAction: KeyAction;
  keyUpAction: KeyUpAction | null;
  allowRepeat: boolean;
  ignoreWhenInInputField: boolean;
  keepKeyDownCondition?: (event: KeyActionEvent) => boolean;
};

let keysPressed = new Set<string>();
let keysPressedTimeStamps = new Map<string, number>();
let aModShortcutWasPressed = false;

function resetKeysPressed() {
  keysPressed = new Set<string>();
  keysPressedTimeStamps = new Map<string, number>();
}

function deleteKeyPressed(key: string) {
  keysPressed.delete(key);
  keysPressedTimeStamps.delete(key);
}

function addKeyPressed(key: string) {
  keysPressed.add(key);
  keysPressedTimeStamps.set(key, Date.now());
}

function clearStaleKeys() {
  const now = Date.now();
  for (const [key, timestamp] of keysPressedTimeStamps) {
    if (now - timestamp > 100) {
      deleteKeyPressed(key);
    }
  }
}

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

function keyUpLoop(event: KeyActionEvent, shortcutInfo: Array<ShortcutInfo>) {
  for (const info of shortcutInfo) {
    if (info.wasPressed && !info.keepKeyDownCondition?.(event)) {
      info.wasPressed = false;
      info.keyUpAction?.(event);
    }
  }
}

function addKeepKeyDownConditions(
  shortcutInfoByName: Record<ShortcutTrackingName, ShortcutInfo | undefined>,
  isMacOsHost: boolean,
) {
  const showTooltipShortcut = shortcutInfoByName.showTooltipShortcut;
  const incrementTooltipPageShortcut =
    shortcutInfoByName.incrementTooltipPageShortcut;
  const decrementTooltipPageShortcut =
    shortcutInfoByName.decrementTooltipPageShortcut;
  const copyTooltipTextShortcut = shortcutInfoByName.copyTooltipTextShortcut;

  if (
    !showTooltipShortcut ||
    !incrementTooltipPageShortcut ||
    !decrementTooltipPageShortcut ||
    !copyTooltipTextShortcut
  ) {
    return;
  }

  showTooltipShortcut.keepKeyDownCondition = (event) =>
    event instanceof KeyboardEvent &&
    (isShortcutPressed(
      event,
      showTooltipShortcut.parsedShortcut,
      isMacOsHost,
      keysPressed,
    ) ||
      isShortcutPressed(
        event,
        incrementTooltipPageShortcut.parsedShortcut,
        isMacOsHost,
        keysPressed,
      ) ||
      isShortcutPressed(
        event,
        decrementTooltipPageShortcut.parsedShortcut,
        isMacOsHost,
        keysPressed,
      ) ||
      isShortcutPressed(
        event,
        copyTooltipTextShortcut.parsedShortcut,
        isMacOsHost,
        keysPressed,
      ));
}

export function attachKeyEventListeners() {
  const shortcuts = useSettings.getState().shortcuts;
  const shortcutInfoByName: Record<
    ShortcutTrackingName,
    ShortcutInfo | undefined
  > = {
    copyTooltipTextShortcut: undefined,
    decrementTooltipPageShortcut: undefined,
    incrementTooltipPageShortcut: undefined,
    showTooltipShortcut: undefined,
  };

  const cleanupFunctions: Array<() => void> = [];
  const shortcutInfo: Array<ShortcutInfo> = [];
  const isMacOsHost = isMacOs();

  for (const registration of createShortcutRegistrations(shortcuts)) {
    const {
      keyCombo,
      keyDownAction,
      keyUpAction,
      allowRepeat,
      trackingName,
    }: ShortcutRegistration = registration;
    if (!keyCombo) {
      continue;
    }

    const parsedShortcut = parseShortcut(keyCombo.toLowerCase());
    const info: ShortcutInfo = {
      parsedShortcut,
      wasPressed: false,
      shouldPreventDefault: getShouldPreventDefault(parsedShortcut),
      keyDownAction,
      keyUpAction,
      allowRepeat,
      ignoreWhenInInputField: getIgnoreWhenInInputField(
        parsedShortcut,
        isMacOsHost,
      ),
    };
    shortcutInfo.push(info);
    if (trackingName) {
      shortcutInfoByName[trackingName] = info;
    }
  }

  addKeepKeyDownConditions(shortcutInfoByName, isMacOsHost);

  let cleanup = attachKeyDownListener((event) => {
    if (aModShortcutWasPressed) {
      clearStaleKeys();
    }
    aModShortcutWasPressed = false;

    const eventCode = getNormalizedEventCode(event);
    if (eventCode && !modifierKeyCodes.has(eventCode)) {
      addKeyPressed(eventCode);
    }

    const isInput = getIsInput(event);

    for (const info of shortcutInfo) {
      if (
        isShortcutPressed(event, info.parsedShortcut, isMacOsHost, keysPressed)
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
          aModShortcutWasPressed = true;
        }
      } else if (info.wasPressed && !info.keepKeyDownCondition?.(event)) {
        info.keyUpAction?.(event);
        info.wasPressed = false;
      }
    }
  });
  cleanupFunctions.push(cleanup);

  cleanup = attachKeyUpListener((event) => {
    if (isMacOsHost && event.key === "Meta") {
      resetKeysPressed();
    } else {
      const eventCode = getNormalizedEventCode(event);
      if (eventCode) {
        deleteKeyPressed(eventCode);
      }
    }
    keyUpLoop(event, shortcutInfo);
  });
  cleanupFunctions.push(cleanup);

  cleanup = attachEventListenerAndReturnCleanup(window, "blur", (event) => {
    resetKeysPressed();
    keyUpLoop(event, shortcutInfo);
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
  const modShortcuts = shortcutInfo.filter((info) => info.parsedShortcut.mod);
  if (modShortcuts.length === 0) {
    return null;
  }

  return attachEventListenerAndReturnCleanup(window, "mousemove", (event) => {
    if (!(event instanceof MouseEvent)) {
      return;
    }
    if (aModShortcutWasPressed && !event.metaKey) {
      modShortcuts.forEach((info) => {
        if (info.wasPressed) {
          info.keyUpAction?.(event);
          info.wasPressed = false;
        }
      });
      aModShortcutWasPressed = false;
    }
  });
}
