import { describe, expect, test } from "vitest";

import { presentConversationPane } from "./conversation-pane-coordinator";
import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { WorkspaceLayoutStore } from "./layout-store";
import { defaultRealWorkspacePaneLimits, createRealWorkspaceScene } from "./workspace-scene";

describe("conversation pane coordinator", () => {
  test("focuses the most recently focused matching pane instead of opening a duplicate", () => {
    const store = workspaceStore();
    const first = store.openPane(boundRequest("conversation_shared"));
    const second = store.openPane(boundRequest("conversation_shared"));
    store.focusPane(first);
    store.focusPane(second);
    store.focusPane("workspace_pane_0");
    const paneCount = store.toScene().totalPanes;

    const result = presentConversationPane(store, {
      conversationId: "conversation_shared",
      title: "Shared topic",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "focused", paneId: second });
    expect(store.focusedPaneId()).toBe(second);
    expect(store.toScene().totalPanes).toBe(paneCount);
  });

  test("opens a typed Easy Button view when the conversation has no pane", () => {
    const store = workspaceStore();

    const result = presentConversationPane(store, {
      conversationId: "conversation_zero_panes",
      title: "Persistent topic",
      workspaceId: "workspace_api",
    });

    expect(result.kind).toBe("opened");
    const pane = store
      .toScene()
      .panes.find(
        (candidate) => candidate.easyButtonConfig?.conversationId === "conversation_zero_panes",
      );
    expect(pane).toMatchObject({
      surfaceKind: "easy-button",
      title: "Persistent topic",
    });
  });

  test("rejects a request for a workspace that is not mounted", () => {
    const result = presentConversationPane(workspaceStore(), {
      conversationId: "conversation_other",
      title: "Other",
      workspaceId: "workspace_other",
    });

    expect(result).toMatchObject({
      kind: "blocked",
      reason: expect.stringContaining("not mounted"),
    });
  });
});

function workspaceStore() {
  const { focusedPaneId, scene } = createRealWorkspaceScene({
    storedLayout: null,
    workspaceId: "workspace_api",
    workspaceName: "api",
  });
  return new WorkspaceLayoutStore(new WorkspaceLikeLayoutEngine(scene), scene, focusedPaneId, {
    paneLimits: defaultRealWorkspacePaneLimits,
  });
}

function boundRequest(conversationId: string) {
  return {
    easyButtonConfig: { conversationId },
    surfaceKind: "easy-button",
    title: conversationId,
  } as const;
}
