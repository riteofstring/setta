import type { NavigatorItem, WorkspaceSummary } from "@generated/backend";
import { describe, expect, test } from "vitest";

import type { ConversationNavigatorWorkspaceState } from "../stores/conversation-navigator-store";
import {
  selectSidebarNavigationItems,
  type SidebarNavigationInput,
} from "./workspace-sidebar-model";

describe("conversation navigator sidebar model", () => {
  test("groups one durable row per conversation under expanded workspaces", () => {
    const api = workspace("workspace_api", "api");
    const web = workspace("workspace_web", "web");
    const input = navigationInput([api, web]);
    input.expandedWorkspaceIds = new Set([api.id, web.id]);
    input.conversationWorkspaces = {
      [api.id]: page([navigatorItem("conversation_api", "Plan API", api.id)]),
      [web.id]: page([navigatorItem("conversation_web", "Build web", web.id)]),
    };
    input.conversationPanes = new Map([
      [
        web.id,
        {
          focusedConversationId: "conversation_web",
          focusedPaneId: "pane_web_a",
          paneIdsByConversationId: new Map([["conversation_web", ["pane_web_a", "pane_web_b"]]]),
        },
      ],
    ]);

    const items = selectSidebarNavigationItems(input);

    expect(items.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "conversation:conversation_api",
      "active-workspace:workspace_web",
      "conversation:conversation_web",
    ]);
    expect(items[3]).toMatchObject({
      commands: {
        archive: {
          conversationId: "conversation_web",
          title: "Build web",
          type: "archiveConversation",
          workspaceId: web.id,
        },
        primary: {
          conversationId: "conversation_web",
          title: "Build web",
          type: "presentConversation",
          workspaceId: web.id,
        },
      },
      focused: true,
      kind: "conversation",
      openPaneCount: 2,
    });
  });

  test("keeps a zero-pane conversation navigable without selecting a global conversation", () => {
    const api = workspace("workspace_api", "api");
    const input = navigationInput([api]);
    input.conversationWorkspaces = {
      [api.id]: page([navigatorItem("conversation_api", "Plan API", api.id)]),
    };

    const items = selectSidebarNavigationItems(input);

    expect(items[1]).toMatchObject({
      focused: false,
      kind: "conversation",
      openPaneCount: 0,
    });
  });

  test("resolves durable-fork lineage against the loaded parent row", () => {
    const api = workspace("workspace_api", "api");
    const parent = navigatorItem("conversation_parent", "Parent topic", api.id);
    const child = navigatorItem("conversation_child", "Child topic", api.id);
    child.branch = {
      childConversationId: child.conversation.id,
      createdAt: testTime,
      decisionSource: "conversation_router",
      forkedAtTurnId: "turn_parent",
      kind: "fork",
      parentConversationId: parent.conversation.id,
      providerMetadata: {},
      sourceTrajectorySequence: 4,
    };
    const input = navigationInput([api]);
    input.conversationWorkspaces = { [api.id]: page([child, parent]) };

    const items = selectSidebarNavigationItems(input);

    expect(items[1]).toMatchObject({
      kind: "conversation",
      lineageParentTitle: "Parent topic",
    });
  });

  test("represents loading, empty search, error, and incremental paging explicitly", () => {
    const api = workspace("workspace_api", "api");
    const input = navigationInput([api]);
    input.conversationWorkspaces = {
      [api.id]: { error: null, items: [], loading: true, nextCursor: null },
    };
    expect(selectSidebarNavigationItems(input)[1]).toMatchObject({
      kind: "conversationStatus",
      label: "Loading conversations…",
    });

    input.conversationQuery = "missing";
    input.conversationWorkspaces = {
      [api.id]: { error: null, items: [], loading: false, nextCursor: null },
    };
    expect(selectSidebarNavigationItems(input)[1]).toMatchObject({
      label: "No matching conversations",
    });

    input.conversationWorkspaces = {
      [api.id]: { error: "database unavailable", items: [], loading: false, nextCursor: null },
    };
    expect(selectSidebarNavigationItems(input)[1]).toMatchObject({ label: "database unavailable" });

    input.conversationWorkspaces = {
      [api.id]: {
        error: null,
        items: [navigatorItem("conversation_api", "Plan API", api.id)],
        loading: false,
        nextCursor: { conversationId: "conversation_api", updatedAt: testTime },
      },
    };
    expect(selectSidebarNavigationItems(input).at(-1)).toMatchObject({
      commands: { primary: { type: "loadMoreConversations", workspaceId: api.id } },
      kind: "loadMoreConversations",
    });
  });

  test("keeps inactive recent workspaces separate from topic rows", () => {
    const api = workspace("workspace_api", "api");
    const docs = workspace("workspace_docs", "docs");
    const input = navigationInput([api]);
    input.expandedWorkspaceIds = new Set();
    input.recentWorkspaces = [api, docs];

    const items = selectSidebarNavigationItems(input);

    expect(items.map((item) => item.id)).toEqual([
      "active-workspace:workspace_api",
      "recent-workspace:workspace_docs",
    ]);
  });
});

const testTime = "2026-07-11T20:00:00Z";

function navigationInput(activeWorkspaces: WorkspaceSummary[]): SidebarNavigationInput {
  return {
    activeWorkspaces,
    conversationPanes: new Map(),
    conversationQuery: "",
    conversationWorkspaces: {},
    expandedWorkspaceIds: new Set(activeWorkspaces.map((workspace) => workspace.id)),
    recentWorkspaces: [],
    selectedWorkspaceId: activeWorkspaces[0]?.id ?? "",
  };
}

function workspace(id: string, displayName: string): WorkspaceSummary {
  return {
    displayName,
    id,
    lastOpenedAt: testTime,
    rootPath: `/tmp/${displayName}`,
  };
}

function page(items: NavigatorItem[]): ConversationNavigatorWorkspaceState {
  return { error: null, items, loading: false, nextCursor: null };
}

function navigatorItem(id: string, title: string, workspaceId: string): NavigatorItem {
  return {
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: testTime,
      id,
      lastTrajectorySequence: 0,
      status: "idle",
      title,
      topicDescriptor: "",
      updatedAt: testTime,
      workspaceId,
    },
    presentationProfile: {
      conversationId: id,
      narratorSpeechEnabled: true,
      narratorVoiceReuse: null,
      narratorVoiceSelection: "auto_distinct",
      paletteReuse: null,
      paletteSelection: "auto_distinct",
      requestedNarratorVoiceId: null,
      requestedPaletteId: null,
      resolvedNarratorVoiceId: "alloy",
      resolvedPaletteId: "sky",
      updatedAt: testTime,
    },
  };
}
