import { resetChatRuntimeState } from "./chat-store-runtime-reset";
import { useSemanticGraphStore } from "./semantic-graph-store";
import { useWorkflowDefinitionStore } from "./workflow-definition-store";
import { useWorkflowEditorStore } from "./workflow-editor-store";
import { useWorkspaceStore } from "./workspace-store";

export function resetRuntimeDerivedRendererState(): void {
  useWorkspaceStore.getState().resetRuntimeState();
  resetChatRuntimeState();
  useWorkflowDefinitionStore.getState().resetRuntimeState();
  useWorkflowEditorStore.getState().resetRuntimeState();
  useSemanticGraphStore.getState().resetRuntimeState();
}
