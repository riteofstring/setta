import type {
  BackendHealth,
  ChatCommandResult,
  ChatGoalState,
  ChatMessage,
  Conversation,
  ConversationListItem,
  Diagnostic,
  ListConversationsResponse,
  MessageDelivery,
  MessagePage,
  MessageRole,
  MessageStatus,
  Run,
  RunItem,
  RunItemOutput,
  RunItemStatus,
  RunItemType,
  RunStatus,
  TranscriptTurn,
  WorkspaceSession,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { prependOlderMessages, useChatStore } from "./chat-store";
import {
  assistantDeltaEvent,
  conversationUpdatedEvent,
  diagnosticCreatedEvent,
  messageCreatedEvent,
  resyncRequiredEvent,
  runItemCreatedEvent,
  runItemOutputDeltaEvent,
  runItemUpdatedEvent,
  runUpdatedEvent,
} from "./chat-store-events.test.helpers";

describe("chat store", () => {
  beforeEach(() => {
    useChatStore.setState({
      activeRun: null,
      commandListError: null,
      commandListStatus: "idle",
      conversationDetailsById: {},
      conversationListsByWorkspaceId: {},
      conversations: [],
      corruption: emptyCorruption(),
      diagnostics: [],
      error: null,
      hasMoreOlder: false,
      lastEventSequence: 0,
      lastEventStreamId: "",
      editingQueuedMessageId: null,
      messageIds: [],
      messages: [],
      messagesById: {},
      olderBeforeOrdinal: 0,
      operation: null,
      queuedRuns: [],
      runItemOutputs: [],
      runItemOutputIdsByRunItemId: {},
      runItemOutputPagesByRunItemId: {},
      runItemOutputsById: {},
      runItems: [],
      runItemIdsByRunId: {},
      runItemsById: {},
      removingQueuedMessageId: null,
      selectedConversation: null,
      selectedConversationIdsByWorkspaceId: {},
      status: "idle",
      transcript: [],
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
    expect(useChatStore.getState().messagesById.message_latest?.parts[0]?.text).toBe("latest");
    expect(listConversations).toHaveBeenCalledWith("workspace_api");
    expect(messagePage).toHaveBeenCalledWith("workspace_api", "conversation_api", 0, 40);
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
      olderBeforeOrdinal: 2,
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
      olderBeforeOrdinal: 2,
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

    await useChatStore.getState().sendMessage("hello");

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

    await expect(useChatStore.getState().sendMessage("hello")).rejects.toThrow("send failed");
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

    await useChatStore.getState().queueMessage("queued");

    expect(queueMessage).toHaveBeenCalledWith("workspace_api", "conversation_api", "queued");
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

    await expect(useChatStore.getState().queueMessage("queued")).rejects.toThrow("queue failed");
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
      transcript: [transcriptTurn(activeRun, activeAssistant)],
      workspaceId: "workspace_api",
    });

    const queuePromise = useChatStore.getState().queueMessage("queued");
    useChatStore.setState({
      activeRun: null,
      messages: [completedAssistant],
      transcript: [transcriptTurn(testRun("completed", activeRun.id), completedAssistant)],
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

    await useChatStore.getState().steerMessage("steer");

    expect(steerMessage).toHaveBeenCalledWith("workspace_api", "conversation_api", "steer");
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

    await expect(useChatStore.getState().steerMessage("steer")).rejects.toThrow("steer failed");
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
      transcript: [transcriptTurn(testRun("running"), staleAssistant)],
      workspaceId: "workspace_api",
    });

    const steerPromise = useChatStore.getState().steerMessage("trigger failure");
    useChatStore.setState({
      activeRun: null,
      messages: [terminalAssistant],
      transcript: [transcriptTurn(testRun("failed"), terminalAssistant)],
    });
    steerResponse.resolve({
      conversation,
      page: testPage(conversation, [staleAssistant]),
      run: testRun("running"),
      userMessage: message("message_steer", 3, "user", "complete", "trigger failure", "steering"),
    });
    await steerPromise;

    expect(useChatStore.getState().activeRun).toBeNull();
    expect(
      useChatStore.getState().messages.find((message) => message.id === staleAssistant.id)?.status,
    ).toBe("error");
    expect(useChatStore.getState().transcript[0]?.run.status).toBe("failed");
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
      transcript: [transcriptTurn(activeRun, activeAssistant)],
      workspaceId: "workspace_api",
    });

    const commandPromise = useChatStore.getState().executeCommand("/goal tests");
    useChatStore.setState({
      activeRun: null,
      messages: [completedAssistant],
      transcript: [transcriptTurn(testRun("completed", activeRun.id), completedAssistant)],
    });
    commandResponse.resolve({
      conversation,
      message: commandMessage,
      page: testPage(
        conversation,
        [activeAssistant, commandMessage],
        false,
        goalState("tests", "active"),
      ),
      result: goalCommandResult(),
    });
    await commandPromise;

    expect(useChatStore.getState().activeRun).toBeNull();
    expect(useChatStore.getState().messages.map((item) => item.role)).toContain("command");
    expect(
      useChatStore.getState().messages.find((message) => message.id === activeAssistant.id)?.status,
    ).toBe("complete");
    expect(useChatStore.getState().transcript[0]?.run.status).toBe("completed");
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

  test("applies run activity events incrementally", () => {
    const conversation = testConversation();
    const item = runItem("run_item_command", "command_execution", "running");
    const completed: RunItem = { ...item, status: "completed", exitCode: 0 };
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
    expect(useChatStore.getState().runItemIdsByRunId.run_api).toEqual([completed.id]);
    expect(useChatStore.getState().runItemOutputIdsByRunItemId[completed.id]).toEqual([output.id]);
  });

  test("lazy-loads run activity without dropping embedded output", async () => {
    const item = runItem("run_item_command", "command_execution", "running");
    const completed: RunItem = { ...item, status: "completed" };
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

  test("tracks run item output pagination per item", async () => {
    const itemA = runItem("run_item_a", "command_execution", "completed");
    const itemB = runItem("run_item_b", "command_execution", "completed");
    const outputA1 = runItemOutput("run_item_output_a1", itemA.id, 1, "a1\n");
    const outputA2 = runItemOutput("run_item_output_a2", itemA.id, 2, "a2\n");
    const outputB1 = runItemOutput("run_item_output_b1", itemB.id, 1, "b1\n");
    const runItemOutputPage = vi
      .fn()
      .mockResolvedValueOnce({
        hasMore: true,
        nextOrdinal: 1,
        output: [outputA1],
        runId: "run_api",
        runItemId: itemA.id,
      })
      .mockResolvedValueOnce({
        hasMore: false,
        nextOrdinal: 0,
        output: [outputB1],
        runId: "run_api",
        runItemId: itemB.id,
      })
      .mockResolvedValueOnce({
        hasMore: false,
        nextOrdinal: 0,
        output: [outputA1, outputA2],
        runId: "run_api",
        runItemId: itemA.id,
      });
    installSettaAPI({ chat: { runItemOutput: runItemOutputPage } });
    useChatStore.setState({
      runItems: [itemA, itemB],
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().loadRunItemOutput("run_api", itemA.id, 0, 1);
    await useChatStore.getState().loadRunItemOutput("run_api", itemB.id, 0, 1);
    await useChatStore.getState().loadRunItemOutput("run_api", itemA.id, 1, 2);

    expect(runItemOutputPage).toHaveBeenNthCalledWith(
      3,
      "workspace_api",
      "run_api",
      itemA.id,
      1,
      2,
    );
    expect(useChatStore.getState().runItemOutputs.map((output) => output.id)).toEqual([
      outputA1.id,
      outputA2.id,
      outputB1.id,
    ]);
    expect(useChatStore.getState().runItemOutputPagesByRunItemId[itemA.id]).toMatchObject({
      hasMore: false,
      loadedThroughOrdinal: 2,
      nextOrdinal: 0,
    });
    expect(useChatStore.getState().runItemOutputPagesByRunItemId[itemB.id]).toMatchObject({
      hasMore: false,
      loadedThroughOrdinal: 1,
    });
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
        workflowGraphAnimationEnabled: true,
        workflowGraphDebug: false,
        workflowGraphReduceMotion: false,
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
        version: "test",
      }),
      onEventStreamStatus: () => () => {},
      onProcessStatus: () => () => {},
    },
    appearance: {} as SettaAPI["appearance"],
    chat: {
      activeRun: async () => ({ hasActiveRun: false, run: null }),
      cancelRun: async () => testRun("cancelled"),
      createConversation: async () => conversation,
      deleteConversation: async () => listResponse([]),
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
          selectedReasoningEffort: null,
          selectedModel: "",
          title: "Goal",
        },
      }),
      setCodexModel: async () => ({
        conversation,
        message: null,
        page: testPage(conversation, []),
        result: {
          action: "display",
          goal: null,
          kind: "model",
          message: "Model set: gpt-test",
          models: [],
          raw: "/model",
          reasoningEfforts: [],
          selectedReasoningEffort: null,
          selectedModel: "gpt-test",
          title: "Model",
        },
      }),
      setCodexReasoningEffort: async () => ({
        conversation,
        message: null,
        page: testPage(conversation, []),
        result: {
          action: "display",
          goal: null,
          kind: "model",
          message: "Reasoning set: High",
          models: [],
          raw: "/model",
          reasoningEfforts: [],
          selectedReasoningEffort: "high",
          selectedModel: "",
          title: "Model",
        },
      }),
      setConversationPinned: async () => conversationItem(conversation, 0),
      listCommands: async () => ({
        commands: [
          {
            available: true,
            description: "Goal",
            kind: "goal",
            name: "/goal",
            unavailableReason: "",
            usage: "/goal",
          },
        ],
      }),
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
      runActivity: async () => ({ items: [], output: [], runId: "run_api" }),
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
    semanticGraph: {} as SettaAPI["semanticGraph"],
    workspaceTrajectory: {} as SettaAPI["workspaceTrajectory"],
    terminal: unimplementedTerminalAPI,
    workflow: {} as SettaAPI["workflow"],
    workspace: {
      close: async () => workspaceSession(),
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
): MessagePage {
  return {
    conversation,
    goal,
    hasMoreOlder,
    messages,
    olderBeforeOrdinal: messages[0]?.ordinal ?? 0,
    queue: {
      messages: messages.filter((item) => item.delivery === "queued"),
      runs: transcriptFromMessages(messages)
        .map((turn) => turn.run)
        .filter((run) => run.status === "queued"),
    },
    runItemOutputs: [],
    runItems: [],
    transcript: transcriptFromMessages(messages),
  };
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
    goal: goalState("tests", "active"),
    kind: "goal",
    message: "Goal set: tests",
    models: [],
    raw: "/goal tests",
    reasoningEfforts: [],
    selectedModel: "",
    selectedReasoningEffort: null,
    title: "Goal",
  };
}

function transcriptFromMessages(messages: ChatMessage[]): TranscriptTurn[] {
  const runIds = [...new Set(messages.map((item) => item.runId).filter((runId) => runId !== ""))];
  return runIds.map((runId) => {
    const run = testRun("running", runId);
    const triggerMessage =
      messages.find((item) => item.runId === runId && item.role === "user") ??
      message(`message_user_${runId}`, 1, "user", "complete", "user", "normal", runId);
    const assistantMessage =
      messages.find((item) => item.runId === runId && item.role === "assistant") ?? null;
    return {
      assistantMessage,
      run: {
        ...run,
        assistantMessageId: assistantMessage?.id ?? "",
        status: assistantMessage ? run.status : "queued",
        triggerMessageId: triggerMessage.id,
      },
      steeringMessages: messages.filter(
        (item) => item.runId === runId && item.delivery === "steering",
      ),
      triggerMessage,
    };
  });
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
  const run = {
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
  } satisfies Run;
  return run as Run & { status: T };
}

function transcriptTurn(run: Run, assistantMessage: ChatMessage): TranscriptTurn {
  const triggerMessage = message("message_user", 1, "user", "complete", "hello", "normal", run.id);
  return {
    assistantMessage,
    run: { ...run, assistantMessageId: assistantMessage.id, triggerMessageId: triggerMessage.id },
    steeringMessages: [],
    triggerMessage,
  };
}
function runItem(id: string, type: RunItemType, status: RunItemStatus): RunItem {
  return {
    command: "go test ./...",
    completedAt: "",
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    cwd: "/tmp/workspace",
    details: null,
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
    filePaths: [],
    fileOperations: [],
    diffStats: { additions: 0, changedFiles: 0, deletions: 0, structured: false, summary: "" },
    hiddenText: "",
    id,
    noticeKind: "",
    namespace: "",
    noticeMessage: "",
    patchStatus: "",
    processId: "",
    progress: "",
    providerItemId: "provider_" + id,
    requestId: "",
    result: "",
    reviewId: "",
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
