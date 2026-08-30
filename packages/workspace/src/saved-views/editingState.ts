import { createStore } from "zustand/vanilla";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

type WorkspaceSavedViewEditingState = {
  editing: boolean;
};

function createWorkspaceSavedViewEditingStore() {
  return createStore<WorkspaceSavedViewEditingState>(() => ({
    editing: false,
  }));
}

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createWorkspaceSavedViewEditingStore>
>();

function getWorkspaceSavedViewEditingStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createWorkspaceSavedViewEditingStore();
  storesByHost.set(host, store);
  return store;
}

export function isWorkspaceSavedViewEditing(host: WorkspaceHost): boolean {
  return getWorkspaceSavedViewEditingStore(host).getState().editing;
}

export function setWorkspaceSavedViewEditingState(
  host: WorkspaceHost,
  editing: boolean,
): void {
  if (typeof editing !== "boolean") {
    throw new Error("Saved view editing state must be boolean.");
  }
  getWorkspaceSavedViewEditingStore(host).setState({ editing });
}

export function useWorkspaceSavedViewEditing(): boolean {
  return useWorkspaceStore(
    getWorkspaceSavedViewEditingStore(useWorkspaceHost()),
    (state) => state.editing,
  );
}
