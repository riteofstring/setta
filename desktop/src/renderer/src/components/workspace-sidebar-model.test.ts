import type {
  ConversationListItem,
  WorkflowDefinition,
  WorkspaceSummary,
} from "@generated/backend";
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
      selectedWorkflowDefinitionIdsByWorkspaceId: {},
      selectedWorkspaceId: web.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [web.id]: conversationList([
          conversationListItem("conversation_web_build", "Build web", web.id, {
            latestReadRelevantMarker: 2,
            readMarker: 1,
          }),
          conversationListItem("conversation_web_fix", "Fix web", web.id, {
            latestReadRelevantMarker: 0,
            pinnedAt: "2026-05-29T21:00:00Z",
            readMarker: 0,
          }),
        ]),
      },
      workspaceWorkflowDefinitionLists: {},
    });

    expect(items.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "active-workspace:workspace_web",
      "section:workspace_web:conversations",
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
      kind: "sectionHeader",
      label: "Conversations",
      section: "conversations",
    });
    expect(items[3]).toMatchObject({
      commands: {
        delete: {
          conversationId: "conversation_web_build",
          type: "deleteConversation",
          workspaceId: web.id,
        },
        pin: {
          conversationId: "conversation_web_build",
          pinned: true,
          type: "setConversationPinned",
          workspaceId: web.id,
        },
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
    expect(items[4]).toMatchObject({
      commands: {
        pin: {
          conversationId: "conversation_web_fix",
          pinned: false,
          type: "setConversationPinned",
          workspaceId: web.id,
        },
      },
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
      selectedWorkflowDefinitionIdsByWorkspaceId: {},
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
      workspaceWorkflowDefinitionLists: {},
    });

    expect(items.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "section:workspace_api:conversations",
      "conversation:conversation_api_plan",
      "active-workspace:workspace_web",
      "section:workspace_web:conversations",
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
    expect(items[1]).toMatchObject({ kind: "sectionHeader", label: "Conversations" });
    expect(items[2]).toMatchObject({ kind: "conversation", selected: false });
    expect(items[4]).toMatchObject({ kind: "sectionHeader", label: "Conversations" });
    expect(items[5]).toMatchObject({ kind: "conversation", selected: true });
  });

  test("adds workflow and conversation rows as sibling sections", () => {
    const api = workspace("workspace_api", "api");

    const items = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      expandedWorkspaceIds: new Set([api.id]),
      recentWorkspaces: [],
      selectedConversationId: "",
      selectedWorkflowDefinitionIdsByWorkspaceId: {
        [api.id]: "workflow_definition_review",
      },
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [api.id]: conversationList([
          conversationListItem("conversation_api_plan", "Plan API", api.id),
        ]),
      },
      workspaceWorkflowDefinitionLists: {
        [api.id]: {
          definitions: [workflowDefinition("workflow_definition_review", "Review")],
          error: null,
          loading: false,
        },
      },
    });

    expect(items.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "section:workspace_api:workflows",
      "workflow:workflow_definition_review",
      "section:workspace_api:conversations",
      "conversation:conversation_api_plan",
    ]);
    expect(items[1]).toMatchObject({
      kind: "sectionHeader",
      label: "Workflows",
      section: "workflows",
    });
    expect(items[2]).toMatchObject({
      commands: {
        primary: {
          definitionId: "workflow_definition_review",
          type: "selectWorkflowDefinition",
          workspaceId: api.id,
        },
      },
      kind: "workflowDefinition",
      selected: true,
    });
    expect(items[3]).toMatchObject({
      kind: "sectionHeader",
      label: "Conversations",
      section: "conversations",
    });
  });

  test("keeps inactive recent workspaces selectable and removable", () => {
    const api = workspace("workspace_api", "api");
    const docs = workspace("workspace_docs", "docs");

    const items = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      expandedWorkspaceIds: new Set(),
      recentWorkspaces: [docs, api],
      selectedConversationId: "",
      selectedWorkflowDefinitionIdsByWorkspaceId: {},
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {},
      workspaceWorkflowDefinitionLists: {},
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
      selectedWorkflowDefinitionIdsByWorkspaceId: {},
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [api.id]: conversationList([]),
      },
      workspaceWorkflowDefinitionLists: {
        [api.id]: {
          definitions: [],
          error: null,
          loading: false,
        },
      },
    });

    expect(emptyItems.map((item) => item.kind)).toEqual([
      "activeWorkspace",
      "sectionHeader",
      "emptyWorkflowList",
      "sectionHeader",
      "emptyConversationList",
    ]);
    expect(emptyItems.map((item) => item.label)).toEqual([
      "api",
      "Workflows",
      "No workflows",
      "Conversations",
      "No chats",
    ]);

    const conversations = Array.from({ length: 3 }, (_, index) =>
      conversationListItem(`conversation_${index}`, `Chat ${index}`),
    );
    const limitedItems = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      expandedWorkspaceIds: new Set([api.id]),
      recentWorkspaces: [],
      selectedConversationId: "conversation_0",
      selectedWorkflowDefinitionIdsByWorkspaceId: {},
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 1,
      workspaceConversationLists: {
        [api.id]: conversationList(conversations),
      },
      workspaceWorkflowDefinitionLists: {},
    });

    expect(limitedItems.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "section:workspace_api:conversations",
      "conversation:conversation_0",
      "conversation-more:workspace_api",
    ]);
    expect(limitedItems[3]).toMatchObject({
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
      selectedWorkflowDefinitionIdsByWorkspaceId: {},
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {},
      workspaceWorkflowDefinitionLists: {},
    });
    expect(unknownItems.map((item) => item.kind)).toEqual(["activeWorkspace"]);

    const coldLoadingItems = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      expandedWorkspaceIds: new Set([api.id]),
      recentWorkspaces: [],
      selectedConversationId: "",
      selectedWorkflowDefinitionIdsByWorkspaceId: {},
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [api.id]: { conversations: [], error: null, loading: true },
      },
      workspaceWorkflowDefinitionLists: {},
    });
    expect(coldLoadingItems.map((item) => item.kind)).toEqual(["activeWorkspace"]);

    const refreshingItems = selectSidebarNavigationItems({
      activeWorkspaces: [api],
      expandedWorkspaceIds: new Set([api.id]),
      recentWorkspaces: [],
      selectedConversationId: "",
      selectedWorkflowDefinitionIdsByWorkspaceId: {},
      selectedWorkspaceId: api.id,
      visibleConversationLimit: 80,
      workspaceConversationLists: {
        [api.id]: {
          conversations: [conversationListItem("conversation_api_plan", "Plan API", api.id)],
          error: null,
          loading: true,
        },
      },
      workspaceWorkflowDefinitionLists: {},
    });
    expect(refreshingItems.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "section:workspace_api:conversations",
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
  markers: { latestReadRelevantMarker: number; pinnedAt?: string; readMarker: number } = {
    latestReadRelevantMarker: 0,
    readMarker: 0,
  },
): ConversationListItem {
  return {
    activeRunId: "",
    pinnedAt: markers.pinnedAt ?? "",
    conversation: {
      archivedAt: "",
      codexEffectiveSettings: null,
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

function workflowDefinition(id: string, name: string): WorkflowDefinition {
  return {
    createdAt: "2026-05-29T20:00:00Z",
    description: "",
    graph: {
      edges: [],
      layout: { nodes: [] },
      nodes: [],
    },
    id,
    name,
    schemaVersion: 1,
    updatedAt: "2026-05-29T20:00:00Z",
    workspaceId: "workspace_api",
  };
}
