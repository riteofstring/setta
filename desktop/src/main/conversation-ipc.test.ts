import type { BackendClient } from "@generated/backend";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { ipcChannels } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerConversationIpcHandlers } from "./conversation-ipc";

describe("conversation IPC handlers", () => {
  test("forwards generated topic commands and owns scoped event subscriptions", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
    } as Pick<IpcMain, "handle">;
    const page = { items: [], nextCursor: null };
    const listTopicConversations = vi.fn(async () => page);
    const snapshot = { conversation: { id: "conversation_api" } };
    const backendMethods = {
      askTopicConversationNarratorStatus: vi.fn(async () => snapshot),
      createTopicConversation: vi.fn(async () => snapshot),
      listTopicConversations,
      queueTopicConversationTurn: vi.fn(async () => snapshot),
      readConversationSnapshot: vi.fn(async () => snapshot),
      sendTopicConversationTurn: vi.fn(async () => snapshot),
      steerTopicConversationTurn: vi.fn(async () => snapshot),
      stopTopicConversationTurn: vi.fn(async () => snapshot),
      submitTopicConversationApproval: vi.fn(async () => snapshot),
    };
    const backend = backendMethods as unknown as BackendClient;
    const conversationEvents = {
      release: vi.fn(async () => {}),
      subscribe: vi.fn(),
    };
    registerConversationIpcHandlers({
      conversationEvents: conversationEvents as never,
      ipcMain,
      requireBackendClient: () => backend,
    });
    const request = { cursor: null, limit: 80, query: "", workspaceId: "workspace_api" };

    const handler = requiredHandler(handlers, ipcChannels.conversationListTopicConversations);
    await expect(handler({} as IpcMainInvokeEvent, request)).resolves.toEqual(page);
    expect(listTopicConversations).toHaveBeenCalledWith(request);

    const target = { conversationId: "conversation_api", workspaceId: "workspace_api" };
    const turn = { ...target, text: "work" };
    const sender = { id: 7 };
    await invokeHandler(handlers, ipcChannels.conversationAskNarratorStatus, {
      ...target,
      question: "What is happening?",
    });
    await requiredHandler(handlers, ipcChannels.conversationCreateTopic)({} as IpcMainInvokeEvent, {
      title: "Topic",
      workspaceId: "workspace_api",
    });
    await invokeHandler(handlers, ipcChannels.conversationReadSnapshot, target);
    await invokeHandler(handlers, ipcChannels.conversationSendTurn, turn);
    await invokeHandler(handlers, ipcChannels.conversationQueueTurn, turn);
    await invokeHandler(handlers, ipcChannels.conversationSteerTurn, turn);
    await invokeHandler(handlers, ipcChannels.conversationStopTurn, target);
    await invokeHandler(handlers, ipcChannels.conversationSubmitApproval, {
      ...target,
      response: { answers: [], approvalId: "approval", decision: "approved", response: "" },
    });
    const subscription = {
      ...target,
      cursor: { sequence: 4, streamId: "conversation:conversation_api" },
    };
    await requiredHandler(handlers, ipcChannels.conversationSubscribeEvents)(
      { sender } as unknown as IpcMainInvokeEvent,
      subscription,
    );
    await requiredHandler(handlers, ipcChannels.conversationReleaseEvents)(
      { sender } as unknown as IpcMainInvokeEvent,
      { ...target, keepAlive: true },
    );

    expect(backendMethods.askTopicConversationNarratorStatus).toHaveBeenCalledWith({
      ...target,
      question: "What is happening?",
    });
    expect(backendMethods.createTopicConversation).toHaveBeenCalledWith({
      title: "Topic",
      workspaceId: "workspace_api",
    });
    expect(backendMethods.readConversationSnapshot).toHaveBeenCalledWith(target);
    expect(backendMethods.sendTopicConversationTurn).toHaveBeenCalledWith(turn);
    expect(backendMethods.queueTopicConversationTurn).toHaveBeenCalledWith(turn);
    expect(backendMethods.steerTopicConversationTurn).toHaveBeenCalledWith(turn);
    expect(backendMethods.stopTopicConversationTurn).toHaveBeenCalledWith(target);
    expect(conversationEvents.subscribe).toHaveBeenCalledWith(
      sender,
      subscription,
      subscription.cursor,
    );
    expect(conversationEvents.release).toHaveBeenCalledWith(sender, target, true);
  });
});

type ConversationHandler = Parameters<IpcMain["handle"]>[1];

function requiredHandler(
  handlers: ReadonlyMap<string, ConversationHandler>,
  channel: string,
): ConversationHandler {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`conversation handler was not registered: ${channel}`);
  }
  return handler;
}

async function invokeHandler(
  handlers: ReadonlyMap<string, ConversationHandler>,
  channel: string,
  request: unknown,
): Promise<unknown> {
  return requiredHandler(handlers, channel)({} as IpcMainInvokeEvent, request);
}
