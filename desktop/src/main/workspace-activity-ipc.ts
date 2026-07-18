import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface WorkspaceActivityIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerWorkspaceActivityIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: WorkspaceActivityIpcRegistration): void {
  handleIpc(
    ipcMain,
    "workspaceActivitySnapshot",
    async (_event, workspaceId, limit) => {
      return requireBackendClient().readWorkspaceActivitySnapshot({ limit, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceActivityExecutionSnapshot",
    async (_event, workspaceId, executionId, limit) => {
      return requireBackendClient().readWorkflowExecutionActivity({
        executionId,
        limit,
        workspaceId,
      });
    },
    ipcObserver,
  );
}
