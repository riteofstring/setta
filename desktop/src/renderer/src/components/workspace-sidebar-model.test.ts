import type { ConversationListItem, WorkspaceSummary } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { selectSidebarNavigationItems } from "./workspace-sidebar-model";

describe("workspace sidebar navigation model", () => {
  test("maps selected expanded workspace conversations into the active workspace stream", () => {
    const api = workspace("workspace_api", "api");
    const web = workspace("workspace_web", "web");

    const items = selectSidebarNavigationItems({
      activeWorkspaces: [api, web],
      conversations: [
        conversationListItem("conversation_web_build", "Build web", {
          latestReadRelevantMarker: 2,
          readMarker: 1,
        }),
        conversationListItem("conversation_web_fix", "Fix web"),
      ],
      expandedWorkspaceId: web.id,
      recentWorkspaces: [web, api],
      selectedConversationId: "conversation_web_fix",
      selectedWorkspaceId: web.id,
      visibleConversationLimit: 80,
    });

    expect(items.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "active-workspace:workspace_web",
      "conversation:conversation_web_build",
      "conversation:conversation_web_fix",
    ]);
    expect(items[1]).toMatchObject({
      commands: {
        primary: {
          nextExpandedWorkspaceId: "",
          selectWorkspace: false,
          type: "activateWorkspace",
          workspaceId: web.id,
        },
      },
      expanded: true,
      kind: "activeWorkspace",
      selected: true,
    });
    expect(items[2]).toMatchObject({
      commands: {
        primary: { conversationId: "conversation_web_build", type: "selectConversation" },
      },
      kind: "conversation",
      selected: false,
      unread: true,
    });
    expect(items[3]).toMatchObject({
      kind: "conversation",
      selected: true,
      unread: false,
    });
  });

  test("keeps inactive recent workspaces selectable and removable", () => {
    const api = workspace("workspace_api", "api");
    const docs = workspace("workspace_docs", "docs");

    const items = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      conversations: [],
      expandedWorkspaceId: "",
      recentWorkspaces: [docs, api],
      selectedConversationId: "",
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
    });

    expect(items.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "recent-workspace:workspace_docs",
    ]);
    expect(items[1]).toMatchObject({
      commands: {
        primary: {
          rootPath: docs.rootPath,
          type: "openRecentWorkspace",
          workspaceId: docs.id,
        },
        remove: { type: "removeRecentWorkspace", workspaceId: docs.id },
      },
      kind: "recentWorkspace",
      label: "docs",
    });
  });

  test("adds empty and more conversation rows from conversation state", () => {
    const api = workspace("workspace_api", "api");
    const emptyItems = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      conversations: [],
      expandedWorkspaceId: api.id,
      recentWorkspaces: [],
      selectedConversationId: "",
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
    });

    expect(emptyItems.map((item) => item.kind)).toEqual([
      "activeWorkspace",
      "emptyConversationList",
    ]);

    const conversations = Array.from({ length: 3 }, (_, index) =>
      conversationListItem(`conversation_${index}`, `Chat ${index}`),
    );
    const limitedItems = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      conversations,
      expandedWorkspaceId: api.id,
      recentWorkspaces: [],
      selectedConversationId: "conversation_0",
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 1,
    });

    expect(limitedItems.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "conversation:conversation_0",
      "conversation-more:workspace_api",
    ]);
    expect(limitedItems[2]).toMatchObject({
      commands: { primary: { type: "showMoreConversations" } },
      hiddenCount: 2,
      kind: "moreConversations",
    });
  });
});

function workspace(id: string, displayName: string): WorkspaceSummary {
  return {
    displayName,
    id,
    lastOpenedAt: "2026-05-29T20:00:00Z",
    rootPath: `/tmp/${displayName}`,
  };
}

function conversationListItem(
  id: string,
  title: string,
  markers: { latestReadRelevantMarker: number; readMarker: number } = {
    latestReadRelevantMarker: 0,
    readMarker: 0,
  },
): ConversationListItem {
  return {
    activeRunId: "",
    conversation: {
      archivedAt: "",
      codexSettings: null,
      createdAt: "2026-05-29T20:00:00Z",
      harnessRefs: [],
      id,
      schemaVersion: 1,
      title,
      updatedAt: "2026-05-29T20:00:00Z",
      workspaceId: "workspace_api",
    },
    latestReadRelevantMarker: markers.latestReadRelevantMarker,
    messageCount: 1,
    readMarker: markers.readMarker,
  };
}
