import {
  openLoadModal,
  openSaveAsModal,
} from "components/AppContainer/Header/SubNav/FileMenu/FileMenu";
import { resetZoom } from "xyflow/core/hooks/useViewportHelper";
import { copy } from "./copy/copy";
import { focusOnArgsFilter } from "./focusOnArgsFilter";
import { groupSections } from "./groupSections";
import { paste } from "./paste/paste";
import { saveProject } from "./save";
import { redoProjectState, undoProjectState } from "./undo";

function preventDefault(fn) {
  return (e) => {
    const output = fn(e);
    if (output) {
      e.preventDefault();
    }
    return output;
  };
}

function ctrlPlus(key) {
  return preventDefault((e) => {
    return e.ctrlKey && e.key === key;
  });
}

function ctrlShiftPlus(key) {
  return preventDefault((e) => e.ctrlKey && e.shiftKey && e.key === key);
}

function attachKeyEventListener(action) {
  document.addEventListener("keydown", action);

  // Return a cleanup function
  return () => {
    document.removeEventListener("keydown", action);
  };
}

function attachBuiltInListener(name, fn) {
  document.addEventListener(name, fn);
  return () => document.removeEventListener(name, fn);
}

export function attachKeyEventListeners() {
  const conditionAndAction = [
    [ctrlPlus("z"), undoProjectState],
    [ctrlShiftPlus("Z"), redoProjectState], // has to be capital because of shift
    [ctrlPlus("g"), groupSections],
    [ctrlPlus("s"), saveProject],
    [ctrlPlus("l"), openLoadModal],
    [ctrlShiftPlus("S"), openSaveAsModal],
    [ctrlPlus("k"), focusOnArgsFilter],
    [ctrlPlus(","), resetZoom],
    ["copy", copy], // Builtin copy event (ctrl-c)
    ["paste", paste], // Builtin paste event (ctrl-v)
  ];

  const cleanup_functions = [];
  for (const [condition, action] of conditionAndAction) {
    let cleanup;
    if (typeof condition === "string") {
      cleanup = attachBuiltInListener(condition, action);
    } else {
      cleanup = attachKeyEventListener((e) => {
        if (condition(e)) {
          action();
        }
      });
    }
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
