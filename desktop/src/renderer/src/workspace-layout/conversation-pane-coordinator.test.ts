import { describe, expect, test } from "vitest";

import {
  conversationPaneRequestForPresentationIntent,
  preflightConversationPanePlacement,
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
      viewAction: "focus-or-open",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "focused", paneId: second });
    expect(store.focusedPaneId()).toBe(second);
    expect(store.toScene().totalPanes).toBe(paneCount);
  });

  test("opens another Easy Button view when duplicate presentation is requested", () => {
    const store = workspaceStore();
    const existingPaneId = store.openPane(boundRequest("conversation_shared"));
    const paneCount = store.toScene().totalPanes;

    const result = presentConversationPane(store, {
      conversationId: "conversation_shared",
      title: "Shared topic",
      viewAction: "open-new-view",
      workspaceId: "workspace_api",
    });

    expect(result.kind).toBe("opened");
    if (result.kind !== "opened") {
      throw new Error(`conversation pane was not opened: ${JSON.stringify(result)}`);
    }
    expect(result.paneId).not.toBe(existingPaneId);
    expect(store.toScene().totalPanes).toBe(paneCount + 1);
    expect(
      store
        .toScene()
        .panes.filter((pane) => pane.easyButtonConfig?.conversationId === "conversation_shared"),
    ).toHaveLength(2);
  });

  test("opens a typed Easy Button view when the conversation has no pane", () => {
    const store = workspaceStore();
    const initialPaneId = store.focusedPaneId();

    const result = presentConversationPane(store, {
      conversationId: "conversation_zero_panes",
      title: "Persistent topic",
      viewAction: "focus-or-open",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "opened", paneId: initialPaneId });
    const pane = store
      .toScene()
      .panes.find(
        (candidate) => candidate.easyButtonConfig?.conversationId === "conversation_zero_panes",
      );
    expect(pane).toMatchObject({
      surfaceKind: "easy-button",
      title: "Persistent topic",
    });
    expect(store.toScene().totalPanes).toBe(1);
    expect(store.toScene().panes.some((candidate) => candidate.surfaceKind === "empty-frame")).toBe(
      false,
    );
  });

  test("opens a newly created conversation in a new pane without consuming the only empty frame", () => {
    const store = workspaceStore();
    const initialPaneId = store.focusedPaneId();

    const result = presentConversationPane(store, {
      conversationId: "conversation_new",
      destination: { kind: "new-pane" },
      title: "New conversation",
      viewAction: "focus-or-open",
      workspaceId: "workspace_api",
    });

    expect(result.kind).toBe("opened");
    if (result.kind !== "opened") {
      throw new Error(`conversation pane was not opened: ${JSON.stringify(result)}`);
    }
    expect(result.paneId).not.toBe(initialPaneId);
    expect(store.toScene().totalPanes).toBe(2);
    expect(store.toScene().paneById.get(initialPaneId)?.surfaceKind).toBe("empty-frame");
  });

  test("opens a newly created conversation in the requested empty frame", () => {
    const store = workspaceStore();
    const emptyPaneId = store.focusedPaneId();

    expect(
      preflightConversationPanePlacement(store, {
        destination: { kind: "empty-frame", paneId: emptyPaneId },
        workspaceId: "workspace_api",
      }),
    ).toEqual({ kind: "ready" });
    const result = presentConversationPane(store, {
      conversationId: "conversation_new",
      destination: { kind: "empty-frame", paneId: emptyPaneId },
      title: "New conversation",
      viewAction: "focus-or-open",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "opened", paneId: emptyPaneId });
    expect(store.toScene().paneById.get(emptyPaneId)).toMatchObject({
      easyButtonConfig: { conversationId: "conversation_new" },
      surfaceKind: "easy-button",
      title: "New conversation",
    });
  });

  test("rejects exact empty-frame placement when the selected frame disappeared", () => {
    const store = workspaceStore();

    expect(
      preflightConversationPanePlacement(store, {
        destination: { kind: "empty-frame", paneId: "workspace_pane_missing" },
        workspaceId: "workspace_api",
      }),
    ).toEqual({ kind: "blocked", reason: "The selected frame no longer exists." });
    const result = presentConversationPane(store, {
      conversationId: "conversation_new",
      destination: { kind: "empty-frame", paneId: "workspace_pane_missing" },
      title: "New conversation",
      viewAction: "focus-or-open",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "blocked", reason: "The selected frame no longer exists." });
    expect(store.toScene().totalPanes).toBe(1);
    expect(
      store
        .toScene()
        .panes.some((pane) => pane.easyButtonConfig?.conversationId === "conversation_new"),
    ).toBe(false);
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
      viewAction: "focus-or-open",
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
      viewAction: "focus-or-open",
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
      viewAction: "focus-or-open",
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
      viewAction: "focus-or-open",
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
      viewAction: "focus-or-open",
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
