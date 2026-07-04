import type {
  ChatGoalState,
  ChatMessage,
  Conversation,
  ConversationListItem,
  Diagnostic,
  ListConversationsResponse,
  MessagePage,
  RunLiveness,
  TranscriptBlock,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";
import { testRun } from "./chat-store.test.fixtures";
import { runLiveness, runLivenessUpdatedEvent } from "./chat-store-events.test.helpers";

describe("chat store liveness events", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  test("applies active run liveness events to selected state and conversation summaries", () => {
    const conversation = testConversation();
    const run = testRun("running");
    const liveness: RunLiveness = runLiveness({ status: "reconciling" });
    useChatStore.setState({
      activeRun: run,
      activeRunLiveness: runLiveness({ status: "attached" }),
      conversationListsByWorkspaceId: {
        workspace_api: loadedConversationList([conversationItem(conversation, 1, run.id)]),
      },
      conversations: [conversationItem(conversation, 1, run.id)],
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(runLivenessUpdatedEvent(1, liveness));

    expect(useChatStore.getState().activeRunLiveness).toEqual(liveness);
    expect(useChatStore.getState().conversations[0]?.activeRunLiveness).toEqual(liveness);
    expect(
      useChatStore.getState().conversationListsByWorkspaceId.workspace_api?.conversations[0]
        ?.activeRunLiveness,
    ).toEqual(liveness);
  });

  test("lost selected liveness events trigger a snapshot resync", async () => {
    const conversation = testConversation();
    const run = testRun("running");
    const liveness: RunLiveness = runLiveness({ status: "lost" });
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(conversation, 1, run.id)]));
    const messagePage = vi.fn().mockResolvedValue(testPage(conversation, []));
    const activeRun = vi.fn().mockResolvedValue({ hasActiveRun: true, liveness, run });
    installSettaAPI({ activeRun, listConversations, messagePage });
    useChatStore.setState({
      activeRun: run,
      activeRunLiveness: runLiveness({ status: "attached" }),
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(runLivenessUpdatedEvent(1, liveness));
    await waitFor(() => messagePage.mock.calls.length === 1);

    expect(listConversations).toHaveBeenCalledWith("workspace_api");
    expect(messagePage).toHaveBeenCalledWith("workspace_api", "conversation_api", 0, 40);
    expect(activeRun).toHaveBeenCalledWith("workspace_api", "conversation_api");
    expect(useChatStore.getState().activeRunLiveness).toEqual(liveness);
  });

  test("reconciling selected liveness events update state without snapshot resync", () => {
    const conversation = testConversation();
    const run = testRun("running");
    const liveness: RunLiveness = runLiveness({ status: "reconciling" });
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(conversation, 1, run.id)]));
    const messagePage = vi.fn().mockResolvedValue(testPage(conversation, []));
    const activeRun = vi.fn().mockResolvedValue({ hasActiveRun: true, liveness, run });
    installSettaAPI({ activeRun, listConversations, messagePage });
    useChatStore.setState({
      activeRun: run,
      activeRunLiveness: runLiveness({ status: "attached" }),
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(runLivenessUpdatedEvent(1, liveness));

    expect(listConversations).not.toHaveBeenCalled();
    expect(messagePage).not.toHaveBeenCalled();
    expect(activeRun).not.toHaveBeenCalled();
    expect(useChatStore.getState().activeRunLiveness).toEqual(liveness);
  });
});

function emptyCorruption() {
  return { byKind: [], bySeverity: [], hasCorruption: false, total: 0 };
}

function listResponse(
  conversations: ConversationListItem[],
  corruptTotal = 0,
  diagnostics: Diagnostic[] = [],
): ListConversationsResponse {
  return {
    conversations,
    corruption: {
      byKind: corruptTotal > 0 ? [{ count: corruptTotal, key: "run" }] : [],
      bySeverity: corruptTotal > 0 ? [{ count: corruptTotal, key: "critical" }] : [],
      hasCorruption: corruptTotal > 0,
      total: corruptTotal,
    },
    diagnostics,
  };
}

function loadedConversationList(conversations: ConversationListItem[]) {
  return {
    conversations,
    corruption: emptyCorruption(),
    diagnostics: [],
    error: null,
    loading: false,
  };
}

function installSettaAPI(chat: Partial<SettaAPI["chat"]>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: {
        chat: {
          activeRun: async () => ({ hasActiveRun: false, liveness: null, run: null }),
          listBackgroundTerminals: async () => ({ terminals: [] }),
          listConversations: async () => listResponse([]),
          messagePage: async () => testPage(testConversation(), []),
          onEvent: () => () => {},
          ...chat,
        },
      } as unknown as SettaAPI,
    },
  });
}

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

function conversationItem(
  conversation: Conversation,
  messageCount: number,
  activeRunId = "",
): ConversationListItem {
  return {
    activeRunId,
    activeRunLiveness: null,
    conversation,
    latestReadRelevantMarker: 0,
    messageCount,
    pinnedAt: "",
    readMarker: 0,
  };
}

function testPage(
  conversation: Conversation,
  messages: ChatMessage[],
  hasMoreOlder = false,
  goal: ChatGoalState | null = null,
  blocks: TranscriptBlock[] = [],
): MessagePage {
  return {
    blocks,
    conversation,
    goal,
    hasMoreOlder,
    messages,
    olderBeforeBlockOrdinal: 0,
    queue: { messages: [], runs: [] },
  };
}

async function waitFor(done: () => boolean) {
  const startedAt = Date.now();
  while (!done()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
