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
    "conversationArchiveTopic",
    async (_event, request) => requireBackendClient().archiveTopicConversation(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationBindFolder",
    async (_event, request) => requireBackendClient().bindTopicConversationFolder(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationDisposeSide",
    async (_event, request) => requireBackendClient().disposeSideConversation(request),
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
    "conversationDiscardInput",
    async (_event, request) => requireBackendClient().discardConversationInput(request),
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
    "conversationReadInputState",
    async (_event, request) => requireBackendClient().readConversationInputRoutingState(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationReadArtifact",
    async (_event, request) => requireBackendClient().readConversationArtifact(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationWaitInputState",
    async (_event, request) => requireBackendClient().waitConversationInputRoutingState(request),
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
    "conversationRetryInput",
    async (_event, request) => requireBackendClient().retryConversationInput(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "conversationSendSideTurn",
    async (_event, request) => requireBackendClient().sendSideConversationTurn(request),
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
