import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { WorkspaceSelectionStore } from "./workspace-selection-store.js";

const WorkspaceSelectionContext = createContext<WorkspaceSelectionStore | null>(null);

export function WorkspaceSelectionProvider({
  children,
  store,
}: Readonly<{ children: ReactNode; store: WorkspaceSelectionStore }>) {
  return (
    <WorkspaceSelectionContext.Provider value={store}>
      {children}
    </WorkspaceSelectionContext.Provider>
  );
}

function useWorkspaceSelectionStore(): WorkspaceSelectionStore {
  const store = useContext(WorkspaceSelectionContext);
  if (!store) {
    throw new Error("Workspace selection state requires its workbench canvas boundary.");
  }
  return store;
}

/**
 * Per-section selection state, subscribed as primitives so a selection commit
 * inside the pointer-down dispatch rerenders only the frames whose derived
 * values actually changed.
 */
export function useWorkspaceSectionSelectionState(
  sectionId: string,
  root: boolean,
): Readonly<{ selected: boolean; selectionMovementBlocked: boolean }> {
  const store = useWorkspaceSelectionStore();
  const selectedSnapshot = useCallback(
    () => store.getSnapshot().selected.has(sectionId),
    [sectionId, store],
  );
  const selected = useSyncExternalStore(store.subscribe, selectedSnapshot, selectedSnapshot);
  const blockedSnapshot = useCallback(() => {
    const snapshot = store.getSnapshot();
    return (
      snapshot.selected.has(sectionId) &&
      (root ? snapshot.movementBlocked : snapshot.structuralMovementBlocked)
    );
  }, [root, sectionId, store]);
  const selectionMovementBlocked = useSyncExternalStore(
    store.subscribe,
    blockedSnapshot,
    blockedSnapshot,
  );
  return { selected, selectionMovementBlocked };
}
