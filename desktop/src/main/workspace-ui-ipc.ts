import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface WorkspaceUILayoutIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerWorkspaceUILayoutIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: WorkspaceUILayoutIpcRegistration): void {
  handleIpc(
    ipcMain,
    "workspaceReadUISchema",
    async () => {
      return requireBackendClient().readWorkspaceUISchema();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceListUIPanes",
    async (_event, workspaceId) => {
      return requireBackendClient().listWorkspaceUIPanes({ workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceReadUIPane",
    async (_event, workspaceId, paneId) => {
      return requireBackendClient().readWorkspaceUIPane({ paneId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceReadUILayout",
    async (_event, workspaceId) => {
      return requireBackendClient().readWorkspaceUILayout({ workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceSaveUILayout",
    async (_event, layout) => {
      return requireBackendClient().saveWorkspaceUILayout({ layout });
    },
    ipcObserver,
  );
}
