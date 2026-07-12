import { useMemo, useSyncExternalStore } from "react";

import { useWorkspaceStore } from "../stores/workspace-store";
import type { WorkspaceLayoutStore } from "./layout-store";

export function useWorkspaceLayoutSnapshot(store: WorkspaceLayoutStore) {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}

export function useWorkspaceLayoutTarget() {
  const session = useWorkspaceStore((state) => state.session);
  const status = useWorkspaceStore((state) => state.status);
  const workspace = useMemo(() => {
    if (!session) {
      return null;
    }
    return (
      session.activeWorkspaces.find((workspace) => workspace.id === session.selectedWorkspaceId) ??
      null
    );
  }, [session]);
  return { status, workspace };
}
