import { useDndState } from "forks/dnd-kit/dndState";
import { resetZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
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

// shortcutString is a lowercase string.
function parseShortcut(shortcutString) {
  const parts = shortcutString.split("+").map((part) => part.trim());
  let key = parts.find(
    (part) => !["ctrl", "shift", "alt", "mod"].includes(part),
  );
  if (key !== undefined && key !== "enter" && key !== "space") {
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

function isShortcutPressed(event, shortcut) {
  const { mod, ctrl, shift, alt, key } = shortcut;
  return (
    event.metaKey === (ctrl || mod) &&
    event.ctrlKey === ctrl &&
    event.shiftKey === shift &&
    event.altKey === alt &&
    (key === undefined || event.code.toLowerCase() === key)
  );
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
  const keyUpActions = [];
  for (const [keyCombo, action, keyUpAction] of conditionAndAction) {
    let cleanup;
    let lowercaseKeyCombo = keyCombo.toLowerCase();
    const parsedShortcut = parseShortcut(lowercaseKeyCombo);
    // if (typeof condition === "string") {
    //   cleanup = attachBuiltInListener(condition, action);
    // } else {
    cleanup = attachKeyDownListener((e) => {
      if (lowercaseKeyCombo && isShortcutPressed(e, parsedShortcut)) {
        // We don't want to prevent default if the shortcut is just Control or Alt
        // because this would prevent things like Ctrl + R for refreshing the page.
        if (
          ![
            "mod",
            "ctrl",
            "alt",
            "shift",
            "ctrl + c",
            "ctrl + v",
            "mod + c",
            "mod + v",
            "space",
          ].includes(lowercaseKeyCombo)
        ) {
          e.preventDefault();
        }
        action();
      }
    });
    cleanup_functions.push(cleanup);

    if (keyUpAction) {
      cleanup = attachKeyUpListener((e) => {
        e.preventDefault();
        keyUpAction();
      });
      cleanup_functions.push(cleanup);
      keyUpActions.push(keyUpAction);
    }
  }

  window.addEventListener("blur", () => {
    for (const x of keyUpActions) {
      x();
    }
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
