import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils.js";
import {
  useWorkspaceHost,
  useWorkspaceStore,
} from "../workspaceHostContext.js";
import { createHostStoreGetter } from "../state/hostStore.js";
import type { WorkspaceHost } from "../workspaceHost.js";

export type WorkspaceCapabilitiesState = {
  canEditLayout: boolean;
  canEditStructure: boolean;
};

function createWorkspaceCapabilitiesStore() {
  return createStore(
    withResetFn<WorkspaceCapabilitiesState>(() => ({
      canEditLayout: true,
      canEditStructure: true,
    })),
  );
}

export const getWorkspaceCapabilitiesStore = createHostStoreGetter(
  createWorkspaceCapabilitiesStore,
);

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
