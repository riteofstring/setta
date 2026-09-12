import { createContext, useContext, type ReactNode } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { StoreApi } from "zustand/vanilla";
import { assertWorkspaceHostActive } from "./workspaceHostInternals";
import type { WorkspaceHost } from "./workspaceHost";

const WorkspaceHostContext = createContext<WorkspaceHost | null>(null);

export function WorkspaceProvider({
  children,
  host,
}: {
  children?: ReactNode;
  host: WorkspaceHost;
}) {
  assertWorkspaceHostActive(host);
  return (
    <WorkspaceHostContext.Provider value={host}>
      {children}
    </WorkspaceHostContext.Provider>
  );
}

export function useWorkspaceHost(): WorkspaceHost {
  const host = useContext(WorkspaceHostContext);
  if (!host) {
    throw new Error(
      "Workspace components require WorkspaceProvider with a createWorkspaceHost() host.",
    );
  }
  assertWorkspaceHostActive(host);
  return host;
}

export function useWorkspaceStore<TState, TSelection>(
  store: StoreApi<TState>,
  selector: (state: TState) => TSelection,
  equalityFn?: (left: TSelection, right: TSelection) => boolean,
): TSelection {
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
