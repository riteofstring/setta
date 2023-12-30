import { create } from "./utils";

const initialState = {
  isSorting: false,
  isMovingFree: false,
};

function attachEventListeners(state) {
  const conditions = {
    isSorting: (e) => e.key === "Control",
    isMovingFree: (e) => e.key === "Alt",
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
