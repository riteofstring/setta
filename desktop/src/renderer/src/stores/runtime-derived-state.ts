import { useWorkspaceStore } from "./workspace-store";

export function resetRuntimeDerivedRendererState(): void {
  useWorkspaceStore.getState().resetRuntimeState();
}
