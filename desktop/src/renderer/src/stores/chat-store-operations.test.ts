import type {
  ChatEvent,
  ChatGoalState,
  ChatMessage,
  Conversation,
  ConversationListItem,
  ListConversationsResponse,
  MessageDelivery,
  MessagePage,
  MessageRole,
  MessageStatus,
  Run,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";

const eventStreamId = "event_stream_test";

describe("chat store operation scopes", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  test("attaches promoted assistant message events to queued transcript turns", () => {
    const conversation = testConversation();
    const runId = "run_queued";
    const queued = message(
      "message_queued",
      1,
      "user",
      "pending",
      "queued prompt",
      runId,
      "queued",
    );
    const assistant = message(
      "message_queued_assistant",
      2,
      "assistant",
      "complete",
      "queued response",
      runId,
    );
    useChatStore.setState({
      messages: [queued],
      selectedConversation: conversation,
      status: "ready",
      transcript: [transcriptTurn(testRun("queued", runId), queued, null)],
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(messageCreatedEvent(1, assistant, runId));

    expect(useChatStore.getState().messagesById[assistant.id]?.parts[0]?.text).toBe(
      "queued response",
    );
    expect(useChatStore.getState().transcript[0]?.assistantMessage?.id).toBe(assistant.id);
  });

  test("attaches steering message events to active transcript turns", () => {
    const conversation = testConversation();
    const runId = "run_active";
    const trigger = message("message_user", 1, "user", "complete", "active", runId);
    const assistant = message("message_assistant", 2, "assistant", "streaming", "partial", runId);
    const steering = message("message_steering", 3, "user", "complete", "steer", runId, "steering");
    useChatStore.setState({
      activeRun: testRun("running", runId),
      messages: [trigger, assistant],
      selectedConversation: conversation,
      status: "ready",
      transcript: [transcriptTurn(testRun("running", runId), trigger, assistant)],
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent({
      ...messageCreatedEvent(1, steering, runId),
      payload: { message: steering, run: testRun("running", runId) },
      type: "chat.message.steering_sent" as const,
    });

    expect(useChatStore.getState().messagesById[steering.id]?.delivery).toBe("steering");
    expect(useChatStore.getState().transcript[0]?.steeringMessages.map((item) => item.id)).toEqual([
      steering.id,
    ]);
  });

  test("resync completion does not cancel an overlapping user send response", async () => {
    const conversation = testConversation();
    const sendResponse = deferred<Awaited<ReturnType<SettaAPI["chat"]["sendMessage"]>>>();
    const resyncPage = deferred<MessagePage>();
    const refreshed = message("message_refreshed", 1, "assistant", "complete", "refreshed");
    const sentUser = message("message_sent_user", 2, "user", "complete", "overlap send", "");
    const sentAssistant = message(
      "message_sent_assistant",
      3,
      "assistant",
      "streaming",
      "",
      "run_sent",
    );
    const run = testRun("running", "run_sent");
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(conversation, 1)]));
    const messagePage = vi.fn().mockReturnValue(resyncPage.promise);
    const sendMessage = vi.fn().mockReturnValue(sendResponse.promise);
    installSettaAPI({ chat: { listConversations, messagePage, sendMessage } });
    useChatStore.setState({
      messages: [message("message_existing", 1, "assistant", "complete", "existing")],
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    const sendPromise = useChatStore.getState().sendMessage("overlap send");
    expect(useChatStore.getState().operation).toBe("sending");

    useChatStore.getState().handleEvent(resyncRequiredEvent(1));
    await waitFor(() => messagePage.mock.calls.length === 1);
    expect(useChatStore.getState().operation).toBe("sending");

    resyncPage.resolve(testPage(conversation, [refreshed]));
    await waitFor(() => Boolean(useChatStore.getState().messagesById[refreshed.id]));
    expect(useChatStore.getState().operation).toBe("sending");

    sendResponse.resolve({
      assistantMessage: sentAssistant,
      conversation,
      page: testPage(conversation, [sentUser, sentAssistant]),
      run,
      userMessage: sentUser,
    });
    await sendPromise;

    expect(useChatStore.getState().activeRun?.id).toBe(run.id);
    expect(useChatStore.getState().messagesById[sentUser.id]?.parts[0]?.text).toBe("overlap send");
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("resync completion preserves terminal events that arrive while the page is loading", async () => {
    const conversation = testConversation();
    const runId = "run_dynamic";
    const user = message(
      "message_dynamic_user",
      1,
      "user",
      "complete",
      "dynamic tool workflow",
      runId,
    );
    const staleAssistant = message(
      "message_dynamic_assistant",
      2,
      "assistant",
      "streaming",
      "",
      runId,
    );
    const staleAssistantPart = staleAssistant.parts[0];
    if (!staleAssistantPart) {
      throw new Error("test assistant message must include a part");
    }
    const completedAssistant: ChatMessage = {
      ...staleAssistant,
      parts: [{ ...staleAssistantPart, text: "Dynamic tool workflow complete." }],
      status: "complete" as const,
      updatedAt: "2026-05-29T20:00:02Z",
    };
    const runningRun = testRun("running", runId);
    const completedRun = testRun("completed", runId);
    const runningItem = runItem("run_item_dynamic", runId, "running");
    const completedItem = {
      ...runningItem,
      completedAt: "2026-05-29T20:00:02Z",
      result: "tool ok",
      status: "completed" as const,
    };
    const resyncPage = deferred<MessagePage>();
    const messagePage = vi.fn().mockReturnValue(resyncPage.promise);
    installSettaAPI({
      chat: {
        activeRun: async () => ({ hasActiveRun: false, run: null }),
        listConversations: async () => listResponse([conversationItem(conversation, 2)]),
        messagePage,
      },
    });
    useChatStore.setState({
      activeRun: runningRun,
      messages: [user, staleAssistant],
      runItemOutputs: [],
      runItems: [runningItem],
      selectedConversation: conversation,
      status: "ready",
      transcript: [transcriptTurn(runningRun, user, staleAssistant)],
      workspaceId: "workspace_api",
    });

    const resyncPromise = useChatStore.getState().resyncActiveConversation();
    await waitFor(() => messagePage.mock.calls.length === 1);
    useChatStore.setState({
      activeRun: null,
      messages: [user, completedAssistant],
      runItemOutputs: [runItemOutput("run_item_output_dynamic", runningItem.id, "tool ok\n")],
      runItems: [completedItem],
      transcript: [transcriptTurn(completedRun, user, completedAssistant)],
    });
    resyncPage.resolve({
      ...testPage(conversation, [user, staleAssistant]),
      runItems: [runningItem],
      transcript: [transcriptTurn(runningRun, user, staleAssistant)],
    });
    await resyncPromise;

    const state = useChatStore.getState();
    expect(state.activeRun).toBeNull();
    expect(state.messagesById[completedAssistant.id]?.parts[0]?.text).toBe(
      "Dynamic tool workflow complete.",
    );
    expect(state.runItemsById[completedItem.id]?.status).toBe("completed");
    expect(state.transcript[0]?.run.status).toBe("completed");
  });

  test("resync completion preserves terminal queued runs missing from a stale page", async () => {
    const conversation = testConversation();
    const activeRunId = "run_active";
    const queuedRunId = "run_promoted";
    const activeUser = message(
      "message_active_user",
      1,
      "user",
      "complete",
      "active workflow",
      activeRunId,
    );
    const staleActiveAssistant = message(
      "message_active_assistant",
      2,
      "assistant",
      "streaming",
      "active partial",
      activeRunId,
    );
    const completedActiveAssistant = replaceMessageText(
      { ...staleActiveAssistant, status: "complete" },
      "active complete",
    );
    const staleQueuedUser = message(
      "message_queued_user",
      3,
      "user",
      "pending",
      "queued workflow",
      queuedRunId,
      "queued",
    );
    const completedQueuedUser = { ...staleQueuedUser, status: "complete" as const };
    const completedQueuedAssistant = message(
      "message_queued_assistant",
      4,
      "assistant",
      "complete",
      "queued complete",
      queuedRunId,
    );
    const runningActiveRun = testRun("running", activeRunId);
    const completedActiveRun = testRun("completed", activeRunId);
    const staleQueuedRun = testRun("queued", queuedRunId);
    const completedQueuedRun = testRun("completed", queuedRunId);
    const resyncPage = deferred<MessagePage>();
    const messagePage = vi.fn().mockReturnValue(resyncPage.promise);
    installSettaAPI({
      chat: {
        activeRun: async () => ({ hasActiveRun: false, run: null }),
        listConversations: async () => listResponse([conversationItem(conversation, 4)]),
        messagePage,
      },
    });
    useChatStore.setState({
      activeRun: runningActiveRun,
      messages: [activeUser, staleActiveAssistant, staleQueuedUser],
      queuedRuns: [staleQueuedRun],
      selectedConversation: conversation,
      status: "ready",
      transcript: [transcriptTurn(runningActiveRun, activeUser, staleActiveAssistant)],
      workspaceId: "workspace_api",
    });

    const resyncPromise = useChatStore.getState().resyncActiveConversation();
    await waitFor(() => messagePage.mock.calls.length === 1);
    useChatStore.setState({
      activeRun: null,
      messages: [
        activeUser,
        completedActiveAssistant,
        completedQueuedUser,
        completedQueuedAssistant,
      ],
      queuedRuns: [],
      transcript: [
        transcriptTurn(completedActiveRun, activeUser, completedActiveAssistant),
        transcriptTurn(completedQueuedRun, completedQueuedUser, completedQueuedAssistant),
      ],
    });
    resyncPage.resolve({
      ...testPage(conversation, [activeUser, staleActiveAssistant, staleQueuedUser]),
      queue: { messages: [staleQueuedUser], runs: [staleQueuedRun] },
      transcript: [transcriptTurn(runningActiveRun, activeUser, staleActiveAssistant)],
    });
    await resyncPromise;

    const state = useChatStore.getState();
    expect(state.activeRun).toBeNull();
    expect(state.queuedRuns.map((run) => run.id)).not.toContain(queuedRunId);
    expect(state.transcript.map((turn) => turn.run.id)).toEqual([activeRunId, queuedRunId]);
    expect(state.transcript[1]?.run.status).toBe("completed");
    expect(state.messagesById[completedQueuedAssistant.id]?.parts[0]?.text).toBe("queued complete");
    expect(state.messagesById[completedQueuedUser.id]?.status).toBe("complete");
  });

  test("resync completion does not downgrade terminal run items from stale pages", async () => {
    const conversation = testConversation();
    const runId = "run_activity";
    const user = message("message_activity_user", 1, "user", "complete", "activity", runId);
    const assistant = message(
      "message_activity_assistant",
      2,
      "assistant",
      "streaming",
      "partial",
      runId,
    );
    const runningRun = testRun("running", runId);
    const runningItem = runItem("run_item_activity", runId, "running");
    const completedItem = {
      ...runningItem,
      completedAt: "2026-05-29T20:00:02Z",
      result: "done",
      status: "completed" as const,
    };
    const completedOutput = runItemOutput("run_item_output_activity", runningItem.id, "done\n");
    const resyncPage = deferred<MessagePage>();
    const messagePage = vi.fn().mockReturnValue(resyncPage.promise);
    installSettaAPI({
      chat: {
        activeRun: async () => ({ hasActiveRun: true, run: runningRun }),
        listConversations: async () => listResponse([conversationItem(conversation, 2)]),
        messagePage,
      },
    });
    useChatStore.setState({
      activeRun: runningRun,
      messages: [user, assistant],
      runItemOutputs: [completedOutput],
      runItems: [completedItem],
      selectedConversation: conversation,
      status: "ready",
      transcript: [transcriptTurn(runningRun, user, assistant)],
      workspaceId: "workspace_api",
    });

    const resyncPromise = useChatStore.getState().resyncActiveConversation();
    await waitFor(() => messagePage.mock.calls.length === 1);
    resyncPage.resolve({
      ...testPage(conversation, [user, assistant]),
      runItemOutputs: [],
      runItems: [runningItem],
      transcript: [transcriptTurn(runningRun, user, assistant)],
    });
    await resyncPromise;

    const state = useChatStore.getState();
    expect(state.runItemsById[completedItem.id]?.status).toBe("completed");
    expect(state.runItemOutputsById[completedOutput.id]?.text).toBe("done\n");
  });

  test("resync completion preserves newer goal state from events", async () => {
    const conversation = testConversation();
    const activeGoal = goalState("finish renderer tests", "active", 10);
    const completedGoal = goalState("finish renderer tests", "complete", activeGoal.updatedAt);
    const resyncPage = deferred<MessagePage>();
    const messagePage = vi.fn().mockReturnValue(resyncPage.promise);
    installSettaAPI({
      chat: {
        activeRun: async () => ({ hasActiveRun: false, run: null }),
        listConversations: async () => listResponse([conversationItem(conversation, 0)]),
        messagePage,
      },
    });
    useChatStore.setState({
      goal: activeGoal,
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    const resyncPromise = useChatStore.getState().resyncActiveConversation();
    await waitFor(() => messagePage.mock.calls.length === 1);
    useChatStore.setState({ goal: completedGoal });
    resyncPage.resolve({ ...testPage(conversation, []), goal: activeGoal });
    await resyncPromise;

    expect(useChatStore.getState().goal?.status).toBe("complete");
  });

  test("approval response does not resurrect a run completed by events before the response", async () => {
    const conversation = testConversation();
    const approvalResponse = deferred<Run>();
    const run = testRun("running", "run_approval");
    const completedRun = testRun("completed", run.id);
    const assistant = message(
      "message_approval_assistant",
      2,
      "assistant",
      "streaming",
      "",
      run.id,
    );
    const submitApproval = vi.fn().mockReturnValue(approvalResponse.promise);
    installSettaAPI({ chat: { submitApproval } });
    useChatStore.setState({
      activeRun: run,
      messages: [assistant],
      selectedConversation: conversation,
      status: "ready",
      transcript: [
        transcriptTurn(
          run,
          message("message_approval_user", 1, "user", "complete", "approve", run.id),
          assistant,
        ),
      ],
      workspaceId: "workspace_api",
    });

    const approvePromise = useChatStore
      .getState()
      .submitApproval("approval_api", true, "", [], false);
    useChatStore.setState({
      activeRun: null,
      transcript: [
        transcriptTurn(
          completedRun,
          message("message_approval_user", 1, "user", "complete", "approve", run.id),
          assistant,
        ),
      ],
    });
    approvalResponse.resolve(run);
    await approvePromise;

    expect(useChatStore.getState().activeRun).toBeNull();
  });
});

interface SettaAPIOverrides {
  chat?: Partial<SettaAPI["chat"]>;
}

function installSettaAPI(overrides: SettaAPIOverrides) {
  const conversation = testConversation();
  const chat = {
    activeRun: async () => ({ hasActiveRun: false, run: null }),
    listConversations: async () => listResponse([]),
    messagePage: async () => testPage(conversation, []),
    onEvent: () => () => {},
    sendMessage: async () => ({
      assistantMessage: message("message_assistant", 2, "assistant", "complete", "done"),
      conversation,
      page: testPage(conversation, []),
      run: testRun("completed"),
      userMessage: message("message_user", 1, "user", "complete", "hello"),
    }),
    ...overrides.chat,
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: { chat } },
  });
}

function testConversation(): Conversation {
  return {
    archivedAt: "",
    codexSettings: null,
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id: "conversation_api",
    schemaVersion: 1,
    title: "API chat",
    updatedAt: "2026-05-29T20:00:00Z",
    workspaceId: "workspace_api",
  };
}

function conversationItem(conversation: Conversation, messageCount: number): ConversationListItem {
  return {
    activeRunId: "",
    conversation,
    latestReadRelevantMarker: 0,
    messageCount,
    readMarker: 0,
  };
}

function listResponse(conversations: ConversationListItem[]): ListConversationsResponse {
  return {
    conversations,
    corruption: { byKind: [], bySeverity: [], hasCorruption: false, total: 0 },
    diagnostics: [],
  };
}

function goalState(objective: string, status: string, updatedAt: number): ChatGoalState {
  return {
    createdAt: 0,
    objective,
    status,
    threadId: "thread_fake",
    timeUsedSeconds: 0,
    tokenBudget: null,
    tokensUsed: 0,
    updatedAt,
  };
}

function testPage(conversation: Conversation, messages: ChatMessage[]): MessagePage {
  return {
    conversation,
    goal: null,
    hasMoreOlder: false,
    messages,
    olderBeforeOrdinal: messages[0]?.ordinal ?? 0,
    queue: { messages: [], runs: [] },
    runItemOutputs: [],
    runItems: [],
    transcript: [],
  };
}

function transcriptTurn(
  run: Run,
  triggerMessage: ChatMessage,
  assistantMessage: ChatMessage | null,
): TranscriptTurn {
  return {
    assistantMessage,
    run: {
      ...run,
      assistantMessageId: assistantMessage?.id ?? "",
      triggerMessageId: triggerMessage.id,
    },
    steeringMessages: [],
    triggerMessage,
  };
}

function testRun<Status extends Run["status"]>(
  status: Status,
  id = "run_api",
): Run & { status: Status } {
  const run = {
    assistantMessageId: status === "queued" ? "" : "message_assistant",
    completedAt: status === "running" || status === "queued" ? "" : "2026-05-29T20:01:00Z",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    id,
    pendingApproval: null,
    promptSummary: "hello",
    schemaVersion: 1,
    startedAt: status === "queued" ? "" : "2026-05-29T20:00:00Z",
    status,
    triggerMessageId: "message_user",
    workspaceId: "workspace_api",
  } satisfies Run;
  return run as Run & { status: Status };
}

function runItem(id: string, runId: string, status: RunItem["status"]): RunItem {
  return {
    command: "",
    completedAt: status === "running" || status === "pending" ? "" : "2026-05-29T20:00:02Z",
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:01Z",
    cwd: "",
    details: null,
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
    filePaths: [],
    hiddenText: "",
    id,
    namespace: "setta",
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    processId: "",
    progress: "",
    providerItemId: `provider_${id}`,
    requestId: "",
    result: "",
    reviewId: "",
    schemaVersion: 1,
    serverName: "",
    startedAt: "2026-05-29T20:00:01Z",
    status,
    summary: "",
    title: "Dynamic tool call",
    toolName: "fakeTool",
    type: "dynamic_tool_call",
    workspaceId: "workspace_api",
    runId,
  };
}

function runItemOutput(id: string, runItemId: string, text: string): RunItemOutput {
  return {
    createdAt: "2026-05-29T20:00:02Z",
    id,
    ordinal: 1,
    runItemId,
    schemaVersion: 1,
    stream: "stdout",
    text,
  };
}

function message(
  id: string,
  ordinal: number,
  role: MessageRole,
  status: MessageStatus,
  text: string,
  runId = "run_api",
  delivery: MessageDelivery = "normal",
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
  };
}

function resyncRequiredEvent(sequence: number): ChatEvent {
  return {
    conversationId: "",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${eventStreamId}:${sequence}`,
    payload: {
      currentSequence: sequence,
      currentStreamId: eventStreamId,
      earliestSequence: 0,
      reason: "test resync",
      requestedSequence: Math.max(0, sequence - 1),
      requestedStreamId: eventStreamId,
    },
    runId: "",
    schemaVersion: 1,
    sequence,
    streamId: eventStreamId,
    type: "chat.resync_required",
    workspaceId: "",
  };
}

function messageCreatedEvent(sequence: number, chatMessage: ChatMessage, runId: string): ChatEvent {
  return {
    conversationId: chatMessage.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${eventStreamId}:${sequence}`,
    payload: {
      message: chatMessage,
    },
    runId,
    schemaVersion: 1,
    sequence,
    streamId: eventStreamId,
    type: "chat.message.created",
    workspaceId: "workspace_api",
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

async function waitFor(done: () => boolean) {
  const startedAt = Date.now();
  while (!done()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
