import type { CorruptionSummary, WorkspaceSession } from "@generated/backend";
import { beforeEach, describe, expect, test } from "vitest";

import { useChatStore } from "./chat-store";
import { resetRuntimeDerivedRendererState } from "./runtime-derived-state";
import { useSemanticGraphStore } from "./semantic-graph-store";
import { useWorkflowDefinitionStore } from "./workflow-definition-store";
import { useWorkflowEditorStore } from "./workflow-editor-store";
import { useWorkspaceStore } from "./workspace-store";

describe("runtime-derived renderer state reset", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    useChatStore.setState(useChatStore.getInitialState(), true);
    useWorkflowDefinitionStore.setState(useWorkflowDefinitionStore.getInitialState(), true);
    useWorkflowEditorStore.setState(useWorkflowEditorStore.getInitialState(), true);
    useSemanticGraphStore.setState(useSemanticGraphStore.getInitialState(), true);
  });

  test("clears workspace chat workflow and semantic state together", () => {
    useWorkspaceStore.setState({
      session: workspaceSession("workspace_local"),
      status: "ready",
    });
    useChatStore.setState({
      conversationListsByWorkspaceId: {
        workspace_local: {
          conversations: [],
          corruption: emptyCorruption(),
          diagnostics: [],
          error: null,
          loading: false,
        },
      },
      lastEventSequence: 42,
      lastEventStreamId: "stream_local",
      status: "ready",
      workspaceId: "workspace_local",
    });
    useWorkflowDefinitionStore.setState({
      selectedDefinitionIdsByWorkspaceId: { workspace_local: "definition_local" },
      workflowDefinitionsByWorkspaceId: {
        workspace_local: { definitions: [], error: null, loading: false },
      },
    });
    useWorkflowEditorStore.setState({
      activityFocusRequestSeq: 3,
      selectedWorkflowSettingsTarget: {
        definitionDescription: "",
        definitionId: "definition_local",
        definitionName: "Local workflow",
        editable: true,
        viewMode: "draft",
        workspaceId: "workspace_local",
      },
    });
    useSemanticGraphStore.setState({
      selectedNodeTarget: {
        nodeId: "semantic_local",
        nodeKind: "concept",
        nodeLabel: "Local node",
        workspaceId: "workspace_local",
      },
    });

    resetRuntimeDerivedRendererState();

    expect(useWorkspaceStore.getState()).toMatchObject({
      error: null,
      operation: null,
      session: null,
      status: "idle",
    });
    expect(useChatStore.getState()).toMatchObject({
      conversationListsByWorkspaceId: {},
      lastEventSequence: 0,
      lastEventStreamId: "",
      selectedConversation: null,
      status: "idle",
      workspaceId: null,
    });
    expect(useWorkflowDefinitionStore.getState()).toMatchObject({
      selectedDefinitionIdsByWorkspaceId: {},
      workflowDefinitionsByWorkspaceId: {},
    });
    expect(useWorkflowEditorStore.getState()).toMatchObject({
      activityFocusRequestSeq: 0,
      selectedNodeActivityFocus: null,
      selectedNodeTarget: null,
      selectedWorkflowSettingsTarget: null,
    });
    expect(useSemanticGraphStore.getState().selectedNodeTarget).toBeNull();
  });
});

function workspaceSession(workspaceId: string): WorkspaceSession {
  return {
    activeWorkspaces: [
      {
        displayName: workspaceId,
        id: workspaceId,
        lastOpenedAt: "2026-07-03T12:00:00Z",
        rootPath: `/tmp/${workspaceId}`,
      },
    ],
    recentWorkspaces: [],
    selectedWorkspaceId: workspaceId,
  };
}

function emptyCorruption(): CorruptionSummary {
  return {
    byKind: [],
    bySeverity: [],
    hasCorruption: false,
    total: 0,
  };
}
