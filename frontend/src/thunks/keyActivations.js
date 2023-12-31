import {
  openLoadModal,
  openSaveAsModal,
} from "components/AppContainer/Header/SubNav/FileMenu/FileMenu";
import { copySections } from "./copySections";
import { focusOnArgsFilter } from "./focusOnArgsFilter";
import { groupSections } from "./groupSections";
import { pasteSections } from "./pasteSections";
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
  return preventDefault((e) => e.ctrlKey && e.key === key);
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
    ["copy", copySections], // Builtin copy event (ctrl-c)
    ["paste", pasteSections], // Builtin paste event (ctrl-v)
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
