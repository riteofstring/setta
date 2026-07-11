import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface ConversationIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerConversationIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: ConversationIpcRegistration): void {
  handleIpc(
    ipcMain,
    "conversationListTopicConversations",
    async (_event, request) => requireBackendClient().listTopicConversations(request),
    ipcObserver,
  );
}
