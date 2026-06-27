import type {
  ChatEvent,
  ChatMessage,
  Conversation,
  MessageDelivery,
  MessagePage,
  MessageRole,
  MessageStatus,
  Run,
  RunStatus,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";

const eventStreamId = "event_stream_test";

describe("chat store queued message controls", () => {
  beforeEach(() => {
    useChatStore.setState({
      activeRun: null,
      conversations: [],
      corruption: { byKind: [], bySeverity: [], hasCorruption: false, total: 0 },
      diagnostics: [],
      editingQueuedMessageId: null,
      error: null,
      hasMoreOlder: false,
      lastEventSequence: 0,
      lastEventStreamId: "",
      messageIds: [],
      messages: [],
      messagesById: {},
      olderBeforeBlockOrdinal: 0,
      operation: null,
      queuedRuns: [],
      removingQueuedMessageId: null,
      runItemOutputIdsByRunItemId: {},
      runItemOutputPagesByRunItemId: {},
      runItemOutputs: [],
      runItemOutputsById: {},
      runItemIdsByRunId: {},
      runItems: [],
      runItemsById: {},
      selectedConversation: null,
      status: "idle",
      transcriptBlocks: [],
      transcriptBlocksById: {},
      workspaceId: null,
    });
  });

  test("edit queued message applies the backend page", async () => {
    const conversation = testConversation();
    const queuedRun = testRun("queued", "run_queued");
    const queued = message(
      "message_queued",
      1,
      "user",
      "pending",
      "queued",
      "queued",
      queuedRun.id,
    );
    const edited = replaceMessageText(queued, "edited queued");
    const editQueuedMessage = vi.fn().mockResolvedValue({
      conversation,
      page: testPage(conversation, [edited]),
      queue: { messages: [edited], runs: [queuedRun] },
      run: queuedRun,
      userMessage: edited,
    });
    installChatAPI({ editQueuedMessage });
    useChatStore.setState({
      messages: [queued],
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().editQueuedMessage(queued.id, "edited queued");

    expect(editQueuedMessage).toHaveBeenCalledWith(
      "workspace_api",
      "conversation_api",
      queued.id,
      "edited queued",
    );
    expect(useChatStore.getState().messagesById[queued.id]?.parts[0]?.text).toBe("edited queued");
    expect(useChatStore.getState().editingQueuedMessageId).toBeNull();
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("remove queued message applies the backend page", async () => {
    const conversation = testConversation();
    const removedRun = testRun("queued", "run_removed");
    const nextRun = testRun("queued", "run_next");
    const removed = message(
      "message_removed",
      1,
      "user",
      "pending",
      "remove me",
      "queued",
      removedRun.id,
    );
    const next = message("message_next", 2, "user", "pending", "next", "queued", nextRun.id);
    const removeQueuedMessage = vi.fn().mockResolvedValue({
      conversation,
      page: testPage(conversation, [next]),
      queue: { messages: [next], runs: [nextRun] },
      removedMessageId: removed.id,
      removedRunId: removedRun.id,
    });
    installChatAPI({ removeQueuedMessage });
    useChatStore.setState({
      messages: [removed, next],
      removingQueuedMessageId: removed.id,
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().removeQueuedMessage(removed.id);

    expect(removeQueuedMessage).toHaveBeenCalledWith(
      "workspace_api",
      "conversation_api",
      removed.id,
    );
    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual([next.id]);
    expect(useChatStore.getState().removingQueuedMessageId).toBeNull();
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("send steering immediately applies the replay run from the backend page", async () => {
    const conversation = testConversation();
    const activeRun = testRun("running", "run_replay");
    const replayed = message(
      "message_replayed",
      4,
      "user",
      "complete",
      "steer now",
      "normal",
      activeRun.id,
    );
    const sendSteeringImmediately = vi.fn().mockResolvedValue({
      activeRun,
      cancelledRun: testRun("cancelled", "run_previous"),
      conversation,
      page: testPage(conversation, [replayed]),
      queue: { messages: [], runs: [] },
      replayedSteeringMessageIds: ["message_steering"],
    });
    installChatAPI({ sendSteeringImmediately });
    useChatStore.setState({
      activeRun: testRun("running", "run_previous"),
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().sendSteeringImmediately("steer now");

    expect(sendSteeringImmediately).toHaveBeenCalledWith(
      "workspace_api",
      "conversation_api",
      "steer now",
    );
    expect(useChatStore.getState().activeRun?.id).toBe(activeRun.id);
    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual([replayed.id]);
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("send steering immediately preserves errors for caller handling", async () => {
    const conversation = testConversation();
    const sendSteeringImmediately = vi.fn().mockRejectedValue(new Error("nothing to replay"));
    installChatAPI({ sendSteeringImmediately });
    useChatStore.setState({
      activeRun: testRun("running"),
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await expect(useChatStore.getState().sendSteeringImmediately()).rejects.toThrow(
      "nothing to replay",
    );
    expect(useChatStore.getState().error).toBe("nothing to replay");
  });

  test("removes messages from pushed removal events", () => {
    const conversation = testConversation();
    const queuedRun = testRun("queued", "run_queued");
    const queued = message(
      "message_queued",
      1,
      "user",
      "pending",
      "queued",
      "queued",
      queuedRun.id,
    );
    useChatStore.setState({
      editingQueuedMessageId: queued.id,
      messages: [queued],
      removingQueuedMessageId: queued.id,
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(messageRemovedEvent(1, queued.id, queuedRun.id));

    // A queued message owns no transcript block, so removal only clears the queue
    // surfaces; transcript blocks are driven by block events, not message removal.
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().editingQueuedMessageId).toBeNull();
    expect(useChatStore.getState().removingQueuedMessageId).toBeNull();
  });
});

function installChatAPI(overrides: Partial<SettaAPI["chat"]>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: { chat: overrides } },
  });
}

function testConversation(): Conversation {
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
  };
}

function testPage(conversation: Conversation, messages: ChatMessage[]): MessagePage {
  const queuedMessages = messages.filter((item) => item.delivery === "queued");
  const queuedRunIds = [
    ...new Set(queuedMessages.map((item) => item.runId).filter((runId) => runId !== "")),
  ];
  return {
    blocks: [],
    conversation,
    goal: null,
    hasMoreOlder: false,
    messages,
    olderBeforeBlockOrdinal: 0,
    queue: {
      messages: queuedMessages,
      runs: queuedRunIds.map((runId) => ({
        ...testRun("queued", runId),
        triggerMessageId: queuedMessages.find((item) => item.runId === runId)?.id ?? "",
      })),
    },
  };
}

function message(
  id: string,
  ordinal: number,
  role: MessageRole,
  status: MessageStatus,
  text: string,
  delivery: MessageDelivery = "normal",
  runId = "run_api",
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery,
    id,
    ordinal,
    parts: [
      { format: role === "assistant" ? "markdown" : "plain", id: `${id}_part`, text, type: "text" },
    ],
    role,
    runId,
    schemaVersion: 1,
    status,
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

function replaceMessageText(message: ChatMessage, text: string): ChatMessage {
  const [part, ...rest] = message.parts;
  if (!part) {
    throw new Error("test message must include a part");
  }
  return {
    ...message,
    parts: [{ ...part, text }, ...rest],
    updatedAt: "2026-05-29T20:00:01Z",
  };
}

function testRun<T extends RunStatus>(status: T, runId = "run_api"): Run & { status: T } {
  return {
    assistantMessageId: "message_assistant",
    completedAt: status === "running" ? "" : "2026-05-29T20:01:00Z",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    id: runId,
    pendingApproval: null,
    promptSummary: "hello",
    schemaVersion: 1,
    startedAt: "2026-05-29T20:00:00Z",
    status,
    triggerMessageId: "message_user",
    workspaceId: "workspace_api",
  };
}

function messageRemovedEvent(
  sequence: number,
  messageId: string,
  runId: string,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { messageId, runId },
    runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.message.removed",
    workspaceId: "workspace_api",
  };
}
