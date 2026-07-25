import { workspaceUILayoutSchemaVersion, type WorkspaceUILayout } from "@generated/backend";
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
  test("focuses the existing matching pane instead of opening a duplicate", () => {
    const store = workspaceStore();
    const paneId = store.openPane(boundRequest("conversation_shared"));
    store.focusPane(paneId);
    store.focusPane("workspace_pane_0");
    const paneCount = store.toScene().totalPanes;

    const result = presentConversationPane(store, {
      conversationId: "conversation_shared",
      title: "Shared topic",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "focused", paneId });
    expect(store.focusedPaneId()).toBe(paneId);
    expect(store.toScene().totalPanes).toBe(paneCount);
  });

  test("rejects duplicate conversation bindings instead of selecting among them", () => {
    const store = workspaceStoreWithDuplicateConversationBindings();
    store.focusPane("workspace_pane_0");
    const paneCount = store.toScene().totalPanes;

    const result = presentConversationPane(store, {
      conversationId: "conversation_shared",
      title: "Shared topic",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({
      kind: "blocked",
      reason: "This conversation is already bound to multiple panes.",
    });
    expect(store.focusedPaneId()).toBe("workspace_pane_0");
    expect(store.toScene().totalPanes).toBe(paneCount);
  });

  test("opens a typed conversation pane when the conversation has no pane", () => {
    const store = workspaceStore();
    const initialPaneId = store.focusedPaneId();

    const result = presentConversationPane(store, {
      conversationId: "conversation_zero_panes",
      title: "Persistent topic",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "opened", paneId: initialPaneId });
    const pane = store
      .toScene()
      .panes.find(
        (candidate) => candidate.conversationConfig?.conversationId === "conversation_zero_panes",
      );
    expect(pane).toMatchObject({
      surfaceKind: "conversation",
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

  test("opens an explicitly folderless conversation pane without workspace-derived bindings", () => {
    const store = workspaceStore();

    const result = presentConversationPane(store, {
      conversationId: "conversation_folderless",
      destination: { kind: "new-pane" },
      resourceBindings: [],
      title: "Folderless topic",
      workspaceId: "workspace_api",
    });

    expect(result.kind).toBe("opened");
    const pane = store
      .toScene()
      .panes.find(
        (candidate) => candidate.conversationConfig?.conversationId === "conversation_folderless",
      );
    expect(pane).toMatchObject({
      conversationConfig: {
        conversationId: "conversation_folderless",
        resourceBindings: [],
      },
      surfaceKind: "conversation",
      title: "Folderless topic",
    });
  });

  test("opens newly created conversations beyond the former conversation pane cap", () => {
    const store = workspaceStore();

    for (let index = 0; index < 11; index += 1) {
      const result = presentConversationPane(store, {
        conversationId: `conversation_new_${index}`,
        destination: { kind: "new-pane" },
        title: "New conversation",
        workspaceId: "workspace_api",
      });

      expect(result.kind).toBe("opened");
    }

    expect(
      store.toScene().panes.filter((pane) => pane.surfaceKind === "conversation"),
    ).toHaveLength(11);
    expect(
      preflightConversationPanePlacement(store, {
        destination: { kind: "new-pane" },
        workspaceId: "workspace_api",
      }),
    ).toEqual({ kind: "ready" });
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
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "opened", paneId: emptyPaneId });
    expect(store.toScene().paneById.get(emptyPaneId)).toMatchObject({
      conversationConfig: { conversationId: "conversation_new" },
      surfaceKind: "conversation",
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
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "blocked", reason: "The selected frame no longer exists." });
    expect(store.toScene().totalPanes).toBe(1);
    expect(
      store
        .toScene()
        .panes.some((pane) => pane.conversationConfig?.conversationId === "conversation_new"),
    ).toBe(false);
  });

  test("focuses the unique matching pane when the preferred hint is stale", () => {
    const store = workspaceStore();
    const paneId = store.openPane(boundRequest("conversation_shared"));

    const result = presentConversationPane(store, {
      conversationId: "conversation_shared",
      preferredPaneId: "workspace_pane_missing",
      title: "Shared topic",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({ kind: "focused", paneId });
  });

  test("rejects new placement when the conversation already has a pane", () => {
    const store = workspaceStore();
    store.openPane(boundRequest("conversation_shared"));
    const paneCount = store.toScene().totalPanes;

    const result = presentConversationPane(store, {
      conversationId: "conversation_shared",
      destination: { kind: "new-pane" },
      title: "Shared topic",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({
      kind: "blocked",
      reason: "This conversation already has an open pane.",
    });
    expect(store.toScene().totalPanes).toBe(paneCount);
  });

  test("maps a backend presentation intent into the same coordinator request", () => {
    expect(
      conversationPaneRequestForPresentationIntent({
        focusExistingConversationPane: {
          target: {
            conversationId: "conversation_shared",
            preferredPaneId: "pane_shared",
            resourceBindings: [{ folder: { rootPath: "/tmp/setta-api" }, kind: "folder" }],
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
      resourceBindings: [{ folder: { rootPath: "/tmp/setta-api" }, kind: "folder" }],
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

function workspaceStoreWithDuplicateConversationBindings() {
  const { focusedPaneId, scene } = createRealWorkspaceScene({
    storedLayout: duplicateConversationBindingLayout(),
    workspaceId: "workspace_api",
    workspaceName: "api",
  });
  return new WorkspaceLayoutStore(new WorkspaceLikeLayoutEngine(scene), scene, focusedPaneId, {
    paneLimits: defaultRealWorkspacePaneLimits,
  });
}

function duplicateConversationBindingLayout(): WorkspaceUILayout {
  return {
    columns: [
      {
        columnId: "workspace_column_0",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 0,
        paneIds: ["workspace_pane_0", "workspace_pane_1", "workspace_pane_2"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 520 },
      },
    ],
    focusedPaneId: "workspace_pane_0",
    panes: [
      persistedPane("workspace_pane_0", "workspace_surface_0", "empty-frame"),
      persistedPane("workspace_pane_1", "workspace_surface_1", "conversation"),
      persistedPane("workspace_pane_2", "workspace_surface_2", "conversation"),
    ],
    schemaVersion: workspaceUILayoutSchemaVersion,
    workspaceId: "workspace_api",
  };
}

function persistedPane(
  paneId: string,
  surfaceId: string,
  surfaceKind: "conversation" | "empty-frame",
): WorkspaceUILayout["panes"][number] {
  const fields = {
    columnId: "workspace_column_0",
    heat: 0,
    paneId,
    sequence: Number(paneId.split("_").at(-1) ?? "0"),
    subtitle: "Topic conversation",
    surfaceId,
    surfaceKind,
    title: "Shared topic",
    tone: "cyan" as const,
    weight: 1,
  };
  if (surfaceKind === "conversation") {
    return {
      ...fields,
      conversationConfig: { conversationId: "conversation_shared" },
      surfaceKind: "conversation",
    };
  }
  return {
    ...fields,
    conversationConfig: null,
    surfaceKind: "empty-frame",
  };
}

function boundRequest(conversationId: string) {
  return {
    conversationConfig: { conversationId },
    surfaceKind: "conversation",
    title: conversationId,
  } as const;
}
