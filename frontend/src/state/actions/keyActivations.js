import {
  convertFloatingBoxToSection,
  disableFloatingBox,
  enableFloatingBox,
} from "components/Utils/FloatingBox";
import { useDndState } from "forks/dnd-kit/dndState";
import { resetZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { isMacOs } from "forks/xyflow/core/utils";
import _ from "lodash";
import {
  activateParamSelect,
  deactivateParamSelect,
} from "state/actions/paramSelect";
import { useSettings } from "state/definitions";
import { tabFromDocumentBody } from "utils/tabbingLogic";
import { copy } from "./copyPaste/copy";
import { paste } from "./copyPaste/paste";
import { formatCode, updateInteractiveCode } from "./interactive";
import { unselectAllParams } from "./kwargs/kwargs";
import { openLoadModal, openSaveAsModal } from "./modal";
import { saveProject } from "./project/saveProject";
import { groupSections } from "./sections/groupSections";
import { focusOnArgsFilter } from "./sections/sectionParamFilter";
import { redoProjectState, undoProjectState } from "./undo";

let keysPressed = new Set();

function attachEventListenerAndReturnCleanup(attachTo, eventName, action) {
  attachTo.addEventListener(eventName, action);

  // Return a cleanup function
  return () => {
    attachTo.removeEventListener(eventName, action);
  };
}

function attachKeyDownListener(action) {
  return attachEventListenerAndReturnCleanup(document, "keydown", action);
}

function attachKeyUpListener(action) {
  return attachEventListenerAndReturnCleanup(document, "keyup", action);
}

const specialEventKeyToEventCode = {
  ".": "Period",
  ",": "Comma",
  "/": "Slash",
  "\\": "Backslash",
  "'": "Quote",
  ";": "Semicolon",
  "[": "BracketLeft",
  "]": "BracketRight",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
};

const modifierKeyCodes = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
]);

// shortcutString is a lowercase string.
function parseShortcut(shortcutString) {
  const parts = shortcutString.split("+").map((x) => x.trim());

  let keys = parts.filter((x) => !["ctrl", "shift", "alt", "mod"].includes(x));

  keys = new Set(
    keys.map((part) => {
      const x = part.trim();
      if (/^[a-zA-Z]$/.test(x)) {
        return `Key${x.toUpperCase()}`;
      }
      if (/^[0-9]$/.test(x)) {
        return `Digit${x}`;
      }
      const special = specialEventKeyToEventCode[x];
      return special ?? x;
    }),
  );

  return {
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    keys,
  };
}

function isShortcutPressed(e, shortcut, _isMacOs) {
  const { mod, ctrl, shift, alt, keys } = shortcut;
  if (_isMacOs) {
    return (
      e.metaKey === mod &&
      e.ctrlKey === ctrl &&
      e.shiftKey === shift &&
      e.altKey === alt &&
      _.isEqual(keysPressed, keys)
    );
  } else {
    return (
      e.ctrlKey === (ctrl || mod) &&
      e.shiftKey === shift &&
      e.altKey === alt &&
      _.isEqual(keysPressed, keys)
    );
  }
}

function getShouldPreventDefault(lowercaseKeyCombo) {
  // Check if it's a single character
  if (lowercaseKeyCombo.length === 1) {
    const char = lowercaseKeyCombo.charAt(0);
    // Check if it's a letter or number
    if ((char >= "a" && char <= "z") || (char >= "0" && char <= "9")) {
      return false;
    }
  }

  return ![
    "mod",
    "ctrl",
    "alt",
    "shift",
    "ctrl + c",
    "ctrl + v",
    "mod + c",
    "mod + v",
    "space",
    "escape",
    "tab",
    "shift + tab",
  ].includes(lowercaseKeyCombo);
}

function keyUpLoop(e, shortcutInfo) {
  for (const x of shortcutInfo) {
    if (x.wasPressed) {
      x.wasPressed = false;
      x.keyUpAction?.(e);
    }
  }
}

export function attachKeyEventListeners() {
  const settings = useSettings.getState();

  const conditionAndAction = [
    ["tab", tabFromDocumentBody],
    ["shift + tab", tabFromDocumentBody],
    [settings.showTooltipShortcut, enableFloatingBox, disableFloatingBox],
    [settings.tooltipToSectionShortcut, convertFloatingBoxToSection],
    [settings.undoShortcut, _.throttle(undoProjectState, 100), null, true],
    [settings.redoShortcut, _.throttle(redoProjectState, 100), null, true],
    [settings.groupShortcut, groupSections],
    [settings.saveShortcut, saveProject],
    [settings.loadShortcut, openLoadModal],
    [settings.saveAsShortcut, openSaveAsModal],
    [settings.focusOnArgsFilterShortcut, focusOnArgsFilter],
    [settings.resetZoomShortcut, resetZoom],
    [settings.copyShortcut, copy],
    [settings.pasteShortcut, paste],
    [settings.updateInteractiveCode, updateInteractiveCode],
    [settings.formatCode, formatCode],
    [settings.paramSelect, activateParamSelect, deactivateParamSelect],
    [
      settings.selectionKeyCode,
      activateSelectionKeyPressed,
      deactivateSelectionKeyPressed,
    ],
    [
      settings.multiSelectionKeyCode,
      activateMultiSelectionPressed,
      deactivateMultiSelectionPressed,
    ],
    [settings.panActivationKeyCode, activatePanMode, deactivatePanMode],
    [settings.zoomActivationKeyCode, activateZoomMode, deactivateZoomMode],
    [
      settings.moveSectionKeyCode,
      activateMoveSectionMode,
      deactivateMoveSectionMode,
    ],
    [
      settings.sortingShortcut,
      useDndState.getState().activateSortingMode,
      useDndState.getState().deactivate,
    ],
    [
      settings.movingFreeShortcut,
      useDndState.getState().activateMovingFreeMode,
      useDndState.getState().deactivate,
    ],
    ["Escape", onEscapeKey],
  ];

  const cleanup_functions = [];
  const shortcutInfo = [];
  const _isMacOs = isMacOs();
  for (const [
    keyCombo,
    keyDownAction,
    keyUpAction,
    allowRepeat,
  ] of conditionAndAction) {
    if (!keyCombo) {
      continue;
    }
    const lowercaseKeyCombo = keyCombo.toLowerCase();
    shortcutInfo.push({
      parsedShortcut: parseShortcut(lowercaseKeyCombo),
      wasPressed: false,
      shouldPreventDefault: getShouldPreventDefault(lowercaseKeyCombo),
      keyDownAction,
      keyUpAction,
      allowRepeat,
    });
  }
  let cleanup = attachKeyDownListener((e) => {
    if (!modifierKeyCodes.has(e.code)) {
      keysPressed.add(e.code);
    }
    for (const x of shortcutInfo) {
      if (isShortcutPressed(e, x.parsedShortcut, _isMacOs)) {
        if (x.shouldPreventDefault) {
          e.preventDefault();
        }
        if (e.repeat && !x.allowRepeat) {
          continue;
        }
        x.keyDownAction(e);
        x.wasPressed = true;
      } else if (x.wasPressed) {
        x.keyUpAction?.(e);
        x.wasPressed = false;
      }
    }
  });
  cleanup_functions.push(cleanup);

  cleanup = attachKeyUpListener((e) => {
    if (_isMacOs && e.key === "Meta") {
      // special case because on mac, meta key causes the other pressed keys to not trigger keyup
      keysPressed = new Set();
    } else {
      keysPressed.delete(e.code);
    }
    keyUpLoop(e, shortcutInfo);
  });
  cleanup_functions.push(cleanup);

  cleanup = attachEventListenerAndReturnCleanup(window, "blur", (e) => {
    keysPressed = new Set();
    keyUpLoop(e, shortcutInfo);
  });
  cleanup_functions.push(cleanup);

  return () => {
    cleanup_functions.forEach((x) => x());
  };
}

export function variableClick(e) {
  return e.ctrlKey && !e.shiftKey;
}

function onEscapeKey() {
  unselectAllParams();
}

function activateSelectionKeyPressed() {
  useReactFlow.setState({ selectionKeyPressed: true });
}

function deactivateSelectionKeyPressed() {
  useReactFlow.setState({ selectionKeyPressed: false });
}

function activateMultiSelectionPressed() {
  useReactFlow.setState({ multiSelectionActive: true });
}

function deactivateMultiSelectionPressed() {
  useReactFlow.setState({ multiSelectionActive: false });
}

function activatePanMode() {
  useReactFlow.setState({ panActivationKeyPressed: true });
}

function deactivatePanMode() {
  useReactFlow.setState({ panActivationKeyPressed: false });
}

function activateZoomMode() {
  useReactFlow.setState({ zoomActivationKeyPressed: true });
}

function deactivateZoomMode() {
  useReactFlow.setState({ zoomActivationKeyPressed: false });
}

function activateMoveSectionMode() {
  useReactFlow.setState({ moveSectionActivationKeyPressed: true });
}

function deactivateMoveSectionMode() {
  useReactFlow.setState({ moveSectionActivationKeyPressed: false });
}
