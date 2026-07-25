import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import type { WorkspaceSession } from "@generated/backend";

import { useConversationStore } from "../../stores/conversation-store";
import {
  EasyButtonSurface,
  conversationSurfaceWorkspaceId,
} from "./easy-button-conversation-surface";

const workspaceId = "workspace_topic";

describe("Easy Button conversation surface workspace context", () => {
  beforeEach(() => {
    useConversationStore.getState().reset();
  });

  test("reports an unloaded bound pane without reading selected-workspace state", () => {
    const unloaded = renderToString(<EasyButtonSurface conversationId="conversation_unloaded" />);

    expect(unloaded).toContain('data-conversation-id="conversation_unloaded"');
    expect(unloaded).toContain('data-easy-button-projection="unloaded"');
    expect(unloaded).toContain("Conversation projection is not loaded");
  });

  test("opens an explicitly folderless pane without requesting a folder", () => {
    const folderless = renderToString(
      <EasyButtonSurface
        conversationId="conversation_folderless"
        paneId="pane_folderless"
        resourceBindings={[]}
        workspaceId={workspaceId}
      />,
    );
    const input = folderless.match(/<input[^>]*data-testid="easy-button-input"[^>]*>/)?.[0] ?? "";

    expect(folderless).toContain('data-conversation-id="conversation_folderless"');
    expect(folderless).toContain('data-easy-button-projection="unloaded"');
    expect(folderless).not.toContain('data-testid="easy-button-folder-resource"');
    expect(folderless).not.toContain("Choose folder");
    expect(folderless).not.toContain("Conversation commands are unavailable");
    expect(input).not.toContain("disabled");
  });

  test("does not treat unresolved folder bindings as folderless", () => {
    expect(
      conversationSurfaceWorkspaceId({
        projection: undefined,
        resourceBindings: [{ folder: { rootPath: "/tmp/setta-api" }, kind: "folder" }],
        workspaceId: "workspace_mounted",
        workspaceSession: null,
      }),
    ).toBeUndefined();
  });

  test("resolves folder bindings through active workspace roots", () => {
    expect(
      conversationSurfaceWorkspaceId({
        projection: undefined,
        resourceBindings: [{ folder: { rootPath: "/tmp/setta-api" }, kind: "folder" }],
        workspaceId: "workspace_mounted",
        workspaceSession: workspaceSession(),
      }),
    ).toBe("workspace_api");
  });

  test("keeps explicit empty bindings folderless", () => {
    expect(
      conversationSurfaceWorkspaceId({
        projection: undefined,
        resourceBindings: [],
        workspaceId,
        workspaceSession: workspaceSession(),
      }),
    ).toBeNull();
  });
});

function workspaceSession(): WorkspaceSession {
  return {
    activeWorkspaces: [
      {
        displayName: "api",
        id: "workspace_api",
        lastOpenedAt: "2026-07-24T00:00:00Z",
        rootPath: "/tmp/setta-api",
      },
    ],
    recentWorkspaces: [],
    selectedWorkspaceId: "workspace_api",
    workspaceAvailabilities: [
      { available: true, unavailableReason: "", workspaceId: "workspace_api" },
    ],
  };
}
