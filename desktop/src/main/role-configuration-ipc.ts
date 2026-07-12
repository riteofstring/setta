import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface RoleConfigurationIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerRoleConfigurationIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: RoleConfigurationIpcRegistration): void {
  handleIpc(
    ipcMain,
    "roleConfigurationReadConversation",
    async (_event, request) => requireBackendClient().readConversationRoleConfiguration(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "roleConfigurationReadGlobal",
    async () => requireBackendClient().readGlobalRoleConfiguration(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "roleConfigurationReadModels",
    async () => requireBackendClient().readRoleModelCatalog(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "roleConfigurationUpdateConversation",
    async (_event, request) => requireBackendClient().updateConversationRoleProfiles(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "roleConfigurationUpdateGlobal",
    async (_event, request) => requireBackendClient().updateGlobalRoleProfiles(request),
    ipcObserver,
  );
}
