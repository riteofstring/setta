import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";

// The reference tracks this on its app-wide `useMisc` store; it suppresses section click
// activation while a section drag (and, in later batches, a resize) is in progress.
export type CanvasGestureState = {
  mouseDownDraggingSection: boolean;
};

export const useCanvasGestures = createWithEqualityFn(
  withResetFn<CanvasGestureState>(() => ({
    mouseDownDraggingSection: false,
  })),
);
