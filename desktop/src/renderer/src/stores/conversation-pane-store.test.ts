import { workspaceUILayoutSchemaVersion, type WorkspaceUILayout } from "@generated/backend";
import { beforeEach, describe, expect, test } from "vitest";

import { WorkspaceLikeLayoutEngine } from "../workspace-layout/layout-engine";
import { WorkspaceLayoutStore } from "../workspace-layout/layout-store";
import { createRealWorkspaceScene } from "../workspace-layout/workspace-scene";
import { useConversationPaneStore } from "./conversation-pane-store";

describe("conversation pane binding store", () => {
  beforeEach(() => {
    useConversationPaneStore.getState().resetRuntimeState();
  });

  test("indexes optional pane ids and the focused conversation without duplicate rows", () => {
    const store = workspaceStore();
    const paneId = store.openPane({
      easyButtonConfig: { conversationId: "conversation_shared" },
      surfaceKind: "easy-button",
    });
    store.focusPane(paneId);

    useConversationPaneStore
      .getState()
      .syncWorkspace("workspace_api", store.toScene(), store.focusedPaneId());

    const workspace = useConversationPaneStore.getState().workspaces.get("workspace_api");
    expect(workspace?.focusedConversationId).toBe("conversation_shared");
    expect(workspace?.focusedPaneId).toBe(paneId);
    expect(workspace?.paneIdByConversationId.get("conversation_shared")).toBe(paneId);

    store.focusPane("workspace_pane_0");
    useConversationPaneStore
      .getState()
      .syncWorkspace("workspace_api", store.toScene(), store.focusedPaneId());

    expect(useConversationPaneStore.getState().workspaces.get("workspace_api")).toMatchObject({
      focusedConversationId: null,
      focusedPaneId: "workspace_pane_0",
    });
  });

  test("rejects duplicate conversation bindings", () => {
    const store = workspaceStoreWithDuplicateConversationBindings();

    expect(() =>
      useConversationPaneStore
        .getState()
        .syncWorkspace("workspace_api", store.toScene(), store.focusedPaneId()),
    ).toThrow("Conversation conversation_shared is bound to multiple panes.");
  });

  test("retains the focused pane hint when the pane is not conversation-bound", () => {
    const store = workspaceStore();
    const settingsPaneId = store.openPane({ surfaceKind: "settings-dom" });

    useConversationPaneStore
      .getState()
      .syncWorkspace("workspace_api", store.toScene(), store.focusedPaneId());

    expect(useConversationPaneStore.getState().workspaces.get("workspace_api")).toMatchObject({
      focusedConversationId: null,
      focusedPaneId: settingsPaneId,
    });
  });
});

function workspaceStore() {
  const { focusedPaneId, scene } = createRealWorkspaceScene({
    storedLayout: null,
    workspaceId: "workspace_api",
    workspaceName: "api",
  });
  return new WorkspaceLayoutStore(new WorkspaceLikeLayoutEngine(scene), scene, focusedPaneId);
}

function workspaceStoreWithDuplicateConversationBindings() {
  const { focusedPaneId, scene } = createRealWorkspaceScene({
    storedLayout: duplicateConversationBindingLayout(),
    workspaceId: "workspace_api",
    workspaceName: "api",
  });
  return new WorkspaceLayoutStore(new WorkspaceLikeLayoutEngine(scene), scene, focusedPaneId);
}

function duplicateConversationBindingLayout(): WorkspaceUILayout {
  return {
    columns: [
      {
        columnId: "workspace_column_0",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 0,
        paneIds: ["workspace_pane_0", "workspace_pane_1"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 520 },
      },
    ],
    focusedPaneId: "workspace_pane_0",
    panes: [
      persistedConversationPane("workspace_pane_0", "workspace_surface_0", 0),
      persistedConversationPane("workspace_pane_1", "workspace_surface_1", 1),
    ],
    schemaVersion: workspaceUILayoutSchemaVersion,
    workspaceId: "workspace_api",
  };
}

function persistedConversationPane(
  paneId: string,
  surfaceId: string,
  sequence: number,
): WorkspaceUILayout["panes"][number] {
  return {
    columnId: "workspace_column_0",
    easyButtonConfig: { conversationId: "conversation_shared" },
    heat: 0,
    paneId,
    sequence,
    subtitle: "Topic conversation",
    surfaceId,
    surfaceKind: "easy-button",
    title: "Shared topic",
    tone: "cyan",
    weight: 1,
  };
}
