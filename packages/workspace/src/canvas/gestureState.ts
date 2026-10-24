import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { createHostStoreGetter } from "../state/hostStore";

type CanvasGestureState = {
  mouseDownDraggingSection: boolean;
};

function createCanvasGesturesStore() {
  return createStore(
    withResetFn<CanvasGestureState>(() => ({
      mouseDownDraggingSection: false,
    })),
  );
}

export const getCanvasGesturesStore = createHostStoreGetter(
  createCanvasGesturesStore,
);
