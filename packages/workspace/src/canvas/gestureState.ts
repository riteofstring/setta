import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

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

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createCanvasGesturesStore>
>();

export function getCanvasGesturesStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createCanvasGesturesStore();
  storesByHost.set(host, store);
  return store;
}
