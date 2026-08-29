import { createStore } from "zustand/vanilla";
import { withResetFn } from "../../state/storeUtils";
import {
  useWorkspaceHost,
  useWorkspaceStore,
} from "../../workspaceHostContext";
import { assertWorkspaceHostActive } from "../../workspaceHostInternals";
import type { WorkspaceHost } from "../../workspaceHost";

// The reference's `useResizeEvent` store: a per-section "start"/"end" tick emitted around
// height-affecting resize gestures. The sizing hook widens the auto-height ceiling while a
// resize is in flight.
type ResizeEventState = {
  resizeEvent: Record<string, "start" | "end">;
};

function createResizeEventStore() {
  return createStore(
    withResetFn<ResizeEventState>(() => ({
      resizeEvent: {},
    })),
  );
}

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createResizeEventStore>
>();

export function getResizeEventStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createResizeEventStore();
  storesByHost.set(host, store);
  return store;
}

export function useResizeEvent<T>(
  selector: (state: ResizeEventState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getResizeEventStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

export function setSectionResizeEvent(
  host: WorkspaceHost,
  sectionId: string,
  resizeEvent: "start" | "end",
) {
  getResizeEventStore(host).setState((state) => ({
    resizeEvent: { ...state.resizeEvent, [sectionId]: resizeEvent },
  }));
}
