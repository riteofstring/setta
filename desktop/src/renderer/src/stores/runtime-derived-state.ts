import { resetChatRuntimeState } from "./chat-store-runtime-reset";
import { useConversationNavigatorStore } from "./conversation-navigator-store";
import { resetConversationProjectionRuntime } from "./conversation-projection-runtime";
import { useConversationPaneStore } from "./conversation-pane-store";
import { useConversationStore } from "./conversation-store";
import { useSemanticGraphStore } from "./semantic-graph-store";
import { useWorkflowDefinitionStore } from "./workflow-definition-store";
import { useWorkflowEditorStore } from "./workflow-editor-store";
import { useWorkspaceStore } from "./workspace-store";

export function resetRuntimeDerivedRendererState(): void {
  useWorkspaceStore.getState().resetRuntimeState();
  resetChatRuntimeState();
  useConversationNavigatorStore.getState().resetRuntimeState();
  resetConversationProjectionRuntime();
  useConversationStore.getState().reset();
  useConversationPaneStore.getState().resetRuntimeState();
  useWorkflowDefinitionStore.getState().resetRuntimeState();
  useWorkflowEditorStore.getState().resetRuntimeState();
  useSemanticGraphStore.getState().resetRuntimeState();
}
