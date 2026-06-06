import type { ConversationListItem, WorkspaceSummary } from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  selectSidebarNavigationItems,
  type SidebarWorkspaceConversationList,
} from "./workspace-sidebar-model";

describe("workspace sidebar navigation model", () => {
  test("maps selected expanded workspace conversations into the active workspace stream", () => {
    const api = workspace("workspace_api", "api");
    const web = workspace("workspace_web", "web");

    const items = selectSidebarNavigationItems({
      activeWorkspaces: [api, web],
      expandedWorkspaceIds: new Set([web.id]),
      recentWorkspaces: [web, api],
      selectedConversationId: "conversation_web_fix",
      selectedWorkspaceId: web.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [web.id]: conversationList([
          conversationListItem("conversation_web_build", "Build web", web.id, {
            latestReadRelevantMarker: 2,
            readMarker: 1,
          }),
          conversationListItem("conversation_web_fix", "Fix web", web.id),
        ]),
      },
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
          nextExpanded: false,
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
        primary: {
          conversationId: "conversation_web_build",
          type: "selectConversation",
          workspaceId: web.id,
        },
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

  test("keeps conversations visible for multiple expanded active workspaces", () => {
    const api = workspace("workspace_api", "api");
    const web = workspace("workspace_web", "web");

    const items = selectSidebarNavigationItems({
      activeWorkspaces: [api, web],
      expandedWorkspaceIds: new Set([api.id, web.id]),
      recentWorkspaces: [],
      selectedConversationId: "conversation_web_fix",
      selectedWorkspaceId: web.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [api.id]: conversationList([
          conversationListItem("conversation_api_plan", "Plan API", api.id),
        ]),
        [web.id]: conversationList([
          conversationListItem("conversation_web_fix", "Fix web", web.id),
        ]),
      },
    });

    expect(items.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "conversation:conversation_api_plan",
      "active-workspace:workspace_web",
      "conversation:conversation_web_fix",
    ]);
    expect(items[0]).toMatchObject({
      commands: {
        primary: {
          nextExpanded: true,
          selectWorkspace: true,
          type: "activateWorkspace",
          workspaceId: api.id,
        },
      },
      expanded: true,
      selected: false,
    });
    expect(items[1]).toMatchObject({ kind: "conversation", selected: false });
    expect(items[3]).toMatchObject({ kind: "conversation", selected: true });
  });

  test("keeps inactive recent workspaces selectable and removable", () => {
    const api = workspace("workspace_api", "api");
    const docs = workspace("workspace_docs", "docs");

    const items = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      expandedWorkspaceIds: new Set(),
      recentWorkspaces: [docs, api],
      selectedConversationId: "",
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {},
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
      expandedWorkspaceIds: new Set([api.id]),
      recentWorkspaces: [],
      selectedConversationId: "",
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [api.id]: conversationList([]),
      },
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
      expandedWorkspaceIds: new Set([api.id]),
      recentWorkspaces: [],
      selectedConversationId: "conversation_0",
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 1,
      workspaceConversationLists: {
        [api.id]: conversationList(conversations),
      },
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

  test("omits cold loading rows while preserving known conversations during refresh", () => {
    const api = workspace("workspace_api", "api");

    const unknownItems = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      expandedWorkspaceIds: new Set([api.id]),
      recentWorkspaces: [],
      selectedConversationId: "",
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {},
    });
    expect(unknownItems.map((item) => item.kind)).toEqual(["activeWorkspace"]);

    const coldLoadingItems = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      expandedWorkspaceIds: new Set([api.id]),
      recentWorkspaces: [],
      selectedConversationId: "",
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [api.id]: { conversations: [], error: null, loading: true },
      },
    });
    expect(coldLoadingItems.map((item) => item.kind)).toEqual(["activeWorkspace"]);

    const refreshingItems = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      expandedWorkspaceIds: new Set([api.id]),
      recentWorkspaces: [],
      selectedConversationId: "",
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [api.id]: {
          conversations: [conversationListItem("conversation_api_plan", "Plan API", api.id)],
          error: null,
          loading: true,
        },
      },
    });
    expect(refreshingItems.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "conversation:conversation_api_plan",
    ]);
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
  workspaceId: string = "workspace_api",
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
      internal: false,
      schemaVersion: 1,
      title,
      updatedAt: "2026-05-29T20:00:00Z",
      workflow: null,
      workspaceId,
    },
    latestReadRelevantMarker: markers.latestReadRelevantMarker,
    messageCount: 1,
    readMarker: markers.readMarker,
  };
}

function conversationList(conversations: ConversationListItem[]): SidebarWorkspaceConversationList {
  return {
    conversations,
    error: null,
    loading: false,
  };
}
