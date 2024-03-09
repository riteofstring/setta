import {
  openLoadModal,
  openSaveAsModal,
} from "components/AppContainer/Header/SubNav/FileMenu/FileMenu";
import { useDndState } from "models/info/dndState";
import { useSettings } from "models/settings";
import { resetZoom } from "xyflow/core/hooks/useViewportHelper";
import { copy } from "./copy/copy";
import { focusOnArgsFilter } from "./focusOnArgsFilter";
import { groupSections } from "./groupSections";
import { paste } from "./paste/paste";
import { saveProject } from "./save";
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

function parseShortcut(shortcutString) {
  const parts = shortcutString
    .toLowerCase()
    .split("+")
    .map((part) => part.trim());
  return {
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    key: parts.find((part) => !["ctrl", "shift", "alt"].includes(part)),
  };
}

function isShortcutPressed(event, shortcut) {
  const { ctrl, shift, alt, key } = parseShortcut(shortcut);
  return (
    event.ctrlKey === ctrl &&
    event.shiftKey === shift &&
    event.altKey === alt &&
    (key === undefined || event.key.toLowerCase() === key)
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
    [
      settings.dndShortcut,
      useDndState.getState().activateDnd,
      useDndState.getState().deactivateDnd,
    ],
  ];

  const cleanup_functions = [];
  for (const [keyCombo, action, keyUpAction] of conditionAndAction) {
    let cleanup;
    // if (typeof condition === "string") {
    //   cleanup = attachBuiltInListener(condition, action);
    // } else {
    cleanup = attachKeyDownListener((e) => {
      if (isShortcutPressed(e, keyCombo)) {
        // e.preventDefault();
        action();
      }
      if (keyUpAction) {
        attachKeyUpListener(keyUpAction);
      }
    });
    // }
    cleanup_functions.push(cleanup);
  }

  return () => {
    cleanup_functions.forEach((x) => x());
  };
}

// Below functions are used in various onClick functions

export function multiSectionSelect(e) {
  return e.ctrlKey && !e.shiftKey;
}

export function variableClick(e) {
  return e.ctrlKey && !e.shiftKey;
}

export function paramSelect(e) {
  return e.ctrlKey && e.shiftKey;
}
