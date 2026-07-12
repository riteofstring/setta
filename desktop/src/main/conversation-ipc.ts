import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";
import type { ConversationEventRegistry } from "./conversation-event-registry";

interface ConversationIpcRegistration {
  conversationEvents: ConversationEventRegistry;
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerConversationIpcHandlers({
  conversationEvents,
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: ConversationIpcRegistration): void {
  handleIpc(
    ipcMain,
    "conversationAskNarratorStatus",
    async (_event, request) => requireBackendClient().askTopicConversationNarratorStatus(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationCreateTopic",
    async (_event, request) => requireBackendClient().createTopicConversation(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationForkTopic",
    async (_event, request) => requireBackendClient().forkTopicConversation(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationListTopicConversations",
    async (_event, request) => requireBackendClient().listTopicConversations(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationReadSnapshot",
    async (_event, request) => requireBackendClient().readConversationSnapshot(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationSendTurn",
    async (_event, request) => requireBackendClient().sendTopicConversationTurn(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationQueueTurn",
    async (_event, request) => requireBackendClient().queueTopicConversationTurn(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationSteerTurn",
    async (_event, request) => requireBackendClient().steerTopicConversationTurn(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationStopTurn",
    async (_event, request) => requireBackendClient().stopTopicConversationTurn(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationSubmitInput",
    async (_event, request) => requireBackendClient().submitConversationInput(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationSubmitApproval",
    async (_event, request) => requireBackendClient().submitTopicConversationApproval(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationUpdateNarratorVoice",
    async (_event, request) => requireBackendClient().updateTopicConversationNarratorVoice(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationSubscribeEvents",
    async (event, request) => {
      conversationEvents.subscribe(event.sender, request, request.cursor);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationReleaseEvents",
    async (event, request) =>
      conversationEvents.release(
        event.sender,
        { conversationId: request.conversationId, workspaceId: request.workspaceId },
        request.keepAlive,
      ),
    ipcObserver,
  );
}
