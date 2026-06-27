import type {
  Conversation,
  ConversationListItem,
  CorruptionSummary,
  ListConversationsResponse,
  MessagePage,
} from "@generated/backend";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";

describe("chat store workspace conversation selection", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  test("loads a conversation from an explicit non-selected workspace", async () => {
    const apiConversation = conversation("conversation_api", "workspace_api");
    const webConversation = conversation("conversation_web", "workspace_web");
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(webConversation)]));
    const messagePage = vi.fn().mockResolvedValue(messagePageResponse(webConversation));
    const setSelectedConversation = vi.fn(async (workspaceId: string, conversationId: string) => ({
      selectedConversationIdsByWorkspaceId: { [workspaceId]: conversationId },
    }));
    installChatAPI({ listConversations, messagePage, setSelectedConversation });
    useChatStore.setState({
      conversations: [conversationItem(apiConversation)],
      selectedConversation: apiConversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().selectConversation("conversation_web", "workspace_web");

    expect(listConversations).toHaveBeenCalledWith("workspace_web");
    expect(messagePage).toHaveBeenCalledWith("workspace_web", "conversation_web", 0, 40);
    expect(useChatStore.getState().workspaceId).toBe("workspace_web");
    expect(useChatStore.getState().selectedConversation?.id).toBe("conversation_web");
    expect(useChatStore.getState().selectedConversationIdsByWorkspaceId.workspace_web).toBe(
      "conversation_web",
    );
    expect(setSelectedConversation).toHaveBeenCalledWith("workspace_web", "conversation_web");
    expect(useChatStore.getState().conversations.map((item) => item.conversation.id)).toEqual([
      "conversation_web",
    ]);
    expect(useChatStore.getState().error).toBeNull();
    expect(useChatStore.getState().status).toBe("ready");
  });

  test("loads selected conversation metadata from the message page response", async () => {
    const listedConversation = conversation("conversation_api", "workspace_api");
    const pageConversation: Conversation = {
      ...listedConversation,
      codexEffectiveSettings: {
        model: "gpt-test",
        modelDisplayName: "GPT Test",
        reasoningEffort: "xhigh",
        reasoningEffortDisplayName: "Extra high",
      },
    };
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(listedConversation)]));
    const messagePage = vi.fn().mockResolvedValue(messagePageResponse(pageConversation));
    installChatAPI({
      listConversations,
      messagePage,
      setSelectedConversation: vi.fn(),
    });

    await useChatStore.getState().loadWorkspace("workspace_api");

    expect(useChatStore.getState().selectedConversation?.codexEffectiveSettings).toEqual({
      model: "gpt-test",
      modelDisplayName: "GPT Test",
      reasoningEffort: "xhigh",
      reasoningEffortDisplayName: "Extra high",
    });
    expect(messagePage).toHaveBeenCalledWith("workspace_api", listedConversation.id, 0, 40);
  });
});

function installChatAPI({
  listConversations,
  messagePage,
  selectedConversations = async () => ({ selectedConversationIdsByWorkspaceId: {} }),
  setSelectedConversation,
}: {
  listConversations: (workspaceId: string) => Promise<ListConversationsResponse>;
  messagePage: (
    workspaceId: string,
    conversationId: string,
    offset: number,
    limit: number,
  ) => Promise<MessagePage>;
  setSelectedConversation: (
    workspaceId: string,
    conversationId: string,
  ) => Promise<{ selectedConversationIdsByWorkspaceId: Record<string, string> }>;
  selectedConversations?: () => Promise<{
    selectedConversationIdsByWorkspaceId: Record<string, string>;
  }>;
}) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: {
        chat: {
          activeRun: async () => ({ hasActiveRun: false, run: null }),
          listConversations,
          messagePage,
        },
        workspace: {
          selectedConversations,
          setSelectedConversation,
        },
      },
    },
  });
}

function conversation(id: string, workspaceId: string): Conversation {
  return {
    archivedAt: "",
    codexEffectiveSettings: null,
    codexSettings: null,
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id,
    internal: false,
    schemaVersion: 1,
    title: id,
    updatedAt: "2026-05-29T20:00:00Z",
    workflow: null,
    workspaceId,
  };
}

function conversationItem(conversation: Conversation): ConversationListItem {
  return {
    activeRunId: "",
    pinnedAt: "",
    conversation,
    latestReadRelevantMarker: 0,
    messageCount: 0,
    readMarker: 0,
  };
}

function listResponse(conversations: ConversationListItem[]): ListConversationsResponse {
  return {
    conversations,
    corruption: emptyCorruption(),
    diagnostics: [],
  };
}

function messagePageResponse(conversation: Conversation): MessagePage {
  return {
    blocks: [],
    conversation,
    goal: null,
    hasMoreOlder: false,
    messages: [],
    olderBeforeBlockOrdinal: 0,
    olderBeforeOrdinal: 0,
    queue: { messages: [], runs: [] },
    runItemOutputs: [],
    runItems: [],
    transcript: [],
  };
}

function emptyCorruption(): CorruptionSummary {
  return {
    byKind: [],
    bySeverity: [],
    hasCorruption: false,
    total: 0,
  };
}
