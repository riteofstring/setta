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
  window.addEventListener("keydown", action);

  // Return a cleanup function
  return () => {
    window.removeEventListener("keydown", action);
  };
}

export function attachKeyEventListeners() {
  const conditionAndAction = [
    [ctrlPlus("z"), undoProjectState],
    [ctrlShiftPlus("Z"), redoProjectState], // has to be capital because of shift
  ];

  const cleanup_functions = [];
  for (const [condition, action] of conditionAndAction) {
    const cleanup = attachKeyEventListener((e) => {
      if (condition(e)) {
        action();
      }
    });
    cleanup_functions.push(cleanup);
  }

  return () => cleanup_functions.forEach((x) => x());
}
