import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface ChatCodexIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerChatCodexIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: ChatCodexIpcRegistration): void {
  handleIpc(
    ipcMain,
    "chatReadCodexDefaults",
    async () => {
      return requireBackendClient().readChatCodexDefaults();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatOpenCodexModelPicker",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().openChatCodexModelPicker({
        conversationId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatOpenCodexPermissionPicker",
    (_event, workspaceId, conversationId) =>
      requireBackendClient().openChatCodexPermissionPicker({ conversationId, workspaceId }),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSetCodexModel",
    async (_event, workspaceId, conversationId, modelId) => {
      return requireBackendClient().setChatCodexModel({
        conversationId,
        modelId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSetCodexPermissionPreset",
    (_event, workspaceId, conversationId, preset, confirmed) =>
      requireBackendClient().setChatCodexPermissionPreset({
        confirmed,
        conversationId,
        preset,
        workspaceId,
      }),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSetCodexReasoningEffort",
    async (_event, workspaceId, conversationId, reasoningEffort) => {
      return requireBackendClient().setChatCodexReasoningEffort({
        conversationId,
        reasoningEffort,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatUpdateCodexDefaults",
    async (_event, request) => {
      return requireBackendClient().updateChatCodexDefaults(request);
    },
    ipcObserver,
  );
}
