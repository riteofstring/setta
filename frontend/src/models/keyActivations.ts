import { create } from "./utils";

const initialState = {
  isSorting: false,
  isMovingFree: false,
  groupSections: false,
  undo: false,
  redo: false,
  save: false,
  load: false,
  searchArgs: false,
};

function preventDefault(fn) {
  return (e) => {
    const output = fn(e);
    if (output) {
      e.preventDefault();
    }
    return output;
  };
}

function ctrlPlus(key: string) {
  return preventDefault((e) => e.ctrlKey && e.key === key);
}

function ctrlShiftPlus(key: string) {
  return preventDefault((e) => e.ctrlKey && e.shiftKey && e.key === key);
}

function attachEventListeners(state) {
  const conditions = {
    isSorting: (e) => e.key === "Control",
    isMovingFree: (e) => e.key === "Alt",
    groupSections: ctrlPlus("g"),
    undo: ctrlPlus("z"),
    redo: ctrlShiftPlus("Z"), // has to be capital because of shift
    save: ctrlPlus("s"),
    load: ctrlPlus("l"),
    saveAs: ctrlShiftPlus("S"),
    searchArgs: ctrlPlus("k"),
  };

  for (const [attrName, cond] of Object.entries(conditions)) {
    window.addEventListener("keydown", (e) =>
      state.getState().setActivation(attrName, cond(e))
    );
    window.addEventListener("keyup", () =>
      state.getState().setActivation(attrName, false)
    );
  }

  window.addEventListener("blur", () => state.getState().reset());

  return state;
}

export const useKeyActivations = create((set) => ({
  ...initialState,
  setActivation: (key, value) => set({ [key]: value }),
  reset: () => set(initialState),
}));

attachEventListeners(useKeyActivations);
