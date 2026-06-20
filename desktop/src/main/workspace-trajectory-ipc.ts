import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface WorkspaceTrajectoryIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerWorkspaceTrajectoryIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: WorkspaceTrajectoryIpcRegistration): void {
  handleIpc(
    ipcMain,
    "workspaceTrajectoryRuntimeSnapshot",
    async (_event, request) => {
      return requireBackendClient().readWorkspaceTrajectoryRuntimeSnapshot(request);
    },
    ipcObserver,
  );
}
