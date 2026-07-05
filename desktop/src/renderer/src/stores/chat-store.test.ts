import type {
  BackendHealth,
  BackgroundTerminalOutput,
  ChatCommandResult,
  ChatGoalState,
  ChatMessage,
  Conversation,
  ConversationListItem,
  Diagnostic,
  ListConversationsResponse,
  MessagePage,
  TranscriptBlock,
  TranscriptBlockStatus,
  WorkspaceSession,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { chatTextInput } from "../lib/chat-input";
import { prependOlderMessages, useChatStore } from "./chat-store";
import { deferred, message, replaceMessageText, testRun } from "./chat-store.test.fixtures";
import { workspaceUIReadFixtureAPI } from "./workspace-ui.test-fixtures";
import {
  assistantTextBlock,
  backgroundTerminalOutput,
  backgroundTerminalProcess,
  conversationUpdatedEvent,
  diagnosticCreatedEvent,
  messageCreatedEvent,
  resyncRequiredEvent,
  runUpdatedEvent,
  transcriptBlockCreatedEvent,
  transcriptTextDeltaEvent,
  userMessageBlock,
} from "./chat-store-events.test.helpers";

const emptyCommandRunState = { activeRun: null, activeRunLiveness: null };

describe("chat store", () => {
  beforeEach(() => {
    useChatStore.setState({
      activeRun: null,
      activeRunLiveness: null,
      backgroundTerminalIdsByConversationId: {},
      backgroundTerminalOutputIdsByProcessId: {},
      backgroundTerminalOutputPagesByProcessId: {},
      backgroundTerminalOutputsById: {},
      backgroundTerminalsById: {},
      commandListError: null,
      commandListStatus: "idle",
      conversationDetailsById: {},
      conversationListsByWorkspaceId: {},
      conversations: [],
      corruption: emptyCorruption(),
      diagnostics: [],
      error: null,
      goal: null,
      hasMoreOlder: false,
      lastEventSequence: 0,
      lastEventStreamId: "",
      editingQueuedMessageId: null,
      messageIds: [],
      messages: [],
      messagesById: {},
      olderBeforeBlockOrdinal: 0,
      operation: null,
      pendingGoalSubmission: null,
      queuedRuns: [],
      runItemOutputs: [],
      runItemOutputIdsByRunItemId: {},
      runItemOutputPagesByRunItemId: {},
      runItemOutputsById: {},
      removingQueuedMessageId: null,
      selectedConversation: null,
      selectedConversationIdsByWorkspaceId: {},
      status: "idle",
      transcriptBlocks: [],
      transcriptBlocksById: {},
      workspaceId: null,
    });
  });

  test("loads conversation metadata separately from the latest message page", async () => {
    const conversation = testConversation();
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(conversation, 120)]));
    const messagePage = vi
      .fn()
      .mockResolvedValue(
        testPage(conversation, [message("message_latest", 120, "assistant", "complete", "latest")]),
      );
    installSettaAPI({ chat: { listConversations, messagePage } });

    await useChatStore.getState().loadWorkspace("workspace_api");

    expect(useChatStore.getState().conversations).toHaveLength(1);
    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual([
      "message_user_run_api",
      "message_latest",
    ]);
    expect(useChatStore.getState().messageIds).toEqual(["message_user_run_api", "message_latest"]);
    expect(useChatStore.getState().messagesById.message_latest?.parts[0]?.text?.text).toBe(
      "latest",
    );
    expect(listConversations).toHaveBeenCalledWith("workspace_api");
    expect(messagePage).toHaveBeenCalledWith("workspace_api", "conversation_api", 0, 40);
  });

  test("loads and controls background terminals through typed chat store actions", async () => {
    const conversation = testConversation();
    const alpha = backgroundTerminalProcess("background_terminal_alpha", {
      command: "npm run dev",
      recentOutput: ["dev server ready"],
    });
    const beta = backgroundTerminalProcess("background_terminal_beta", {
      command: "vite --host 0.0.0.0",
    });
    const alphaOutput = backgroundTerminalOutput("background_terminal_output_alpha_1", alpha.id);
    const listBackgroundTerminals = vi
      .fn<SettaAPI["chat"]["listBackgroundTerminals"]>()
      .mockResolvedValue({ terminals: [alpha, beta] });
    const getBackgroundTerminalOutput = vi
      .fn<SettaAPI["chat"]["getBackgroundTerminalOutput"]>()
      .mockResolvedValue(backgroundTerminalOutputPage(alpha.id, [alphaOutput]));
    const killBackgroundTerminal = vi
      .fn<SettaAPI["chat"]["killBackgroundTerminal"]>()
      .mockResolvedValue({
        ...alpha,
        status: "terminating",
        updatedAt: "2026-05-29T20:00:02Z",
      });
    installSettaAPI({
      chat: {
        getBackgroundTerminalOutput,
        killBackgroundTerminal,
        listBackgroundTerminals,
        listConversations: async () => listResponse([conversationItem(conversation, 1)]),
        messagePage: async () => testPage(conversation, []),
      },
    });

    await useChatStore.getState().loadWorkspace("workspace_api");
    await useChatStore.getState().loadBackgroundTerminalOutput(alpha.id);
    await useChatStore.getState().killBackgroundTerminal(alpha.id);

    expect(useChatStore.getState().backgroundTerminalIdsByConversationId[conversation.id]).toEqual([
      beta.id,
      alpha.id,
    ]);
    expect(useChatStore.getState().backgroundTerminalOutputsById[alphaOutput.id]?.text).toBe(
      alphaOutput.text,
    );
    expect(useChatStore.getState().backgroundTerminalsById[alpha.id]?.status).toBe("terminating");
    expect(listBackgroundTerminals).toHaveBeenCalledWith("workspace_api", conversation.id);
    expect(getBackgroundTerminalOutput).toHaveBeenCalledWith(
      "workspace_api",
      conversation.id,
      alpha.id,
      0,
      200,
    );
    expect(killBackgroundTerminal).toHaveBeenCalledWith("workspace_api", conversation.id, alpha.id);
  });

  test("loads the last selected workspace conversation instead of the first list item", async () => {
    const firstConversation = testConversation({ id: "conversation_first", title: "First" });
    const rememberedConversation = testConversation({
      id: "conversation_remembered",
      title: "Remembered",
    });
    const listConversations = vi
      .fn()
      .mockResolvedValue(
        listResponse([
          conversationItem(firstConversation, 3),
          conversationItem(rememberedConversation, 7),
        ]),
      );
    const messagePage = vi
      .fn()
      .mockResolvedValue(
        testPage(rememberedConversation, [
          message("message_remembered", 7, "user", "complete", "remembered detail", "normal", ""),
        ]),
      );
    const selectedConversations = vi.fn().mockResolvedValue({
      selectedConversationIdsByWorkspaceId: {
        workspace_api: rememberedConversation.id,
      },
    });
    installSettaAPI({
      chat: { listConversations, messagePage },
      workspace: { selectedConversations },
    });

    await useChatStore.getState().loadWorkspace("workspace_api");

    expect(useChatStore.getState().selectedConversation?.id).toBe(rememberedConversation.id);
    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual(["message_remembered"]);
    expect(messagePage).toHaveBeenCalledWith("workspace_api", rememberedConversation.id, 0, 40);
    expect(selectedConversations).toHaveBeenCalledOnce();
  });

  test("creates a new conversation when the historical list reports corruption", async () => {
    const conversation = testConversation();
    const createConversation = vi.fn().mockResolvedValue(conversation);
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(conversation, 0)], 1));
    const messagePage = vi.fn().mockResolvedValue(testPage(conversation, []));
    installSettaAPI({ chat: { createConversation, listConversations, messagePage } });
    useChatStore.setState({
      error: "malformed chat state /tmp/old-run.json",
      status: "error",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().createConversation();

    expect(createConversation).toHaveBeenCalledWith("workspace_api", "");
    expect(messagePage).toHaveBeenCalledWith("workspace_api", "conversation_api", 0, 40);
    expect(useChatStore.getState().selectedConversation?.id).toBe("conversation_api");
    expect(useChatStore.getState().conversations.map((item) => item.conversation.id)).toEqual([
      "conversation_api",
    ]);
    expect(useChatStore.getState().corruption.total).toBe(1);
    expect(useChatStore.getState().error).toBeNull();
    expect(useChatStore.getState().status).toBe("ready");
  });

  test("create conversation preserves error state for caller handling", async () => {
    const createConversation = vi.fn().mockRejectedValue(new Error("conversation create failed"));
    installSettaAPI({ chat: { createConversation } });
    useChatStore.setState({ status: "ready", workspaceId: "workspace_api" });

    await expect(useChatStore.getState().createConversation()).rejects.toThrow(
      "conversation create failed",
    );
    expect(useChatStore.getState().error).toBe("conversation create failed");
  });

  test("pins a conversation through the backend summary", async () => {
    const conversation = testConversation();
    const setConversationPinned = vi.fn().mockResolvedValue({
      ...conversationItem(conversation, 0),
      pinnedAt: "2026-05-29T21:00:00Z",
    });
    installSettaAPI({ chat: { setConversationPinned } });
    useChatStore.setState({
      conversations: [conversationItem(conversation, 0)],
      conversationListsByWorkspaceId: {
        workspace_api: loadedConversationList([conversationItem(conversation, 0)]),
      },
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().setConversationPinned(conversation.id, true);

    expect(setConversationPinned).toHaveBeenCalledWith("workspace_api", conversation.id, true);
    expect(useChatStore.getState().conversations[0]?.pinnedAt).toBe("2026-05-29T21:00:00Z");
    expect(
      useChatStore.getState().conversationListsByWorkspaceId.workspace_api?.conversations[0]
        ?.pinnedAt,
    ).toBe("2026-05-29T21:00:00Z");
  });

  test("deletes the selected conversation and loads the next one", async () => {
    const deleted = testConversation({ id: "conversation_deleted", title: "Deleted" });
    const next = testConversation({ id: "conversation_next", title: "Next" });
    const deleteConversation = vi.fn().mockResolvedValue(listResponse([conversationItem(next, 2)]));
    const messagePage = vi
      .fn()
      .mockResolvedValue(
        testPage(next, [message("message_next", 2, "assistant", "complete", "next")]),
      );
    const setSelectedConversation = vi.fn(async (workspaceId: string, conversationId: string) => ({
      selectedConversationIdsByWorkspaceId: { [workspaceId]: conversationId },
    }));
    installSettaAPI({
      chat: { deleteConversation, messagePage },
      workspace: { setSelectedConversation },
    });
    useChatStore.setState({
      conversations: [conversationItem(deleted, 1), conversationItem(next, 2)],
      conversationListsByWorkspaceId: {
        workspace_api: loadedConversationList([
          conversationItem(deleted, 1),
          conversationItem(next, 2),
        ]),
      },
      selectedConversation: deleted,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().deleteConversation(deleted.id);

    expect(deleteConversation).toHaveBeenCalledWith("workspace_api", deleted.id);
    expect(messagePage).toHaveBeenCalledWith("workspace_api", next.id, 0, 40);
    expect(setSelectedConversation).toHaveBeenCalledWith("workspace_api", next.id);
    expect(useChatStore.getState().selectedConversation?.id).toBe(next.id);
    expect(useChatStore.getState().conversations.map((item) => item.conversation.id)).toEqual([
      next.id,
    ]);
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
      olderBeforeBlockOrdinal: 2,
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
      olderBeforeBlockOrdinal: 2,
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
        listConversations: vi
          .fn()
          .mockResolvedValue(listResponse([conversationItem(conversation, 2, run.id)])),
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

    await useChatStore.getState().sendMessage(chatTextInput("hello"));

    expect(useChatStore.getState().activeRun?.id).toBe(run.id);
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().operation).toBeNull();
  });

  test("send message preserves error state for caller handling", async () => {
    const conversation = testConversation();
    const sendMessage = vi.fn().mockRejectedValue(new Error("send failed"));
    installSettaAPI({ chat: { sendMessage } });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await expect(useChatStore.getState().sendMessage(chatTextInput("hello"))).rejects.toThrow(
      "send failed",
    );
    expect(useChatStore.getState().error).toBe("send failed");
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

    await useChatStore.getState().queueMessage(chatTextInput("queued"));

    expect(queueMessage).toHaveBeenCalledWith(
      "workspace_api",
      "conversation_api",
      chatTextInput("queued"),
    );
    expect(useChatStore.getState().messages[0]?.delivery).toBe("queued");
  });

  test("queue message preserves error state for caller handling", async () => {
    const conversation = testConversation();
    const queueMessage = vi.fn().mockRejectedValue(new Error("queue failed"));
    installSettaAPI({ chat: { queueMessage } });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await expect(useChatStore.getState().queueMessage(chatTextInput("queued"))).rejects.toThrow(
      "queue failed",
    );
    expect(useChatStore.getState().error).toBe("queue failed");
  });

  test("queue message response ignores a captured active run that completed before the response", async () => {
    const conversation = testConversation();
    const activeRun = testRun("running", "run_active");
    const activeAssistant = message(
      "message_active_assistant",
      2,
      "assistant",
      "streaming",
      "partial",
      "normal",
      activeRun.id,
    );
    const completedAssistant: ChatMessage = {
      ...activeAssistant,
      status: "complete",
      updatedAt: "2026-05-29T20:00:01Z",
    };
    const queued = message(
      "message_queued",
      3,
      "user",
      "pending",
      "queued",
      "queued",
      "run_queued",
    );
    const queueResponse = deferred<Awaited<ReturnType<SettaAPI["chat"]["queueMessage"]>>>();
    installSettaAPI({
      chat: {
        queueMessage: vi.fn().mockReturnValue(queueResponse.promise),
      },
    });
    useChatStore.setState({
      activeRun,
      messages: [activeAssistant],
      selectedConversation: conversation,
      status: "ready",
      ...blockState(runBlocks(activeRun.id, { assistantText: "partial" })),
      workspaceId: "workspace_api",
    });

    const queuePromise = useChatStore.getState().queueMessage(chatTextInput("queued"));
    useChatStore.setState({
      activeRun: null,
      messages: [completedAssistant],
      ...blockState(
        runBlocks(activeRun.id, { assistantStatus: "complete", assistantText: "partial" }),
      ),
    });
    queueResponse.resolve({
      conversation,
      page: testPage(conversation, [queued]),
      queue: { messages: [queued], runs: [testRun("queued", "run_queued")] },
      run: testRun("queued", "run_queued"),
      userMessage: queued,
    });
    await queuePromise;

    expect(useChatStore.getState().activeRun).toBeNull();
    expect(useChatStore.getState().queuedRuns.map((run) => run.id)).toEqual(["run_queued"]);
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

    await useChatStore.getState().steerMessage(chatTextInput("steer"));

    expect(steerMessage).toHaveBeenCalledWith(
      "workspace_api",
      "conversation_api",
      chatTextInput("steer"),
    );
    expect(useChatStore.getState().messages.some((item) => item.delivery === "steering")).toBe(
      true,
    );
  });

  test("steer message preserves error state for caller handling", async () => {
    const conversation = testConversation();
    const steerMessage = vi.fn().mockRejectedValue(new Error("steer failed"));
    installSettaAPI({ chat: { steerMessage } });
    useChatStore.setState({
      activeRun: testRun("running"),
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await expect(useChatStore.getState().steerMessage(chatTextInput("steer"))).rejects.toThrow(
      "steer failed",
    );
    expect(useChatStore.getState().error).toBe("steer failed");
  });

  test("operation responses do not resurrect terminal run events", async () => {
    const conversation = testConversation();
    const steerResponse = deferred<Awaited<ReturnType<SettaAPI["chat"]["steerMessage"]>>>();
    const staleAssistant = message("message_assistant", 2, "assistant", "streaming", "partial");
    const terminalAssistant: ChatMessage = {
      ...staleAssistant,
      status: "error",
      updatedAt: "2026-05-29T20:00:01Z",
    };
    installSettaAPI({
      chat: {
        steerMessage: vi.fn().mockReturnValue(steerResponse.promise),
      },
    });
    useChatStore.setState({
      activeRun: testRun("running"),
      messages: [staleAssistant],
      selectedConversation: conversation,
      status: "ready",
      ...blockState(runBlocks("run_api", { assistantText: "partial" })),
      workspaceId: "workspace_api",
    });

    const steerPromise = useChatStore.getState().steerMessage(chatTextInput("trigger failure"));
    useChatStore.setState({
      activeRun: null,
      messages: [terminalAssistant],
      ...blockState(runBlocks("run_api", { assistantStatus: "failed", assistantText: "partial" })),
    });
    steerResponse.resolve({
      conversation,
      // The operation page is stale: it still shows the run streaming.
      page: testPage(
        conversation,
        [staleAssistant],
        false,
        null,
        runBlocks("run_api", {
          assistantText: "partial",
        }),
      ),
      run: testRun("running"),
      userMessage: message("message_steer", 3, "user", "complete", "trigger failure", "steering"),
    });
    await steerPromise;

    expect(useChatStore.getState().activeRun).toBeNull();
    expect(
      useChatStore.getState().messages.find((message) => message.id === staleAssistant.id)?.status,
    ).toBe("error");
    expect(useChatStore.getState().transcriptBlocksById["run_api_text"]?.status).toBe("failed");
  });

  test("execute command response ignores a captured active run that completed before the response", async () => {
    const conversation = testConversation();
    const activeRun = testRun("running", "run_active");
    const activeAssistant = message(
      "message_active_assistant",
      2,
      "assistant",
      "streaming",
      "partial",
      "normal",
      activeRun.id,
    );
    const completedAssistant: ChatMessage = {
      ...activeAssistant,
      status: "complete",
      updatedAt: "2026-05-29T20:00:01Z",
    };
    const commandMessage = message(
      "message_command",
      3,
      "command",
      "complete",
      "Goal set: tests",
      "normal",
      "",
    );
    const commandResponse = deferred<Awaited<ReturnType<SettaAPI["chat"]["executeCommand"]>>>();
    installSettaAPI({
      chat: {
        executeCommand: vi.fn().mockReturnValue(commandResponse.promise),
      },
    });
    useChatStore.setState({
      activeRun,
      messages: [activeAssistant],
      selectedConversation: conversation,
      status: "ready",
      ...blockState(runBlocks(activeRun.id, { assistantText: "partial" })),
      workspaceId: "workspace_api",
    });

    const commandPromise = useChatStore.getState().executeCommand("/goal tests");
    useChatStore.setState({
      activeRun: null,
      messages: [completedAssistant],
      ...blockState(
        runBlocks(activeRun.id, { assistantStatus: "complete", assistantText: "partial" }),
      ),
    });
    commandResponse.resolve({
      ...emptyCommandRunState,
      conversation,
      message: commandMessage,
      page: testPage(
        conversation,
        [activeAssistant, commandMessage],
        false,
        goalState("tests", "active"),
        runBlocks(activeRun.id, { assistantText: "partial" }),
      ),
      result: goalCommandResult(),
    });
    await commandPromise;

    expect(useChatStore.getState().activeRun).toBeNull();
    expect(useChatStore.getState().messages.map((item) => item.role)).toContain("command");
    expect(
      useChatStore.getState().messages.find((message) => message.id === activeAssistant.id)?.status,
    ).toBe("complete");
    expect(useChatStore.getState().transcriptBlocksById[`${activeRun.id}_text`]?.status).toBe(
      "complete",
    );
  });

  test("execute command exposes pending goal submission until the command settles", async () => {
    const conversation = testConversation();
    const commandResponse = deferred<Awaited<ReturnType<SettaAPI["chat"]["executeCommand"]>>>();
    installSettaAPI({
      chat: {
        executeCommand: vi.fn().mockReturnValue(commandResponse.promise),
      },
    });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    const commandPromise = useChatStore
      .getState()
      .executeCommand("/goal tests", undefined, { pendingGoalObjective: "tests" });

    expect(useChatStore.getState().pendingGoalSubmission).toEqual({
      conversationId: conversation.id,
      objective: "tests",
    });

    commandResponse.resolve(commandExecuteResult(conversation, goalCommandResult()));
    await commandPromise;

    expect(useChatStore.getState().pendingGoalSubmission).toBeNull();
  });

  test("execute command clears pending goal submission after failures", async () => {
    const conversation = testConversation();
    const executeCommand = vi.fn().mockRejectedValue(new Error("provider command failed"));
    installSettaAPI({ chat: { executeCommand } });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await expect(
      useChatStore
        .getState()
        .executeCommand("/goal tests", undefined, { pendingGoalObjective: "tests" }),
    ).rejects.toThrow("provider command failed");

    expect(useChatStore.getState().pendingGoalSubmission).toBeNull();
  });

  test("execute command preserves error state for caller handling", async () => {
    const conversation = testConversation();
    const executeCommand = vi.fn().mockRejectedValue(new Error("unknown slash command: /wat"));
    installSettaAPI({ chat: { executeCommand } });
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await expect(useChatStore.getState().executeCommand("/wat")).rejects.toThrow(
      "unknown slash command: /wat",
    );
    expect(useChatStore.getState().error).toBe("unknown slash command: /wat");
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

  test("marks the selected conversation read with the backend summary", async () => {
    const conversation = testConversation();
    const readConversation = { ...conversation, updatedAt: "2026-05-29T20:00:01Z" };
    const markConversationRead = vi
      .fn()
      .mockResolvedValue(
        conversationItem(readConversation, 2, "", { latestReadRelevantMarker: 3, readMarker: 3 }),
      );
    installSettaAPI({ chat: { markConversationRead } });
    useChatStore.setState({
      conversations: [
        conversationItem(conversation, 2, "", { latestReadRelevantMarker: 3, readMarker: 1 }),
      ],
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().markConversationRead(conversation.id);

    expect(markConversationRead).toHaveBeenCalledWith("workspace_api", conversation.id);
    expect(useChatStore.getState().conversations[0]?.readMarker).toBe(3);
    expect(useChatStore.getState().conversations[0]?.latestReadRelevantMarker).toBe(3);
    expect(useChatStore.getState().selectedConversation?.updatedAt).toBe("2026-05-29T20:00:01Z");
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
    const assistantBlock = assistantTextBlock({
      id: "block_assistant",
      ordinal: 2,
      runId: "run_api",
      text: "",
    });
    const updatedConversation = { ...conversation, title: "Updated chat" };
    useChatStore.setState({
      conversations: [conversationItem(conversation, 0)],
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    // The message surface and the transcript are driven by separate event streams:
    // user messages flow through message events, assistant output through block and
    // block-text-delta events.
    useChatStore.getState().handleEvent(messageCreatedEvent(1, user, "run_api"));
    useChatStore
      .getState()
      .handleEvent(
        transcriptBlockCreatedEvent(
          2,
          userMessageBlock({ id: "block_user", ordinal: 1, runId: "run_api" }),
        ),
      );
    useChatStore.getState().handleEvent(transcriptBlockCreatedEvent(3, assistantBlock));
    useChatStore.getState().handleEvent(
      transcriptTextDeltaEvent(4, {
        blockId: assistantBlock.id,
        delta: "done",
        runId: "run_api",
      }),
    );
    useChatStore.getState().handleEvent(runUpdatedEvent(5, testRun("running")));
    useChatStore
      .getState()
      .handleEvent(
        conversationUpdatedEvent(6, conversationItem(updatedConversation, 2, "run_api")),
      );

    expect(useChatStore.getState().messages.map((item) => item.id)).toEqual(["message_user"]);
    expect(useChatStore.getState().transcriptBlocks.map((block) => block.id)).toEqual([
      "block_user",
      "block_assistant",
    ]);
    expect(useChatStore.getState().transcriptBlocksById.block_assistant?.assistantText?.text).toBe(
      "done",
    );
    expect(useChatStore.getState().activeRun?.id).toBe("run_api");
    expect(useChatStore.getState().selectedConversation?.title).toBe("Updated chat");
    expect(useChatStore.getState().conversations[0]?.messageCount).toBe(2);
  });

  test("queued run events do not replace the active running run", () => {
    const conversation = testConversation();
    const activeRun = testRun("running");
    const queuedRun = {
      ...testRun("queued"),
      id: "run_queued",
      triggerMessageId: "message_queued",
    };
    useChatStore.setState({
      activeRun,
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(runUpdatedEvent(1, queuedRun));

    expect(useChatStore.getState().activeRun?.id).toBe(activeRun.id);
    expect(useChatStore.getState().activeRun?.status).toBe("running");
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
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(conversation, 1)]));
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
    const listConversations = vi
      .fn()
      .mockResolvedValue(listResponse([conversationItem(conversation, 1)]));
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
  workspace?: Partial<SettaAPI["workspace"]>;
}
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
function installSettaAPI(overrides: SettaAPIOverrides) {
  const conversation = testConversation();
  const api: SettaAPI = {
    app: {
      flags: {
        workflowGraphDebug: false,
        workflowGraphSyntheticGraph: null,
      },
      captureRendererRegion: async () => ({
        capturedAt: 0,
        height: 1,
        imageDataUrl: "data:image/png;base64,",
        width: 1,
      }),
      installedEditors: async () => [],
      endWindowDrag: async () => {},
      moveWindowDrag: async () => {},
      openWorkspaceInEditor: async () => {},
      openExternalUrl: async () => {},
      platform: "darwin",
      startWindowDrag: async () => {},
      versions: async () => ({ app: "test", chrome: "test", electron: "test", node: "test" }),
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
        protocolVersion: 1,
        version: "test",
      }),
      onEventStreamStatus: () => () => {},
      onProcessStatus: () => () => {},
    },
    appearance: {} as SettaAPI["appearance"],
    runtimes: {} as SettaAPI["runtimes"],
    chat: {
      activeRun: async () => ({ hasActiveRun: false, liveness: null, run: null }),
      cancelRun: async () => testRun("cancelled"),
      reconcileRuns: async () => ({ result: { runs: [] } }),
      createConversation: async () => conversation,
      createImageAttachmentFromBytes: async () => {
        throw new Error("create image attachment from bytes is not used by chat store tests");
      },
      deleteConversation: async () => listResponse([]),
      editQueuedMessage: async () => ({
        conversation,
        page: testPage(conversation, []),
        queue: { messages: [], runs: [] },
        run: testRun("queued"),
        userMessage: message("message_queued", 1, "user", "pending", "queued", "queued"),
      }),
      executeCommand: async () =>
        commandExecuteResult(
          conversation,
          commandResult("goal", "display", "Goal set: test", "/goal test"),
        ),
      readCodexDefaults: async () => {
        throw new Error("chat defaults are not used by chat store tests");
      },
      openCodexModelPicker: async () =>
        commandExecuteResult(
          conversation,
          commandResult("model", "model_picker", "Choose a model.", "model_picker"),
        ),
      openCodexPermissionPicker: async () =>
        commandExecuteResult(
          conversation,
          commandResult(
            "permission",
            "permission_picker",
            "Choose a permission mode.",
            "permission",
          ),
        ),
      setCodexModel: async () =>
        commandExecuteResult(conversation, {
          ...commandResult("model", "display", "Model set: gpt-test", "model_set"),
          selectedModel: "gpt-test",
        }),
      setCodexPermissionPreset: async () =>
        commandExecuteResult(
          conversation,
          commandResult(
            "permission",
            "display",
            "Permission set: Ask for approval",
            "permission_set",
          ),
        ),
      setCodexReasoningEffort: async () =>
        commandExecuteResult(conversation, {
          ...commandResult("model", "display", "Reasoning set: High", "model_reasoning_effort_set"),
          selectedReasoningEffort: "high",
        }),
      updateCodexDefaults: async () => {
        throw new Error("chat defaults are not used by chat store tests");
      },
      setConversationPinned: async () => conversationItem(conversation, 0),
      selectImageAttachments: async () => [],
      listCommands: async () => ({
        commands: [
          {
            available: true,
            description: "Goal",
            grammar: {
              arguments: [
                {
                  description: "Set objective",
                  kind: "free_text",
                  maxRunes: 4000,
                  name: "objective",
                  required: false,
                },
              ],
              literalMatch: "exact",
              summary: "/goal",
            },
            kind: "goal",
            name: "/goal",
            unavailableReason: "",
          },
        ],
      }),
      listConversations: async () => listResponse([]),
      listBackgroundTerminals: async () => ({ terminals: [] }),
      getBackgroundTerminalOutput: async () => ({
        hasMore: false,
        nextOrdinal: 0,
        output: [],
        processId: "background_terminal_api",
      }),
      killBackgroundTerminal: async () => {
        throw new Error("kill background terminal is not used by chat store tests");
      },
      killAllBackgroundTerminals: async () => ({ terminals: [] }),
      markConversationRead: async () => conversationItem(conversation, 0),
      messagePage: async () => testPage(conversation, []),
      listComposerPromptHistory: async () => ({
        conversationId: conversation.id,
        entries: [],
        hasMoreOlder: false,
        olderBeforeOrdinal: 0,
      }),
      onEvent: () => () => {},
      queueMessage: async () => ({
        conversation,
        page: testPage(conversation, []),
        queue: { messages: [], runs: [] },
        run: testRun("queued"),
        userMessage: message("message_queued", 1, "user", "pending", "queued", "queued"),
      }),
      runActivity: async () => ({
        activity: [],
        hasMoreItems: false,
        items: [],
        nextItemId: "",
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
      removeQueuedMessage: async () => ({
        conversation,
        page: testPage(conversation, []),
        queue: { messages: [], runs: [] },
        removedMessageId: "message_queued",
        removedRunId: "run_queued",
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
      sendSteeringImmediately: async () => ({
        activeRun: testRun("running"),
        cancelledRun: testRun("cancelled"),
        conversation,
        page: testPage(conversation, []),
        queue: { messages: [], runs: [] },
        replayedSteeringMessageIds: [],
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
    workspaceActivity: {} as SettaAPI["workspaceActivity"],
    semanticGraph: {} as SettaAPI["semanticGraph"],
    terminal: unimplementedTerminalAPI,
    workflow: {} as SettaAPI["workflow"],
    workspace: {
      close: async () => workspaceSession(),
      ...workspaceUIReadFixtureAPI("chat store tests"),
      openLocalFolder: async () => ({ session: workspaceSession(), workspace: workspaceSummary() }),
      openPath: async () => ({ session: workspaceSession(), workspace: workspaceSummary() }),
      readUILayout: async (workspaceId) => ({ layout: null, workspaceId }),
      removeRecent: async () => workspaceSession(),
      reorder: async () => workspaceSession(),
      saveUILayout: async (layout) => layout,
      select: async () => workspaceSession(),
      selectedConversations: async () => ({ selectedConversationIdsByWorkspaceId: {} }),
      setSelectedConversation: async (workspaceId, conversationId) => ({
        selectedConversationIdsByWorkspaceId: { [workspaceId]: conversationId },
      }),
      session: async () => workspaceSession(),
      ...overrides.workspace,
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: api },
  });
}

const unimplementedTerminalAPI = new Proxy({} as SettaAPI["terminal"], {
  get: () => {
    throw new Error("terminal API is not implemented in this test");
  },
});
async function waitFor(done: () => boolean) {
  const startedAt = Date.now();
  while (!done()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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
  markers: { latestReadRelevantMarker: number; readMarker: number } = {
    latestReadRelevantMarker: 0,
    readMarker: 0,
  },
): ConversationListItem {
  return {
    activeRunId,
    activeRunLiveness: null,
    pinnedAt: "",
    conversation,
    latestReadRelevantMarker: markers.latestReadRelevantMarker,
    messageCount,
    readMarker: markers.readMarker,
  };
}
function testPage(
  conversation: Conversation,
  messages: ChatMessage[],
  hasMoreOlder = false,
  goal: ChatGoalState | null = null,
  blocks: TranscriptBlock[] = [],
): MessagePage {
  const pageMessages = withSyntheticTriggers(messages);
  const queuedMessages = pageMessages.filter((item) => item.delivery === "queued");
  const queuedRunIds = [
    ...new Set(queuedMessages.map((item) => item.runId).filter((runId) => runId !== "")),
  ];
  return {
    blocks,
    conversation,
    goal,
    hasMoreOlder,
    messages: pageMessages,
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

function backgroundTerminalOutputPage(processId: string, output: BackgroundTerminalOutput[]) {
  return {
    hasMore: false,
    nextOrdinal: output.reduce((current, item) => Math.max(current, item.ordinal), 0),
    output,
    processId,
  };
}

// The backend page's message surface includes every conversation message,
// including each run's user trigger. Tests pass only the salient messages, so this
// synthesizes a trigger for any run that lacks one, mirroring the real page.
function withSyntheticTriggers(messages: ChatMessage[]): ChatMessage[] {
  const byId = new Map(messages.map((item) => [item.id, item]));
  const runIds = [...new Set(messages.map((item) => item.runId).filter((runId) => runId !== ""))];
  for (const runId of runIds) {
    if (!messages.some((item) => item.runId === runId && item.role === "user")) {
      const trigger = message(
        `message_user_${runId}`,
        1,
        "user",
        "complete",
        "user",
        "normal",
        runId,
      );
      byId.set(trigger.id, trigger);
    }
  }
  return [...byId.values()];
}
function goalState(objective: string, status: string): ChatGoalState {
  return {
    createdAt: 0,
    objective,
    status,
    threadId: "thread_fake",
    timeUsedSeconds: 0,
    tokenBudget: null,
    tokensUsed: 0,
    updatedAt: 0,
  };
}
function goalCommandResult(): ChatCommandResult {
  return {
    action: "display",
    composerDraft: "",
    currentPermission: null,
    goal: goalState("tests", "active"),
    kind: "goal",
    message: "Goal set: tests",
    models: [],
    permissionPresets: [],
    raw: "/goal tests",
    reasoningEfforts: [],
    selectedModel: "",
    selectedPermissionPreset: null,
    selectedReasoningEffort: null,
    title: "Goal",
  };
}
function runBlocks(
  runId: string,
  opts: { assistantText: string; assistantStatus?: TranscriptBlockStatus },
): TranscriptBlock[] {
  return [
    userMessageBlock({ id: `${runId}_trigger`, ordinal: 1, runId, text: "user" }),
    assistantTextBlock({
      id: `${runId}_text`,
      ordinal: 2,
      runId,
      status: opts.assistantStatus ?? "streaming",
      text: opts.assistantText,
    }),
  ];
}
function blockState(blocks: TranscriptBlock[]) {
  return {
    transcriptBlocks: blocks,
    transcriptBlocksById: Object.fromEntries(blocks.map((block) => [block.id, block])),
  };
}
function commandExecuteResult(conversation: Conversation, result: ChatCommandResult) {
  return {
    ...emptyCommandRunState,
    conversation,
    message: null,
    page: testPage(conversation, []),
    result,
  };
}
function commandResult(
  kind: ChatCommandResult["kind"],
  action: ChatCommandResult["action"],
  messageText: string,
  raw: string,
): ChatCommandResult {
  return {
    action,
    composerDraft: "",
    currentPermission: null,
    goal: null,
    kind,
    message: messageText,
    models: [],
    permissionPresets: [],
    raw,
    reasoningEfforts: [],
    selectedPermissionPreset: null,
    selectedReasoningEffort: null,
    selectedModel: "",
    title: kind === "goal" ? "Goal" : kind === "permission" ? "Permission" : "Model",
  };
}
function workspaceSession(): WorkspaceSession {
  const workspace = workspaceSummary();
  return { activeWorkspaces: [workspace], recentWorkspaces: [], selectedWorkspaceId: workspace.id };
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
function workspaceSummary() {
  return {
    displayName: "api",
    id: "workspace_api",
    lastOpenedAt: "2026-05-29T20:00:00Z",
    rootPath: "/tmp/api",
  };
}
