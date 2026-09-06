import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

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

export function setWorkspaceCapabilities(
  host: WorkspaceHost,
  capabilities: WorkspaceCapabilitiesState,
): void {
  if (
    typeof capabilities !== "object" ||
    capabilities === null ||
    Array.isArray(capabilities) ||
    typeof capabilities.canEditLayout !== "boolean" ||
    typeof capabilities.canEditStructure !== "boolean"
  ) {
    throw new Error(
      "Workspace capabilities require boolean canEditLayout and canEditStructure values.",
    );
  }
  getWorkspaceCapabilitiesStore(host).setState({
    canEditLayout: capabilities.canEditLayout,
    canEditStructure: capabilities.canEditStructure,
  });
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
