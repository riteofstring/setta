import { describe, expect, test } from "vitest";

import {
  conversationPaneRequestForPresentationIntent,
  presentConversationPane,
} from "./conversation-pane-coordinator";
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

  test("honors a validated preferred pane before the most recently focused matching view", () => {
    const store = workspaceStore();
    const preferred = store.openPane(boundRequest("conversation_shared"));
    const recent = store.openPane(boundRequest("conversation_shared"));
    store.focusPane(preferred);
    store.focusPane(recent);

    const result = presentConversationPane(store, {
      conversationId: "conversation_shared",
      preferredPaneId: preferred,
      title: "Shared topic",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "focused", paneId: preferred });
  });

  test("maps a backend presentation intent into the same coordinator request", () => {
    expect(
      conversationPaneRequestForPresentationIntent({
        focusExistingConversationPane: {
          target: {
            conversationId: "conversation_shared",
            preferredPaneId: "pane_shared",
            title: "Shared topic",
            workspaceId: "workspace_api",
          },
        },
        id: "master-presentation:input_shared",
        inputId: "input_shared",
        kind: "focus_existing_conversation_pane",
        openConversationPane: null,
        openSideConversation: null,
        originatingConversationId: null,
        originatingConversationInputId: null,
        originatingPaneId: null,
        originatingWorkspaceId: null,
        showMasterReply: null,
        source: "shell",
      }),
    ).toEqual({
      conversationId: "conversation_shared",
      preferredPaneId: "pane_shared",
      title: "Shared topic",
      workspaceId: "workspace_api",
    });
  });

  test("keeps the requested existing conversation focused when another pane was maximized", () => {
    const store = workspaceStore();
    const conversationPaneId = store.openPane(boundRequest("conversation_shared"));
    store.togglePaneMaximized("workspace_pane_1");

    const result = presentConversationPane(store, {
      conversationId: "conversation_shared",
      title: "Shared topic",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "focused", paneId: conversationPaneId });
    expect(store.getSnapshot().maximizedPaneId).toBeNull();
    expect(store.focusedPaneId()).toBe(conversationPaneId);
  });

  test("keeps a newly opened conversation focused when another pane was maximized", () => {
    const store = workspaceStore();
    store.togglePaneMaximized("workspace_pane_1");

    const result = presentConversationPane(store, {
      conversationId: "conversation_zero_panes",
      title: "Persistent topic",
      workspaceId: "workspace_api",
    });

    expect(result.kind).toBe("opened");
    if (result.kind !== "opened") {
      throw new Error(`conversation pane was not opened: ${JSON.stringify(result)}`);
    }
    expect(store.getSnapshot().maximizedPaneId).toBeNull();
    expect(store.focusedPaneId()).toBe(result.paneId);
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
