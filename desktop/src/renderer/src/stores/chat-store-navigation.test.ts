import type {
  BackendHealth,
  ChatEvent,
  ChatMessage,
  Conversation,
  ConversationListItem,
  CorruptionSummary,
  ListConversationsResponse,
  MessageDelivery,
  MessagePage,
  MessageRole,
  MessageStatus,
  WorkspaceSession,
} from "@generated/backend";
import type { RuntimeVersions, SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";

const eventStreamId = "event_stream_test";

describe("chat store navigation caches", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  test("selecting a cached conversation renders cached detail while revalidating", async () => {
    const firstConversation = testConversation({ id: "conversation_first", title: "First" });
    const cachedConversation = testConversation({ id: "conversation_cached", title: "Cached" });
    const cachedMessage = messageForConversation(
      cachedConversation,
      "message_cached",
      1,
      "user",
      "complete",
      "cached detail",
      "normal",
      "run_cached",
    );
    const freshMessage = messageForConversation(
      cachedConversation,
      "message_fresh",
      1,
      "user",
      "complete",
      "fresh detail",
      "normal",
      "run_cached",
    );
    const pageResponse = deferred<MessagePage>();
    const messagePage = vi.fn().mockReturnValue(pageResponse.promise);
    installSettaAPI({ chat: { messagePage } });
    useChatStore.setState({
      conversationDetailsById: {
        [cachedConversation.id]: conversationDetail(cachedConversation, [cachedMessage]),
      },
      conversations: [
        conversationItem(firstConversation, 1),
        conversationItem(cachedConversation, 1),
      ],
      messages: [
        messageForConversation(
          firstConversation,
          "message_first",
          1,
          "user",
          "complete",
          "first detail",
        ),
      ],
      selectedConversation: firstConversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    const selection = useChatStore.getState().selectConversation(cachedConversation.id);

    expect(useChatStore.getState().selectedConversation?.id).toBe(cachedConversation.id);
    expect(useChatStore.getState().messages.map((item) => item.parts[0]?.text)).toEqual([
      "cached detail",
    ]);
    expect(useChatStore.getState().operation).toBe("loading");

    pageResponse.resolve(testPage(cachedConversation, [freshMessage]));
    await selection;

    expect(messagePage).toHaveBeenCalledWith("workspace_api", cachedConversation.id, 0, 40);
    expect(useChatStore.getState().messages.map((item) => item.parts[0]?.text)).toEqual([
      "fresh detail",
    ]);
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("selecting an uncached conversation preserves previous detail until the page arrives", async () => {
    const firstConversation = testConversation({ id: "conversation_first", title: "First" });
    const nextConversation = testConversation({ id: "conversation_next", title: "Next" });
    const firstMessage = messageForConversation(
      firstConversation,
      "message_first",
      1,
      "user",
      "complete",
      "first detail",
    );
    const nextMessage = messageForConversation(
      nextConversation,
      "message_next",
      1,
      "user",
      "complete",
      "next detail",
    );
    const pageResponse = deferred<MessagePage>();
    installSettaAPI({ chat: { messagePage: vi.fn().mockReturnValue(pageResponse.promise) } });
    useChatStore.setState({
      conversations: [
        conversationItem(firstConversation, 1),
        conversationItem(nextConversation, 1),
      ],
      messages: [firstMessage],
      selectedConversation: firstConversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    const selection = useChatStore.getState().selectConversation(nextConversation.id);

    expect(useChatStore.getState().selectedConversation?.id).toBe(firstConversation.id);
    expect(useChatStore.getState().messages.map((item) => item.parts[0]?.text)).toEqual([
      "first detail",
    ]);
    expect(useChatStore.getState().operation).toBe("loading");

    pageResponse.resolve(testPage(nextConversation, [nextMessage]));
    await selection;

    expect(useChatStore.getState().selectedConversation?.id).toBe(nextConversation.id);
    expect(useChatStore.getState().messages.map((item) => item.parts[0]?.text)).toEqual([
      "next detail",
    ]);
    expect(useChatStore.getState().operation).toBeNull();
  });
});

describe("chat store workspace summary cache", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  test("applies pushed conversation summaries to loaded non-selected workspaces", () => {
    const apiConversation = testConversation();
    const webConversation = testConversation({
      id: "conversation_web",
      title: "Web chat",
      workspaceId: "workspace_web",
    });
    const updatedWebConversation = { ...webConversation, title: "Updated web chat" };
    useChatStore.setState({
      conversationListsByWorkspaceId: {
        workspace_web: loadedConversationList([conversationItem(webConversation, 1)]),
      },
      conversations: [conversationItem(apiConversation, 1)],
      selectedConversation: apiConversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore
      .getState()
      .handleEvent(conversationUpdatedEvent(1, conversationItem(updatedWebConversation, 2)));

    expect(
      useChatStore.getState().conversationListsByWorkspaceId.workspace_web?.conversations[0]
        ?.conversation.title,
    ).toBe("Updated web chat");
    expect(
      useChatStore.getState().conversationListsByWorkspaceId.workspace_web?.conversations[0]
        ?.messageCount,
    ).toBe(2);
    expect(useChatStore.getState().conversations[0]?.conversation.title).toBe("API chat");
    expect(useChatStore.getState().selectedConversation?.id).toBe(apiConversation.id);
  });

  test("does not create a complete summary list from events for unloaded workspaces", () => {
    const webConversation = testConversation({
      id: "conversation_web",
      title: "Web chat",
      workspaceId: "workspace_web",
    });
    useChatStore.setState({
      conversationListsByWorkspaceId: {},
      conversations: [conversationItem(testConversation(), 1)],
      selectedConversation: testConversation(),
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore
      .getState()
      .handleEvent(conversationUpdatedEvent(1, conversationItem(webConversation, 2)));

    expect(useChatStore.getState().conversationListsByWorkspaceId.workspace_web).toBeUndefined();
  });

  test("clears closed workspace conversation summaries without disturbing active workspaces", () => {
    const apiConversation = testConversation();
    const webConversation = testConversation({
      id: "conversation_web",
      workspaceId: "workspace_web",
    });
    const docsConversation = testConversation({
      id: "conversation_docs",
      workspaceId: "workspace_docs",
    });
    useChatStore.setState({
      conversationListsByWorkspaceId: {
        workspace_api: loadedConversationList([conversationItem(apiConversation, 1)]),
        workspace_docs: loadedConversationList([conversationItem(docsConversation, 1)]),
        workspace_web: loadedConversationList([conversationItem(webConversation, 1)]),
      },
      conversations: [conversationItem(apiConversation, 1)],
      workspaceId: "workspace_api",
    });

    useChatStore
      .getState()
      .clearClosedWorkspaceConversationLists(["workspace_api", "workspace_docs"]);

    expect(Object.keys(useChatStore.getState().conversationListsByWorkspaceId).toSorted()).toEqual([
      "workspace_api",
      "workspace_docs",
    ]);
    expect(
      useChatStore.getState().conversationListsByWorkspaceId.workspace_api?.conversations[0]
        ?.conversation.id,
    ).toBe(apiConversation.id);
    expect(useChatStore.getState().conversations[0]?.conversation.id).toBe(apiConversation.id);
  });
});

interface SettaAPIOverrides {
  chat?: Partial<SettaAPI["chat"]>;
}

function installSettaAPI(overrides: SettaAPIOverrides) {
  const conversation = testConversation();
  const api: SettaAPI = {
    app: {
      flags: {
        pixiWorkspaceDebug: false,
        pixiWorkspacePrototype: false,
        pixiWorkspaceSyntheticGraph: null,
      },
      installedEditors: async () => [],
      openExternalUrl: async () => {},
      openWorkspaceInEditor: async () => {},
      platform: "darwin",
      versions: async (): Promise<RuntimeVersions> => ({
        app: "test",
        chrome: "test",
        electron: "test",
        node: "test",
      }),
      workspaceGitInfo: async () => ({
        branchName: "main",
        commitShort: "0000000",
        worktreeName: "workspace",
        worktreeRoot: "/tmp/workspace",
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
      activeRun: async () => ({ hasActiveRun: false, run: null }),
      cancelRun: async () => testRun("cancelled"),
      createConversation: async () => conversation,
      editQueuedMessage: async () => ({
        conversation,
        page: testPage(conversation, []),
        queue: { messages: [], runs: [] },
        run: testRun("queued"),
        userMessage: message("message_queued", 1, "user", "pending", "queued", "queued"),
      }),
      executeCommand: async () => ({
        conversation,
        message: null,
        page: testPage(conversation, []),
        result: {
          action: "display",
          goal: null,
          kind: "goal",
          message: "Goal set: test",
          models: [],
          raw: "/goal test",
          reasoningEfforts: [],
          selectedModel: "",
          selectedReasoningEffort: null,
          title: "Goal",
        },
      }),
      listCommands: async () => ({ commands: [] }),
      listConversations: async () => listResponse([]),
      markConversationRead: async () => conversationItem(conversation, 0),
      messagePage: async () => testPage(conversation, []),
      onEvent: () => () => {},
      queueMessage: async () => ({
        conversation,
        page: testPage(conversation, []),
        queue: { messages: [], runs: [] },
        run: testRun("queued"),
        userMessage: message("message_queued", 1, "user", "pending", "queued", "queued"),
      }),
      removeQueuedMessage: async () => ({
        conversation,
        page: testPage(conversation, []),
        queue: { messages: [], runs: [] },
        removedMessageId: "message_queued",
        removedRunId: "run_queued",
      }),
      runActivity: async () => ({ items: [], output: [], runId: "run_api" }),
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
      sendSteeringImmediately: async () => ({
        activeRun: testRun("running"),
        cancelledRun: testRun("cancelled"),
        conversation,
        page: testPage(conversation, []),
        queue: { messages: [], runs: [] },
        replayedSteeringMessageIds: [],
      }),
      setCodexModel: async () => ({
        conversation,
        message: null,
        page: testPage(conversation, []),
        result: commandResult("model"),
      }),
      setCodexReasoningEffort: async () => ({
        conversation,
        message: null,
        page: testPage(conversation, []),
        result: commandResult("model"),
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
    codexAccount: {
      cancelLogin: async () => emptyCodexAccountState(),
      logout: async () => emptyCodexAccountState(),
      read: async () => emptyCodexAccountState(),
      refresh: async () => emptyCodexAccountState(),
      startLogin: async () => ({
        login: {
          authUrl: "",
          error: "",
          loginId: "",
          status: "succeeded",
          type: "chatgpt",
          userCode: "",
          verificationUrl: "",
        },
        state: emptyCodexAccountState(),
      }),
    },
    workflow: unimplementedWorkflowAPI(),
    workspace: {
      close: async () => workspaceSession(),
      openLocalFolder: async () => ({ session: workspaceSession(), workspace: workspaceSummary() }),
      openPath: async () => ({ session: workspaceSession(), workspace: workspaceSummary() }),
      removeRecent: async () => workspaceSession(),
      reorder: async () => workspaceSession(),
      select: async () => workspaceSession(),
      session: async () => workspaceSession(),
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: api },
  });
}

function unimplementedWorkflowAPI(): SettaAPI["workflow"] {
  const unavailable = async (): Promise<never> => {
    throw new Error("workflow API is not implemented in this test");
  };
  return {
    cancelExecution: unavailable,
    createDefinition: unavailable,
    deleteDefinition: unavailable,
    executionEvents: unavailable,
    listDefinitions: unavailable,
    readDefinition: unavailable,
    readExecution: unavailable,
    startExecution: unavailable,
    updateDefinition: unavailable,
    validateDefinition: unavailable,
  };
}

function commandResult(kind: "goal" | "model") {
  return {
    action: "display" as const,
    goal: null,
    kind,
    message: "Command result",
    models: [],
    raw: "/command",
    reasoningEfforts: [],
    selectedModel: "",
    selectedReasoningEffort: null,
    title: "Command",
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

function listResponse(conversations: ConversationListItem[]): ListConversationsResponse {
  return {
    conversations,
    corruption: emptyCorruption(),
    diagnostics: [],
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

function testConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    archivedAt: "",
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

function conversationDetail(conversation: Conversation, messages: ChatMessage[]) {
  return {
    activeRun: null,
    conversation,
    goal: null,
    hasMoreOlder: false,
    messageIds: messages.map((item) => item.id),
    messages,
    messagesById: Object.fromEntries(messages.map((item) => [item.id, item])),
    olderBeforeOrdinal: messages[0]?.ordinal ?? 0,
    queuedRuns: [],
    runItemIdsByRunId: {},
    runItemOutputIdsByRunItemId: {},
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [],
    runItemOutputsById: {},
    runItems: [],
    runItemsById: {},
    transcript: [],
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

function messageForConversation(
  conversation: Conversation,
  id: string,
  ordinal: number,
  role: MessageRole,
  status: MessageStatus,
  text: string,
  delivery: MessageDelivery = "normal",
  runId = "run_api",
): ChatMessage {
  return {
    ...message(id, ordinal, role, status, text, delivery, runId),
    conversationId: conversation.id,
  };
}

function testRun(status: "cancelled" | "completed" | "queued" | "running") {
  return {
    assistantMessageId: "message_assistant",
    completedAt: status === "running" || status === "queued" ? "" : "2026-05-29T20:01:00Z",
    conversationId: "conversation_api",
    error: "",
    harness: "codex" as const,
    id: "run_api",
    pendingApproval: null,
    promptSummary: "hello",
    schemaVersion: 1,
    startedAt: "2026-05-29T20:00:00Z",
    status,
    triggerMessageId: "message_user",
    workspaceId: "workspace_api",
  };
}

function conversationUpdatedEvent(sequence: number, item: ConversationListItem): ChatEvent {
  return {
    conversationId: item.conversation.id,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${eventStreamId}:${sequence}`,
    payload: { item },
    runId: item.activeRunId,
    schemaVersion: 1,
    sequence,
    streamId: eventStreamId,
    type: "chat.conversation.updated",
    workspaceId: item.conversation.workspaceId,
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

function emptyCodexAccountState() {
  return {
    account: null,
    diagnostic: "",
    login: null,
    requiresOpenaiAuth: true,
    status: "unauthenticated" as const,
  };
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
