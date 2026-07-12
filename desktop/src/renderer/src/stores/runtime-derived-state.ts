import { useConversationNavigatorStore } from "./conversation-navigator-store";
import { resetConversationProjectionRuntime } from "./conversation-projection-runtime";
import { useConversationPaneStore } from "./conversation-pane-store";
import { useConversationRoutingStore } from "./conversation-routing-store";
import { useConversationStore } from "./conversation-store";
import { useWorkspaceStore } from "./workspace-store";

export function resetRuntimeDerivedRendererState(): void {
  useWorkspaceStore.getState().resetRuntimeState();
  useConversationNavigatorStore.getState().resetRuntimeState();
  resetConversationProjectionRuntime();
  useConversationStore.getState().reset();
  useConversationPaneStore.getState().resetRuntimeState();
  useConversationRoutingStore.getState().resetRuntimeState();
}
