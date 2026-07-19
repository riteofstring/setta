import type { NavigatorItem, WorkspaceSession } from "@generated/backend";
import { describe, expect, test } from "vitest";

import type { ConversationNavigatorWorkspaceState } from "../../stores/conversation-navigator-store";
import type { ConversationPaneWorkspaceState } from "../../stores/conversation-pane-store";
import { selectMasterConversationPickerItems } from "./master-conversation-picker-model";

describe("master conversation picker model", () => {
  test("selects searchable recent topic conversations across active folders", () => {
    const selection = selectMasterConversationPickerItems({
      conversationPanes: new Map<string, ConversationPaneWorkspaceState>([
        [
          "workspace_api",
          {
            focusedConversationId: "conversation_api",
            focusedPaneId: "pane_api",
            paneIdByConversationId: new Map([["conversation_api", "pane_api"]]),
          },
        ],
      ]),
      conversationWorkspaces: {
        workspace_api: navigatorState([
          navigatorItem("conversation_api", "API rollout", "workspace_api", "2026-07-22T20:02:00Z"),
          navigatorItem(
            "conversation_api_old",
            "API archive",
            "workspace_api",
            "2026-07-22T19:00:00Z",
          ),
        ]),
        workspace_web: navigatorState([
          navigatorItem("conversation_web", "Web polish", "workspace_web", "2026-07-22T20:03:00Z"),
        ]),
      },
      limit: 4,
      query: "api",
      session: workspaceSession(),
    });

    expect(selection.items.map((item) => item.conversationId)).toEqual([
      "conversation_api",
      "conversation_api_old",
    ]);
    expect(selection.items[0]).toMatchObject({
      focused: true,
      openPaneId: "pane_api",
      workspaceName: "api",
      workspaceRootPath: "/tmp/api",
    });
    expect(selection.status).toEqual({
      hasActiveWorkspaces: true,
      loading: false,
      message: null,
    });
  });

  test("keeps folderless create actionable when no folder navigator exists", () => {
    const selection = selectMasterConversationPickerItems({
      conversationPanes: new Map(),
      conversationWorkspaces: {},
      query: "",
      session: null,
    });

    expect(selection.items).toEqual([]);
    expect(selection.status).toEqual({
      hasActiveWorkspaces: false,
      loading: false,
      message: "No folders are open. Start a folderless conversation.",
    });
  });
});

function workspaceSession(): WorkspaceSession {
  return {
    activeWorkspaces: [
      {
        displayName: "api",
        id: "workspace_api",
        lastOpenedAt: "2026-07-22T20:00:00Z",
        rootPath: "/tmp/api",
      },
      {
        displayName: "web",
        id: "workspace_web",
        lastOpenedAt: "2026-07-22T20:01:00Z",
        rootPath: "/tmp/web",
      },
    ],
    recentWorkspaces: [],
    selectedWorkspaceId: "workspace_api",
    workspaceAvailabilities: [
      { available: true, unavailableReason: "", workspaceId: "workspace_api" },
      { available: true, unavailableReason: "", workspaceId: "workspace_web" },
    ],
  };
}

function navigatorState(items: NavigatorItem[]): ConversationNavigatorWorkspaceState {
  return {
    error: null,
    items,
    loading: false,
    nextCursor: null,
  };
}

function navigatorItem(
  id: string,
  title: string,
  workspaceId: string,
  updatedAt: string,
): NavigatorItem {
  return {
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: "2026-07-22T20:00:00Z",
      id,
      lastTrajectorySequence: 0,
      status: "idle",
      title,
      topicDescriptor: "",
      updatedAt,
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
      updatedAt,
    },
  };
}
