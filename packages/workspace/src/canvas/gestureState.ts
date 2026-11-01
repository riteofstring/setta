import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils.js";
import { createHostStoreGetter } from "../state/hostStore.js";

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
