import { create } from "./utils";

const initialState = { isSorting: false, isMovingFree: false };

function createAndAttachEventListeners(fn) {
  const state = create(fn);

  const handleKeyDown = (e) => {
    state.getState().setIsSorting(e.key === "Control");
    state.getState().setIsMovingFree(e.key === "Alt");
  };
  const handleKeyUp = () => {
    state.getState().setIsSorting(false);
    state.getState().setIsMovingFree(false);
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  return state;
}

export const useDragActivation = createAndAttachEventListeners((set) => ({
  ...initialState,
  setIsSorting: (value) => set({ isSorting: value }),
  setIsMovingFree: (value) => set({ isMovingFree: value }),
}));
