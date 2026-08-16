import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

// The capability seam (extraction seam 4): the reference's `useShareCapabilities` collapses to
// the two capabilities the Phase 1 slice consumes. `canEditLayout` gates drag, resize, and lock;
// `canEditStructure` gates delete and title editing. Hosts set these; the package defaults to
// fully editable, matching the reference's owner session.
export type WorkspaceCapabilitiesState = {
  canEditLayout: boolean;
  canEditStructure: boolean;
};

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createWorkspaceCapabilitiesStore>
>();

function createWorkspaceCapabilitiesStore() {
  return createStore(
    withResetFn<WorkspaceCapabilitiesState>(() => ({
      canEditLayout: true,
      canEditStructure: true,
    })),
  );
}

export function getWorkspaceCapabilitiesStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createWorkspaceCapabilitiesStore();
  storesByHost.set(host, store);
  return store;
}

export function useWorkspaceCapabilities<T>(
  selector: (state: WorkspaceCapabilitiesState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getWorkspaceCapabilitiesStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}
