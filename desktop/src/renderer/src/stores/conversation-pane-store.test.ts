import { beforeEach, describe, expect, test } from "vitest";

import { WorkspaceLikeLayoutEngine } from "../workspace-layout/layout-engine";
import { WorkspaceLayoutStore } from "../workspace-layout/layout-store";
import { createRealWorkspaceScene } from "../workspace-layout/workspace-scene";
import { useConversationPaneStore } from "./conversation-pane-store";

describe("conversation pane binding store", () => {
  beforeEach(() => {
    useConversationPaneStore.getState().resetRuntimeState();
  });

  test("indexes zero-or-more pane ids and the focused conversation without duplicate rows", () => {
    const store = workspaceStore();
    const first = store.openPane({
      easyButtonConfig: { conversationId: "conversation_shared" },
      surfaceKind: "easy-button",
    });
    const second = store.openPane({
      easyButtonConfig: { conversationId: "conversation_shared" },
      surfaceKind: "easy-button",
    });
    store.focusPane(first);

    useConversationPaneStore
      .getState()
      .syncWorkspace("workspace_api", store.toScene(), store.focusedPaneId());

    const workspace = useConversationPaneStore.getState().workspaces.get("workspace_api");
    expect(workspace?.focusedConversationId).toBe("conversation_shared");
    expect(workspace?.paneIdsByConversationId.get("conversation_shared")).toEqual([first, second]);
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
