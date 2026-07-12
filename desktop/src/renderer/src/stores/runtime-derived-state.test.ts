import type { WorkspaceSession } from "@generated/backend";
import { beforeEach, describe, expect, test } from "vitest";

import { useConversationNavigatorStore } from "./conversation-navigator-store";
import { useConversationPaneStore } from "./conversation-pane-store";
import { useConversationRoutingStore } from "./conversation-routing-store";
import { resetRuntimeDerivedRendererState } from "./runtime-derived-state";
import { useWorkspaceStore } from "./workspace-store";

describe("runtime-derived renderer state reset", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    useConversationNavigatorStore.setState(useConversationNavigatorStore.getInitialState(), true);
    useConversationPaneStore.setState(useConversationPaneStore.getInitialState(), true);
    useConversationRoutingStore.setState(useConversationRoutingStore.getInitialState(), true);
  });

  test("clears workspace and topic-conversation presentation state together", () => {
    useWorkspaceStore.setState({
      session: workspaceSession("workspace_local"),
      status: "ready",
    });
    useConversationNavigatorStore.setState({
      query: "stale topic",
      workspaces: {
        workspace_local: {
          error: null,
          items: [],
          loading: false,
          nextCursor: null,
        },
      },
    });
    useConversationPaneStore.setState({
      workspaces: new Map([
        [
          "workspace_local",
          {
            focusedConversationId: "conversation_local",
            focusedPaneId: "pane_local",
            paneIdsByConversationId: new Map([["conversation_local", ["pane_local"]]]),
          },
        ],
      ]),
    });
    useConversationRoutingStore.setState({
      presentations: new Map([
        [
          JSON.stringify(["workspace_local", "conversation_local"]),
          {
            clarification: null,
            inputId: "input_local",
            masterReply: null,
            routingAttempt: 1,
            routingFailure: null,
            sequence: 1,
          },
        ],
      ]),
    });

    resetRuntimeDerivedRendererState();

    expect(useWorkspaceStore.getState()).toMatchObject({
      error: null,
      operation: null,
      session: null,
      status: "idle",
    });
    expect(useConversationNavigatorStore.getState()).toMatchObject({
      query: "",
      workspaces: {},
    });
    expect(useConversationPaneStore.getState().workspaces.size).toBe(0);
    expect(useConversationRoutingStore.getState().presentations.size).toBe(0);
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
