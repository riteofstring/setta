import { createStore } from "zustand/vanilla";
import { withResetFn } from "../../state/storeUtils";
import {
  useWorkspaceHost,
  useWorkspaceStore,
} from "../../workspaceHostContext";
import { createHostStoreGetter } from "../../state/hostStore";
import type { WorkspaceHost } from "../../workspaceHost";

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

export const getResizeEventStore = createHostStoreGetter(
  createResizeEventStore,
);

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
