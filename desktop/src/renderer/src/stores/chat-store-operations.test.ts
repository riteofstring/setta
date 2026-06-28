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
  RunItemStatus,
  TranscriptBlock,
  TranscriptBlockStatus,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { chatTextInput } from "../lib/chat-input";
import { useChatStore } from "./chat-store";
import {
  activityBlock,
  assistantTextBlock,
  userMessageBlock,
} from "./chat-store-events.test.helpers";

const eventStreamId = "event_stream_test";

describe("chat store operation scopes", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
    useChatStore.getState().handleBackendProcessStatus({
      message: "Backend online",
      mode: "spawned",
      status: "online",
      url: "http://127.0.0.1:1",
    });
  });

  test("steering message events update the message surface without touching transcript blocks", () => {
    // The transcript is driven only by block events; message events feed the
    // queue/message surface, so a steering_sent event must not mutate blocks (the
    // steering user_message block arrives through its own block event).
    const conversation = testConversation();
    const runId = "run_active";
    const trigger = message("message_user", 1, "user", "complete", "active", runId);
    const blocks = runBlocks(runId, { assistantText: "partial" });
    const steering = message("message_steering", 3, "user", "complete", "steer", runId, "steering");
    useChatStore.setState({
      activeRun: testRun("running", runId),
      messages: [trigger],
      selectedConversation: conversation,
      status: "ready",
      transcriptBlocks: blocks,
      transcriptBlocksById: blocksById(blocks),
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent({
      ...messageCreatedEvent(1, steering, runId),
      payload: { message: steering, run: testRun("running", runId) },
      type: "chat.message.steering_sent" as const,
    });

    expect(useChatStore.getState().messagesById[steering.id]?.delivery).toBe("steering");
    expect(useChatStore.getState().transcriptBlocks.map((block) => block.id)).toEqual(
      blocks.map((block) => block.id),
    );
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

    const sendPromise = useChatStore.getState().sendMessage(chatTextInput("overlap send"));
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
    expect(useChatStore.getState().messagesById[sentUser.id]?.parts[0]?.text?.text).toBe(
      "overlap send",
    );
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("backend offline status prevents event resync backend calls", async () => {
    const conversation = testConversation();
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(conversation, 1)]));
    const messagePage = vi.fn().mockResolvedValue(testPage(conversation, []));
    installSettaAPI({ chat: { listConversations, messagePage } });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore
      .getState()
      .handleBackendProcessStatus({ message: "Backend is stopping", status: "offline" });
    await useChatStore.getState().resyncActiveConversation();

    expect(listConversations).not.toHaveBeenCalled();
    expect(messagePage).not.toHaveBeenCalled();
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("backend offline status cancels stale resync before active run lookup", async () => {
    const conversation = testConversation();
    const resyncPage = deferred<MessagePage>();
    const activeRun = vi.fn().mockResolvedValue({ hasActiveRun: false, liveness: null, run: null });
    const messagePage = vi.fn().mockReturnValue(resyncPage.promise);
    installSettaAPI({
      chat: {
        activeRun,
        listConversations: async () => listResponse([conversationItem(conversation, 1)]),
        messagePage,
      },
    });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    const resync = useChatStore.getState().resyncActiveConversation();
    await waitFor(() => messagePage.mock.calls.length === 1);
    useChatStore
      .getState()
      .handleBackendProcessStatus({ message: "Backend is stopping", status: "offline" });
    resyncPage.resolve(testPage(conversation, []));
    await resync;

    expect(activeRun).not.toHaveBeenCalled();
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("resync completion preserves terminal block snapshots that arrive while the page loads", async () => {
    const conversation = testConversation();
    const runId = "run_dynamic";
    const staleBlocks = runBlocks(runId, {
      activity: { blockStatus: "streaming", status: "running" },
      assistantText: "",
    });
    const completedBlocks = runBlocks(runId, {
      activity: { blockStatus: "complete", status: "completed" },
      assistantStatus: "complete",
      assistantText: "Dynamic tool workflow complete.",
    });
    const runningRun = testRun("running", runId);
    const resyncPage = deferred<MessagePage>();
    const messagePage = vi.fn().mockReturnValue(resyncPage.promise);
    installSettaAPI({
      chat: {
        activeRun: async () => ({ hasActiveRun: false, liveness: null, run: null }),
        listConversations: async () => listResponse([conversationItem(conversation, 2)]),
        messagePage,
      },
    });
    useChatStore.setState({
      activeRun: runningRun,
      selectedConversation: conversation,
      status: "ready",
      transcriptBlocks: staleBlocks,
      transcriptBlocksById: blocksById(staleBlocks),
      workspaceId: "workspace_api",
    });

    const resyncPromise = useChatStore.getState().resyncActiveConversation();
    await waitFor(() => messagePage.mock.calls.length === 1);
    // Block events finalize the run while the resync page is in flight.
    useChatStore.setState({
      activeRun: null,
      transcriptBlocks: completedBlocks,
      transcriptBlocksById: blocksById(completedBlocks),
    });
    // The resync page is stale: it still shows the run streaming.
    resyncPage.resolve(testPage(conversation, [], staleBlocks));
    await resyncPromise;

    const state = useChatStore.getState();
    expect(state.activeRun).toBeNull();
    expect(state.transcriptBlocksById[`${runId}_text`]?.assistantText?.text).toBe(
      "Dynamic tool workflow complete.",
    );
    expect(state.transcriptBlocksById[`${runId}_text`]?.status).toBe("complete");
    expect(state.transcriptBlocksById[`${runId}_activity`]?.activity?.status).toBe("completed");
  });

  test("resync completion preserves a terminal run promoted by events but missing from a stale page", async () => {
    const conversation = testConversation();
    const activeRunId = "run_active";
    const promotedRunId = "run_promoted";
    const staleActiveBlocks = runBlocks(activeRunId, { assistantText: "active partial" });
    const completedActiveBlocks = runBlocks(activeRunId, {
      assistantStatus: "complete",
      assistantText: "active complete",
    });
    const completedPromotedBlocks = runBlocks(promotedRunId, {
      assistantStatus: "complete",
      assistantText: "queued complete",
    });
    const runningActiveRun = testRun("running", activeRunId);
    const staleQueuedRun = testRun("queued", promotedRunId);
    const resyncPage = deferred<MessagePage>();
    const messagePage = vi.fn().mockReturnValue(resyncPage.promise);
    installSettaAPI({
      chat: {
        activeRun: async () => ({ hasActiveRun: false, liveness: null, run: null }),
        listConversations: async () => listResponse([conversationItem(conversation, 4)]),
        messagePage,
      },
    });
    useChatStore.setState({
      activeRun: runningActiveRun,
      queuedRuns: [staleQueuedRun],
      selectedConversation: conversation,
      status: "ready",
      transcriptBlocks: staleActiveBlocks,
      transcriptBlocksById: blocksById(staleActiveBlocks),
      workspaceId: "workspace_api",
    });

    const resyncPromise = useChatStore.getState().resyncActiveConversation();
    await waitFor(() => messagePage.mock.calls.length === 1);
    // Events finish the active run and run the queued run to completion. The
    // promoted run's blocks are appended after the active run, newest last.
    const mergedBlocks = [...completedActiveBlocks, ...completedPromotedBlocks];
    useChatStore.setState({
      activeRun: null,
      queuedRuns: [],
      transcriptBlocks: mergedBlocks,
      transcriptBlocksById: blocksById(mergedBlocks),
    });
    // The stale page predates the promotion: it shows only the streaming active run
    // and still lists the promoted run in the queue.
    resyncPage.resolve({
      ...testPage(conversation, [], staleActiveBlocks),
      queue: { messages: [], runs: [staleQueuedRun] },
    });
    await resyncPromise;

    const state = useChatStore.getState();
    expect(state.activeRun).toBeNull();
    expect(state.queuedRuns.map((run) => run.id)).not.toContain(promotedRunId);
    // The promoted run keeps its event-driven position after the active run.
    expect(runOrder(state.transcriptBlocks)).toEqual([activeRunId, promotedRunId]);
    expect(state.transcriptBlocksById[`${promotedRunId}_text`]?.assistantText?.text).toBe(
      "queued complete",
    );
    expect(state.transcriptBlocksById[`${activeRunId}_text`]?.assistantText?.text).toBe(
      "active complete",
    );
  });

  test("resync completion keeps lazily-loaded detail run-item outputs the page no longer carries", async () => {
    const conversation = testConversation();
    const runId = "run_activity";
    const completedItem = {
      ...runItem("run_item_activity", runId, "completed"),
      result: "done",
    };
    const completedOutput = runItemOutput("run_item_output_activity", completedItem.id, "done\n");
    const blocks = runBlocks(runId, {
      activity: { blockStatus: "complete", status: "completed" },
      assistantStatus: "complete",
      assistantText: "done",
    });
    const resyncPage = deferred<MessagePage>();
    const messagePage = vi.fn().mockReturnValue(resyncPage.promise);
    installSettaAPI({
      chat: {
        activeRun: async () => ({ hasActiveRun: false, liveness: null, run: null }),
        listConversations: async () => listResponse([conversationItem(conversation, 2)]),
        messagePage,
      },
    });
    useChatStore.setState({
      activeRun: null,
      runItemOutputs: [completedOutput],
      runItemOutputsById: { [completedOutput.id]: completedOutput },
      selectedConversation: conversation,
      status: "ready",
      transcriptBlocks: blocks,
      transcriptBlocksById: blocksById(blocks),
      workspaceId: "workspace_api",
    });

    const resyncPromise = useChatStore.getState().resyncActiveConversation();
    await waitFor(() => messagePage.mock.calls.length === 1);
    // The page carries blocks only; detail run-item outputs are loaded lazily by
    // source run item ID and must survive a resync.
    resyncPage.resolve(testPage(conversation, [], blocks));
    await resyncPromise;

    const state = useChatStore.getState();
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
        activeRun: async () => ({ hasActiveRun: false, liveness: null, run: null }),
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
    const streamingBlocks = runBlocks(run.id, { assistantText: "" });
    const completedBlocks = runBlocks(run.id, {
      assistantStatus: "complete",
      assistantText: "approved",
    });
    const submitApproval = vi.fn().mockReturnValue(approvalResponse.promise);
    installSettaAPI({ chat: { submitApproval } });
    useChatStore.setState({
      activeRun: run,
      selectedConversation: conversation,
      status: "ready",
      transcriptBlocks: streamingBlocks,
      transcriptBlocksById: blocksById(streamingBlocks),
      workspaceId: "workspace_api",
    });

    const approvePromise = useChatStore
      .getState()
      .submitApproval("approval_api", true, "", [], false);
    useChatStore.setState({
      activeRun: null,
      transcriptBlocks: completedBlocks,
      transcriptBlocksById: blocksById(completedBlocks),
    });
    approvalResponse.resolve(run);
    await approvePromise;

    expect(useChatStore.getState().activeRun).toBeNull();
  });
});

function runOrder(blocks: TranscriptBlock[]): string[] {
  const order: string[] = [];
  for (const block of blocks) {
    if (!order.includes(block.runId)) {
      order.push(block.runId);
    }
  }
  return order;
}

interface SettaAPIOverrides {
  chat?: Partial<SettaAPI["chat"]>;
}

function installSettaAPI(overrides: SettaAPIOverrides) {
  const conversation = testConversation();
  const chat = {
    activeRun: async () => ({ hasActiveRun: false, liveness: null, run: null }),
    listBackgroundTerminals: async () => ({ terminals: [] }),
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

function conversationItem(conversation: Conversation, messageCount: number): ConversationListItem {
  return {
    activeRunId: "",
    activeRunLiveness: null,
    pinnedAt: "",
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

function testPage(
  conversation: Conversation,
  messages: ChatMessage[],
  blocks: TranscriptBlock[] = [],
): MessagePage {
  return {
    blocks,
    conversation,
    goal: null,
    hasMoreOlder: false,
    messages,
    olderBeforeBlockOrdinal: 0,
    queue: { messages: [], runs: [] },
  };
}

// runBlocks builds one run's ordered transcript blocks: trigger user message,
// assistant text, and an optional activity row, with run-local ordinals.
function runBlocks(
  runId: string,
  opts: {
    assistantText: string;
    assistantStatus?: TranscriptBlockStatus;
    activity?: { status: RunItemStatus; blockStatus: TranscriptBlockStatus };
  },
): TranscriptBlock[] {
  const blocks = [
    userMessageBlock({ id: `${runId}_trigger`, ordinal: 1, runId, text: "user" }),
    assistantTextBlock({
      id: `${runId}_text`,
      ordinal: 2,
      runId,
      status: opts.assistantStatus ?? "streaming",
      text: opts.assistantText,
    }),
  ];
  if (opts.activity) {
    blocks.push(
      activityBlock({
        activityStatus: opts.activity.status,
        id: `${runId}_activity`,
        ordinal: 3,
        runId,
        sourceRunItemId: `run_item_${runId}`,
        status: opts.activity.blockStatus,
      }),
    );
  }
  return blocks;
}

function blocksById(blocks: TranscriptBlock[]): Record<string, TranscriptBlock> {
  return Object.fromEntries(blocks.map((block) => [block.id, block]));
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
    source: null,
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
      {
        id: `${id}_part`,
        image: null,
        text: { format: role === "assistant" ? "markdown" : "plain", text },
        type: "text",
      },
    ],
    role,
    runId,
    schemaVersion: 1,
    status,
    updatedAt: "2026-05-29T20:00:00Z",
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
