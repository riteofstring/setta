import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../../state/storeUtils";

// The reference's `useResizeEvent` store: a per-section "start"/"end" tick emitted around
// height-affecting resize gestures. The sizing hook widens the auto-height ceiling while a
// resize is in flight.
type ResizeEventState = {
  resizeEvent: Record<string, "start" | "end">;
};

export const useResizeEvent = createWithEqualityFn(
  withResetFn<ResizeEventState>(() => ({
    resizeEvent: {},
  })),
);

export function setSectionResizeEvent(
  sectionId: string,
  resizeEvent: "start" | "end",
) {
  useResizeEvent.setState((state) => ({
    resizeEvent: { ...state.resizeEvent, [sectionId]: resizeEvent },
  }));
}
