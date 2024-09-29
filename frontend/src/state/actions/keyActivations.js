import { useDndState } from "forks/dnd-kit/dndState";
import { resetZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { isMacOs } from "forks/xyflow/core/utils";
import {
  activateParamSelect,
  deactivateParamSelect,
} from "state/actions/paramSelect";
import { useSettings } from "state/definitions";
import { copy } from "./copyPaste/copy";
import { paste } from "./copyPaste/paste";
import { formatCode, updateInteractiveCode } from "./interactive";
import { openLoadModal, openSaveAsModal } from "./modal";
import { saveProject } from "./project/saveProject";
import { groupSections } from "./sections/groupSections";
import { focusOnArgsFilter } from "./sections/sectionParamFilter";
import { redoProjectState, undoProjectState } from "./undo";

function attachKeyDownListener(action) {
  document.addEventListener("keydown", action);

  // Return a cleanup function
  return () => {
    document.removeEventListener("keydown", action);
  };
}

function attachKeyUpListener(action) {
  document.addEventListener("keyup", action);

  // Return a cleanup function
  return () => {
    document.removeEventListener("keyup", action);
  };
}

function shouldAddKeyPrefix(key) {
  return ![undefined, "enter", "space", "comma", "period"].includes(key);
}

// shortcutString is a lowercase string.
function parseShortcut(shortcutString) {
  const parts = shortcutString.split("+").map((part) => part.trim());
  let key = parts.find(
    (part) => !["ctrl", "shift", "alt", "mod"].includes(part),
  );
  if (shouldAddKeyPrefix(key)) {
    key = `key${key}`;
  }

  return {
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    key,
  };
}

const considerAsUndefined = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

function isShortcutPressed(event, shortcut, _isMacOs) {
  const { mod, ctrl, shift, alt, key } = shortcut;
  if (_isMacOs) {
    return (
      event.metaKey === mod &&
      event.ctrlKey === ctrl &&
      event.shiftKey === shift &&
      event.altKey === alt &&
      ((key === undefined && considerAsUndefined.has(event.code)) ||
        key === event.code.toLowerCase())
    );
  } else {
    return (
      event.ctrlKey === (ctrl || mod) &&
      event.shiftKey === shift &&
      event.altKey === alt &&
      ((key === undefined && considerAsUndefined.has(event.code)) ||
        key === event.code.toLowerCase())
    );
  }
}

function getShouldPreventDefault(lowercaseKeyCombo) {
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
  ].includes(lowercaseKeyCombo);
}

function keyUpLoop(e, shortcutInfo) {
  for (const x of shortcutInfo) {
    if (x.wasPressed) {
      if (x.shouldPreventDefault) {
        e.preventDefault();
      }
      x.wasPressed = false;
      x.keyUpAction?.();
    }
  }
}

export function attachKeyEventListeners() {
  const settings = useSettings.getState();

  const conditionAndAction = [
    [settings.undoShortcut, undoProjectState],
    [settings.redoShortcut, redoProjectState],
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
      useDndState.getState().deactivateSortingMode,
    ],
    [
      settings.movingFreeShortcut,
      useDndState.getState().activateMovingFreeMode,
      useDndState.getState().deactivateMovingFreeMode,
    ],
  ];

  const cleanup_functions = [];
  const shortcutInfo = [];
  const _isMacOs = isMacOs();
  for (const [keyCombo, keyDownAction, keyUpAction] of conditionAndAction) {
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
    });
  }

  let cleanup = attachKeyDownListener((e) => {
    for (const x of shortcutInfo) {
      const isPressed = isShortcutPressed(e, x.parsedShortcut, _isMacOs);
      if (isPressed && x.shouldPreventDefault) {
        e.preventDefault();
      }
      if (!x.wasPressed && isPressed) {
        x.wasPressed = true;
        x.keyDownAction();
      } else if (x.wasPressed && !isPressed) {
        x.wasPressed = false;
        x.keyUpAction?.();
      }
    }
  });
  cleanup_functions.push(cleanup);

  cleanup = attachKeyUpListener((e) => {
    keyUpLoop(e, shortcutInfo);
  });
  cleanup_functions.push(cleanup);

  window.addEventListener("blur", (e) => {
    keyUpLoop(e, shortcutInfo);
  });

  return () => {
    cleanup_functions.forEach((x) => x());
  };
}

export function variableClick(e) {
  return e.ctrlKey && !e.shiftKey;
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
