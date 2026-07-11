import { resetChatRuntimeState } from "./chat-store-runtime-reset";
import { useConversationNavigatorStore } from "./conversation-navigator-store";
import { useConversationPaneStore } from "./conversation-pane-store";
import { useSemanticGraphStore } from "./semantic-graph-store";
import { useWorkflowDefinitionStore } from "./workflow-definition-store";
import { useWorkflowEditorStore } from "./workflow-editor-store";
import { useWorkspaceStore } from "./workspace-store";

export function resetRuntimeDerivedRendererState(): void {
  useWorkspaceStore.getState().resetRuntimeState();
  resetChatRuntimeState();
  useConversationNavigatorStore.getState().resetRuntimeState();
  useConversationPaneStore.getState().resetRuntimeState();
  useWorkflowDefinitionStore.getState().resetRuntimeState();
  useWorkflowEditorStore.getState().resetRuntimeState();
  useSemanticGraphStore.getState().resetRuntimeState();
}
