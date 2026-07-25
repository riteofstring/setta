import { afterEach, describe, expect, test } from "vitest";

import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { WorkspaceLayoutStore } from "./layout-store";
import { bindConversationPaneFolderResource } from "./conversation-pane-resource-binding";
import { createWorkspaceLayoutTestScene } from "./workspace-scene.test-fixtures";

describe("conversation pane resource binding", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("binds the selected folder to the target conversation pane", () => {
    const store = createStore();

    bindConversationPaneFolderResource(store, {
      conversationId: "conversation_layout_test",
      paneId: "workspace_pane_2",
      rootPath: "/tmp/setta-bound",
      workspaceId: "workspace_bound",
    });

    const pane = store.toScene().paneById.get("workspace_pane_2");
    expect(pane).toMatchObject({
      conversationConfig: {
        conversationId: "conversation_layout_test",
        resourceBindings: [{ folder: { rootPath: "/tmp/setta-bound" }, kind: "folder" }],
      },
      surfaceKind: "conversation",
      title: "Topic",
    });
  });

  test("rejects a request for another pane or conversation", () => {
    const store = createStore();

    expect(() =>
      bindConversationPaneFolderResource(store, {
        conversationId: "conversation_layout_test",
        paneId: "workspace_pane_3",
        rootPath: "/tmp/setta-bound",
        workspaceId: "workspace_bound",
      }),
    ).toThrow("Pane workspace_pane_3 is not a conversation pane.");
    expect(() =>
      bindConversationPaneFolderResource(store, {
        conversationId: "conversation_other",
        paneId: "workspace_pane_2",
        rootPath: "/tmp/setta-bound",
        workspaceId: "workspace_bound",
      }),
    ).toThrow("Pane workspace_pane_2 belongs to another conversation.");
  });
});

function createStore(): WorkspaceLayoutStore {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  const { focusedPaneId, scene } = createWorkspaceLayoutTestScene({
    storedLayout: null,
    workspaceId: "workspace_layout_test",
    workspaceName: "Layout Test",
  });
  return new WorkspaceLayoutStore(new WorkspaceLikeLayoutEngine(scene), scene, focusedPaneId);
}
