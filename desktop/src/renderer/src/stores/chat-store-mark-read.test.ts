import type { Conversation, ConversationListItem } from "@generated/backend";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";

describe("chat store mark-read guards", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  test("does not mark a stale cross-workspace conversation read", async () => {
    const firstWorkspaceConversation = testConversation({
      id: "conversation_first",
      workspaceId: "workspace_first",
    });
    const secondWorkspaceConversation = testConversation({
      id: "conversation_second",
      workspaceId: "workspace_second",
    });
    const markConversationRead = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setta: {
          chat: { markConversationRead },
        },
      },
    });
    useChatStore.setState({
      conversations: [conversationItem(firstWorkspaceConversation)],
      selectedConversation: secondWorkspaceConversation,
      status: "ready",
      workspaceId: "workspace_first",
    });

    await useChatStore.getState().markConversationRead(secondWorkspaceConversation.id);

    expect(markConversationRead).not.toHaveBeenCalled();
  });
});

function testConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    archivedAt: "",
    codexEffectiveSettings: null,
    codexSettings: null,
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id: "conversation_api",
    internal: false,
    schemaVersion: 1,
    title: "API chat",
    updatedAt: "2026-05-29T20:00:00Z",
    workflow: null,
    workspaceId: "workspace_api",
    ...overrides,
  };
}

function conversationItem(conversation: Conversation): ConversationListItem {
  return {
    activeRunId: "",
    conversation,
    latestReadRelevantMarker: 0,
    messageCount: 1,
    pinnedAt: "",
    readMarker: 0,
  };
}
