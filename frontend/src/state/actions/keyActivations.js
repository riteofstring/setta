import {
  openLoadModal,
  openSaveAsModal,
} from "components/AppContainer/Header/SubNav/FileMenu/FileMenu";
import { useDndState } from "forks/dnd-kit/dndState";
import { resetZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import { useSettings } from "state/definitions";
import { copy } from "./copy";
import { groupSections } from "./createSection";
import { focusOnArgsFilter } from "./focusOnArgsFilter";
import { paste } from "./paste";
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
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    key: parts.find((part) => !["ctrl", "shift", "alt", "mod"].includes(part)),
  };
}

function isShortcutPressed(event, shortcut) {
  const { mod, ctrl, shift, alt, key } = parseShortcut(shortcut);
  return (
    event.metaKey === (ctrl || mod) &&
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
    // if (typeof condition === "string") {
    //   cleanup = attachBuiltInListener(condition, action);
    // } else {
    cleanup = attachKeyDownListener((e) => {
      if (isShortcutPressed(e, keyCombo)) {
        // We don't want to prevent default if the shortcut is just Control or Alt
        // because this would prevent things like Ctrl + R for refreshing the page.
        if (!["mod", "ctrl", "alt"].includes(keyCombo)) {
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
