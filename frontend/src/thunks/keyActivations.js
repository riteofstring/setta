import {
  openLoadModal,
  openSaveAsModal,
} from "components/AppContainer/Header/SubNav/FileMenu/FileMenu";
import { copySections } from "./copySections";
import { focusOnArgsFilter } from "./focusOnArgsFilter";
import { groupSections } from "./groupSections";
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

export function attachKeyEventListeners() {
  const conditionAndAction = [
    [ctrlPlus("z"), undoProjectState],
    [ctrlShiftPlus("Z"), redoProjectState], // has to be capital because of shift
    [ctrlPlus("g"), groupSections],
    [ctrlPlus("s"), saveProject],
    [ctrlPlus("l"), openLoadModal],
    [ctrlShiftPlus("S"), openSaveAsModal],
    [ctrlPlus("k"), focusOnArgsFilter],
  ];

  // Special copy event (ctrl-c)
  document.addEventListener("copy", copySections);

  const cleanup_functions = [
    () => document.removeEventListener("copy", copySections),
  ];
  for (const [condition, action] of conditionAndAction) {
    const cleanup = attachKeyEventListener((e) => {
      if (condition(e)) {
        action();
      }
    });
    cleanup_functions.push(cleanup);
  }

  return () => {
    cleanup_functions.forEach((x) => x());
  };
}
