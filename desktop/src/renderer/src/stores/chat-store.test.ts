import type {
  BackendHealth,
  ChatEvent,
  ChatMessage,
  Conversation,
  ConversationListItem,
  MessagePage,
  Run,
  RunItem,
  RunItemOutput,
  WorkspaceSession,
} from "@generated/backend";
import type { RuntimeVersions, SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { prependOlderMessages, useChatStore } from "./chat-store";

const eventStreamId = "event_stream_test";

describe("chat store", () => {
  beforeEach(() => {
    useChatStore.setState({
      activeRun: null,
      conversations: [],
      diagnostics: [],
      error: null,
      hasMoreOlder: false,
      lastEventSequence: 0,
      lastEventStreamId: "",
      messages: [],
      operation: null,
      runItemOutputs: [],
      runItems: [],
      selectedConversation: null,
      status: "idle",
      workspaceId: null,
    });
  });

  test("loads conversation metadata separately from the latest message page", async () => {
    const conversation = testConversation();
    const listConversations = vi.fn().mockResolvedValue({
      conversations: [conversationItem(conversation, 120)],
    });
    const messagePage = vi
      .fn()
      .mockResolvedValue(
        testPage(conversation, [message("message_latest", 120, "assistant", "complete", "latest")]),
      );
    installSettaAPI({ chat: { listConversations, messagePage } });

    await useChatStore.getState().loadWorkspace("workspace_api");

    expect(useChatStore.getState().conversations).toHaveLength(1);
    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual(["message_latest"]);
    expect(listConversations).toHaveBeenCalledWith("workspace_api");
    expect(messagePage).toHaveBeenCalledWith("workspace_api", "conversation_api", 0, 40);
  });

  test("prepends older message pages without replacing the latest page", async () => {
    const conversation = testConversation();
    installSettaAPI({
      chat: {
        messagePage: vi
          .fn()
          .mockResolvedValue(
            testPage(conversation, [message("message_old", 1, "user", "complete", "old")], false),
          ),
      },
    });
    useChatStore.setState({
      hasMoreOlder: true,
      messages: [message("message_latest", 2, "assistant", "complete", "latest")],
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().loadOlder();

    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual([
      "message_old",
      "message_latest",
    ]);
    expect(useChatStore.getState().hasMoreOlder).toBe(false);
  });

  test("older message pages merge with current messages when the request finishes", async () => {
    const conversation = testConversation();
    const olderPage = deferred<MessagePage>();
    installSettaAPI({
      chat: {
        messagePage: vi.fn().mockReturnValue(olderPage.promise),
      },
    });
    const latest = message("message_latest", 2, "assistant", "streaming", "latest");
    const refreshedLatest = replaceMessageText(latest, "latest refreshed");
    useChatStore.setState({
      hasMoreOlder: true,
      messages: [latest],
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    const loadPromise = useChatStore.getState().loadOlder();
    useChatStore.setState({ messages: [refreshedLatest] });
    olderPage.resolve(
      testPage(conversation, [message("message_old", 1, "user", "complete", "old")], false),
    );
    await loadPromise;

    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual([
      "message_old",
      "message_latest",
    ]);
    expect(useChatStore.getState().messages[1]).toBe(refreshedLatest);
  });

  test("send message updates from the backend page and active run", async () => {
    const conversation = testConversation();
    const run = testRun("running");
    installSettaAPI({
      chat: {
        listConversations: vi.fn().mockResolvedValue({
          conversations: [conversationItem(conversation, 2, run.id)],
        }),
        sendMessage: vi.fn().mockResolvedValue({
          assistantMessage: message("message_assistant", 2, "assistant", "streaming", ""),
          conversation,
          page: testPage(conversation, [
            message("message_user", 1, "user", "complete", "hello"),
            message("message_assistant", 2, "assistant", "streaming", ""),
          ]),
          run,
          userMessage: message("message_user", 1, "user", "complete", "hello"),
        }),
      },
    });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().sendMessage("hello");

    expect(useChatStore.getState().activeRun?.id).toBe(run.id);
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("queue message updates from the backend page", async () => {
    const conversation = testConversation();
    const queued = message("message_queued", 1, "user", "pending", "queued", "queued");
    const queueMessage = vi.fn().mockResolvedValue({
      conversation,
      page: testPage(conversation, [queued]),
      queue: { messages: [queued], runs: [testRun("queued")] },
      run: testRun("queued"),
      userMessage: queued,
    });
    installSettaAPI({ chat: { queueMessage } });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().queueMessage("queued");

    expect(queueMessage).toHaveBeenCalledWith("workspace_api", "conversation_api", "queued");
    expect(useChatStore.getState().messages[0]?.delivery).toBe("queued");
  });

  test("steer message updates from the backend page", async () => {
    const conversation = testConversation();
    const steering = message("message_steer", 3, "user", "complete", "steer", "steering");
    const steerMessage = vi.fn().mockResolvedValue({
      conversation,
      page: testPage(conversation, [steering]),
      run: testRun("running"),
      userMessage: steering,
    });
    installSettaAPI({ chat: { steerMessage } });
    useChatStore.setState({
      activeRun: testRun("running"),
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().steerMessage("steer");

    expect(steerMessage).toHaveBeenCalledWith("workspace_api", "conversation_api", "steer");
    expect(useChatStore.getState().messages[0]?.delivery).toBe("steering");
  });

  test("submit approval passes the decision to the preload API", async () => {
    const submitApproval = vi.fn().mockResolvedValue(testRun("running"));
    installSettaAPI({ chat: { submitApproval } });
    useChatStore.setState({
      selectedConversation: testConversation(),
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().submitApproval("approval_api", true, "", [], false);

    expect(submitApproval).toHaveBeenCalledWith({
      approvalId: "approval_api",
      approved: true,
      answers: [],
      cancelled: false,
      conversationId: "conversation_api",
      response: "",
      workspaceId: "workspace_api",
    });
  });

  test("prepends older pages without duplicating messages already visible", () => {
    const currentLatest = message("message_latest", 2, "assistant", "streaming", "latest");
    const staleLatest = replaceMessageText(currentLatest, "stale latest");

    const merged = prependOlderMessages(
      [message("message_old", 1, "user", "complete", "old"), staleLatest],
      [currentLatest],
    );

    expect(merged.map((item) => item.id)).toEqual(["message_old", "message_latest"]);
    expect(merged[1]).toBe(currentLatest);
  });

  test("applies pushed chat events to the active conversation", () => {
    const conversation = testConversation();
    const user = message("message_user", 1, "user", "complete", "hello");
    const assistant = message("message_assistant", 2, "assistant", "streaming", "");
    const updatedConversation = { ...conversation, title: "Updated chat" };
    useChatStore.setState({
      conversations: [conversationItem(conversation, 0)],
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(messageCreatedEvent(1, user, "run_api"));
    useChatStore.getState().handleEvent(messageCreatedEvent(2, assistant, "run_api"));
    const assistantPart = assistant.parts[0];
    if (!assistantPart) {
      throw new Error("assistant test message must include a part");
    }
    useChatStore
      .getState()
      .handleEvent(assistantDeltaEvent(3, assistant.id, assistantPart.id, "done"));
    useChatStore.getState().handleEvent(runUpdatedEvent(4, testRun("running")));
    useChatStore
      .getState()
      .handleEvent(
        conversationUpdatedEvent(5, conversationItem(updatedConversation, 2, "run_api")),
      );

    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual([
      "message_user",
      "message_assistant",
    ]);
    expect(useChatStore.getState().messages[1]?.parts[0]?.text).toBe("done");
    expect(useChatStore.getState().activeRun?.id).toBe("run_api");
    expect(useChatStore.getState().selectedConversation?.title).toBe("Updated chat");
    expect(useChatStore.getState().conversations[0]?.messageCount).toBe(2);
  });

  test("applies run activity events incrementally", () => {
    const conversation = testConversation();
    const item = runItem("run_item_command", "command_execution", "running");
    const completed = { ...item, status: "completed", exitCode: 0 };
    const output = runItemOutput("run_item_output_1", item.id, 1, "ok\n");
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(runItemCreatedEvent(1, item));
    useChatStore.getState().handleEvent(runItemUpdatedEvent(2, completed));
    useChatStore.getState().handleEvent(runItemOutputDeltaEvent(3, output));
    useChatStore.getState().handleEvent(runItemOutputDeltaEvent(3, output));

    expect(useChatStore.getState().runItems).toEqual([completed]);
    expect(useChatStore.getState().runItemOutputs).toEqual([output]);
  });

  test("lazy-loads run activity without dropping embedded output", async () => {
    const item = runItem("run_item_command", "command_execution", "running");
    const completed = { ...item, status: "completed" };
    const firstOutput = runItemOutput("run_item_output_1", item.id, 1, "first\n");
    const secondOutput = runItemOutput("run_item_output_2", item.id, 2, "second\n");
    const runActivity = vi.fn().mockResolvedValue({
      items: [completed],
      output: [secondOutput],
      runId: "run_api",
    });
    installSettaAPI({ chat: { runActivity } });
    useChatStore.setState({
      runItemOutputs: [firstOutput],
      runItems: [item],
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().loadRunActivity("run_api", 200);

    expect(runActivity).toHaveBeenCalledWith("workspace_api", "run_api", 200);
    expect(useChatStore.getState().runItems).toEqual([completed]);
    expect(useChatStore.getState().runItemOutputs).toEqual([firstOutput, secondOutput]);
  });

  test("lazy-loads run item output for only the expanded row", async () => {
    const itemA = runItem("run_item_a", "command_execution", "completed");
    const itemB = runItem("run_item_b", "command_execution", "completed");
    const outputA = runItemOutput("run_item_output_a1", itemA.id, 1, "a1\n");
    const outputB = runItemOutput("run_item_output_b1", itemB.id, 1, "b1\n");
    const runItemOutputPage = vi.fn().mockResolvedValue({
      hasMore: false,
      nextOrdinal: 0,
      output: [outputB],
      runId: "run_api",
      runItemId: itemB.id,
    });
    installSettaAPI({ chat: { runItemOutput: runItemOutputPage } });
    useChatStore.setState({
      runItemOutputs: [outputA],
      runItems: [itemA, itemB],
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().loadRunItemOutput("run_api", itemB.id, 0, 200);

    expect(runItemOutputPage).toHaveBeenCalledWith("workspace_api", "run_api", itemB.id, 0, 200);
    expect(useChatStore.getState().runItemOutputs).toEqual([outputA, outputB]);
  });

  test("ignores pushed message events for unrelated conversations", () => {
    const conversation = testConversation();
    useChatStore.setState({
      messages: [message("message_existing", 1, "user", "complete", "existing")],
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });
    const unrelated = {
      ...message("message_other", 1, "user", "complete", "other"),
      conversationId: "conversation_other",
    };

    useChatStore.getState().handleEvent({
      ...messageCreatedEvent(1, unrelated, ""),
      conversationId: "conversation_other",
    });

    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual(["message_existing"]);
    expect(useChatStore.getState().lastEventSequence).toBe(1);
  });

  test("records pushed critical diagnostics for the active workspace", () => {
    useChatStore.setState({ workspaceId: "workspace_api" });

    useChatStore.getState().handleEvent(diagnosticCreatedEvent(1));

    expect(useChatStore.getState().diagnostics).toEqual([
      expect.objectContaining({
        code: "complete_turn_transition_failed",
        severity: "critical",
      }),
    ]);
  });

  test("resync-required events reload the selected snapshot", async () => {
    const conversation = testConversation();
    const listConversations = vi.fn().mockResolvedValue({
      conversations: [conversationItem(conversation, 1)],
    });
    const messagePage = vi
      .fn()
      .mockResolvedValue(
        testPage(conversation, [message("message_latest", 1, "user", "complete", "latest")]),
      );
    installSettaAPI({ chat: { listConversations, messagePage } });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(resyncRequiredEvent(1));
    await waitFor(() => messagePage.mock.calls.length === 1);

    expect(listConversations).toHaveBeenCalledWith("workspace_api");
    expect(messagePage).toHaveBeenCalledWith("workspace_api", "conversation_api", 0, 40);
  });

  test("resync-required events bypass sequence filtering after stream restart", async () => {
    const conversation = testConversation();
    const listConversations = vi.fn().mockResolvedValue({
      conversations: [conversationItem(conversation, 1)],
    });
    const messagePage = vi
      .fn()
      .mockResolvedValue(
        testPage(conversation, [message("message_latest", 1, "user", "complete", "latest")]),
      );
    installSettaAPI({ chat: { listConversations, messagePage } });
    useChatStore.setState({
      lastEventSequence: 10,
      lastEventStreamId: "event_stream_previous",
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(
      resyncRequiredEvent(0, {
        currentSequence: 0,
        currentStreamId: "event_stream_next",
        requestedSequence: 10,
        requestedStreamId: "event_stream_previous",
      }),
    );
    await waitFor(() => messagePage.mock.calls.length === 1);

    expect(useChatStore.getState().lastEventSequence).toBe(0);
    expect(useChatStore.getState().lastEventStreamId).toBe("event_stream_next");
    expect(messagePage).toHaveBeenCalledWith("workspace_api", "conversation_api", 0, 40);
  });
});

interface SettaAPIOverrides {
  chat?: Partial<SettaAPI["chat"]>;
}

function installSettaAPI(overrides: SettaAPIOverrides) {
  const conversation = testConversation();
  const api: SettaAPI = {
    app: {
      versions: async (): Promise<RuntimeVersions> => ({
        app: "test",
        chrome: "test",
        electron: "test",
        node: "test",
      }),
    },
    backend: {
      health: async (): Promise<BackendHealth> => ({
        name: "setta-backend",
        ok: true,
        version: "test",
      }),
      onEventStreamStatus: () => () => {},
      onProcessStatus: () => () => {},
    },
    chat: {
      activeRun: async () => ({ hasActiveRun: false, run: testRun("completed") }),
      cancelRun: async () => testRun("cancelled"),
      createConversation: async () => conversation,
      listConversations: async () => ({ conversations: [] }),
      messagePage: async () => testPage(conversation, []),
      onEvent: () => () => {},
      queueMessage: async () => ({
        conversation,
        page: testPage(conversation, []),
        queue: { messages: [], runs: [] },
        run: testRun("queued"),
        userMessage: message("message_queued", 1, "user", "pending", "queued", "queued"),
      }),
      runActivity: async () => ({
        items: [],
        output: [],
        runId: "run_api",
      }),
      runItemOutput: async () => ({
        hasMore: false,
        nextOrdinal: 0,
        output: [],
        runId: "run_api",
        runItemId: "run_item_api",
      }),
      sendMessage: async () => ({
        assistantMessage: message("message_assistant", 2, "assistant", "complete", "done"),
        conversation,
        page: testPage(conversation, []),
        run: testRun("completed"),
        userMessage: message("message_user", 1, "user", "complete", "hello"),
      }),
      steerMessage: async () => ({
        conversation,
        page: testPage(conversation, []),
        run: testRun("running"),
        userMessage: message("message_steer", 3, "user", "complete", "steer", "steering"),
      }),
      submitApproval: async () => testRun("running"),
      ...overrides.chat,
    },
    workspace: {
      close: async () => workspaceSession(),
      openLocalFolder: async () => ({
        session: workspaceSession(),
        workspace: workspaceSummary(),
      }),
      removeRecent: async () => workspaceSession(),
      reorder: async () => workspaceSession(),
      select: async () => workspaceSession(),
      session: async () => workspaceSession(),
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: api,
    },
  });
}

function messageCreatedEvent(
  sequence: number,
  chatMessage: ChatMessage,
  runId: string,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: chatMessage.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      message: chatMessage,
    },
    runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.message.created",
    workspaceId: "workspace_api",
  };
}

function assistantDeltaEvent(
  sequence: number,
  messageId: string,
  partId: string,
  delta: string,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      delta,
      messageId,
      partId,
      updatedAt: "2026-05-29T20:00:01Z",
    },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.assistant_text_delta",
    workspaceId: "workspace_api",
  };
}

function runUpdatedEvent(sequence: number, run: Run, streamId = eventStreamId): ChatEvent {
  return {
    conversationId: run.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { run },
    runId: run.id,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run.updated",
    workspaceId: run.workspaceId,
  };
}

function runItemCreatedEvent(sequence: number, item: RunItem, streamId = eventStreamId): ChatEvent {
  return {
    conversationId: item.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { item },
    runId: item.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_item.created",
    workspaceId: item.workspaceId,
  };
}

function runItemUpdatedEvent(sequence: number, item: RunItem, streamId = eventStreamId): ChatEvent {
  return {
    conversationId: item.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { item },
    runId: item.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_item.updated",
    workspaceId: item.workspaceId,
  };
}

function runItemOutputDeltaEvent(
  sequence: number,
  output: RunItemOutput,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { output },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_item_output.delta",
    workspaceId: "workspace_api",
  };
}

function conversationUpdatedEvent(
  sequence: number,
  item: ConversationListItem,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: item.conversation.id,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { item },
    runId: item.activeRunId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.conversation.updated",
    workspaceId: item.conversation.workspaceId,
  };
}

function diagnosticCreatedEvent(sequence: number, streamId = eventStreamId): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      diagnostic: {
        code: "complete_turn_transition_failed",
        context: { error: "terminal transition failed" },
        conversationId: "conversation_api",
        id: "diagnostic_api",
        message: "terminal transition failed",
        occurredAt: "2026-05-29T20:00:00Z",
        runId: "run_api",
        schemaVersion: 1,
        severity: "critical",
        source: "chat",
        workspaceId: "workspace_api",
      },
    },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "diagnostic.created",
    workspaceId: "workspace_api",
  };
}

function resyncRequiredEvent(
  sequence: number,
  options: {
    currentSequence?: number;
    currentStreamId?: string;
    requestedSequence?: number;
    requestedStreamId?: string;
  } = {},
): ChatEvent {
  const streamId = options.currentStreamId ?? eventStreamId;
  const currentSequence = options.currentSequence ?? sequence;
  return {
    conversationId: "",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${currentSequence}`,
    payload: {
      currentSequence,
      currentStreamId: streamId,
      earliestSequence: 0,
      reason: "test resync",
      requestedSequence: options.requestedSequence ?? Math.max(0, sequence - 1),
      requestedStreamId: options.requestedStreamId ?? streamId,
    },
    runId: "",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.resync_required",
    workspaceId: "",
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

function testConversation(): Conversation {
  return {
    archivedAt: "",
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id: "conversation_api",
    schemaVersion: 1,
    title: "API chat",
    updatedAt: "2026-05-29T20:00:00Z",
    workspaceId: "workspace_api",
  };
}

function conversationItem(
  conversation: Conversation,
  messageCount: number,
  activeRunId = "",
): ConversationListItem {
  return {
    activeRunId,
    conversation,
    messageCount,
  };
}

function testPage(
  conversation: Conversation,
  messages: ChatMessage[],
  hasMoreOlder = false,
): MessagePage {
  return {
    conversation,
    hasMoreOlder,
    messages,
    olderBeforeOrdinal: messages[0]?.ordinal ?? 0,
    queue: { messages: messages.filter((item) => item.delivery === "queued"), runs: [] },
    runItemOutputs: [],
    runItems: [],
  };
}

function message(
  id: string,
  ordinal: number,
  role: string,
  status: string,
  text: string,
  delivery = "normal",
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
    runId: role === "assistant" ? "run_api" : "",
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

function testRun(status: string): Run {
  return {
    assistantMessageId: "message_assistant",
    completedAt: status === "running" ? "" : "2026-05-29T20:01:00Z",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    hasPendingApproval: false,
    id: "run_api",
    pendingApproval: {
      approved: false,
      body: "",
      command: "",
      createdAt: "2026-05-29T20:00:00Z",
      filePath: "",
      id: "approval_api",
      kind: "permission",
      options: [],
      providerItemId: "",
      questions: [],
      permission: "",
      question: "",
      resolvedAt: "",
      response: "",
      runId: "run_api",
      runItemId: "",
      status: "pending",
      title: "Permission",
    },
    promptSummary: "hello",
    schemaVersion: 1,
    startedAt: "2026-05-29T20:00:00Z",
    status,
    triggerMessageId: "message_user",
    workspaceId: "workspace_api",
  };
}

function runItem(id: string, type: string, status: string): RunItem {
  return {
    command: "go test ./...",
    completedAt: "",
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    cwd: "/tmp/workspace",
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
    filePaths: [],
    id,
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    progress: "",
    providerItemId: "provider_" + id,
    result: "",
    runId: "run_api",
    schemaVersion: 1,
    serverName: "",
    startedAt: "2026-05-29T20:00:00Z",
    status,
    summary: "",
    title: "",
    toolName: "",
    type,
    workspaceId: "workspace_api",
  };
}

function runItemOutput(
  id: string,
  runItemId: string,
  ordinal: number,
  text: string,
): RunItemOutput {
  return {
    createdAt: "2026-05-29T20:00:00Z",
    id,
    ordinal,
    runItemId,
    schemaVersion: 1,
    stream: "stdout",
    text,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: Error) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | null = null;
  let reject: Deferred<T>["reject"] | null = null;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  if (!resolve || !reject) {
    throw new Error("deferred promise callbacks were not initialized");
  }
  return { promise, reject, resolve };
}

function workspaceSession(): WorkspaceSession {
  return {
    activeWorkspaces: [workspaceSummary()],
    recentWorkspaces: [],
    selectedWorkspaceId: "workspace_api",
  };
}

function workspaceSummary() {
  return {
    displayName: "api",
    id: "workspace_api",
    lastOpenedAt: "2026-05-29T20:00:00Z",
    rootPath: "/tmp/api",
  };
}
